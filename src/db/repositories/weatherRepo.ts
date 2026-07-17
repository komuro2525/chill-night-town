// 夜の天気（daily_night_weather）リポジトリ
//
// 要件2.5: 天気は「1晩＝1天気」。その学習日のあいだ何度でも選び直せて、
//   最後に選択された天気がその夜の天気として残る。
//   学習セッション（study_session / active_session）は天気を持たない。
//
// 選択の経路は3つ（ホーム画面の天気カード・タイマー設定・学習成果記録）だが、
// いずれも本リポジトリの setWeather() を通す。演出（背景・環境音）も
// カレンダー・天気アルバムも、参照先は常にこのテーブルとする。

import { getDatabase } from "../database";
import type { DailyNightWeather, NightWeather } from "../types";

/** 指定学習日に選択されている天気（未選択なら null） */
export async function getWeatherByStudyDate(
  studyDate: string,
): Promise<NightWeather | null> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<NightWeather>(
    `SELECT w.* FROM night_weather w
       JOIN daily_night_weather d ON d.night_weather_id = w.id
      WHERE d.study_date = ?`,
    studyDate,
  );
  return row ?? null;
}

/** 指定学習日の選択記録そのもの（未選択なら null） */
export async function getDailyWeather(
  studyDate: string,
): Promise<DailyNightWeather | null> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<DailyNightWeather>(
    "SELECT * FROM daily_night_weather WHERE study_date = ?",
    studyDate,
  );
  return row ?? null;
}

/**
 * その学習日の天気を選択・変更する（1晩＝1天気のため上書き）。
 * 選び直しても履歴は残さず、最後の選択がその夜の天気になる（要件2.5）。
 */
export async function setWeather(
  userId: number,
  studyDate: string,
  nightWeatherId: number,
): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    `INSERT INTO daily_night_weather (user_id, study_date, night_weather_id, updated_at)
     VALUES (?, ?, ?, datetime('now'))
     ON CONFLICT (user_id, study_date)
     DO UPDATE SET night_weather_id = excluded.night_weather_id,
                   updated_at = excluded.updated_at`,
    userId,
    studyDate,
    nightWeatherId,
  );
}
