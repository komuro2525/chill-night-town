import { buildWeatherVariantSeed, pickVariantIndex } from "@/lib/video-variant";

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
// 置き場所: assets/home/weather/<天気コード>_<連番>.mp4
// 街の背景と違い画面いっぱいに敷くだけでスワイプ探索の対象外のため、解像度の登録は不要。
//
// 【複数パターン】背景動画（townVideo.ts）と同じく、1つの天気に降り方の違う動画を
// 複数登録できる。どれを流すかは**学習日ごとに決まり、同じ夜のあいだは変わらない**
// （選び方は lib/video-variant.ts。乱数を使わない理由も同ファイル）。
// 同じ「雨音の夜」でも夜ごとに降り方が変わり、毎晩帰ってくる街に小さな表情の差が出る。
export type WeatherEffect = {
  /** require() した MP4（黒背景・screen 合成前提） */
  source: number;
  /**
   * 重ねる強さ（0〜1）。素材そのものの明るさが強すぎるときに落とす。
   * 背景の明るさは時間帯で変わるため、浮いて見える場合はここで調整する。
   * パターンごとに濃さが違うため、1本ずつ持つ。
   */
  opacity: number;
};

// night_weather.code をキーにする（コードの一覧は db/シードデータ.sql）。
// 素材のある天気だけ登録する。無い天気は演出なし（＝ニュートラルな夜空。要件8）。
//
// 未登録: 星空 / 月灯り / 満月 / 闇夜 / 雲間 / 静寂 / 霧（素材未制作）。
// 採用しなかった素材とその理由は assets/未使用/README.md にある。
const WEATHER_EFFECT: Record<string, WeatherEffect[]> = {
  // 雨音の夜: 斜めの弱い雨 / 中くらいの雨 / まっすぐな雨
  rainy_night: [
    {
      source: require("@/assets/home/weather/rainy_night_1.mp4"),
      opacity: 0.8,
    },
    {
      source: require("@/assets/home/weather/rainy_night_2.mp4"),
      opacity: 0.8,
    },
    {
      source: require("@/assets/home/weather/rainy_night_3.mp4"),
      opacity: 0.8,
    },
  ],
  // 嵐の夜: 強い雨。雷は下の WEATHER_FLASH で時々重ねる（改訂履歴 要件57）
  stormy_night: [
    {
      source: require("@/assets/home/weather/stormy_night_1.mp4"),
      opacity: 0.8,
    },
    {
      source: require("@/assets/home/weather/stormy_night_2.mp4"),
      opacity: 0.8,
    },
    {
      source: require("@/assets/home/weather/stormy_night_3.mp4"),
      opacity: 0.8,
    },
    {
      source: require("@/assets/home/weather/stormy_night_4.mp4"),
      opacity: 0.8,
    },
  ],
  // 雪明かりの夜
  snowy_night: [
    {
      source: require("@/assets/home/weather/snowy_night_1.mp4"),
      opacity: 0.8,
    },
    {
      source: require("@/assets/home/weather/snowy_night_2.mp4"),
      opacity: 0.8,
    },
    {
      source: require("@/assets/home/weather/snowy_night_3.mp4"),
      opacity: 0.8,
    },
  ],
  // 花火の夜
  fireworks_night: [
    {
      source: require("@/assets/home/weather/fireworks_night_1.mp4"),
      opacity: 0.8,
    },
  ],
};


// 天気に**重ねる単発の演出**（雷など）。上のループ素材の上へさらに敷く。
//
// 雨や雪は降り続けるのでループでよいが、雷は光り続けない。ループさせると素材の尺ごとに
// 光ってしまい画面が落ち着かなくなるため、一度流したら伏せて間隔を置く
// （間隔の決め方は components/weather-flash.tsx）。
//
// 天気1種につき1本。素材は同じく黒背景・screen 合成前提。
const WEATHER_FLASH: Record<string, WeatherEffect> = {
  // 嵐の夜: 強い雨（上のループ）に、雷を時々重ねる。
  // 当初は雷の映像を使わず環境音だけで雷らしさを出す方針だったが、素材の採用にあたり
  // 「ループさせず間隔を置く」形が決まったため映像も使うことにした（改訂履歴 要件57）。
  stormy_night: {
    source: require("@/assets/home/weather/stormy_night_flash.mp4"),
    opacity: 0.9,
  },
};

/**
 * その天気に重ねる単発の演出を返す（無ければ undefined）。
 * ループ素材（getWeatherEffect）とは別に、上へ重ねて時々流す。
 */
export function getWeatherFlash(
  weatherCode: string | null | undefined,
): WeatherEffect | undefined {
  if (!weatherCode) return undefined;
  return WEATHER_FLASH[weatherCode];
}
/**
 * その夜に重ねる演出を返す（未選択・素材が無ければ undefined）。
 * undefined のときは何も重ねない（天気演出のないニュートラルな夜空）。
 *
 * 複数パターンのある天気は学習日で1つに決まる。同じ学習日なら何度呼んでも同じ結果に
 * なるため、毎分の時刻更新や画面回転で再評価されても降り方は切り替わらない。
 *
 * @param weatherCode night_weather.code。未選択は null
 * @param studyDate 表示中の学習日（YYYY-MM-DD）。パターンの抽選に使う
 */
export function getWeatherEffect(
  weatherCode: string | null | undefined,
  studyDate: string,
): WeatherEffect | undefined {
  if (!weatherCode) return undefined;
  const variants = WEATHER_EFFECT[weatherCode];
  if (!variants || variants.length === 0) return undefined;
  const seed = buildWeatherVariantSeed(studyDate, weatherCode);
  return variants[pickVariantIndex(seed, variants.length)];
}
