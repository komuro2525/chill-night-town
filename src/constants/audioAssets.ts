// 音源ファイルの静的登録（要件9）。
//
// React Native の require() は静的パスのみ解決可能なため、DBの file_path 文字列から
// 実ファイルを動的に読むことはできない。街の背景（townArt.ts）と同じ理由・同じ方式で、
// **コードをキーに静的に対応づける**。DBの file_path は記録・確認用と位置づける。
//
// 分類の持たせ方（Phase 7 で決めた方針）:
//   ・BGM / 環境音 … ambient_sound マスタの code をキーに引く。曲名・クレジットの表示や
//     将来の個別選択（user_sound_preference）はマスタ側が担うため、マスタに載せる
//   ・効果音 / 鐘   … マスタに載せず、ここで用途名をキーに持つ。単一固定ファイルで
//     曲名表示もシャッフルも個別選択もなく、マスタの利点が効かないため
//     （sound_type の CHECK は 'bgm' / 'ambient' のまま拡張しない）
//
// 未登録のコードは undefined を返し、呼び出し側は「その音は鳴らさない」で通す。
// 素材が揃っていない天気の環境音などは、ここへ足すだけで有効になる。

import type { AudioSource } from "expo-audio";

/** BGM。キーは ambient_sound.code（sound_type = 'bgm'） */
const BGM: Record<string, AudioSource> = {
  bgm_223am: require("@/assets/audio/bgm/2_23_AM.mp3"),
  bgm_lofigirl: require("@/assets/audio/bgm/ローファイ少女は今日も寝不足.mp3"),
};

/**
 * 環境音。キーは ambient_sound.code（sound_type = 'ambient'）。
 * 現状は仮素材の2つのみ。天気11種ぶんが揃うまで、未登録の天気は無音とする。
 */
const AMBIENT: Record<string, AudioSource> = {
  amb_rain: require("@/assets/audio/sfx/VSQSE_0319_rain_01.mp3"),
  amb_wind: require("@/assets/audio/sfx/VSQSE_0610_wind_01.mp3"),
};

/** 効果音・鐘の用途 */
export type SfxKey =
  /** 学習終了演出の鐘（要件3.3）。再生中はBGM・環境音をダッキングする */
  | "bell"
  /** 休憩提案が表示されたことを柔らかく知らせる通知音（要件5.1）。鐘とは別・急かさない音 */
  | "break_notice"
  /** ポモドーロの作業⇄休憩の切り替わり（要件3.1）。控えめな音 */
  | "pomodoro_phase"
  /** UI操作音（要件9） */
  | "ui_tap";

/**
 * 効果音・鐘。未制作のものは登録せず、呼び出し側では無音になる。
 * TODO(素材): pomodoro_phase / ui_tap は未制作。break_notice は仮素材
 *   （test_目標達成.mp3 を流用中）。最終的に「それとなく柔らかい休憩の通知音」へ差し替える。
 *   差し替え時は docs/必要素材一覧.md の該当行も更新する。
 */
const SFX: Partial<Record<SfxKey, AudioSource>> = {
  bell: require("@/assets/audio/ambient/The sound of the bell.mp3"),
  break_notice: require("@/assets/audio/ambient/test_目標達成.mp3"),
};

/** BGMの音源（未登録なら undefined） */
export function getBgmSource(code: string): AudioSource | undefined {
  return BGM[code];
}

/** 環境音の音源（未登録なら undefined＝その天気では鳴らさない） */
export function getAmbientSource(code: string): AudioSource | undefined {
  return AMBIENT[code];
}

/** 効果音・鐘の音源（未制作なら undefined＝鳴らさない） */
export function getSfxSource(key: SfxKey): AudioSource | undefined {
  return SFX[key];
}
