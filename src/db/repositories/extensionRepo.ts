// 延長宣言（additional_study_time）リポジトリ。要件5.2 / UC 5.2
//
// 「目標時間を超えてさらに学習を続けたい」ときに、延長する時間を宣言する。
//
// 重要: 延長宣言は**休憩提案の表示制御にのみ使用する**。
//   目標達成・経験値の判定（要件6.2①）には一切影響しない。
//   宣言した時間は当学習日のみ有効で、翌学習日には引き継がない。
//
// ログとして残すのは、宣言の履歴を後から振り返れるようにするため
// （表示制御そのものは active_session.break_suggest_threshold_minutes が担う）。

import { getDatabase } from "../database";
import type { AdditionalStudyTime } from "../types";

/** 延長を宣言する（値域5〜120分の検証は呼び出し側で行う） */
export async function declare(
  userId: number,
  targetDate: string,
  addedMinutes: number,
): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    `INSERT INTO additional_study_time (user_id, target_date, added_minutes)
     VALUES (?, ?, ?)`,
    userId,
    targetDate,
    addedMinutes,
  );
}

/** 指定学習日の延長宣言ログ（当学習日のみ有効） */
export async function getByStudyDate(
  targetDate: string,
): Promise<AdditionalStudyTime[]> {
  const db = await getDatabase();
  return db.getAllAsync<AdditionalStudyTime>(
    "SELECT * FROM additional_study_time WHERE target_date = ? ORDER BY id",
    targetDate,
  );
}
