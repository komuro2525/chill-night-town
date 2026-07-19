// 学習記録（study_session）参照リポジトリ
// 学習日単位の集計を担う。学習日の算出は src/lib/study-day.ts の共通関数に集約する
// （CLAUDE.md / 要件0章）。study_session.study_date には保存時に算出済みの学習日が入る。
//
// セッションの作成は Phase 3（タイマー）で追加する。ここでは集計の参照のみ。

import { getStudyDate } from "@/lib/study-day";
import { getActualStudyMinutes, getEndMs, getPlannedMinutes } from "@/lib/timer";
import { getDatabase } from "../database";
import type { ActiveSession } from "../types";

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

/**
 * 計測中セッションを学習記録として確定し、計測状態を削除する（要件3.4）。
 *
 * 感情・タグ・メモは任意項目のため、ここでは空で保存する。
 * 成果記録画面（S6）はこの後に入力を上書きする形で実装する
 * （画面から離脱した場合もセッションは失わない、という要件3.4の担保）。
 *
 * 実績1分未満のセッションはここへ来ない（呼び出し側で破棄する。要件3.2）。
 *
 * @returns 作成した学習記録のID
 */
export async function createFromActive(
  session: ActiveSession,
  atMs: number,
): Promise<number> {
  const db = await getDatabase();
  const endMs = getEndMs(session, atMs);
  const studyDate = getStudyDate(new Date(Date.parse(session.start_time)));

  let insertedId = 0;
  await db.withTransactionAsync(async () => {
    const result = await db.runAsync(
      `INSERT INTO study_session
         (user_id, town_id, timer_mode, study_date,
          start_time, end_time, planned_minutes, duration_minutes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      session.user_id,
      session.town_id,
      session.timer_mode,
      studyDate,
      session.start_time,
      new Date(endMs).toISOString(),
      getPlannedMinutes(session),
      getActualStudyMinutes(session, atMs),
    );
    insertedId = result.lastInsertRowId;
    // 学習記録へ変換できた時点で計測状態は不要になる
    await db.runAsync("DELETE FROM active_session WHERE user_id = ?", session.user_id);
  });
  return insertedId;
}

/**
 * 学習記録の任意項目を書き込む共通処理。
 *
 * emotionId が undefined のときは emotion_id に一切触れない
 * （カレンダーからの編集。感情はその時の気持ちのスナップショットのため）。
 * 空文字のメモは NULL として保存する。
 * タグは付け替え。毎回消してから入れ直す（差分計算より単純で取りこぼしがない）。
 */
async function writeSessionDetails(input: {
  sessionId: number;
  emotionId?: number | null;
  memo: string | null;
  tagIds: number[];
}): Promise<void> {
  const db = await getDatabase();
  const memoValue = input.memo && input.memo.length > 0 ? input.memo : null;
  await db.withTransactionAsync(async () => {
    if (input.emotionId !== undefined) {
      await db.runAsync(
        `UPDATE study_session
            SET emotion_id = ?, memo = ?, updated_at = datetime('now')
          WHERE id = ?`,
        input.emotionId,
        memoValue,
        input.sessionId,
      );
    } else {
      await db.runAsync(
        `UPDATE study_session
            SET memo = ?, updated_at = datetime('now')
          WHERE id = ?`,
        memoValue,
        input.sessionId,
      );
    }
    await db.runAsync(
      "DELETE FROM session_tag WHERE study_session_id = ?",
      input.sessionId,
    );
    for (const tagId of input.tagIds) {
      await db.runAsync(
        "INSERT INTO session_tag (study_session_id, study_tag_id) VALUES (?, ?)",
        input.sessionId,
        tagId,
      );
    }
  });
}

/**
 * 学習記録の任意項目（感情・タグ・メモ）を後から書き込む（要件3.4）。
 *
 * セッション自体は終了時に createFromActive() で確定済みのため、
 * 成果記録画面から離脱しても学習した時間は失われない。
 * 本関数は「入力された分だけを上書きする」役割を持つ。
 */
export async function updateRecordDetails(input: {
  sessionId: number;
  emotionId: number | null;
  memo: string | null;
  tagIds: number[];
}): Promise<void> {
  await writeSessionDetails(input);
}

/**
 * 学習記録のタグ・メモだけを後から編集する（要件4.1: カレンダーからの編集）。
 *
 * 感情はその夜のその時の気持ちのスナップショットのため**変更しない**
 * （emotion_id に一切触れない）。学習時間・時刻・天気も対象外。
 */
export async function updateSessionContent(input: {
  sessionId: number;
  memo: string | null;
  tagIds: number[];
}): Promise<void> {
  await writeSessionDetails(input);
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
