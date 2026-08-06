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
import {
  pickLongestNight,
  tallyStartHours,
  type HourCount,
  type NightTotal,
} from "@/lib/calendar";

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
  /** その夜の写真（要件2.6）。撮っていなければ null */
  photo: { fileName: string; takenAt: string } | null;
  totalMinutes: number;
  achieved: boolean;
  sessions: DaySessionRecord[];
};

/** 月次サマリー（要件4.2） */
export type MonthSummary = {
  totalMinutes: number;
  sessionCount: number;
  /** その月に学習した夜の数（アルバムの見え方の段階に使う。要件4.2） */
  nightCount: number;
  /** 最も多かった感情（記録が無ければ null） */
  topEmotion: Emotion | null;
  /** 最も多かった夜の天気（記録が無ければ null） */
  topWeather: NightWeather | null;
  /** 感情別の記録回数（display_order 順）。感情記録の内訳 */
  emotionCounts: { emotion: Emotion; count: number }[];
  /** 夜の天気アルバム: 集めた天気と夜数（display_order 順、集めた分のみ） */
  weatherAlbum: { weather: NightWeather; nights: number }[];
  /** 目標に届いた夜の数（割合にはしない。要件4.2） */
  achievedNights: number;
  /** 学習内容タグ別の記録回数（多い順に並べるのは表示側） */
  tagCounts: { tag: StudyTag; count: number }[];
  /** よく灯していた時間帯（夜の並び順・記録のある区間のみ） */
  startHours: HourCount[];
};

/** 通算のふりかえり（要件4.4）。全期間・全街合計の集計 */
export type OverallSummary = {
  /** 全期間の実績学習時間の合計（分） */
  totalMinutes: number;
  /** 通った夜の数（学習記録のある学習日の数） */
  nightCount: number;
  /** いちばん長かった夜（記録が無ければ null） */
  longestNight: NightTotal | null;
  /** 通算の夜の天気アルバム（display_order 順、集めた分のみ） */
  weatherAlbum: { weather: NightWeather; nights: number }[];
  /** 目標に届いた夜の数（全期間） */
  achievedNights: number;
  /** 学習内容タグ別の記録回数（全期間） */
  tagCounts: { tag: StudyTag; count: number }[];
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

/** 指定学習日の詳細（全セッション＋天気＋写真）。記録が無ければ sessions 空（要件4.1） */
export async function getDayDetail(studyDate: string): Promise<DayDetail> {
  const db = await getDatabase();

  const weather = await db.getFirstAsync<NightWeather>(
    `SELECT w.* FROM night_weather w
       JOIN daily_night_weather d ON d.night_weather_id = w.id
      WHERE d.study_date = ?`,
    studyDate,
  );

  // 写真は天気と同じ行にあるが、天気未選択（night_weather_id が NULL）の夜にも
  // 存在し得るため、上の JOIN とは別に引く（要件2.6）
  const photoRow = await db.getFirstAsync<{
    photo_file_name: string | null;
    photo_taken_at: string | null;
  }>(
    `SELECT photo_file_name, photo_taken_at
       FROM daily_night_weather WHERE study_date = ?`,
    studyDate,
  );
  const photo =
    photoRow?.photo_file_name && photoRow.photo_taken_at
      ? { fileName: photoRow.photo_file_name, takenAt: photoRow.photo_taken_at }
      : null;

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
    photo,
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
    nights: number;
  }>(
    `SELECT SUM(duration_minutes) AS total, COUNT(*) AS count,
            COUNT(DISTINCT study_date) AS nights
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

  // 目標に届いた夜の数（要件4.2）。割合にはしないため、件数だけを数える
  const achieved = await db.getFirstAsync<{ count: number }>(
    "SELECT COUNT(*) AS count FROM daily_goal_achievement WHERE study_date BETWEEN ? AND ?",
    startDate,
    endDate,
  );

  const tagRows = await countTagsIn(startDate, endDate);

  // 時間帯はローカル時刻の「時」で数える必要があるため、SQL では数えず開始時刻を取り出す
  // （start_time はUTCのISO文字列。strftime で数えると時差ぶんずれる）
  const startTimeRows = await db.getAllAsync<{ start_time: string }>(
    "SELECT start_time FROM study_session WHERE study_date BETWEEN ? AND ?",
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
    nightCount: totals?.nights ?? 0,
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
    achievedNights: achieved?.count ?? 0,
    tagCounts: tagRows,
    startHours: tallyStartHours(startTimeRows.map((r) => r.start_time)),
  };
}

/**
 * 通算のふりかえり（要件4.4）。全期間・全街合計で集計する。
 *
 * 数え方は月次サマリー（4.2）に揃える。月と違って範囲で絞らないだけで、
 * 「天気は学習記録のある夜だけを夜の数で数える」条件はそのまま残す。
 */
export async function getOverallSummary(): Promise<OverallSummary> {
  const db = await getDatabase();

  // 学習日ごとの実績合計。夜の数と最長の夜をここから求める
  // （夜の数を COUNT(DISTINCT) で別に引かず、1本のクエリで賄う）
  const nightRows = await db.getAllAsync<{
    study_date: string;
    minutes: number | null;
  }>(
    `SELECT study_date, SUM(duration_minutes) AS minutes
       FROM study_session
      GROUP BY study_date`,
  );
  const nights: NightTotal[] = nightRows.map((r) => ({
    studyDate: r.study_date,
    minutes: r.minutes ?? 0,
  }));

  const totals = await db.getFirstAsync<{ total: number | null }>(
    "SELECT SUM(duration_minutes) AS total FROM study_session",
  );

  // 天気は「学習記録のある夜」を対象に夜の数で数える（1晩1天気）。display_order 順
  const weatherRows = await db.getAllAsync<NightWeather & { nights: number }>(
    `SELECT w.*, COUNT(*) AS nights
       FROM daily_night_weather d
       JOIN night_weather w ON w.id = d.night_weather_id
      WHERE EXISTS (SELECT 1 FROM study_session s WHERE s.study_date = d.study_date)
      GROUP BY w.id
      ORDER BY w.display_order`,
  );

  const achieved = await db.getFirstAsync<{ count: number }>(
    "SELECT COUNT(*) AS count FROM daily_goal_achievement",
  );

  return {
    totalMinutes: totals?.total ?? 0,
    nightCount: nights.length,
    longestNight: pickLongestNight(nights),
    weatherAlbum: weatherRows.map((r) => ({
      weather: stripWeather(r),
      nights: r.nights,
    })),
    achievedNights: achieved?.count ?? 0,
    tagCounts: await countTagsIn(),
  };
}

/**
 * 学習内容タグ別の記録回数（要件4.2 / 4.4）。
 *
 * セッション単位で数える（1セッションに複数タグが付いていれば、それぞれ1回ずつ）。
 * 削除済みタグ（is_active = 0）も、過去の記録に付いているものは含める——
 * タグを消しただけで過去の集計が書き換わるのは、記録として正しくないため。
 *
 * 範囲を省略すると全期間を集計する（通算のふりかえり）。
 */
async function countTagsIn(
  startDate?: string,
  endDate?: string,
): Promise<{ tag: StudyTag; count: number }[]> {
  const db = await getDatabase();
  const scoped = startDate !== undefined && endDate !== undefined;
  const rows = await db.getAllAsync<StudyTag & { count: number }>(
    `SELECT t.*, COUNT(*) AS count
       FROM session_tag st
       JOIN study_tag t ON t.id = st.study_tag_id
       JOIN study_session s ON s.id = st.study_session_id
      ${scoped ? "WHERE s.study_date BETWEEN ? AND ?" : ""}
      GROUP BY t.id
      ORDER BY t.is_custom, t.display_order, t.id`,
    ...(scoped ? [startDate, endDate] : []),
  );
  return rows.map((r) => {
    const { count, ...tag } = r;
    return { tag, count };
  });
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
