// 背景画像の「季節×時間帯」判定（docs/背景_季節×時間帯スケジュール.md）。純関数。
//
// ホームの背景は街ごとに「時間帯5種 × レベル5段階」の画像を持つ（素材は全季節共用）。
// 季節によって変わるのは各時間帯を表示する時刻の境界だけ。ここでは現在時刻から
// 「季節」と「時間帯」を算出する。境界（各時間帯の切り替わり）は画面を見ても
// 正しさが分からず、素材差し替え後は表示がこの結果に乗るため、テストで固定する。

import { now } from "./clock";

/** 季節（月で決まる）。3〜5月=spring / 6〜8月=summer / 9〜11月=autumn / 12〜2月=winter */
export type Season = "spring" | "summer" | "autumn" | "winter";

/** 時間帯。背景画像のファイル名 <town>_<timeOfDay>_lv<N>.png のキーになる */
export type TimeOfDay = "sunrise" | "day" | "sunset" | "night" | "latenight";

/**
 * 各季節の時間帯の「開始時刻（0時からの分）」。
 * ある時間帯は「自分の開始 〜 次の時間帯の開始の直前」まで（下限含み・上限は次帯へ）。
 * latenight は日を跨ぎ、latenight開始 〜 24:00 と 00:00 〜 sunrise開始の直前 まで。
 * 例（春）: sunrise 05:00-06:59 / day 07:00-17:29 / sunset 17:30-18:29 /
 *          night 18:30-22:59 / latenight 23:00-04:59
 *
 * sunset帯は「空が赤くなり始め（日の入りの約35分前）〜暗くなる（日の入り後約30分＝薄明終わり）」に
 * 合わせている（東京あたりの実際の日の入りが基準。季節ごとに代表的な時刻を採る）。
 */
const SEASON_BOUNDARIES: Record<
  Season,
  { sunrise: number; day: number; sunset: number; night: number; latenight: number }
> = {
  // 分 = 時*60+分。sunset/night は実際の日の入り（春≈18:00 / 夏≈18:50 / 秋≈17:15 / 冬≈16:40）に合わせる
  spring: { sunrise: 5 * 60, day: 7 * 60, sunset: 17 * 60 + 30, night: 18 * 60 + 30, latenight: 23 * 60 },
  summer: { sunrise: 4 * 60, day: 6 * 60, sunset: 18 * 60 + 15, night: 19 * 60 + 30, latenight: 23 * 60 },
  autumn: { sunrise: 5 * 60, day: 7 * 60, sunset: 16 * 60 + 40, night: 17 * 60 + 45, latenight: 23 * 60 },
  winter: { sunrise: 6 * 60, day: 8 * 60, sunset: 16 * 60, night: 17 * 60 + 10, latenight: 23 * 60 },
};

/** 月（1〜12）から季節を返す */
export function getSeason(instant: Date = now()): Season {
  const month = instant.getMonth() + 1;
  if (month >= 3 && month <= 5) return "spring";
  if (month >= 6 && month <= 8) return "summer";
  if (month >= 9 && month <= 11) return "autumn";
  return "winter"; // 12・1・2月
}

/**
 * 現在時刻の時間帯を返す（季節ごとの境界に従う）。
 * 時刻はアプリ内クロック（開発用の時刻上書きも反映される）を使う。
 */
export function getTimeOfDay(instant: Date = now()): TimeOfDay {
  const b = SEASON_BOUNDARIES[getSeason(instant)];
  const minutes = instant.getHours() * 60 + instant.getMinutes();

  // latenight は日跨ぎ: latenight開始以降、または sunrise開始より前
  if (minutes >= b.latenight || minutes < b.sunrise) return "latenight";
  if (minutes >= b.night) return "night";
  if (minutes >= b.sunset) return "sunset";
  if (minutes >= b.day) return "day";
  return "sunrise"; // b.sunrise <= minutes < b.day
}
