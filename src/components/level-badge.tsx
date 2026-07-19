import { StyleSheet, Text, View } from "react-native";

import { GROWTH } from "@/constants/domain";
import { LightRgb } from "@/constants/theme";

// 街のレベル表示（案1: 灯りドット）。
// 背景アートが「Lv1=家も街灯も暗い → Lv5=窓と街灯が煌々と灯る」という
// 灯りの成長で描かれているため、レベルも「灯り」で表現する。
// （月はレベルに使わない。月の状態は「夜の天気」が所有しているため／要件3.4）
//
// レベルが上がるほど灯りの発光が育つ:
//   - 芯の色は控えめ→鮮やかへ（ただし常に「点いている」と分かる明るさを保つ）
//   - グロー（光のにじみ）は大きくランプさせ、Lv5で最も美しく灯る
const DOT_SIZE = 10;
const DOT_GAP = 7;

// 発光の調整値（見た目の好みで触るのはここ）
const CORE_OPACITY_MIN = 0.55; // Lv1でも消灯と区別できる下限
const CORE_OPACITY_MAX = 1;
const HALO_EXTRA_MIN = 4; // 芯に対するグローの広がり（最小）
const HALO_EXTRA_MAX = 12; // 同（最大）
const HALO_OPACITY_MIN = 0.1;
const HALO_OPACITY_MAX = 0.32;
const SHADOW_RADIUS_MIN = 2;
const SHADOW_RADIUS_MAX = 8;
const SHADOW_OPACITY_MIN = 0.3;
const SHADOW_OPACITY_MAX = 0.85;

// 灯りの芯は共有の LightRgb（暖色アンバー）を使う
const GLOW_COLOR = "255,184,77"; // にじむ光

function lerp(from: number, to: number, t: number): number {
  return from + (to - from) * t;
}

function LightDot({
  lit,
  intensity,
}: {
  lit: boolean;
  /** 0〜1。レベルに応じた発光の強さ */
  intensity: number;
}) {
  if (!lit) {
    return (
      <View style={styles.slot}>
        <View style={[styles.dot, styles.dotUnlit]} />
      </View>
    );
  }

  const haloSize =
    DOT_SIZE + lerp(HALO_EXTRA_MIN, HALO_EXTRA_MAX, intensity) * 2;
  const haloOffset = (haloSize - DOT_SIZE) / 2;

  return (
    <View style={styles.slot}>
      {/* にじむ光 */}
      <View
        style={{
          position: "absolute",
          left: -haloOffset,
          top: -haloOffset,
          width: haloSize,
          height: haloSize,
          borderRadius: haloSize / 2,
          backgroundColor: `rgba(${GLOW_COLOR}, ${lerp(
            HALO_OPACITY_MIN,
            HALO_OPACITY_MAX,
            intensity,
          )})`,
        }}
      />
      {/* 灯りの芯 */}
      <View
        style={[
          styles.dot,
          {
            backgroundColor: `rgba(${LightRgb}, ${lerp(
              CORE_OPACITY_MIN,
              CORE_OPACITY_MAX,
              intensity,
            )})`,
            shadowColor: `rgb(${GLOW_COLOR})`,
            shadowOpacity: lerp(SHADOW_OPACITY_MIN, SHADOW_OPACITY_MAX, intensity),
            shadowRadius: lerp(SHADOW_RADIUS_MIN, SHADOW_RADIUS_MAX, intensity),
            shadowOffset: { width: 0, height: 0 },
            elevation: 4,
          },
        ]}
      />
    </View>
  );
}

export function LevelBadge({
  level,
  maxLevel = GROWTH.MAX_LEVEL,
}: {
  level: number;
  maxLevel?: number;
}) {
  const clamped = Math.max(0, Math.min(maxLevel, level));
  // レベルが上がるほど発光が育つ（Lv1で最小、maxLevelで最大）
  const intensity =
    maxLevel > 1 ? Math.max(0, clamped - 1) / (maxLevel - 1) : 1;

  return (
    <View style={styles.container}>
      <Text style={styles.label}>Lv.{clamped}</Text>
      <View style={styles.dots}>
        {Array.from({ length: maxLevel }).map((_, i) => (
          <LightDot key={i} lit={i < clamped} intensity={intensity} />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    gap: 5,
  },
  // 文字の太さ・色は時計に合わせる
  label: {
    color: "rgba(255,255,255,0.9)",
    fontSize: 11,
    fontWeight: "500",
    letterSpacing: 0.5,
    textShadowColor: "rgba(0,0,0,0.6)",
    textShadowRadius: 3,
  },
  dots: {
    flexDirection: "row",
    gap: DOT_GAP,
  },
  slot: {
    width: DOT_SIZE,
    height: DOT_SIZE,
  },
  dot: {
    width: DOT_SIZE,
    height: DOT_SIZE,
    borderRadius: DOT_SIZE / 2,
  },
  dotUnlit: {
    backgroundColor: "rgba(0,0,0,0.25)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.28)",
  },
});
