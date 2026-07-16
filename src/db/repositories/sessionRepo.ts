// 学習記録（study_session）参照リポジトリ
// 学習日単位の集計を担う。学習日の算出は src/lib/study-day.ts の共通関数に集約する
// （CLAUDE.md / 要件0章）。study_session.study_date には保存時に算出済みの学習日が入る。
//
// セッションの作成は Phase 3（タイマー）で追加する。ここでは集計の参照のみ。

import { getDatabase } from "../database";

/**
 * 指定学習日の実績学習時間の合計（分）。
 * duration_minutes は一時停止・ポモドーロの休憩フェーズを除いた実績（要件0章）。
 * 1学習日に複数セッションがある場合は合算する（要件6.2①）。
 */
export async function getStudyDayTotalMinutes(
  studyDate: string,
): Promise<number> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ total: number | null }>(
    "SELECT SUM(duration_minutes) AS total FROM study_session WHERE study_date = ?",
    studyDate,
  );
  return row?.total ?? 0;
}

/**
 * 指定学習日が「目標達成済み」か。
 *
 * セッション合計と現在の目標時間を比較して再計算するのではなく、
 * daily_goal_achievement の行の有無で判定する。これは要件6.2①の
 * 「一度付与した経験値は、その学習日内に目標時間が変更されても取り消さない」
 * を満たすため（当時達成した事実は合計からは再現できない）。
 */
export async function isGoalAchieved(studyDate: string): Promise<boolean> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ count: number }>(
    "SELECT COUNT(*) AS count FROM daily_goal_achievement WHERE study_date = ?",
    studyDate,
  );
  return (row?.count ?? 0) > 0;
}

export type StudyDaySummary = {
  studyDate: string;
  totalMinutes: number;
  achieved: boolean;
};

/** ホーム画面の「今夜の学習時間・目標達成状況」表示用のまとめ取得（要件2.1） */
export async function getStudyDaySummary(
  studyDate: string,
): Promise<StudyDaySummary> {
  const [totalMinutes, achieved] = await Promise.all([
    getStudyDayTotalMinutes(studyDate),
    isGoalAchieved(studyDate),
  ]);
  return { studyDate, totalMinutes, achieved };
}
