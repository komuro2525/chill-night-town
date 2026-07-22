import { useEffect } from "react";
import { Modal, Pressable, StyleSheet, Text } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

import { Spacing } from "@/constants/theme";

// おやすみの暗転画面（要件13 / UC 13.1）。
//
// シンプルな暗転のみ（街の灯りが消える差分演出は行わない）。NPCのおやすみメッセージを
// 一言そえ、画面をタップするとホームへ復帰する。音の停止・再開は AudioContext 側で行い、
// ここは「静かに暗くして、ひとことを見せる」表示だけを担う。

export function GoodnightOverlay({
  message,
  onWake,
}: {
  /** 表示するNPCのおやすみメッセージ。null なら閉じている */
  message: string | null;
  /** 画面タップでホームへ復帰する */
  onWake: () => void;
}) {
  const opacity = useSharedValue(0);

  useEffect(() => {
    // ゆっくり暗転する（急に暗くしない）
    opacity.value = withTiming(message !== null ? 1 : 0, { duration: 900 });
  }, [message, opacity]);

  const style = useAnimatedStyle(() => ({ opacity: opacity.value }));

  return (
    <Modal
      visible={message !== null}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={onWake}
    >
      <Animated.View style={[styles.fill, style]}>
        <Pressable
          style={styles.fill}
          onPress={onWake}
          accessibilityLabel="画面をタップしてホームへ戻る"
        >
          <Text style={styles.message}>{message}</Text>
          <Text style={styles.hint}>画面をタップすると戻れます</Text>
        </Pressable>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  fill: {
    flex: 1,
    backgroundColor: "#02030a",
    alignItems: "center",
    justifyContent: "center",
    padding: Spacing.six,
  },
  message: {
    color: "rgba(255,255,255,0.9)",
    fontSize: 17,
    lineHeight: 28,
    textAlign: "center",
    fontWeight: "300",
  },
  hint: {
    color: "rgba(255,255,255,0.35)",
    fontSize: 12,
    marginTop: Spacing.five,
  },
});
