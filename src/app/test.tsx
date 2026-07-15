import { Pressable, StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { BottomTabInset, MaxContentWidth, Spacing } from "@/constants/theme";
import { useTimer } from "@/contexts/TimerContext";

export default function TestScreen() {
  const { state } = useTimer();

  const handlePress = () => {
    // 動作確認用: 現在の isRunning をコンソールに出力する
    console.log("テストボタンが押された。isRunning =", state.isRunning);
  };

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ThemedText type="title" style={styles.title}>
          テスト画面
        </ThemedText>

        <ThemedText>
          isRunning: {state.isRunning ? "稼働中" : "停止中"}
        </ThemedText>

        <Pressable
          onPress={handlePress}
          style={({ pressed }) => [pressed && styles.pressed]}
        >
          <ThemedView type="backgroundElement" style={styles.button}>
            <ThemedText type="link">コンソールに出力</ThemedText>
          </ThemedView>
        </Pressable>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    flexDirection: "row",
  },
  safeArea: {
    flex: 1,
    paddingHorizontal: Spacing.four,
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.four,
    paddingBottom: BottomTabInset + Spacing.three,
    maxWidth: MaxContentWidth,
  },
  title: {
    textAlign: "center",
  },
  pressed: {
    opacity: 0.7,
  },
  button: {
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.two,
    borderRadius: Spacing.five,
  },
});
