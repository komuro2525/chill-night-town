// 夜の天気 → 環境音の選択（要件9 / UC 9.1）。純関数。
//
// 環境音は「時間帯や選択中の夜の天気に応じて自動再生」する（要件9）。
// 天気と環境音の対応はどのテーブルにも無い（設計上の対応づけ）ため、ここに集約する。
// 画面を見ても正しさが分からず、対応を取り違えると別の音が流れるため、テストで固定する。
//
// 現状の音源は仮素材2つ（amb_rain / amb_wind）のみ。対応表に無い天気・未選択のときは
// null（＝環境音を鳴らさない＝天気演出のないニュートラルな夜）。素材が11種そろったら、
// ここへ追記するだけで対応が増える。返すのは ambient_sound.code（音源の解決は
// constants/audioAssets.ts の静的マップが担う。BGM・効果音と同じ方式）。

/**
 * 天気コード → 環境音コード。対応が無ければ null。
 *
 * ※対応は暫定（仮素材ベース）。雨系は雨音、霧は夜風に割り当てて両方の素材を使う。
 *   最終素材（天気11種ぶん）が届いたら見直す。
 *
 * @param weatherCode night_weather.code。未選択のときは null
 */
export function selectAmbientCode(weatherCode: string | null): string | null {
  if (weatherCode === null) return null;
  return WEATHER_TO_AMBIENT[weatherCode] ?? null;
}

const WEATHER_TO_AMBIENT: Record<string, string> = {
  rainy_night: "amb_rain", // 雨音の夜
  stormy_night: "amb_rain", // 嵐の夜（雨の音を流す）
  foggy_night: "amb_wind", // 霧の夜（夜風）
};
