import { StyleSheet, Text, View } from "react-native";

import { Spacing } from "@/constants/theme";
import { formatMinutes } from "@/lib/study-day";

// 当学習日の学習時間・目標達成状況（要件2.1）。
// コンセプト準拠: 未達成を「不足」「あと◯分」と煽らない。静かに事実だけを置く。
const BAR_WIDTH = 108;
const BAR_HEIGHT = 3;
const LIGHT_COLOR = "rgba(255,206,138,0.95)";

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
      <Text style={styles.time}>
        今夜の学習 {formatMinutes(totalMinutes)}
      </Text>

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
  time: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "500",
    textShadowColor: "rgba(0,0,0,0.6)",
    textShadowRadius: 4,
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
    backgroundColor: LIGHT_COLOR,
    shadowColor: "rgb(255,184,77)",
    shadowOpacity: 0.8,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 0 },
  },
  goal: {
    color: "rgba(255,255,255,0.7)",
    fontSize: 11,
    textShadowColor: "rgba(0,0,0,0.6)",
    textShadowRadius: 4,
  },
  goalAchieved: {
    color: LIGHT_COLOR,
  },
});
