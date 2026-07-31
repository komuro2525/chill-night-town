import { useEffect, useRef } from "react";
import { Modal, Pressable, StyleSheet, Text } from "react-native";
import Animated, {
  runOnJS,
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
//
// 暗転しきった時点は onBlackout で呼び出し側へ渡す（見えていないうちに背景の
// ループ動画を止め、暗転中に裏で再生し続けないようにするため。要件2.2 / 13）。

/** 暗転しきるまで（急に暗くしない） */
const FADE_MS = 900;

export function GoodnightOverlay({
  message,
  onWake,
  onBlackout,
}: {
  /** 表示するNPCのおやすみメッセージ。null なら閉じている */
  message: string | null;
  /** 画面タップでホームへ復帰する */
  onWake: () => void;
  /** 暗転しきった時点（背景の動きを止める） */
  onBlackout: () => void;
}) {
  const opacity = useSharedValue(0);

  // 暗転中にコールバックが張り替わっても演出をやり直さないよう、参照はrefで見る
  const onBlackoutRef = useRef(onBlackout);
  onBlackoutRef.current = onBlackout;

  useEffect(() => {
    const toDark = message !== null;
    opacity.value = withTiming(toDark ? 1 : 0, { duration: FADE_MS }, (finished) => {
      // 中断された場合は先へ進めない（明るいまま背景を止めないため）
      if (finished && toDark) runOnJS(onBlackoutRef.current)();
    });
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
