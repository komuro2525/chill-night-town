// 学習中のお知らせ（バックグラウンド通知）の予約内容の検証。要件12章 / UC 12.2
//
// 予約した通知が鳴るのは何十分も後であり、画面を見ても正しさが分からない。
// ずれれば「休憩が終わっても知らせが来ない」「目標に届いたのに気づけない」
// 「夜が明けたのに分からない」形で壊れる。とくに目標到達は、学習日の実績合計から
// 逆算するうえ、ポモドーロでは休憩の分だけ後ろへずれるため間違えやすい。

import type { ActiveSession } from "@/db/types";
import { buildStudyNotices } from "../study-notice";

const at = (iso: string) => Date.parse(iso);

const base = {
  user_id: 1,
  town_id: 1,
  start_time: "2026-01-10T21:00:00",
  npc_id: 1,
  paused_accumulated_ms: 0,
  pause_started_at: null,
  // 休憩提案の基準。目標到達の通知には使わない（要件12章）ので、結果に影響しないことも確かめる
  break_suggest_threshold_minutes: 60,
  updated_at: "2026-01-10T21:00:00",
};

/** 目標到達が起きない大きさ（切り替わり系のテストで邪魔をさせないため） */
const NO_GOAL = 10000;

/** ポモドーロ（作業25分／休憩5分／3ループ）。21:00開始・22:25終了 */
function pomodoro(over: Partial<ActiveSession> = {}): ActiveSession {
  return {
    ...base,
    timer_mode: "pomodoro",
    planned_minutes: null,
    pomodoro_work_minutes: 25,
    pomodoro_break_minutes: 5,
    pomodoro_loop_count: 3,
    ...over,
  };
}

/** 黙々モード（予定120分）。21:00開始 */
function simple(over: Partial<ActiveSession> = {}): ActiveSession {
  return {
    ...base,
    timer_mode: "simple",
    planned_minutes: 120,
    pomodoro_work_minutes: null,
    pomodoro_break_minutes: null,
    pomodoro_loop_count: null,
    ...over,
  };
}

type Opts = { savedMinutes?: number; goalMinutes?: number };

function build(session: ActiveSession, atMs: number, opts: Opts = {}) {
  return buildStudyNotices({
    session,
    atMs,
    savedMinutes: opts.savedMinutes ?? 0,
    goalMinutes: opts.goalMinutes ?? NO_GOAL,
  });
}

/** 発火順の 'HH:MM' の配列 */
function times(session: ActiveSession, atMs: number, opts: Opts = {}) {
  return build(session, atMs, opts).map((n) =>
    n.fireAt.toTimeString().slice(0, 5),
  );
}

function titles(session: ActiveSession, atMs: number, opts: Opts = {}) {
  return build(session, atMs, opts).map((n) => n.title);
}

describe("buildStudyNotices - ポモドーロの切り替わり", () => {
  it("開始直後は、以後のすべての境界と全ループ完了を発火順に予約する", () => {
    // 作業25→休憩5→作業25→休憩5→作業25。最後の作業の後に休憩は無い（要件3.1）
    expect(times(pomodoro(), at("2026-01-10T21:00:00"))).toEqual([
      "21:25", // 1ループ目の作業終わり → 休憩へ
      "21:30", // 休憩終わり → 作業へ
      "21:55", // 2ループ目の作業終わり → 休憩へ
      "22:00", // 休憩終わり → 作業へ
      "22:25", // 最後の作業の終わり ＝ 全ループ完了
    ]);
  });

  it("既に過ぎた出来事は含めない（途中で予約し直しても重複しない）", () => {
    expect(times(pomodoro(), at("2026-01-10T21:40:00"))).toEqual([
      "21:55",
      "22:00",
      "22:25",
    ]);
  });

  it("ちょうど境界の時刻では、その境界は含めない（過去扱い）", () => {
    expect(times(pomodoro(), at("2026-01-10T21:25:00"))).toEqual([
      "21:30",
      "21:55",
      "22:00",
      "22:25",
    ]);
  });

  it("一時停止中は予約を持たない（時間が進まず時刻が決まらないため）", () => {
    const paused = pomodoro({ pause_started_at: "2026-01-10T21:10:00" });
    expect(times(paused, at("2026-01-10T21:10:30"))).toEqual([]);
  });

  it("一時停止した分だけ、以後の出来事が後ろへずれる", () => {
    const resumed = pomodoro({ paused_accumulated_ms: 10 * 60 * 1000 });
    expect(times(resumed, at("2026-01-10T21:20:00"))).toEqual([
      "21:35",
      "21:40",
      "22:05",
      "22:10",
      "22:35",
    ]);
  });

  it("繰り返し回数が1回でも、全ループ完了は予約する（休憩の境界は無い）", () => {
    const once = pomodoro({ pomodoro_loop_count: 1 });
    expect(times(once, at("2026-01-10T21:00:00"))).toEqual(["21:25"]);
  });

  it("文面は、休憩へ入るときだけ休憩の長さを伝える", () => {
    const notices = build(pomodoro(), at("2026-01-10T21:00:00"));
    expect(notices[0]).toMatchObject({
      title: "休憩の時間です",
      body: "5分間、少し離れてみませんか。",
    });
    expect(notices[1]).toMatchObject({
      title: "休憩が終わりました",
      body: "準備ができたら、また続きを。",
    });
    expect(notices[notices.length - 1]).toMatchObject({
      title: "今夜の学習が終わりました",
    });
  });
});

describe("buildStudyNotices - 目標到達", () => {
  it("黙々モードでは、目標ぶんの実績を積んだ時刻に予約する", () => {
    // 目標90分・保存済み0分 → 21:00 から90分後
    expect(
      times(simple(), at("2026-01-10T21:00:00"), { goalMinutes: 90 }),
    ).toContain("22:30");
  });

  it("保存済みの実績があるぶんだけ早く到達する", () => {
    // 目標90分・保存済み30分 → 残り60分 → 22:00
    expect(
      times(simple(), at("2026-01-10T21:00:00"), {
        goalMinutes: 90,
        savedMinutes: 30,
      }),
    ).toContain("22:00");
  });

  it("ポモドーロでは、休憩の分だけ後ろへずれる", () => {
    // 目標30分。作業25分では足りず、休憩5分を挟んだ次の作業で5分ぶん積む。
    // 経過 = 25 + 5 + 5 = 35分 → 21:35
    expect(
      times(pomodoro(), at("2026-01-10T21:00:00"), { goalMinutes: 30 }),
    ).toContain("21:35");
  });

  it("ポモドーロで目標が作業時間ちょうどのときは、そのループの作業の終わり", () => {
    // 目標25分 = 1ループ目の作業の終わり（休憩へ入る直前）
    const list = build(pomodoro(), at("2026-01-10T21:00:00"), {
      goalMinutes: 25,
    });
    // 21:25 に「休憩」と「目標到達」の2件が並ぶ
    const at2125 = list.filter((n) => n.fireAt.toTimeString().startsWith("21:25"));
    expect(at2125.map((n) => n.title)).toEqual([
      "休憩の時間です",
      "今夜の目標に届きました",
    ]);
  });

  it("セッション中に目標へ届かないときは予約しない", () => {
    // 作業25×3=75分ぶんしか積めないのに目標200分
    expect(
      titles(pomodoro(), at("2026-01-10T21:00:00"), { goalMinutes: 200 }),
    ).not.toContain("今夜の目標に届きました");
  });

  it("休憩提案の基準（5.1）には影響されない", () => {
    // 基準は60分だが目標は90分。予約されるのは目標の90分後（22:30）だけで、
    // 基準の60分後（22:00）には出さない
    const s = simple({ break_suggest_threshold_minutes: 60 });
    const list = build(s, at("2026-01-10T21:00:00"), { goalMinutes: 90 });
    const goal = list.filter((n) => n.title === "今夜の目標に届きました");
    expect(goal.map((n) => n.fireAt.toTimeString().slice(0, 5))).toEqual([
      "22:30",
    ]);
  });

  it("その学習日に既に目標へ届いていれば予約しない（1学習日に1回）", () => {
    // 保存済みだけで目標を超えている
    expect(
      titles(simple(), at("2026-01-10T21:30:00"), {
        goalMinutes: 60,
        savedMinutes: 120,
      }),
    ).not.toContain("今夜の目標に届きました");
  });
});

describe("buildStudyNotices - 5:00自動終了", () => {
  it("黙々モードでは、予定を超えても続くため5:00を予約する", () => {
    const list = build(simple(), at("2026-01-10T21:00:00"));
    const autoEnd = list.find((n) => n.title === "夜が明けました");
    expect(autoEnd?.fireAt.toTimeString().slice(0, 5)).toBe("05:00");
    expect(autoEnd?.fireAt.getDate()).toBe(11); // 学習日の翌日
  });

  it("ポモドーロが5:00より前に終わるなら、5:00は予約しない", () => {
    expect(titles(pomodoro(), at("2026-01-10T21:00:00"))).not.toContain(
      "夜が明けました",
    );
  });

  it("ポモドーロが5:00をまたぐ場合は、5:00で終わるため以降の境界を予約しない", () => {
    // 4:20開始・作業25/休憩5/4ループ（本来 6:15 まで）→ 5:00 で自動終了
    const late = pomodoro({
      start_time: "2026-01-11T04:20:00",
      pomodoro_loop_count: 4,
    });
    expect(times(late, at("2026-01-11T04:20:00"))).toEqual([
      "04:45", // 作業終わり → 休憩
      "04:50", // 休憩終わり → 作業
      "05:00", // 自動終了
    ]);
  });

  it("黙々モードでも、5:00より後になる目標到達は予約しない", () => {
    // 4:00開始・目標120分 → 到達は6:00で、5:00の自動終了より後
    const s = simple({ start_time: "2026-01-11T04:00:00" });
    expect(
      titles(s, at("2026-01-11T04:00:00"), { goalMinutes: 120 }),
    ).toEqual(["夜が明けました"]);
  });
});
