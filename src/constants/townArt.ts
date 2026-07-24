import type { ImageSourcePropType } from "react-native";

import type { TimeOfDay } from "@/lib/background-schedule";

// 街コード → 時間帯 → レベル別背景画像の登録（docs/背景_季節×時間帯スケジュール.md）。
//
// React Native の require() は静的パスのみ解決可能なため、DBのパス文字列ではなく
// 街コードをキーに静的に対応づける（将来 Firebase 連携時もこの層で吸収できる）。
// ファイル名は仕様命名 <town>_<timeOfDay>_lv<N>.png。
//
// 時間帯ごとの差分素材ができた時間帯だけ登録する。差分ができたら各街に
// day / sunrise / sunset / latenight を足す。未登録の時間帯は night へフォールバックする。
// 画像は時間帯フォルダ配下に置く: assets/images/home/<town>/<timeOfDay>/<town>_<timeOfDay>_lv<N>.png
// アート未作成の街は未登録とし、UI側でプレースホルダ（準備中）を表示する。
type LevelArt = Record<number, ImageSourcePropType>;
type TownArt = Partial<Record<TimeOfDay, LevelArt>>;

const TOWN_ART: Record<string, TownArt> = {
  // nightTown（海辺の港町テーマ）。night・sunset の Lv.1〜Lv.5 がそろっている。
  nightTown: {
    night: {
      1: require("@/assets/images/home/nightTown/night/nightTown_night_lv1.png"),
      2: require("@/assets/images/home/nightTown/night/nightTown_night_lv2.png"),
      3: require("@/assets/images/home/nightTown/night/nightTown_night_lv3.png"),
      4: require("@/assets/images/home/nightTown/night/nightTown_night_lv4.png"),
      5: require("@/assets/images/home/nightTown/night/nightTown_night_lv5.png"),
    },
    sunset: {
      1: require("@/assets/images/home/nightTown/sunset/nightTown_sunset_lv1.png"),
      2: require("@/assets/images/home/nightTown/sunset/nightTown_sunset_lv2.png"),
      3: require("@/assets/images/home/nightTown/sunset/nightTown_sunset_lv3.png"),
      4: require("@/assets/images/home/nightTown/sunset/nightTown_sunset_lv4.png"),
      5: require("@/assets/images/home/nightTown/sunset/nightTown_sunset_lv5.png"),
    },
  },
  // castleTown。画像は Lv.5 の night が1枚のみ。暫定で全レベルに同じ画像を使う。
  // レベル別・時間帯別の画像ができたら差し替える。
  castleTown: {
    night: (() => {
      const only = require("@/assets/images/home/castleTown/castleTown_night_lv5.png");
      return { 1: only, 2: only, 3: only, 4: only, 5: only };
    })(),
  },
  // snowTown / starHill は画像未制作のため未登録（「準備中」枠として表示・選択不可）
};

/**
 * 指定した街コード・レベル・時間帯の背景画像を返す（未登録なら undefined）。
 * 指定した時間帯の画像が無ければ night へフォールバックする
 * （時間帯差分の素材が用意されるまでは、全時間帯で night 画像になる）。
 */
export function getTownArt(
  code: string,
  level: number,
  timeOfDay: TimeOfDay = "night",
): ImageSourcePropType | undefined {
  const town = TOWN_ART[code];
  if (!town) return undefined;
  const byTime = town[timeOfDay] ?? town.night;
  return byTime?.[level];
}

/** その街のアートが用意されているか（未作成の街の判定に使う） */
export function hasTownArt(code: string): boolean {
  return TOWN_ART[code] != null;
}
