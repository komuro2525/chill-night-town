// ポモドーロの切り替わり通知の予約内容（要件12章 / UC 12.2）。純関数。
//
// アプリがバックグラウンドにある間、作業⇄休憩の切り替わりをOSのローカル通知で知らせる。
// 発火はOSが行うため、アプリは「以後に訪れる境界の時刻」を先にすべて算出して予約する。
//
// 予約し直す契機は、タイマーの開始・再開・一時停止・終了。
// 一時停止中は予約を持たない（停止中はフェーズが進まず、予約済みの時刻が実際の
// 切り替わりとずれるため）。再開時に、その時点の残り時間で予約し直す。
//
// 境界の時刻は画面を見ても正しさが分からず（発火するのは何十分も後）、
// ずれると「休憩が終わったのに知らせが来ない」形で壊れるため、ここに集約してテストで固定する。

import type { ActiveSession } from "@/db/types";
import { getAutoEndMs } from "./timer";

/** 予約するローカル通知1件ぶん */
export type PomodoroPhaseNotice = {
  /** 発火時刻 */
  fireAt: Date;
  title: string;
  body: string;
};

/** 作業→休憩の切り替わりの文面。責めない・急かさない（要件12章） */
function toBreakContent(breakMinutes: number): { title: string; body: string } {
  return {
    title: "休憩の時間です",
    body: `${breakMinutes}分間、少し離れてみませんか。`,
  };
}

/** 休憩→作業の切り替わりの文面 */
function toWorkContent(): { title: string; body: string } {
  return {
    title: "休憩が終わりました",
    body: "準備ができたら、また続きを。",
  };
}

/**
 * 全ループ完了（最後の作業フェーズの終わり）の文面。
 * 終了を告げるだけにとどめ、記録を促して急かさない（要件12章）。
 * 終了演出（3.3）・成果記録（3.4）はアプリへ戻った時点で行う
 */
function completedContent(): { title: string; body: string } {
  return {
    title: "今夜の学習が終わりました",
    body: "おつかれさまでした。街に戻ると、この夜を記録できます。",
  };
}

/**
 * 以後に訪れるフェーズ境界と全ループ完了の通知を、発火が早い順に返す（要件12章 / UC 12.2）。
 *
 * 次の場合は空を返す:
 *   ・黙々モード（フェーズが無い）
 *   ・一時停止中（フェーズが進まないため予約を持たない）
 *
 * 既に過ぎた境界と、5:00（自動終了。要件3.2）以降に当たる境界は含めない。
 *
 * @param session 計測中のセッション
 * @param atMs 現在時刻（ミリ秒）
 */
export function buildPomodoroPhaseNotices(
  session: ActiveSession,
  atMs: number,
): PomodoroPhaseNotice[] {
  if (session.timer_mode !== "pomodoro") return [];
  // 一時停止中は、いつ再開されるか分からない＝境界の時刻が決まらない
  if (session.pause_started_at) return [];

  const workMinutes = session.pomodoro_work_minutes ?? 0;
  const breakMinutes = session.pomodoro_break_minutes ?? 0;
  const loops = session.pomodoro_loop_count ?? 0;
  // 繰り返し1回でも、休憩の境界は無いが「作業の終わり」は訪れる
  if (workMinutes <= 0 || breakMinutes <= 0 || loops < 1) return [];

  const workSec = workMinutes * 60;
  const cycleSec = workSec + breakMinutes * 60;

  // 経過秒 → 実時刻。一時停止中でないため、今後は経過と実時間が同じ速さで進む
  // （さらに一時停止されたら、その時点で予約を解除して再開時に取り直す）
  const baseMs = Date.parse(session.start_time) + session.paused_accumulated_ms;
  const autoEndMs = getAutoEndMs(session);

  const notices: PomodoroPhaseNotice[] = [];
  const push = (elapsedSec: number, content: { title: string; body: string }) => {
    const fireMs = baseMs + elapsedSec * 1000;
    // 既に過ぎた境界は予約しない（過去の時刻を渡すと即時に鳴る実装があるため）
    if (fireMs <= atMs) return;
    // 5:00 到達で自動終了するため、それ以降の境界は訪れない
    if (fireMs >= autoEndMs) return;
    notices.push({ fireAt: new Date(fireMs), ...content });
  };

  // 構成は「作業 →（休憩 → 作業）× (n−1)」。境界は各ループの
  // 作業終わり（→休憩）と休憩終わり（→作業）の2つで、最後の作業の後に休憩は無い（要件3.1）
  for (let k = 0; k < loops - 1; k++) {
    push(k * cycleSec + workSec, toBreakContent(breakMinutes));
    push((k + 1) * cycleSec, toWorkContent());
  }

  // 最後の作業フェーズの終わり ＝ 全ループ完了。バックグラウンドでは終了演出（3.3）が
  // 走らないため、終わったこと自体を知らせる（要件12章）
  push(cycleSec * (loops - 1) + workSec, completedContent());

  return notices;
}
