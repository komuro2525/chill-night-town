// 休憩提案の判定の検証。要件5.1 / 5.2
//
// 「頑張りすぎ防止」は、出しすぎればうるさく、出なければ機能しない。
// 判定は「保存済みの合計＋進行中の実績」と基準値の比較で決まり、画面を見ても
// 正しさが分からないため、境界を固定する。

import type { ActiveSession } from "@/db/types";
import {
  getContinueThreshold,
  getExtensionThreshold,
  getStudyDayTotalMinutes,
  shouldSuggestBreak,
} from "../break-suggestion";

const at = (iso: string) => Date.parse(iso);

const base = {
  user_id: 1,
  town_id: 1,
  start_time: "2026-01-10T21:00:00",
  paused_accumulated_seconds: 0,
  pause_started_at: null,
  updated_at: "2026-01-10T21:00:00",
};

/** 黙々モード（基準60分＝一日の目標時間） */
function simple(over: Partial<ActiveSession> = {}): ActiveSession {
  return {
    ...base,
    timer_mode: "simple",
    planned_minutes: 120,
    pomodoro_work_minutes: null,
    pomodoro_break_minutes: null,
    pomodoro_loop_count: null,
    break_suggest_threshold_minutes: 60,
    ...over,
  };
}

/** ポモドーロ（作業25/休憩5/4ループ） */
function pomodoro(over: Partial<ActiveSession> = {}): ActiveSession {
  return {
    ...base,
    timer_mode: "pomodoro",
    planned_minutes: null,
    pomodoro_work_minutes: 25,
    pomodoro_break_minutes: 5,
    pomodoro_loop_count: 4,
    break_suggest_threshold_minutes: 60,
    ...over,
  };
}

describe("getStudyDayTotalMinutes（保存済み＋進行中の合算）", () => {
  it("保存済みの記録と進行中のセッションを合算する", () => {
    // 保存済み30分 ＋ 進行中20分 = 50分
    expect(
      getStudyDayTotalMinutes(30, simple(), at("2026-01-10T21:20:00")),
    ).toBe(50);
  });

  it("計測していないときは保存済みの合計のみ", () => {
    expect(getStudyDayTotalMinutes(30, null, at("2026-01-10T21:20:00"))).toBe(30);
  });
});

describe("shouldSuggestBreak（表示の判定・要件5.1）", () => {
  it("頑張りすぎ防止がOFFなら一切表示しない", () => {
    // 基準を大きく超えていても出さない
    expect(
      shouldSuggestBreak(simple(), 120, at("2026-01-10T22:00:00"), false),
    ).toBe(false);
  });

  it("合計が基準に届くまでは表示しない", () => {
    // 59分（基準60分）
    expect(
      shouldSuggestBreak(simple(), 0, at("2026-01-10T21:59:00"), true),
    ).toBe(false);
  });

  it("合計が基準にちょうど達したら表示する", () => {
    expect(
      shouldSuggestBreak(simple(), 0, at("2026-01-10T22:00:00"), true),
    ).toBe(true);
  });

  it("保存済みの記録があれば、その分だけ早く達する", () => {
    // 保存済み50分 ＋ 進行中10分 = 60分
    expect(
      shouldSuggestBreak(simple(), 50, at("2026-01-10T21:10:00"), true),
    ).toBe(true);
    expect(
      shouldSuggestBreak(simple(), 50, at("2026-01-10T21:09:00"), true),
    ).toBe(false);
  });

  it("基準が未設定なら表示しない", () => {
    const s = simple({ break_suggest_threshold_minutes: null });
    expect(shouldSuggestBreak(s, 120, at("2026-01-10T22:00:00"), true)).toBe(
      false,
    );
  });

  it("一時停止中は実績が進まないため、やがて表示条件を満たさなくなる", () => {
    // 21:30に停止 → 実績30分のまま。基準60分には届かない
    const s = simple({ pause_started_at: "2026-01-10T21:30:00" });
    expect(shouldSuggestBreak(s, 0, at("2026-01-10T23:00:00"), true)).toBe(
      false,
    );
  });
});

describe("shouldSuggestBreak（ポモドーロの作業中には割り込まない・要件5.1）", () => {
  it("条件を満たしても、作業フェーズ中は表示しない", () => {
    // 作業25/休憩5/4ループ。65分経過時点は3ループ目の作業中（60-85分が作業）
    // 実績は 25+25+5 = 55分…ではなく、経過65分 → 作業50分＋作業5分＝55分
    const s = pomodoro({ break_suggest_threshold_minutes: 50 });
    // 経過65分（3ループ目の作業中）: 実績55分 ≧ 基準50分 だが作業中なので出さない
    expect(shouldSuggestBreak(s, 0, at("2026-01-10T22:05:00"), true)).toBe(
      false,
    );
  });

  it("休憩フェーズに入ったら表示する", () => {
    const s = pomodoro({ break_suggest_threshold_minutes: 50 });
    // 経過87分は3回目の休憩フェーズ（85-90分）
    expect(shouldSuggestBreak(s, 0, at("2026-01-10T22:27:00"), true)).toBe(
      true,
    );
  });

  it("全ループ完了時は表示する", () => {
    const s = pomodoro({ break_suggest_threshold_minutes: 50 });
    // 115分で全ループ完了
    expect(shouldSuggestBreak(s, 0, at("2026-01-10T22:55:00"), true)).toBe(
      true,
    );
  });

  it("黙々モードには作業中の制限がない（いつでも表示する）", () => {
    expect(
      shouldSuggestBreak(simple(), 0, at("2026-01-10T22:00:00"), true),
    ).toBe(true);
  });
});

describe("getContinueThreshold（「継続する」で超過60分ごとに再表示・要件5.1）", () => {
  it("基準を60分ぶん引き上げる", () => {
    expect(getContinueThreshold(60)).toBe(120);
    expect(getContinueThreshold(120)).toBe(180);
  });

  it("引き上げ後は、次の60分に届くまで表示しない", () => {
    const s = simple({ break_suggest_threshold_minutes: getContinueThreshold(60) });
    // 実績119分では出さない
    expect(shouldSuggestBreak(s, 0, at("2026-01-10T22:59:00"), true)).toBe(
      false,
    );
    // 120分で出す
    expect(shouldSuggestBreak(s, 0, at("2026-01-10T23:00:00"), true)).toBe(true);
  });
});

describe("続けることを選んだら、次の基準を必ず先送りする（要件5.1）", () => {
  // 休憩は実績学習時間に加算されないため、基準を上げないと
  // 提案を閉じた瞬間に表示条件を満たしたままとなり、再び出てしまう
  it("基準を上げないと、提案を閉じた直後も表示条件を満たしたままになる", () => {
    // 実績60分・基準60分のまま一時停止した状態
    const s = simple({
      break_suggest_threshold_minutes: 60,
      pause_started_at: "2026-01-10T22:00:00",
    });
    // 一時停止しても実績は60分のまま → 条件を満たし続ける（これが再表示の原因）
    expect(shouldSuggestBreak(s, 0, at("2026-01-10T22:30:00"), true)).toBe(true);
  });

  it("「休憩する」で基準を+60分すれば、再開しても直後には表示しない", () => {
    const s = simple({
      break_suggest_threshold_minutes: getContinueThreshold(60),
      pause_started_at: "2026-01-10T22:00:00",
    });
    // 一時停止中も、再開直後も、実績60分では基準120分に届かない
    expect(shouldSuggestBreak(s, 0, at("2026-01-10T22:30:00"), true)).toBe(false);
  });

  it("休憩を挟んでも、実績が次の60分に達すれば再び表示する", () => {
    // 30分休憩して再開した状態（基準120分）
    const s = simple({
      break_suggest_threshold_minutes: getContinueThreshold(60),
      paused_accumulated_seconds: 30 * 60,
    });
    // 開始21:00・休憩30分 → 実績120分になるのは 23:30
    expect(shouldSuggestBreak(s, 0, at("2026-01-10T23:29:00"), true)).toBe(false);
    expect(shouldSuggestBreak(s, 0, at("2026-01-10T23:30:00"), true)).toBe(true);
  });
});

describe("getExtensionThreshold（延長宣言・要件5.2）", () => {
  it("次回の基準は「現在の実績合計＋宣言時間」", () => {
    // 実績65分の時点で30分延長 → 次は95分
    expect(getExtensionThreshold(65, 30)).toBe(95);
  });

  it("宣言時間を使い切るまでは表示を抑制する", () => {
    // 実績60分で30分延長 → 基準90分
    const s = simple({ break_suggest_threshold_minutes: getExtensionThreshold(60, 30) });
    // 89分では出さない
    expect(shouldSuggestBreak(s, 0, at("2026-01-10T22:29:00"), true)).toBe(
      false,
    );
    // 90分で再表示する
    expect(shouldSuggestBreak(s, 0, at("2026-01-10T22:30:00"), true)).toBe(true);
  });
});
