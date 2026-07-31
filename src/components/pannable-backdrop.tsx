import type { ReactNode } from "react";
import { useWindowDimensions } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
} from "react-native-reanimated";

// 街の背景の土台。画面を必ず覆うサイズ（cover）に拡大し、スワイプで街を探索できる（要件2.2）。
// 中身（静止画／ループ動画）は children で受け取る。動画は実寸を取得できないため、
// 素材の幅・高さは呼び出し側から渡す。
//
// タップとして成立させる指の移動量の上限（ポイント）。
// これを超えて動いたらスワイプ（街探索）とみなし、鑑賞モードから復帰させない（要件2.4）
const TAP_MAX_DISTANCE = 10;

export function PannableBackdrop({
  intrinsicWidth,
  intrinsicHeight,
  onTap,
  children,
}: {
  /** 素材の実寸（px）。cover 倍率とパンの可動域の計算に使う */
  intrinsicWidth: number;
  intrinsicHeight: number;
  /** 背景のタップ（鑑賞モードからの復帰に使う） */
  onTap?: () => void;
  children: ReactNode;
}) {
  const { width: winW, height: winH } = useWindowDimensions();

  // 画面を必ず覆う倍率（縦横比の大きい方に合わせる）
  const coverScale = Math.max(winW / intrinsicWidth, winH / intrinsicHeight);
  const dispW = intrinsicWidth * coverScale;
  const dispH = intrinsicHeight * coverScale;
  // 端で止まるための可動域（横長パノラマなら主に横方向に動く）
  const maxX = Math.max(0, (dispW - winW) / 2);
  const maxY = Math.max(0, (dispH - winH) / 2);

  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const savedX = useSharedValue(0);
  const savedY = useSharedValue(0);

  const pan = Gesture.Pan()
    .onUpdate((e) => {
      translateX.value = Math.min(
        Math.max(savedX.value + e.translationX, -maxX),
        maxX,
      );
      translateY.value = Math.min(
        Math.max(savedY.value + e.translationY, -maxY),
        maxY,
      );
    })
    .onEnd(() => {
      savedX.value = translateX.value;
      savedY.value = translateY.value;
    });

  // タップ（鑑賞モードからの復帰）。要件2.4では復帰の操作は「画面をタップ」のみで、
  // スワイプによる街探索では復帰させない。そのため次の2点が要る:
  //   ・指が少しでも動いたらタップとして成立させない（既定の許容量は緩く、
  //     スワイプしただけでも成立してしまう）
  //   ・onEnd は成立しなかったときにも呼ばれるため、success を必ず見る
  // コールバックはJSスレッドで実行する（worklet から直接JS関数を呼ばないため）
  const tap = Gesture.Tap()
    .maxDistance(TAP_MAX_DISTANCE)
    .runOnJS(true)
    .onEnd((_event, success) => {
      if (success) onTap?.();
    });

  const gesture = Gesture.Simultaneous(pan, tap);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
    ],
  }));

  return (
    <GestureDetector gesture={gesture}>
      <Animated.View
        style={[
          {
            position: "absolute",
            width: dispW,
            height: dispH,
            left: (winW - dispW) / 2,
            top: (winH - dispH) / 2,
          },
          animatedStyle,
        ]}
      >
        {children}
      </Animated.View>
    </GestureDetector>
  );
}
