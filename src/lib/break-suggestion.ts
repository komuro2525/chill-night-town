// 休憩提案の判定（要件5.1 / UC 5.1）。純関数。
//
// 「頑張りすぎ防止」の機能。その学習日の実績合計が一日の目標時間に達したら休憩を提案し、
// 以降も学習が続いていれば超過60分ごとに再度提案する。
//
// 判定に必要なもの:
//   - 保存済みの学習記録の合計（その学習日）
//   - 進行中セッションの実績（時刻差分方式で都度算出）
//   - 次に提案する基準（active_session.break_suggest_threshold_minutes）
//     ・初期値は一日の学習目標時間
//     ・「継続する」で +60分
//     ・延長宣言で「現在の実績合計＋宣言時間」へ更新
//
// この設計により、提案を出したかどうかの履歴を持たずに済む（基準を上げるだけで済む）。

import { BREAK_REPROMPT_INTERVAL_MINUTES } from "@/constants/domain";
import type { ActiveSession } from "@/db/types";
import { getActualStudyMinutes, getPomodoroPhase, getElapsedSeconds } from "./timer";

/**
 * その学習日の実績学習時間の合計（分）。
 * 保存済みの記録と、進行中のセッションを合算する（UC 5.1 のステップ1）。
 */
export function getStudyDayTotalMinutes(
  savedMinutes: number,
  session: ActiveSession | null,
  atMs: number,
): number {
  return savedMinutes + (session ? getActualStudyMinutes(session, atMs) : 0);
}

/**
 * いま休憩提案を表示すべきか（要件5.1）。
 *
 * @param enabled 頑張りすぎ防止の設定（10.6）。OFFなら本機能は一切動作しない
 * @param savedMinutes その学習日の保存済み実績合計（分）
 */
export function shouldSuggestBreak(
  session: ActiveSession,
  savedMinutes: number,
  atMs: number,
  enabled: boolean,
): boolean {
  if (!enabled) return false;

  const threshold = session.break_suggest_threshold_minutes;
  if (threshold === null) return false;

  const total = getStudyDayTotalMinutes(savedMinutes, session, atMs);
  if (total < threshold) return false;

  // ポモドーロの作業フェーズ中には割り込まない（要件5.1）。
  // 休憩が組み込まれたモードのため、条件を満たしても
  // 次の休憩フェーズ開始時またはループ完了時まで待つ
  if (session.timer_mode === "pomodoro") {
    const phase = getPomodoroPhase(
      session,
      getElapsedSeconds(session, atMs),
    );
    if (phase.kind === "work" && !phase.completed) return false;
  }

  return true;
}

/**
 * 「学習を継続する」を選んだときの次回基準（分）。
 * 超過60分ごとに再表示する（要件5.1）。
 */
export function getContinueThreshold(currentThreshold: number): number {
  return currentThreshold + BREAK_REPROMPT_INTERVAL_MINUTES;
}

/**
 * 延長を宣言したときの次回基準（分）＝ 現在の実績合計 ＋ 宣言時間（UC 5.2 のステップ2）。
 * 宣言時間を使い切ってなお学習が続いていれば、再び提案が出る。
 */
export function getExtensionThreshold(
  totalMinutes: number,
  declaredMinutes: number,
): number {
  return totalMinutes + declaredMinutes;
}
