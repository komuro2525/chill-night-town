// 入力検証（初期設定・設定変更で共通利用）。エラーがあればメッセージ、なければ null を返す。
// 文言はコンセプト準拠（責めない・急かさない・感嘆符を使わない）。

import {
  DAILY_GOAL_MINUTES,
  LIMITS,
  NOTIFICATION_WINDOW,
} from "@/constants/domain";

/** ニックネーム（必須・上限20文字）。要件1.2 / UC 1.2 */
export function validateNickname(raw: string): string | null {
  const name = raw.trim();
  if (name.length === 0) return "ニックネームを入力してください";
  if (name.length > LIMITS.NICKNAME_MAX) {
    return `ニックネームは${LIMITS.NICKNAME_MAX}文字以内で入力してください`;
  }
  return null;
}

/** 一日の学習目標時間（必須・10〜720分の整数）。要件1.2 / 10.2 */
export function validateDailyGoalMinutes(raw: string): string | null {
  const trimmed = raw.trim();
  if (trimmed.length === 0) return "目標時間を入力してください";
  if (!/^\d+$/.test(trimmed)) return "目標時間は数字で入力してください";
  const value = Number(trimmed);
  if (value < DAILY_GOAL_MINUTES.MIN || value > DAILY_GOAL_MINUTES.MAX) {
    return `目標時間は${DAILY_GOAL_MINUTES.MIN}〜${DAILY_GOAL_MINUTES.MAX}分で入力してください`;
  }
  return null;
}

/**
 * 通知時刻（'HH:MM' 24時間表記）。通知ON時のみ必須。要件12章（改訂）。
 * 許容範囲は 17:30〜翌4:30（17:30〜23:59 および 00:00〜04:30）。
 */
export function validateNotificationTime(raw: string): string | null {
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(raw.trim());
  // 4桁（HH:MM）が正しく入力されていない場合
  if (!m) return "21:00 の形式で入力してください";

  const minutesOfDay = Number(m[1]) * 60 + Number(m[2]);
  const inWindow =
    minutesOfDay >= NOTIFICATION_WINDOW.START_MINUTES ||
    minutesOfDay <= NOTIFICATION_WINDOW.END_MINUTES;
  if (!inWindow) {
    return `通知時刻は ${NOTIFICATION_WINDOW.START_LABEL}〜翌${NOTIFICATION_WINDOW.END_LABEL} の範囲で設定してください`;
  }
  return null;
}
