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

/** BGMの再生ソース（要件9・音楽プレイリスト）。audio_setting.bgm_source に対応 */
export type BgmSource = "all" | "favorites" | "playlist";

/** キュー生成に使う曲の最小情報（id で所属・並びを判定する） */
export type QueueTrack = { id: number };

/**
 * 再生キュー（曲の並び）を作る（要件9・音楽プレイリスト）。純関数。
 *
 * ソースごとに対象を絞ってから、シャッフルなら並べ替える:
 *   ・all       … 登録曲全部（tracks の順）
 *   ・favorites … ★お気に入りの曲だけ（tracks の順を保つ＝安定順）
 *   ・playlist  … マイプレイリストに入れた曲を playlistOrderedIds の順に
 * シャッフルは「一巡するまで同じ曲を出さない」ため、ここでは対象集合を一度だけ
 * 並べ替える（呼び出し側は末尾まで流し切ってから作り直す）。乱数を注入してテスト可能にする。
 *
 * @returns 再生順に並んだ曲（元の配列は変更しない）
 */
export function buildBgmQueue<T extends QueueTrack>(params: {
  tracks: T[];
  favoriteIds: number[];
  playlistOrderedIds: number[];
  source: BgmSource;
  shuffle: boolean;
  random?: () => number;
}): T[] {
  const { tracks, favoriteIds, playlistOrderedIds, source, shuffle: doShuffle, random } = params;

  let base: T[];
  if (source === "favorites") {
    const favSet = new Set(favoriteIds);
    base = tracks.filter((t) => favSet.has(t.id));
  } else if (source === "playlist") {
    const byId = new Map(tracks.map((t) => [t.id, t]));
    // プレイリスト順に並べる。削除済み等で tracks に無い id は除く
    base = playlistOrderedIds
      .map((id) => byId.get(id))
      .filter((t): t is T => t !== undefined);
  } else {
    base = [...tracks];
  }

  return doShuffle ? shuffle(base, random) : base;
}

/**
 * 一巡し終えてキューを作り直すときの並び（要件9: 直前の曲がすぐ再来しないようにする）。
 * 新しくシャッフルした先頭が直前に流した曲（lastId）と同じなら、先頭を後ろへ1つ送る。
 * 2曲以上のときだけ効果があり、1曲・空では素直に返す。
 *
 * @param queue 新しく作った次周のキュー
 * @param lastId 直前に流し終えた曲のid（無ければ null）
 */
export function avoidImmediateRepeat<T extends QueueTrack>(
  queue: T[],
  lastId: number | null,
): T[] {
  if (queue.length < 2 || lastId === null) return queue;
  if (queue[0].id !== lastId) return queue;
  return [...queue.slice(1), queue[0]];
}
