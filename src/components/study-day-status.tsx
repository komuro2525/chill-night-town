import { StyleSheet, Text, View } from "react-native";

import { Fonts, LightColor, Spacing } from "@/constants/theme";
import { formatMinutes } from "@/lib/study-day";

// 当学習日の学習時間・目標達成状況（要件2.1）。
// コンセプト準拠: 未達成を「不足」「あと◯分」と煽らない。静かに事実だけを置く。
//
// 見出し（小さく・控えめ）→ 時間（大きく）→ バー → 目標、の順に置く。
// 学習時間はホームでいちばん見たい数字なので、ラベルと同じ大きさの1行に
// 埋めてしまわず、時刻表示と同じセリフ体で独立させる。
// ただし時計より大きくはしない（数字を誇示する画面にはしない）。
const BAR_WIDTH = 92;
const BAR_HEIGHT = 3;

export function StudyDayStatus({
  totalMinutes,
  goalMinutes,
  achieved,
}: {
  totalMinutes: number;
  goalMinutes: number;
  achieved: boolean;
}) {
  // 達成後も学習は続くため、進捗バーは1.0で頭打ちにする
  const ratio =
    goalMinutes > 0 ? Math.min(1, totalMinutes / goalMinutes) : 0;

  return (
    <View style={styles.container}>
      <Text style={styles.label}>今夜の学習</Text>
      <Text style={styles.time}>{formatMinutes(totalMinutes)}</Text>

      <View style={styles.bar}>
        <View
          style={[
            styles.barFill,
            { width: BAR_WIDTH * ratio },
            achieved && styles.barFillAchieved,
          ]}
        />
      </View>

      <Text style={[styles.goal, achieved && styles.goalAchieved]}>
        {achieved
          ? "目標を達成しています"
          : `目標 ${formatMinutes(goalMinutes)}`}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: Spacing.one,
  },
  // 見出しは目立たせない。主役は下の数字
  label: {
    color: "rgba(255,255,255,0.6)",
    fontSize: 10,
    fontWeight: "500",
    letterSpacing: 2,
    textShadowColor: "rgba(0,0,0,0.6)",
    textShadowRadius: 4,
  },
  // 時刻表示と同じセリフ体で揃える（同じ「今夜の数字」として読ませる）。
  // 時計（22pt）とは差をつけ、並んでも競わない大きさにする
  time: {
    color: "rgba(255,255,255,0.95)",
    fontSize: 17,
    fontWeight: "300",
    letterSpacing: 1.5,
    fontFamily: Fonts.serif,
    textShadowColor: "rgba(0,0,0,0.6)",
    textShadowRadius: 5,
  },
  bar: {
    width: BAR_WIDTH,
    height: BAR_HEIGHT,
    borderRadius: BAR_HEIGHT / 2,
    backgroundColor: "rgba(255,255,255,0.2)",
    overflow: "hidden",
  },
  barFill: {
    height: BAR_HEIGHT,
    borderRadius: BAR_HEIGHT / 2,
    backgroundColor: "rgba(255,255,255,0.55)",
  },
  barFillAchieved: {
    backgroundColor: LightColor,
    shadowColor: "rgb(255,184,77)",
    shadowOpacity: 0.8,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 0 },
  },
  goal: {
    color: "rgba(255,255,255,0.65)",
    fontSize: 11,
    letterSpacing: 1,
    textShadowColor: "rgba(0,0,0,0.6)",
    textShadowRadius: 4,
  },
  goalAchieved: {
    color: LightColor,
  },
});
