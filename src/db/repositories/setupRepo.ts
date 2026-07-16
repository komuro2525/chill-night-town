// 初期設定（UC 1.2）でユーザーと関連レコードを作成するリポジトリ。
// user は単一行トリガーで1件のみ許可されるため、本処理は初回のみ成功する。

import { getDatabase } from "../database";

export type InitialSetupInput = {
  nickname: string;
  dailyGoalMinutes: number;
  selectedTownId: number;
  notificationEnabled: boolean;
  /** 'HH:MM'。通知OFF時は null */
  notificationTime: string | null;
};

/**
 * ユーザー・音量設定・通知設定・街の育成進捗を1トランザクションで作成する。
 *
 * - user: nickname と daily_goal_minutes 以外はスキーマ既定値
 *   （成長方式=habit / タイマー=simple / 感情記録ON / 頑張りすぎ防止ON / ポモドーロ既定値）
 * - audio_setting: 各音量は既定値50
 * - notification_setting: 入力に応じて is_enabled / scheduled_time を設定
 * - town_progress: 有効な全ての街に行を作成し、選択街を is_selected=1 とする
 *
 * 注: OSの通知許可要求・ローカル通知のスケジュール登録は Phase 7（要件12章）で実装する。
 *     本処理では通知設定の永続化のみ行う。
 *
 * @returns 作成した user.id
 */
export async function completeSetup(input: InitialSetupInput): Promise<number> {
  const db = await getDatabase();
  let userId = 0;

  await db.withTransactionAsync(async () => {
    const userResult = await db.runAsync(
      "INSERT INTO user (nickname, daily_goal_minutes) VALUES (?, ?)",
      input.nickname,
      input.dailyGoalMinutes,
    );
    userId = userResult.lastInsertRowId;

    await db.runAsync("INSERT INTO audio_setting (user_id) VALUES (?)", userId);

    await db.runAsync(
      "INSERT INTO notification_setting (user_id, is_enabled, scheduled_time) VALUES (?, ?, ?)",
      userId,
      input.notificationEnabled ? 1 : 0,
      input.notificationEnabled ? input.notificationTime : null,
    );

    const towns = await db.getAllAsync<{ id: number }>(
      "SELECT id FROM town WHERE is_active = 1 ORDER BY display_order",
    );
    for (const town of towns) {
      await db.runAsync(
        "INSERT INTO town_progress (user_id, town_id, is_selected) VALUES (?, ?, ?)",
        userId,
        town.id,
        town.id === input.selectedTownId ? 1 : 0,
      );
    }
  });

  return userId;
}
