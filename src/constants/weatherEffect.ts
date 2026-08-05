// 夜の天気に応じて背景の上へ重ねる演出レイヤー（要件8章）。
//
// 街の背景（townArt / townVideo）とは別の軸で、その学習日に選択された天気に応じて
// 雨・雪などを上から重ねる。天気1種につき1本で済むため、背景の枚数（街×時間帯×レベル）
// とは掛け算にならない。
//
// 【素材の作り方】アルファチャンネルは使わない（H.264 に無いため）。
// **真っ黒な背景に、雨など見せたいものだけを明るく描いた MP4** を用意し、
// 描画側で mixBlendMode: "screen" を掛けて黒を抜く。
// screen は「黒＝透明、明るいほど乗る」合成のため、雨・雪・光の演出に向く。
// 逆に、暗くする表現（豪雨で街が沈むなど）はこの方式では作れない。
//
// 置き場所: assets/home/weather/<name>.mp4
// 街の背景と違い画面いっぱいに敷くだけでスワイプ探索の対象外のため、解像度の登録は不要。
export type WeatherEffect = {
  /** require() した MP4（黒背景・screen 合成前提） */
  source: number;
  /**
   * 重ねる強さ（0〜1）。素材そのものの明るさが強すぎるときに落とす。
   * 背景の明るさは時間帯で変わるため、浮いて見える場合はここで調整する。
   */
  opacity: number;
};

// night_weather.code をキーにする（コードの一覧は db/シードデータ.sql）。
// 素材のある天気だけ登録する。無い天気は演出なし（＝ニュートラルな夜空。要件8）。
const WEATHER_EFFECT: Record<string, WeatherEffect> = {
  rainy_night: {
    source: require("@/assets/home/weather/rain_01.mp4"),
    opacity: 0.8,
  },
};

/**
 * その夜の天気に重ねる演出を返す（未選択・素材が無ければ undefined）。
 * undefined のときは何も重ねない（天気演出のないニュートラルな夜空）。
 */
export function getWeatherEffect(
  weatherCode: string | null | undefined,
): WeatherEffect | undefined {
  if (!weatherCode) return undefined;
  return WEATHER_EFFECT[weatherCode];
}
