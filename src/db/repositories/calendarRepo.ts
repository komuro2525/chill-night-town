// カレンダー（学習記録の閲覧・集計）リポジトリ。要件4章
//
// すべて「学習日」（study_date、要件0章）を単位に集計する。
//
// 要件4.2 の数え方の違いに注意（取り違えると集計が狂う）:
//   ・夜の天気は daily_night_weather を、学習記録のある夜だけ、**夜の数**で数える
//     （1晩に複数セッションでも1）
//   ・感情・学習時間・学習回数は study_session 単位で数える
//     （感情が NULL の記録は感情集計から除外する）

import type { Emotion, NightWeather, StudyTag } from "../types";
import { getDatabase } from "../database";

/** カレンダーのマス点灯用。記録のある学習日と、その夜の天気・目標達成 */
export type DayMark = {
  studyDate: string;
  /** その夜の天気の絵文字（未選択なら null） */
  weatherEmoji: string | null;
  /** その学習日に目標を達成したか */
  achieved: boolean;
};

/** 日別詳細の1セッション（要件4.1） */
export type DaySessionRecord = {
  id: number;
  timerMode: string;
  startTime: string;
  endTime: string;
  plannedMinutes: number;
  durationMinutes: number;
  emotion: Emotion | null;
  memo: string | null;
  tags: StudyTag[];
};

/** 日別詳細（要件4.1） */
export type DayDetail = {
  studyDate: string;
  weather: NightWeather | null;
  totalMinutes: number;
  achieved: boolean;
  sessions: DaySessionRecord[];
};

/** 月次サマリー（要件4.2） */
export type MonthSummary = {
  totalMinutes: number;
  sessionCount: number;
  /** 最も多かった感情（記録が無ければ null） */
  topEmotion: Emotion | null;
  /** 最も多かった夜の天気（記録が無ければ null） */
  topWeather: NightWeather | null;
  /** 感情別の記録回数（display_order 順）。感情記録の内訳 */
  emotionCounts: { emotion: Emotion; count: number }[];
  /** 夜の天気アルバム: 集めた天気と夜数（display_order 順、集めた分のみ） */
  weatherAlbum: { weather: NightWeather; nights: number }[];
};

/** その月に記録のある学習日のマーク情報（要件4.1: 記録のある日にマーク） */
export async function getMonthMarks(
  startDate: string,
  endDate: string,
): Promise<DayMark[]> {
  const db = await getDatabase();
  // 学習記録のある study_date を基準に、その夜の天気と目標達成の有無を左結合で拾う
  const rows = await db.getAllAsync<{
    study_date: string;
    emoji: string | null;
    achieved: number;
  }>(
    `SELECT s.study_date AS study_date,
            w.emoji AS emoji,
            CASE WHEN a.study_date IS NOT NULL THEN 1 ELSE 0 END AS achieved
       FROM (SELECT DISTINCT study_date FROM study_session
              WHERE study_date BETWEEN ? AND ?) s
       LEFT JOIN daily_night_weather d ON d.study_date = s.study_date
       LEFT JOIN night_weather w ON w.id = d.night_weather_id
       LEFT JOIN daily_goal_achievement a ON a.study_date = s.study_date
      ORDER BY s.study_date`,
    startDate,
    endDate,
  );
  return rows.map((r) => ({
    studyDate: r.study_date,
    weatherEmoji: r.emoji,
    achieved: r.achieved === 1,
  }));
}

/** 指定学習日の詳細（全セッション＋天気）。記録が無ければ sessions 空（要件4.1） */
export async function getDayDetail(studyDate: string): Promise<DayDetail> {
  const db = await getDatabase();

  const weather = await db.getFirstAsync<NightWeather>(
    `SELECT w.* FROM night_weather w
       JOIN daily_night_weather d ON d.night_weather_id = w.id
      WHERE d.study_date = ?`,
    studyDate,
  );

  const sessionRows = await db.getAllAsync<{
    id: number;
    timer_mode: string;
    start_time: string;
    end_time: string;
    planned_minutes: number;
    duration_minutes: number;
    emotion_id: number | null;
    memo: string | null;
  }>(
    `SELECT id, timer_mode, start_time, end_time, planned_minutes,
            duration_minutes, emotion_id, memo
       FROM study_session
      WHERE study_date = ?
      ORDER BY start_time`,
    studyDate,
  );

  const emotions = await db.getAllAsync<Emotion>("SELECT * FROM emotion");
  const emotionById = new Map(emotions.map((e) => [e.id, e]));

  // タグはその日の全セッション分を1クエリで引き、セッションIDごとに束ねる
  // （セッションごとに1クエリずつ発行しない）
  const tagRows = await db.getAllAsync<StudyTag & { study_session_id: number }>(
    `SELECT st.study_session_id, t.*
       FROM session_tag st
       JOIN study_tag t ON t.id = st.study_tag_id
      WHERE st.study_session_id IN
            (SELECT id FROM study_session WHERE study_date = ?)
      ORDER BY t.is_custom, t.display_order, t.id`,
    studyDate,
  );
  const tagsBySession = new Map<number, StudyTag[]>();
  for (const { study_session_id, ...tag } of tagRows) {
    const list = tagsBySession.get(study_session_id) ?? [];
    list.push(tag);
    tagsBySession.set(study_session_id, list);
  }

  const sessions: DaySessionRecord[] = [];
  let totalMinutes = 0;
  for (const s of sessionRows) {
    totalMinutes += s.duration_minutes;
    sessions.push({
      id: s.id,
      timerMode: s.timer_mode,
      startTime: s.start_time,
      endTime: s.end_time,
      plannedMinutes: s.planned_minutes,
      durationMinutes: s.duration_minutes,
      emotion: s.emotion_id !== null ? (emotionById.get(s.emotion_id) ?? null) : null,
      memo: s.memo,
      tags: tagsBySession.get(s.id) ?? [],
    });
  }

  const achievedRow = await db.getFirstAsync<{ count: number }>(
    "SELECT COUNT(*) AS count FROM daily_goal_achievement WHERE study_date = ?",
    studyDate,
  );

  return {
    studyDate,
    weather: weather ?? null,
    totalMinutes,
    achieved: (achievedRow?.count ?? 0) > 0,
    sessions,
  };
}

/** 月次サマリー（要件4.2）。範囲は study_date で絞る */
export async function getMonthSummary(
  startDate: string,
  endDate: string,
): Promise<MonthSummary> {
  const db = await getDatabase();

  // 学習時間・学習回数は study_session 単位（感情の有無を問わない）
  const totals = await db.getFirstAsync<{
    total: number | null;
    count: number;
  }>(
    `SELECT SUM(duration_minutes) AS total, COUNT(*) AS count
       FROM study_session WHERE study_date BETWEEN ? AND ?`,
    startDate,
    endDate,
  );

  // 感情別の回数（study_session 単位・NULL は除外）。display_order 順
  const emotionRows = await db.getAllAsync<Emotion & { count: number }>(
    `SELECT e.*, COUNT(*) AS count
       FROM study_session s
       JOIN emotion e ON e.id = s.emotion_id
      WHERE s.study_date BETWEEN ? AND ?
      GROUP BY e.id
      ORDER BY e.display_order`,
    startDate,
    endDate,
  );

  // 夜の天気は「学習記録のある夜」を対象に夜の数で数える（1晩1天気）。display_order 順
  const weatherRows = await db.getAllAsync<NightWeather & { nights: number }>(
    `SELECT w.*, COUNT(*) AS nights
       FROM daily_night_weather d
       JOIN night_weather w ON w.id = d.night_weather_id
      WHERE d.study_date BETWEEN ? AND ?
        AND EXISTS (SELECT 1 FROM study_session s WHERE s.study_date = d.study_date)
      GROUP BY w.id
      ORDER BY w.display_order`,
    startDate,
    endDate,
  );

  // 最頻は「回数が最大／同数なら display_order の若い方」。
  // クエリを display_order 順に並べてあるため、回数が最大の先頭要素がそのまま答え
  const topEmotion = pickTop(emotionRows, (r) => r.count);
  const topWeather = pickTop(weatherRows, (r) => r.nights);

  return {
    totalMinutes: totals?.total ?? 0,
    sessionCount: totals?.count ?? 0,
    topEmotion: topEmotion ? stripCount(topEmotion) : null,
    topWeather: topWeather ? stripWeather(topWeather) : null,
    emotionCounts: emotionRows.map((r) => ({
      emotion: stripCount(r),
      count: r.count,
    })),
    weatherAlbum: weatherRows.map((r) => ({
      weather: stripWeather(r),
      nights: r.nights,
    })),
  };
}

/** display_order 順の配列から、指定した数が最大の要素を返す（同数は先頭＝order若い方） */
function pickTop<T>(rows: T[], getCount: (r: T) => number): T | null {
  let best: T | null = null;
  let bestCount = 0;
  for (const r of rows) {
    const c = getCount(r);
    if (c > bestCount) {
      best = r;
      bestCount = c;
    }
  }
  return best;
}

/** COUNT 付きの行から Emotion だけ取り出す */
function stripCount(row: Emotion & { count: number }): Emotion {
  const { count: _count, ...emotion } = row;
  return emotion;
}

/** nights 付きの行から NightWeather だけ取り出す */
function stripWeather(row: NightWeather & { nights: number }): NightWeather {
  const { nights: _nights, ...weather } = row;
  return weather;
}
