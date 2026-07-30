import { StyleSheet, Text, View } from "react-native";

import { GROWTH } from "@/constants/domain";
import { LightColor, Spacing } from "@/constants/theme";
import { LevelBadge } from "./level-badge";

// レベルアップ演出・完成演出で見せるカード（要件6.1）。
//
// 学習記録の保存で街が育ったときに、静かに知らせる。表示のきっかけと出し引きは
// 暗転演出（level-up-overlay.tsx）が持ち、ここは中身の見た目だけを担う。
//
// 派手な演出はしない。「勉強することを強調させない」「静かで落ち着いた世界観」
// （コンセプト）に沿って、灯りがひとつ増えたことを伝えるだけにとどめる。
// 数字（経験値）ではなく灯りで見せるのは、成果を測る道具に見せないため。
//
// TODO(Phase 7): 効果音。TODO(素材): Lv1〜5の灯り画像が入ったら差し替える。

export function GrowthCardContent({
  level,
  completed,
}: {
  /** 到達したレベル */
  level: number;
  /** 街が完成した（Lv5へ初めて到達した）か。完成演出は一度だけ */
  completed: boolean;
}) {
  return (
    <View style={styles.card}>
      <Text style={styles.title}>
        {completed ? "街に、すべての灯りがともりました" : "街に灯りがひとつ増えました"}
      </Text>

      <View style={styles.badge}>
        <LevelBadge level={level} />
      </View>

      <Text style={styles.body}>
        {completed
          ? `あなたの夜が、この街を最後まで育てました。\nここからも、灯りはあなたの隣にあります。`
          : `続けてきた夜が、少しずつ街になっています。`}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    width: "100%",
    maxWidth: 340,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(255,206,138,0.35)",
    backgroundColor: "rgba(18,26,46,0.98)",
    paddingVertical: Spacing.five,
    paddingHorizontal: Spacing.four,
    alignItems: "center",
    gap: Spacing.four,
  },
  title: {
    color: LightColor,
    fontSize: 16,
    fontWeight: "600",
    textAlign: "center",
  },
  badge: {
    // Lv表示（灯り）を主役として大きめに置く
    transform: [{ scale: 1.3 }],
    marginVertical: Spacing.two,
  },
  body: {
    color: "rgba(255,255,255,0.75)",
    fontSize: 14,
    lineHeight: 24,
    textAlign: "center",
  },
});

/** 到達レベルが最大なら完成（要件6.1: Lv.5＝街完成） */
export function isCompletedLevel(level: number): boolean {
  return level >= GROWTH.MAX_LEVEL;
}
