// ポモドーロの切り替わり通知の予約内容の検証。要件12章 / UC 12.2
//
// 予約した通知が鳴るのは何十分も後であり、画面を見ても正しさが分からない。
// ずれれば「休憩が終わったのに知らせが来ない」「休憩中に作業へ戻される」形で壊れ、
// 休憩を挟むというポモドーロの目的そのものが果たせなくなるため、境界を固定する。

import type { ActiveSession } from "@/db/types";
import { buildPomodoroPhaseNotices } from "../pomodoro-notice";

const at = (iso: string) => Date.parse(iso);

const base = {
  user_id: 1,
  town_id: 1,
  start_time: "2026-01-10T21:00:00",
  npc_id: 1,
  paused_accumulated_ms: 0,
  pause_started_at: null,
  break_suggest_threshold_minutes: 60,
  updated_at: "2026-01-10T21:00:00",
};

/** ポモドーロ（作業25分／休憩5分／3ループ）。21:00開始 */
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

/** 検証しやすいよう 'HH:MM' で並べる */
const times = (session: ActiveSession, atMs: number) =>
  buildPomodoroPhaseNotices(session, atMs).map((n) =>
    n.fireAt.toTimeString().slice(0, 5),
  );

describe("buildPomodoroPhaseNotices", () => {
  it("開始直後は、以後のすべての境界を発火順に予約する", () => {
    // 作業25→休憩5→作業25→休憩5→作業25。最後の作業の後に休憩は無い（要件3.1）
    expect(times(pomodoro(), at("2026-01-10T21:00:00"))).toEqual([
      "21:25", // 1ループ目の作業終わり → 休憩へ
      "21:30", // 休憩終わり → 作業へ
      "21:55", // 2ループ目の作業終わり → 休憩へ
      "22:00", // 休憩終わり → 作業へ
      "22:25", // 最後の作業の終わり ＝ 全ループ完了
    ]);
  });

  it("既に過ぎた境界は含めない（途中で予約し直しても重複しない）", () => {
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

  it("一時停止中は予約を持たない（フェーズが進まず時刻が決まらないため）", () => {
    const paused = pomodoro({ pause_started_at: "2026-01-10T21:10:00" });
    expect(buildPomodoroPhaseNotices(paused, at("2026-01-10T21:10:30"))).toEqual(
      [],
    );
  });

  it("一時停止した分だけ、以後の境界が後ろへずれる", () => {
    // 10分止めて再開した後。境界は 21:25 → 21:35 へずれる
    const resumed = pomodoro({ paused_accumulated_ms: 10 * 60 * 1000 });
    expect(times(resumed, at("2026-01-10T21:20:00"))).toEqual([
      "21:35",
      "21:40",
      "22:05",
      "22:10",
      "22:35",
    ]);
  });

  it("5:00（自動終了）以降に当たる境界は予約しない", () => {
    // 4:20 開始・作業25/休憩5/4ループ。4:45 と 4:50 は 5:00 前だが、
    // 次の 5:15 以降は 5:00 の自動終了（要件3.2）で訪れない
    const late = pomodoro({
      start_time: "2026-01-11T04:20:00",
      pomodoro_loop_count: 4,
    });
    expect(times(late, at("2026-01-11T04:20:00"))).toEqual(["04:45", "04:50"]);
  });

  it("繰り返し回数が1回でも、全ループ完了は予約する（休憩の境界は無い）", () => {
    // 休憩を挟まないため切り替わりは起きないが、作業の終わりは訪れる
    const once = pomodoro({ pomodoro_loop_count: 1 });
    expect(times(once, at("2026-01-10T21:00:00"))).toEqual(["21:25"]);
  });

  it("黙々モードでは何も予約しない", () => {
    expect(buildPomodoroPhaseNotices(simple(), at("2026-01-10T21:00:00"))).toEqual(
      [],
    );
  });

  it("文面は、休憩へ入るときだけ休憩の長さを伝える", () => {
    const notices = buildPomodoroPhaseNotices(
      pomodoro(),
      at("2026-01-10T21:00:00"),
    );
    expect(notices[0]).toMatchObject({
      title: "休憩の時間です",
      body: "5分間、少し離れてみませんか。",
    });
    expect(notices[1]).toMatchObject({
      title: "休憩が終わりました",
      body: "準備ができたら、また続きを。",
    });
  });

  it("最後の1件は、切り替わりではなく終了を伝える文面になる", () => {
    const notices = buildPomodoroPhaseNotices(
      pomodoro(),
      at("2026-01-10T21:00:00"),
    );
    expect(notices[notices.length - 1]).toMatchObject({
      title: "今夜の学習が終わりました",
      body: "おつかれさまでした。街に戻ると、この夜を記録できます。",
    });
  });
});
