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

// 触れる行だと分かるようにする（要件2.5: 専用の丸ボタンは設けないため、
// 見た目だけが手掛かりになる）。線を1本だけ敷き、ボタンにはしない
const UNDERLINE = "rgba(255,255,255,0.28)";

const styles = StyleSheet.create({
  // 絵文字と文字の間を空け、下線ぶんの余白を持たせる。
  // 自分の幅ぶんだけ下線を引きたいので、行は内容の幅に留める
  row: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    paddingBottom: 3,
    borderBottomWidth: 1,
    borderBottomColor: UNDERLINE,
  },
  pressed: {
    opacity: 0.6,
  },
  // 天気は絵文字が主役なので、文字より一回り大きくする
  emoji: {
    fontSize: 15,
  },
  name: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "500",
    // 上の日時（置き時計の書式）と字間を合わせ、同じ並びのものとして読ませる
    letterSpacing: 1.2,
    textShadowColor: "rgba(0,0,0,0.6)",
    textShadowRadius: 4,
  },
  // 未選択のときは控えめに（選択は必須ではない。要件2.5）
  placeholder: {
    color: "rgba(255,255,255,0.75)",
    fontSize: 13,
    letterSpacing: 1.2,
    textShadowColor: "rgba(0,0,0,0.6)",
    textShadowRadius: 4,
  },
});
