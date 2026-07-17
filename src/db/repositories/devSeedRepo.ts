// 開発用のダミー学習記録リポジトリ（__DEV__ 限定で使う）
//
// 本物の学習記録を作るのは Phase 3（タイマー）。それまでホーム画面の
// 「今夜の学習時間・目標達成状況」（要件2.1）を実機で確認できないため、
// 確認用のダミー記録を投入する手段だけを切り出してある。
//
// 詳細・撤去時期は docs/開発用テストボタン.md を参照。
// TODO(Phase 3): タイマーで実記録が作れるようになったら本ファイルごと削除する。

import { getDatabase } from "../database";

/**
 * 指定学習日にダミーの学習記録を1件足す。
 * 目標を達成したら daily_goal_achievement へ付与記録を残す（要件6.2①: 1学習日1回まで）。
 *
 * 経験値・レベルの反映は行わない（成長判定は Phase 4）。ここでは
 * ホーム表示の確認に必要な study_session と達成記録のみを作る。
 */
export async function addDummySession(
  studyDate: string,
  durationMinutes: number,
  dailyGoalMinutes: number,
): Promise<void> {
  const db = await getDatabase();
  await db.withTransactionAsync(async () => {
    const user = await db.getFirstAsync<{ id: number }>(
      "SELECT id FROM user LIMIT 1",
    );
    const town = await db.getFirstAsync<{ town_id: number }>(
      "SELECT town_id FROM town_progress WHERE is_selected = 1 LIMIT 1",
    );
    if (!user || !town) {
      throw new Error("ダミー記録の作成に必要なデータが揃っていません");
    }

    const now = new Date();
    const start = new Date(now.getTime() - durationMinutes * 60 * 1000);
    await db.runAsync(
      `INSERT INTO study_session
         (user_id, town_id, timer_mode, study_date,
          start_time, end_time, planned_minutes, duration_minutes)
       VALUES (?, ?, 'simple', ?, ?, ?, ?, ?)`,
      user.id,
      town.town_id,
      studyDate,
      start.toISOString(),
      now.toISOString(),
      durationMinutes,
      durationMinutes,
    );

    // 学習日合計が目標に達したら達成記録を残す（既にあれば何もしない）
    const row = await db.getFirstAsync<{ total: number | null }>(
      "SELECT SUM(duration_minutes) AS total FROM study_session WHERE study_date = ?",
      studyDate,
    );
    if ((row?.total ?? 0) >= dailyGoalMinutes) {
      await db.runAsync(
        "INSERT OR IGNORE INTO daily_goal_achievement (user_id, study_date) VALUES (?, ?)",
        user.id,
        studyDate,
      );
    }
  });
}

/** 指定学習日のダミー記録と達成記録を消す（確認をやり直すため） */
export async function clearSessions(studyDate: string): Promise<void> {
  const db = await getDatabase();
  await db.withTransactionAsync(async () => {
    await db.runAsync("DELETE FROM study_session WHERE study_date = ?", studyDate);
    await db.runAsync(
      "DELETE FROM daily_goal_achievement WHERE study_date = ?",
      studyDate,
    );
  });
}
