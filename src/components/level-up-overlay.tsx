import { useEffect, useRef } from "react";
import { Modal, StyleSheet } from "react-native";
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withTiming,
} from "react-native-reanimated";

import { Spacing } from "@/constants/theme";
import { GrowthCardContent } from "./growth-card";

// レベルアップ演出・完成演出の暗転画面（要件6.1 / UC 6.1）。
//
// ゆっくり暗転し、暗転しきった間に「街に灯りがひとつ増えた」ことを一言と灯りで見せ、
// ゆっくり明転して新しい背景を現す。背景の差し替えは暗転しきった時点（onBlackout）で
// 呼び出し側に任せる。明転しきったら onDone で次（NPCの言葉）へ進む。
//
// 操作は求めず、スキップもさせない（急かさない・ユーザーに手数を出させないため）。
// 音は終了演出の鐘をそのまま鳴らし、この演出では足さない。

/** 暗転しきるまで */
const FADE_IN_MS = 1200;
/** 暗転を保つ時間（この間にカードを見せ、背景を差し替える） */
const HOLD_MS = 3000;
/** 明転して新しい背景を現すまで */
const FADE_OUT_MS = 1800;
/** カードの出入り */
const CARD_FADE_MS = 600;

export function LevelUpOverlay({
  level,
  completed,
  onBlackout,
  onDone,
}: {
  /** 到達したレベル。null なら閉じている */
  level: number | null;
  /** 街が完成した（Lv5へ初めて到達した）か */
  completed: boolean;
  /** 暗転しきった時点（見えていないうちに背景を新レベルへ差し替える） */
  onBlackout: () => void;
  /** 明転しきって演出が終わった時点 */
  onDone: () => void;
}) {
  const backdrop = useSharedValue(0);
  const card = useSharedValue(0);

  // 再生中にコールバックが張り替わっても演出をやり直さないよう、参照はrefで見る
  const onBlackoutRef = useRef(onBlackout);
  onBlackoutRef.current = onBlackout;
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  const visible = level !== null;

  useEffect(() => {
    if (!visible) {
      // 閉じたら次回のために初期状態へ戻す（アニメーションはしない）
      backdrop.value = 0;
      card.value = 0;
      return;
    }
    backdrop.value = withSequence(
      withTiming(1, { duration: FADE_IN_MS }, (finished) => {
        // 中断された場合は先へ進めない（背景を勝手に差し替えないため）
        if (finished) runOnJS(onBlackoutRef.current)();
      }),
      withDelay(
        HOLD_MS,
        withTiming(0, { duration: FADE_OUT_MS }, (finished) => {
          if (finished) runOnJS(onDoneRef.current)();
        }),
      ),
    );
    // カードは暗転しきってから出し、明転が始まるのと同時に引く
    card.value = withSequence(
      withDelay(FADE_IN_MS, withTiming(1, { duration: CARD_FADE_MS })),
      withDelay(HOLD_MS - CARD_FADE_MS, withTiming(0, { duration: CARD_FADE_MS })),
    );
  }, [visible, backdrop, card]);

  const backdropStyle = useAnimatedStyle(() => ({ opacity: backdrop.value }));
  const cardStyle = useAnimatedStyle(() => ({ opacity: card.value }));

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      statusBarTranslucent
      // 戻るキーで演出だけを飛ばさない（この後にNPCの言葉が続くため）
      onRequestClose={() => {}}
    >
      <Animated.View style={[styles.fill, backdropStyle]}>
        <Animated.View style={[styles.cardWrap, cardStyle]}>
          <GrowthCardContent level={level ?? 1} completed={completed} />
        </Animated.View>
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
    padding: Spacing.four,
  },
  cardWrap: {
    // カード側が width:100% で幅を決めるため、包む側にも幅を持たせる
    width: "100%",
    maxWidth: 340,
    alignItems: "center",
  },
});
