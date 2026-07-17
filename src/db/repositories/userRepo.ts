// ユーザー（user）参照リポジトリ
// 1端末=1ユーザーのため、常に0件または1件。
// Phase 0 では起動ゲート用の存在判定と取得のみ実装する。
// ユーザー作成（初期設定）は Phase 1、設定更新は各Phaseで追加する。

import { getDatabase } from "../database";
import type { User } from "../types";

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
