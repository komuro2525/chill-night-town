// ユーザー（user）参照リポジトリ
// 1端末=1ユーザーのため、常に0件または1件。
// Phase 0 では起動ゲート用の存在判定と取得のみ実装する。
// ユーザー作成（初期設定）は Phase 1、設定更新は各Phaseで追加する。

import { getDatabase } from "../database";
import type { GrowthMethod, User } from "../types";

/** ユーザーが存在するか（初期設定完了判定。要件1.1） */
export async function hasUser(): Promise<boolean> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ count: number }>(
    "SELECT COUNT(*) AS count FROM user",
  );
  return (row?.count ?? 0) > 0;
}

/** ユーザーを取得する（存在しなければ null） */
export async function getUser(): Promise<User | null> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<User>("SELECT * FROM user LIMIT 1");
  return row ?? null;
}

/**
 * 前回のタイマー設定を記憶する（要件3.1: 次回は選択済みの状態で表示する）。
 * 学習開始時に呼ぶ。ポモドーロの値は黙々モードで開始した場合も前回値を保つため、
 * 呼び出し側が渡した値のみを更新する。
 */
export async function updateTimerPreferences(prefs: {
  timerMode: "simple" | "pomodoro";
  /** 黙々モードで開始した場合のみ */
  plannedMinutes?: number;
  /** 以下3つはポモドーロモードで開始した場合のみ */
  pomodoroWorkMinutes?: number;
  pomodoroBreakMinutes?: number;
  pomodoroLoopCount?: number;
}): Promise<void> {
  const db = await getDatabase();
  // 使わなかったモードの値は前回値のまま残す（次にそのモードを選んだとき復元するため）
  if (prefs.timerMode === "pomodoro") {
    await db.runAsync(
      `UPDATE user
          SET timer_mode = ?, pomodoro_work_minutes = ?, pomodoro_break_minutes = ?,
              pomodoro_loop_count = ?, updated_at = datetime('now')`,
      prefs.timerMode,
      prefs.pomodoroWorkMinutes ?? 25,
      prefs.pomodoroBreakMinutes ?? 5,
      prefs.pomodoroLoopCount ?? 1,
    );
    return;
  }
  await db.runAsync(
    `UPDATE user
        SET timer_mode = ?, planned_minutes = ?, updated_at = datetime('now')`,
    prefs.timerMode,
    prefs.plannedMinutes ?? 60,
  );
}

/**
 * 「育て方のお知らせ」を表示済みとして記録する。
 * 初回ホーム表示で一度だけ案内し、以降は二度と表示しない（要件6.2の周知）。
 */
export async function markGrowthHintDismissed(): Promise<void> {
  const db = await getDatabase();
  await db.runAsync("UPDATE user SET growth_hint_dismissed = 1");
}

/**
 * 初回チュートリアル（使い方）を見終えたことを記録する。
 * 初期設定完了後に一度だけ表示し、閉じたら二度と自動表示しない（設定からは何度でも閲覧可）。
 */
export async function markTutorialCompleted(): Promise<void> {
  const db = await getDatabase();
  await db.runAsync("UPDATE user SET tutorial_completed = 1");
}

/**
 * 機能ごとの初回説明を「見た」と記録する（初めてその画面/操作に触れたとき一度だけ出す）。
 * カンマ区切りのキー集合に追記する（重複は追加しない）。
 */
export async function markFeatureTutorialSeen(featureKey: string): Promise<void> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ tutorial_seen_features: string }>(
    "SELECT tutorial_seen_features FROM user LIMIT 1",
  );
  const seen = new Set(
    (row?.tutorial_seen_features ?? "").split(",").filter(Boolean),
  );
  if (seen.has(featureKey)) return;
  seen.add(featureKey);
  await db.runAsync(
    "UPDATE user SET tutorial_seen_features = ?",
    [...seen].join(","),
  );
}

// --- 設定変更（要件10章）。user は単一行のため WHERE は不要 ---
// 値の形式検証（空文字・値域）は呼び出し側で validation.ts を通すこと。

/** ニックネームを変更する（要件10.1）。稼働中も可 */
export async function updateNickname(nickname: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    "UPDATE user SET nickname = ?, updated_at = datetime('now')",
    nickname.trim(),
  );
}

/** 一日の学習目標時間を変更する（要件10.2）。稼働中不可はUI側で制御 */
export async function updateDailyGoalMinutes(minutes: number): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    "UPDATE user SET daily_goal_minutes = ?, updated_at = datetime('now')",
    minutes,
  );
}

/**
 * 成長方式を変更する（要件10.6 / 6.2）。稼働中不可はUI側で制御。
 * 累計学習時間・経験値は保持したまま、以後の判定に使う方式だけを切り替える。
 * 切り替え後の選択街のレベル再判定は growthRepo.recomputeTownLevel で行う。
 */
export async function updateGrowthMethod(method: GrowthMethod): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    "UPDATE user SET growth_method = ?, updated_at = datetime('now')",
    method,
  );
}

/** 感情記録のON/OFF（要件10.7）。稼働中も可。過去の記録済み感情には影響しない */
export async function updateEmotionRecordEnabled(enabled: boolean): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    "UPDATE user SET emotion_record_enabled = ?, updated_at = datetime('now')",
    enabled ? 1 : 0,
  );
}

/**
 * 背景のループ動画のON/OFF（要件10.11）。稼働中も可（記録・判定に影響しないため）。
 * OFFのときは動画素材があっても静止画を表示する。
 */
export async function updateBackgroundMotionEnabled(
  enabled: boolean,
): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    "UPDATE user SET background_motion_enabled = ?, updated_at = datetime('now')",
    enabled ? 1 : 0,
  );
}

// 夜の写真のON/OFF（旧10.14）の更新関数は、設定の廃止に伴い削除した
// （要件 改訂51）。列 user.night_photo_enabled は未使用のまま残っている。

/**
 * バックグラウンド再生のON/OFF（要件9章 / 10.15）。稼働中も可（記録・判定に影響しないため）。
 * OFFにすると、アプリを離れた時点でBGM・環境音が止まる。
 */
export async function updateBackgroundAudioEnabled(
  enabled: boolean,
): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    "UPDATE user SET background_audio_enabled = ?, updated_at = datetime('now')",
    enabled ? 1 : 0,
  );
}

/**
 * アイドル最小表示・横画面で、計測中に時計と経過時間を出すか（要件10.16）。稼働中も可。
 * OFFのときも「作業中」の一言は残す（計測中だと分かる手掛かりを消さないため）。
 */
export async function updateMinimalClockEnabled(
  enabled: boolean,
): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    "UPDATE user SET minimal_clock_enabled = ?, updated_at = datetime('now')",
    enabled ? 1 : 0,
  );
}

/** 頑張りすぎ防止（休憩提案）のON/OFF（要件10.8）。稼働中も可 */
export async function updateOverworkPreventionEnabled(
  enabled: boolean,
): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    "UPDATE user SET overwork_prevention_enabled = ?, updated_at = datetime('now')",
    enabled ? 1 : 0,
  );
}
