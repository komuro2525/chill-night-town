// 音の再生に関わる純関数（要件9 / UC 9.1・9.2・10.4）。
//
// 音量は「設定値（0〜100の整数）」と「プレイヤーの音量（0.0〜1.0）」の2つの世界があり、
// 変換を各所で書くとズレる。ここに集約して境界（0 / 1 / 100）をテストで固定する。
//
// 「音量0の音は再生処理自体を行わない」（要件9）は本アプリの明示ルールで、
// 判定を isMuted() 1つに寄せる。プレイヤー側で volume=0 にして鳴らし続けるのではなく、
// 呼び出し側が再生そのものを行わない、という意味であることに注意。
//
// 本モジュールは expo-audio にもReactにも依存しない（副作用を持たない）。

import { AUDIO } from "@/constants/domain";

/**
 * 設定値（0〜100）をプレイヤーの音量（0.0〜1.0）へ変換する。
 * 値域外は 0〜1 に丸める（DBの CHECK で担保されているが、念のため）。
 */
export function toPlayerVolume(setting: number): number {
  if (!Number.isFinite(setting)) return 0;
  const clamped = Math.min(AUDIO.VOLUME_MAX, Math.max(0, setting));
  return clamped / AUDIO.VOLUME_MAX;
}

/**
 * その分類が消音か（＝再生処理自体を行わないか）。要件9。
 * 1以上なら鳴らす。0のときだけ再生しない。
 */
export function isMuted(setting: number): boolean {
  return !(setting > 0);
}

/**
 * 鐘の再生中に BGM・環境音を下げるときの音量（要件3.3 のダッキング）。
 * 元の音量に一定比率を掛けた値を返す。元が0なら0のまま。
 */
export function duckedVolume(
  setting: number,
  ratio: number = AUDIO.DUCKING_RATIO,
): number {
  return toPlayerVolume(setting) * Math.min(1, Math.max(0, ratio));
}

/**
 * BGMプールのシャッフル順を作る（要件9: シャッフル再生）。
 *
 * Fisher-Yates。乱数を引数で受け取るのは、テストで順序を固定して
 * 「全曲がちょうど1回ずつ現れる」ことを検証できるようにするため。
 *
 * @param items 並べ替える対象（元の配列は変更しない）
 * @param random 0以上1未満を返す乱数。既定は Math.random
 */
export function shuffle<T>(items: T[], random: () => number = Math.random): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/**
 * 次の曲の位置（要件9: 曲が終わると自動的に次の曲へ進む）。
 * 末尾まで来たら先頭へ戻る（プールを繰り返し再生する）。
 * 空のプールでは 0 を返す（呼び出し側は再生しない）。
 */
export function nextTrackIndex(current: number, length: number): number {
  if (length <= 0) return 0;
  return (current + 1) % length;
}
