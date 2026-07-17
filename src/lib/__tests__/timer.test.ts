// タイマー計測ロジックの検証。要件3.1 / 3.2
//
// 画面を見ても正しさが分からず、壊れると実績学習時間・成長判定に直接響く箇所。
// 時刻差分方式（カウンター変数を使わない）の性質上、
// 「一時停止」「5:00到達」「端末時計の変更」の組み合わせが崩れやすいため、
// 境界値を固定する。

import type { ActiveSession } from "@/db/types";
import {
  getActualStudyMinutes,
  getActualStudySeconds,
  getAutoEndMs,
  getElapsedSeconds,
  getEndMs,
  getPlannedMinutes,
  getPomodoroPhase,
  isAutoEndReached,
  shouldAutoFinish,
} from "../timer";

/** 時刻文字列をミリ秒へ */
const at = (iso: string) => Date.parse(iso);

const base = {
  user_id: 1,
  town_id: 1,
  start_time: "2026-01-10T23:00:00",
  paused_accumulated_seconds: 0,
  pause_started_at: null,
  break_suggest_threshold_minutes: null,
  updated_at: "2026-01-10T23:00:00",
};

/** 黙々モードのセッション（既定: 1/10 23:00 開始・予定60分） */
function simple(over: Partial<ActiveSession> = {}): ActiveSession {
  return {
    ...base,
    timer_mode: "simple",
    planned_minutes: 60,
    pomodoro_work_minutes: null,
    pomodoro_break_minutes: null,
    pomodoro_loop_count: null,
    ...over,
  };
}

/** ポモドーロのセッション（既定: 作業25分・休憩5分・2ループ） */
function pomodoro(over: Partial<ActiveSession> = {}): ActiveSession {
  return {
    ...base,
    timer_mode: "pomodoro",
    planned_minutes: null,
    pomodoro_work_minutes: 25,
    pomodoro_break_minutes: 5,
    pomodoro_loop_count: 2,
    ...over,
  };
}

describe("getElapsedSeconds（時刻差分方式の経過秒）", () => {
  it("一時停止していなければ、開始からの経過がそのまま進む", () => {
    expect(getElapsedSeconds(simple(), at("2026-01-10T23:30:00"))).toBe(1800);
  });

  it("一時停止して再開した分は経過から除かれる", () => {
    // 10分停止して40分経過 → 実際に動いていたのは30分
    const s = simple({ paused_accumulated_seconds: 600 });
    expect(getElapsedSeconds(s, at("2026-01-10T23:40:00"))).toBe(1800);
  });

  it("一時停止中は経過が進まない", () => {
    // 23:20に停止 → 23:50に見ても経過は20分のまま
    const s = simple({ pause_started_at: "2026-01-10T23:20:00" });
    expect(getElapsedSeconds(s, at("2026-01-10T23:50:00"))).toBe(1200);
    expect(getElapsedSeconds(s, at("2026-01-11T02:00:00"))).toBe(1200);
  });

  it("端末時計を開始前へ巻き戻しても負にならず0になる（要件3.2）", () => {
    expect(getElapsedSeconds(simple(), at("2026-01-10T22:00:00"))).toBe(0);
  });

  it("一時停止の累積が経過を上回っても0で下げ止まる", () => {
    const s = simple({ paused_accumulated_seconds: 99999 });
    expect(getElapsedSeconds(s, at("2026-01-10T23:30:00"))).toBe(0);
  });
});

describe("getAutoEndMs / isAutoEndReached（5:00自動終了・要件3.2）", () => {
  it("夜に開始したセッションは翌5:00で自動終了する", () => {
    expect(getAutoEndMs(simple())).toBe(new Date(2026, 0, 11, 5, 0, 0, 0).getTime());
  });

  it("深夜開始でも同じ夜の5:00に終了する（学習日が前日のため）", () => {
    // 1/11 1:30 開始 → 学習日は1/10 → 自動終了は 1/11 5:00
    const s = simple({ start_time: "2026-01-11T01:30:00" });
    expect(getAutoEndMs(s)).toBe(new Date(2026, 0, 11, 5, 0, 0, 0).getTime());
  });

  it("月末に開始しても翌月1日の5:00へ正しく繰り上がる", () => {
    const s = simple({ start_time: "2026-01-31T23:00:00" });
    expect(getAutoEndMs(s)).toBe(new Date(2026, 1, 1, 5, 0, 0, 0).getTime());
  });

  it("5:00ちょうどで到達と判定する", () => {
    expect(isAutoEndReached(simple(), at("2026-01-11T04:59:59"))).toBe(false);
    expect(isAutoEndReached(simple(), at("2026-01-11T05:00:00"))).toBe(true);
  });
});

describe("getActualStudySeconds（実績学習時間・黙々モード）", () => {
  it("予定時間を超えても計測は続く（予定は目標であって上限ではない）", () => {
    // 予定60分に対し90分経過
    expect(getActualStudySeconds(simple(), at("2026-01-11T00:30:00"))).toBe(5400);
  });

  it("5:00を過ぎた分は実績に含めない（実績は5:00まで）", () => {
    // 23:00開始 → 7:00に確認しても実績は6時間で頭打ち
    expect(getActualStudySeconds(simple(), at("2026-01-11T07:00:00"))).toBe(6 * 3600);
  });

  it("一時停止中に5:00を過ぎた場合も、停止分を除いた5:00までが実績になる", () => {
    // 23:00開始・23:30から停止したまま7:00 → 実績は30分
    const s = simple({ pause_started_at: "2026-01-10T23:30:00" });
    expect(getActualStudySeconds(s, at("2026-01-11T07:00:00"))).toBe(1800);
  });
});

describe("getPomodoroPhase（フェーズ算出・要件3.1）", () => {
  // 構成: 作業 →（休憩 → 作業）×(n−1)。最後の作業の後に休憩はない（修正履歴30）
  const s = pomodoro(); // 25分作業 / 5分休憩 / 2ループ = 計55分

  it("開始直後は1ループ目の作業フェーズ", () => {
    const p = getPomodoroPhase(s, 10 * 60);
    expect(p).toMatchObject({ kind: "work", loop: 1, completed: false });
    expect(p.remainingSeconds).toBe(15 * 60);
  });

  it("作業25分を終えると休憩フェーズへ移る", () => {
    expect(getPomodoroPhase(s, 25 * 60 - 1)).toMatchObject({ kind: "work", loop: 1 });
    expect(getPomodoroPhase(s, 25 * 60)).toMatchObject({ kind: "break", loop: 1 });
  });

  it("休憩を終えると最後の作業フェーズへ移る", () => {
    expect(getPomodoroPhase(s, 30 * 60)).toMatchObject({ kind: "work", loop: 2 });
  });

  it("最後の作業の完了をもって全ループ完了となる（計55分）", () => {
    expect(getPomodoroPhase(s, 55 * 60 - 1).completed).toBe(false);
    expect(getPomodoroPhase(s, 55 * 60)).toMatchObject({
      kind: "work",
      loop: 2,
      completed: true,
    });
  });

  it("最後の作業の後に休憩フェーズが現れない", () => {
    // 最後の作業（30分〜55分）の全範囲が work であること
    for (let m = 30; m < 55; m++) {
      expect(getPomodoroPhase(s, m * 60).kind).toBe("work");
    }
  });

  it("繰り返し1回では休憩が一度も発生しない", () => {
    const one = pomodoro({ pomodoro_loop_count: 1 });
    for (let m = 0; m < 25; m++) {
      expect(getPomodoroPhase(one, m * 60).kind).toBe("work");
    }
    expect(getPomodoroPhase(one, 25 * 60).completed).toBe(true);
  });

  it("4ループでは休憩が3回だけ挟まる（計115分）", () => {
    const four = pomodoro({ pomodoro_loop_count: 4 });
    expect(getPomodoroPhase(four, 115 * 60).completed).toBe(true);
    expect(getPomodoroPhase(four, 115 * 60 - 1).completed).toBe(false);
    // 各休憩は 25-30分 / 55-60分 / 85-90分 の位置に現れる
    expect(getPomodoroPhase(four, 27 * 60).kind).toBe("break");
    expect(getPomodoroPhase(four, 57 * 60).kind).toBe("break");
    expect(getPomodoroPhase(four, 87 * 60).kind).toBe("break");
    expect(getPomodoroPhase(four, 100 * 60).kind).toBe("work");
  });
});

describe("getActualStudySeconds（実績学習時間・ポモドーロ）", () => {
  const s = pomodoro();

  it("休憩フェーズは実績に含めない", () => {
    // 27分経過（作業25分＋休憩2分）→ 実績は作業の25分のみ
    expect(getActualStudySeconds(s, at("2026-01-10T23:27:00"))).toBe(25 * 60);
  });

  it("休憩を挟んだ後の作業は実績に積み上がる", () => {
    // 32分経過（作業25＋休憩5＋作業2）→ 実績27分
    expect(getActualStudySeconds(s, at("2026-01-10T23:32:00"))).toBe(27 * 60);
  });

  it("全ループ完了後は作業時間の合計で頭打ちになる", () => {
    // 完了は55分時点。それ以降いくら経っても実績は作業25分×2＝50分
    expect(getActualStudySeconds(s, at("2026-01-10T23:55:00"))).toBe(50 * 60);
    expect(getActualStudySeconds(s, at("2026-01-11T02:00:00"))).toBe(50 * 60);
  });
});

describe("getActualStudyMinutes（実績1分未満の破棄判定・要件3.2）", () => {
  it("59秒は0分（保存せず破棄する）", () => {
    expect(getActualStudyMinutes(simple(), at("2026-01-10T23:00:59"))).toBe(0);
  });

  it("60秒ちょうどから1分（保存する）", () => {
    expect(getActualStudyMinutes(simple(), at("2026-01-10T23:01:00"))).toBe(1);
  });
});

describe("getPlannedMinutes（予定学習時間・要件3.2）", () => {
  it("黙々モードは設定した予定時間", () => {
    expect(getPlannedMinutes(simple())).toBe(60);
  });

  it("ポモドーロは作業時間×繰り返し回数（休憩は含めない）", () => {
    expect(getPlannedMinutes(pomodoro())).toBe(50);
    expect(getPlannedMinutes(pomodoro({ pomodoro_loop_count: 4 }))).toBe(100);
  });
});

describe("shouldAutoFinish（自動終了の判定）", () => {
  it("黙々モードは5:00到達でのみ自動終了する", () => {
    expect(shouldAutoFinish(simple(), at("2026-01-11T04:00:00"))).toBe(false);
    expect(shouldAutoFinish(simple(), at("2026-01-11T05:00:00"))).toBe(true);
  });

  it("ポモドーロは全ループ完了でも自動終了する", () => {
    expect(shouldAutoFinish(pomodoro(), at("2026-01-10T23:54:00"))).toBe(false);
    expect(shouldAutoFinish(pomodoro(), at("2026-01-10T23:55:00"))).toBe(true);
  });

  it("一時停止中に5:00へ到達した場合も自動終了する（要件3.2）", () => {
    const s = simple({ pause_started_at: "2026-01-10T23:30:00" });
    expect(shouldAutoFinish(s, at("2026-01-11T05:00:00"))).toBe(true);
  });
});

describe("getEndMs（記録する終了時刻）", () => {
  it("通常の終了操作では、その時刻を終了時刻とする", () => {
    expect(getEndMs(simple(), at("2026-01-11T00:30:00"))).toBe(
      at("2026-01-11T00:30:00"),
    );
  });

  it("5:00を過ぎていれば5:00を終了時刻とする", () => {
    expect(getEndMs(simple(), at("2026-01-11T07:00:00"))).toBe(getAutoEndMs(simple()));
  });

  it("ポモドーロ完了後に終了した場合、完了した瞬間を終了時刻とする", () => {
    // 55分で完了。実際の終了操作が23:59でも、終了時刻は23:55
    expect(getEndMs(pomodoro(), at("2026-01-10T23:59:00"))).toBe(
      at("2026-01-10T23:55:00"),
    );
  });

  it("一時停止を挟んだポモドーロでは、停止分だけ完了時刻が後ろへずれる", () => {
    // 10分停止していれば、完了は 23:55 + 10分 = 翌0:05
    const s = pomodoro({ paused_accumulated_seconds: 600 });
    expect(getEndMs(s, at("2026-01-11T01:00:00"))).toBe(at("2026-01-11T00:05:00"));
  });
});
