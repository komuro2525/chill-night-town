// 入力検証（初期設定・設定変更で共通利用）。エラーがあればメッセージ、なければ null を返す。
// 文言はコンセプト準拠（責めない・急かさない・感嘆符を使わない）。

import {
  DAILY_GOAL_MINUTES,
  EXTENSION_MINUTES,
  LIMITS,
  NOTIFICATION_WINDOW,
  POMODORO,
  PROJECT_TARGET,
  SIMPLE_PLANNED_MINUTES,
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

/** 分単位の整数入力の共通検証。値域外・非数字はメッセージを返す */
function validateMinutesInRange(
  raw: string,
  min: number,
  max: number,
  label: string,
): string | null {
  const trimmed = raw.trim();
  if (trimmed.length === 0) return `${label}を入力してください`;
  if (!/^\d+$/.test(trimmed)) return `${label}は数字で入力してください`;
  const value = Number(trimmed);
  if (value < min || value > max) {
    return `${label}は${min}〜${max}分で入力してください`;
  }
  return null;
}

/** 黙々モードの予定学習時間（10〜660分）。UC 3.1 */
export function validatePlannedMinutes(raw: string): string | null {
  return validateMinutesInRange(
    raw,
    SIMPLE_PLANNED_MINUTES.MIN,
    SIMPLE_PLANNED_MINUTES.MAX,
    "予定学習時間",
  );
}

/** ポモドーロの作業時間（5〜120分）。要件3.1 */
export function validatePomodoroWorkMinutes(raw: string): string | null {
  return validateMinutesInRange(
    raw,
    POMODORO.WORK_MINUTES.MIN,
    POMODORO.WORK_MINUTES.MAX,
    "作業時間",
  );
}

/** ポモドーロの休憩時間（1〜30分）。要件3.1 */
export function validatePomodoroBreakMinutes(raw: string): string | null {
  return validateMinutesInRange(
    raw,
    POMODORO.BREAK_MINUTES.MIN,
    POMODORO.BREAK_MINUTES.MAX,
    "休憩時間",
  );
}

/** ポモドーロの繰り返し回数（1〜10回）。要件3.1 */
export function validatePomodoroLoopCount(raw: string): string | null {
  const trimmed = raw.trim();
  if (trimmed.length === 0) return "繰り返し回数を入力してください";
  if (!/^\d+$/.test(trimmed)) return "繰り返し回数は数字で入力してください";
  const value = Number(trimmed);
  if (value < POMODORO.LOOP_COUNT.MIN || value > POMODORO.LOOP_COUNT.MAX) {
    return `繰り返し回数は${POMODORO.LOOP_COUNT.MIN}〜${POMODORO.LOOP_COUNT.MAX}回で入力してください`;
  }
  return null;
}

/** 延長宣言の追加時間（5〜120分）。要件5.2 */
export function validateExtensionMinutes(raw: string): string | null {
  return validateMinutesInRange(
    raw,
    EXTENSION_MINUTES.MIN,
    EXTENSION_MINUTES.MAX,
    "延長する時間",
  );
}

/**
 * プロジェクト型の目標学習時間（必須・1〜744時間の整数）。要件6.2② / UC 6.2・6.3。
 * 入力は時間単位。格納時に分へ変換する（分の値域はスキーマの CHECK が担保）。
 */
export function validateProjectTargetHours(raw: string): string | null {
  const trimmed = raw.trim();
  if (trimmed.length === 0) return "目標時間を入力してください";
  if (!/^\d+$/.test(trimmed)) return "目標時間は数字で入力してください";
  const value = Number(trimmed);
  if (value < PROJECT_TARGET.HOURS.MIN || value > PROJECT_TARGET.HOURS.MAX) {
    return `目標時間は${PROJECT_TARGET.HOURS.MIN}〜${PROJECT_TARGET.HOURS.MAX}時間で入力してください`;
  }
  return null;
}

/**
 * タグ名（必須・上限20文字）。要件3.4。
 * 名称の重複（標準タグ・既存マイタグとの衝突）は登録時にDB側で判定する。
 */
export function validateTagName(raw: string): string | null {
  const name = raw.trim();
  if (name.length === 0) return "タグの名前を入力してください";
  if (name.length > LIMITS.TAG_NAME_MAX) {
    return `タグの名前は${LIMITS.TAG_NAME_MAX}文字以内で入力してください`;
  }
  return null;
}

/** 振り返りメモ（任意・上限500文字）。要件3.4 */
export function validateMemo(raw: string): string | null {
  if (raw.length > LIMITS.MEMO_MAX) {
    return `メモは${LIMITS.MEMO_MAX}文字以内で入力してください`;
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
