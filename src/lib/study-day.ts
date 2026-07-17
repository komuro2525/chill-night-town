// =====================================================================
// 学習日・時刻ユーティリティ（共通関数）
// 要件0章: 学習日 = 18:00〜翌5:00 の1サイクル。
//   セッションの開始時刻が属するサイクルの開始日に帰属させる。
//   例: 1/10 23:30開始 → 翌1:30終了 は「1/10」の記録。
// CLAUDE.md: 学習日の算出は必ずこの共通関数へ集約する。
// =====================================================================

import { STUDY_DAY } from "@/constants/domain";
import { now } from "./clock";

/** Date をローカルタイムの 'YYYY-MM-DD' に整形する（UTCではなく端末ローカル基準） */
export function formatDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = `${date.getMonth() + 1}`.padStart(2, "0");
  const d = `${date.getDate()}`.padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * 指定時刻が属する「学習日」（'YYYY-MM-DD'）を返す。
 *
 * 帰属ルール:
 *   - 0:00〜4:59（翌5:00より前）  → 前日（前夜に始まったサイクルの開始日）
 *   - 5:00〜23:59                → 当日
 *
 * 注: セッションの start_time は夜間帯（18:00〜翌5:00）に限られるため、
 *     セッション帰属では上記2分岐のうち有効なのは「18:00〜23:59=当日」
 *     「0:00〜4:59=前日」のみ。5:00〜17:59（昼）は開始できないが、
 *     ホーム表示等で当関数が呼ばれた場合は「これから始まる夜のサイクル=当日」に
 *     帰属させる方針とする（※この昼間の扱いは要確認事項）。
 */
export function getStudyDate(instant: Date = now()): string {
  const d = new Date(instant.getTime());
  if (d.getHours() < STUDY_DAY.END_HOUR) {
    d.setDate(d.getDate() - 1);
  }
  return formatDateKey(d);
}

/**
 * 指定時刻が夜間帯（18:00〜翌5:00）かどうか。学習開始可否の判定に使う（要件2.3）。
 * 5:00 ちょうどは夜間帯外（自動終了時刻）とする。
 */
export function isNightTime(instant: Date = now()): boolean {
  const hour = instant.getHours();
  return hour >= STUDY_DAY.START_HOUR || hour < STUDY_DAY.END_HOUR;
}

const WEEKDAY_LABELS = ["日", "月", "火", "水", "木", "金", "土"];

/**
 * 学習日（'YYYY-MM-DD'）を「1/10（金）の夜」の形にする。
 *
 * どの夜の記録として扱われるかをユーザーへ明示するために使う（要件2.5）。
 * 深夜1時に開いても「その夜」は前日付になるため、この表示が食い違いを防ぐ。
 */
export function formatStudyDateLabel(studyDate: string): string {
  const [y, m, d] = studyDate.split("-").map(Number);
  const weekday = WEEKDAY_LABELS[new Date(y, m - 1, d).getDay()];
  return `${m}/${d}（${weekday}）の夜`;
}

/**
 * 学習時間（分）を日本語の表示用文字列にする。
 * 例: 0 → '0分' / 45 → '45分' / 60 → '1時間' / 95 → '1時間35分'
 */
export function formatMinutes(minutes: number): string {
  const safe = minutes < 0 ? 0 : Math.floor(minutes);
  const hours = Math.floor(safe / 60);
  const mins = safe % 60;
  if (hours === 0) return `${mins}分`;
  if (mins === 0) return `${hours}時間`;
  return `${hours}時間${mins}分`;
}

/**
 * 差分秒数を0以上に丸める（要件3.2: 端末時計変更等で負値になった場合は0扱い）。
 */
export function clampNonNegativeSeconds(seconds: number): number {
  return seconds < 0 ? 0 : seconds;
}
