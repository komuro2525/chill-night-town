// 夜の天気 → 環境音の選択（要件9 / UC 9.1）。純関数。
//
// 環境音は「時間帯や選択中の夜の天気に応じて自動再生」する（要件9）。
// 天気と環境音の対応はどのテーブルにも無い（設計上の対応づけ）ため、ここに集約する。
// 画面を見ても正しさが分からず、対応を取り違えると別の音が流れるため、テストで固定する。
//
// 環境音は単一のプレイヤーでループし続ける（AudioContext の applyAmbient）。
// そのため素材は「継ぎ目なく流し続けられる長さ」であることが前提で、単発の雷のような
// 数秒の音は使えない（10秒おきに鳴り続けてしまう）。採用しなかった素材と理由は
// assets/未使用/README.md にある。
//
// 対応表に無い天気・未選択のときは null（＝環境音を鳴らさない＝静かな夜）。
// 11種すべてに音を当てているわけではなく、**音の無い夜をあえて残している**。
// どの夜も何かしら鳴っていると、天気を選び分ける意味が音の側から消えるため。
// 返すのは ambient_sound.code（音源の解決は constants/audioAssets.ts の静的マップが
// 担う。BGM・効果音と同じ方式）。

/**
 * 天気コード → 環境音コード。対応が無ければ null。
 *
 * @param weatherCode night_weather.code。未選択のときは null
 */
export function selectAmbientCode(weatherCode: string | null): string | null {
  if (weatherCode === null) return null;
  return WEATHER_TO_AMBIENT[weatherCode] ?? null;
}

const WEATHER_TO_AMBIENT: Record<string, string> = {
  rainy_night: "amb_rain", // 雨音の夜
  // 嵐の夜。映像は強い雨だけで雷を出さないと決めたため、雷らしさは音のほうで出す
  stormy_night: "amb_thunder_rain",
  // 風の音は「空気が動いている夜」に広く当てる。霧・闇夜・雲間はいずれも
  // 見晴らしが利かない夜で、風の音があると静けさではなく気配のほうが立つ
  foggy_night: "amb_wind", // 霧の夜
  dark_night: "amb_wind", // 闇夜
  cloudy_night: "amb_wind", // 雲間の夜
  full_moon_night: "amb_insect", // 満月の夜（虫の音）
  // 音を当てていない夜: 星空 / 月灯り / 雪明かり / 静寂 / 花火
};
