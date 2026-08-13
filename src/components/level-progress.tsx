import { StyleSheet, View } from "react-native";

import { LightRgb } from "@/constants/theme";
import type { LevelProgress } from "@/lib/growth";

// 次のレベルまでの積み上がり（要件6.1・6.2）。レベルの灯り（level-badge.tsx）の
// 真下に置き、「あと何回で灯りが増えるか」を視覚だけで示す。
//
// 数字や「あと◯回」の文言は出さない。急かさない・煽らない方針（要件2.1）に沿って、
// 知りたい人が目で数えられれば足りるという判断。
//
// 上のレベル表示と主従を分ける:
//   ・レベルの灯り = 10px・暖色・発光あり（積み上がった実績。下がらない）
//   ・こちら        = 6px・発光なし・控えめ（次への積み上がり）
// 同じ大きさで並べると「5個の点が2列」になり、どちらがレベルか読み取れなくなる。
//
// 成長方式で形が変わる:
//   ・習慣型       = 回数なのでドット（あと何回かを数えられる）
//   ・プロジェクト型 = 時間なのでバー（回数の概念が無い）
//
// 街が完成（Lv.5）していれば呼び出し側が null を渡す。空のゲージを残さないため。
const DOT_SIZE = 6;
const DOT_GAP = 5;
const BAR_WIDTH = 76;
const BAR_HEIGHT = 3;
/** ドットで表せる上限。これを超える段数はバーで表す（数えられないため） */
const MAX_DOTS = 10;

export function LevelProgressIndicator({
  progress,
}: {
  /** null なら何も描かない（街の完成・プロジェクト型で目標未設定） */
  progress: LevelProgress | null;
}) {
  if (!progress) return null;

  // 段の刻みが細かすぎて数えられない場合（プロジェクト型の分数など）はバーにする
  if (progress.total > MAX_DOTS) {
    return (
      <View style={styles.bar}>
        <View style={[styles.barFill, { width: BAR_WIDTH * progress.ratio }]} />
      </View>
    );
  }

  return (
    <View style={styles.dots}>
      {Array.from({ length: progress.total }).map((_, i) => (
        <View
          key={i}
          style={[styles.dot, i < progress.filled && styles.dotFilled]}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  dots: {
    flexDirection: "row",
    gap: DOT_GAP,
  },
  dot: {
    width: DOT_SIZE,
    height: DOT_SIZE,
    borderRadius: DOT_SIZE / 2,
    backgroundColor: "rgba(255,255,255,0.3)",
  },
  // 溜まったぶんは灯りの色をうっすら乗せる（発光はさせない。主役はレベルの灯り）
  dotFilled: {
    backgroundColor: `rgba(${LightRgb},0.9)`,
  },
  bar: {
    width: BAR_WIDTH,
    height: BAR_HEIGHT,
    borderRadius: BAR_HEIGHT / 2,
    backgroundColor: "rgba(255,255,255,0.3)",
    overflow: "hidden",
  },
  barFill: {
    height: BAR_HEIGHT,
    borderRadius: BAR_HEIGHT / 2,
    backgroundColor: `rgba(${LightRgb},0.9)`,
  },
});
