import type { ImageSourcePropType } from "react-native";

// 街コード → レベル別背景画像の登録。
// React Native の require() は静的パスのみ解決可能なため、DBのパス文字列ではなく
// 街コードをキーに静的に対応づける（将来 Firebase 連携時もこの層で吸収できる）。
// アート未作成の街は未登録とし、UI側でプレースホルダ（準備中）を表示する。
const TOWN_LEVEL_ART: Record<string, Record<number, ImageSourcePropType>> = {
  // nightTown（海辺の港町テーマ）。Lv.1〜Lv.5 の画像がそろっている。
  nightTown: {
    1: require("@/assets/images/home/nightTown/lv1.png"),
    2: require("@/assets/images/home/nightTown/lv2.png"),
    3: require("@/assets/images/home/nightTown/lv3.png"),
    4: require("@/assets/images/home/nightTown/lv4.png"),
    5: require("@/assets/images/home/nightTown/lv5.png"),
  },
  // castleTown。レベル別画像は未制作のため、暫定で Lv.5 の画像を全レベルに使う。
  // レベル別（1〜4）の画像ができたら、各レベルの require を差し替える。
  castleTown: {
    1: require("@/assets/images/home/castleTown/5.png"),
    2: require("@/assets/images/home/castleTown/5.png"),
    3: require("@/assets/images/home/castleTown/5.png"),
    4: require("@/assets/images/home/castleTown/5.png"),
    5: require("@/assets/images/home/castleTown/5.png"),
  },
  // snowTown / starHill は画像未制作のため未登録（「準備中」枠として表示・選択不可）
};

/** 指定した街コード・レベルの背景画像を返す（未登録なら undefined） */
export function getTownArt(
  code: string,
  level: number,
): ImageSourcePropType | undefined {
  return TOWN_LEVEL_ART[code]?.[level];
}

/** その街のアートが用意されているか（未作成の街の判定に使う） */
export function hasTownArt(code: string): boolean {
  return TOWN_LEVEL_ART[code] != null;
}
