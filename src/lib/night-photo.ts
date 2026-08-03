// =====================================================================
// その夜の写真（要件2.6）— 帰属・ファイル名・表示の純粋ロジック
//
// 要件2.6: 写真は1学習日に1枚。帰属する学習日は「撮り始めた時刻」が属する学習日で、
//   保存が完了した時刻では判定しない（セッションが開始時刻で帰属するのと同じ）。
//   一方、表示には実際の撮影時刻を使う。この2つは意図的に食い違い得る
//   （例: 学習日 2026-01-10 の写真を 1/11 1:30 に撮影）。
//
// ファイルの読み書きはここでは行わない（night-photo-storage.ts が持つ）。
// 帰属と命名だけを切り出してあるのは、画面を見ても正しさが分からず、
// 壊れると写真が別の夜に付く・撮り直しが反映されない形で記録に響くため。
// =====================================================================

import { now } from "./clock";
import { getStudyDate } from "./study-day";

/** 写真の保存ディレクトリ名（アプリ専有領域の下） */
export const NIGHT_PHOTO_DIR = "night-photos";

/**
 * その学習日に写真を追加・撮り直しできるか（要件2.6）。
 *
 * 追加・撮り直しができるのは「その学習日が終わる（5:00）まで」であり、
 * 過ぎた夜には足せない。判定は学習日どうしの比較で行い、5:00の境界は
 * getStudyDate に委ねる（境界の判定をここで書き直すと二重管理になるため）。
 *
 * ※削除はこの制限を受けない（過去の夜も常に消せる。要件4.1）。
 */
export function canAttachPhoto(studyDate: string, instant: Date = now()): boolean {
  return getStudyDate(instant) === studyDate;
}

/**
 * 写真のファイル名を作る（例: '2026-01-10-1767974400000.jpg'）。
 *
 * 撮影時刻をファイル名に含めるのは、撮り直しのたびに別名にするため。
 * 同じ名前で上書きすると、画像の表示側が前の画像をキャッシュしたまま
 * 更新されないことがある（撮り直したのに古い写真が出る）。
 */
export function buildPhotoFileName(studyDate: string, takenAt: Date): string {
  return `${studyDate}-${takenAt.getTime()}.jpg`;
}

/**
 * 撮影時刻を「1/11 1:30 に撮影」の形にする。
 *
 * 日付をまたいで撮った写真は前日の夜の記録に入るため（1/11 1:30 の写真が
 * 「1/10の夜」に並ぶ）、実際に撮った時刻を添えて読み違えを防ぐ（要件2.6）。
 */
export function formatTakenAtLabel(takenAtIso: string): string {
  const d = new Date(takenAtIso);
  if (Number.isNaN(d.getTime())) return "";
  const mi = String(d.getMinutes()).padStart(2, "0");
  return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours()}:${mi} に撮影`;
}
