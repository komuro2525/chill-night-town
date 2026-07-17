import { Pressable, StyleSheet, Text } from "react-native";

import type { NightWeather } from "@/db/types";

// 今夜の天気の1行（要件2.5）。
//
// ホーム画面の情報表示（日付・学習仲間・学習時間と同じ並び）と、
// タイマー設定モーダルの両方で使う。どこで触っても同じものだと分かるよう見た目を揃える。
//
// 専用の常設ボタン（丸アイコン）は設けない。ホーム画面は既に多くのUIを抱えており、
// ボタンを増やすことは「街の全景を遮らない」方針（要件2.1）に反するため。
// 天気は「今夜の状態」を表す情報なので、情報表示の並びに置く。

export function WeatherRow({
  weather,
  onPress,
}: {
  /** その夜に選択済みの天気（未選択は null） */
  weather: NightWeather | null;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={6}
      accessibilityLabel={
        weather ? `今夜の天気: ${weather.name}。変更する` : "今夜の天気を選ぶ"
      }
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
    >
      {weather ? (
        <>
          <Text style={styles.emoji}>{weather.emoji}</Text>
          <Text style={styles.name}>{weather.name}</Text>
        </>
      ) : (
        <Text style={styles.placeholder}>今夜の天気を選ぶ</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  pressed: {
    opacity: 0.6,
  },
  emoji: {
    fontSize: 13,
  },
  name: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "500",
    textShadowColor: "rgba(0,0,0,0.6)",
    textShadowRadius: 4,
  },
  // 未選択のときは控えめに（選択は必須ではない。要件2.5）
  placeholder: {
    color: "rgba(255,255,255,0.6)",
    fontSize: 13,
    textShadowColor: "rgba(0,0,0,0.6)",
    textShadowRadius: 4,
  },
});
