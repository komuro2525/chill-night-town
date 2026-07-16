import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  type ImageSourcePropType,
  Image as RNImage,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { BatteryIndicator } from "@/components/battery-indicator";
import { ClockButton } from "@/components/clock-button";
import { LevelBadge } from "@/components/level-badge";
import { ThemedText } from "@/components/themed-text";
import { GROWTH } from "@/constants/domain";
import { Spacing } from "@/constants/theme";
import { getTownArt } from "@/constants/townArt";
import { useSettings } from "@/contexts/SettingsContext";
import { maintenanceRepo, townProgressRepo } from "@/db/repositories";
import type { SelectedTown } from "@/db/repositories/townProgressRepo";
import { useNow } from "@/hooks/use-now";
import { getPseudoOnlineCount } from "@/lib/pseudo-online";

// S2 ホーム画面（夜の街）。
// Phase 2-1: 選択中の街の背景（レベル連動）＋スワイプ探索（要件2.2）＋OSステータスバー非表示。
// 上部UI（日付・レベル・時計＝タイマー、各アイコン、BGMミニプレイヤー等）は後続の P2 で載せる。
export default function HomeScreen() {
  const [selected, setSelected] = useState<SelectedTown | null>(null);
  const [loading, setLoading] = useState(true);
  // 開発用: レベル表示のプレビュー切替（Lv5 ⇄ 実際のレベル）。__DEV__ でのみ使う
  const [devLevelOverride, setDevLevelOverride] = useState<number | null>(null);

  useEffect(() => {
    let mounted = true;
    townProgressRepo
      .getSelectedTown()
      .then((s) => {
        if (mounted) setSelected(s);
      })
      .catch((e) => console.error("選択中の街の読み込みに失敗しました", e))
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, []);

  // 表示に使うレベル（開発用プレビュー中はその値）。背景アートとLv表示の両方に効かせる
  const level = devLevelOverride ?? selected?.progress.current_level ?? 1;
  const art = selected ? getTownArt(selected.town.code, level) : undefined;

  return (
    <View style={styles.container}>
      {/* OSのステータスバー（時刻・バッテリー）を隠して全面背景にする */}
      <StatusBar hidden />

      {art ? (
        <TownBackground art={art} />
      ) : (
        <View style={styles.fallback} />
      )}

      {loading ? (
        <ActivityIndicator style={styles.centerLoader} color="#ffffff" />
      ) : null}

      {selected ? <TopOverlay level={level} /> : null}

      <DevPanel
        onToggleLevel={() =>
          setDevLevelOverride((prev) =>
            prev === GROWTH.MAX_LEVEL ? null : GROWTH.MAX_LEVEL,
          )
        }
      />
    </View>
  );
}

// アナログ時計サイズ（本格デザインは後で差し替え）
const CLOCK_SIZE = 155;
const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];

// 例: 2026/08/01(月) 21:00 PM
function formatDateTimeLabel(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const weekday = WEEKDAYS[d.getDay()];
  const h24 = d.getHours();
  const hh = String(h24).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  const ampm = h24 < 12 ? "AM" : "PM";
  return `${yyyy}/${mm}/${dd}(${weekday}) ${hh}:${mi} ${ampm}`;
}

// 上部オーバーレイ。左上: バッテリー＋日時＋今夜の学習仲間、右上: 大きな時計＝タイマー、
// 時計の左に Lv バッジ。右側アイコン（カレンダー/設定/おやすみ）・左下（目）・下部BGMは後続で追加する。
function TopOverlay({ level }: { level: number }) {
  const insets = useSafeAreaInsets();
  const now = useNow(10000);
  const dateLabel = formatDateTimeLabel(now);
  const online = getPseudoOnlineCount();
  const top = insets.top + Spacing.two;

  function handleTimerPress() {
    // TODO(Phase 3): タイマー設定モーダル（S3）を開く。夜間帯判定（2.3）もここで行う。
    // 仮のダイアログは開発時のみ。本番では何も起きない（Phase 3 で置き換える）
    if (__DEV__) {
      Alert.alert("タイマー", "タイマー機能はこの後の段階で実装します。");
    }
  }

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      {/* 左上: バッテリー・日時・仲間 */}
      <View style={[styles.absolute, styles.topLeft, { top, left: Spacing.four }]}>
        <BatteryIndicator />
        <View style={styles.infoBlock}>
          <Text style={styles.dateText}>{dateLabel}</Text>
          <Text style={styles.onlineText}>今夜の学習仲間 … {online}人</Text>
        </View>
      </View>

      {/* 右上: 大きなアナログ時計＝タイマー */}
      <View style={[styles.absolute, { top, right: Spacing.four }]}>
        <ClockButton size={CLOCK_SIZE} now={now} onPress={handleTimerPress} />
      </View>

      {/* 時計の左・縦中央あたりに Lv バッジ */}
      <View
        style={[
          styles.absolute,
          {
            // 左カラム（日時・仲間）と重ならない高さに置く
            top: top + 80,
            right: Spacing.four + CLOCK_SIZE + Spacing.three,
          },
        ]}
      >
        <LevelBadge level={level} />
      </View>
    </View>
  );
}

// 選択中の街の背景。画面を覆うサイズ（cover）で表示し、スワイプで街を探索する（要件2.2）。
// 初期設定の拡大表示と同じ、境界クランプ付きのなめらかなパンで動かす。
function TownBackground({ art }: { art: ImageSourcePropType }) {
  const { width: winW, height: winH } = useWindowDimensions();
  const resolved = RNImage.resolveAssetSource(art);

  // 画面を必ず覆う倍率（縦横比の大きい方に合わせる）
  const coverScale = Math.max(winW / resolved.width, winH / resolved.height);
  const dispW = resolved.width * coverScale;
  const dispH = resolved.height * coverScale;
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

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
    ],
  }));

  return (
    <GestureDetector gesture={pan}>
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
        <Image source={art} style={StyleSheet.absoluteFill} contentFit="cover" />
      </Animated.View>
    </GestureDetector>
  );
}

// 開発用の操作パネル。__DEV__ 限定（本番には表示しない）。
// 詳細は docs/開発用テストボタン.md を参照。
function DevPanel({ onToggleLevel }: { onToggleLevel: () => void }) {
  const router = useRouter();
  const { reload } = useSettings();

  if (!__DEV__) return null;

  async function handleReset() {
    try {
      await maintenanceRepo.resetUserData();
      await reload();
      router.replace("/setup");
    } catch (e) {
      console.error("開発用リセットに失敗しました", e);
    }
  }

  return (
    <View style={styles.devArea} pointerEvents="box-none">
      {/* Lv5プレビュー ⇄ 実レベル（背景アートも連動。DBは変更しない） */}
      <Pressable onPress={onToggleLevel} style={styles.devButton}>
        <ThemedText type="small" style={styles.devButtonText}>
          Lv切り替え
        </ThemedText>
      </Pressable>
      {/* 全ユーザーデータを削除して初期設定へ（正式版は Phase 6 の設定画面） */}
      <Pressable onPress={handleReset} style={styles.devButton}>
        <ThemedText type="small" style={styles.devButtonText}>
          開発用: データ初期化して初期設定へ
        </ThemedText>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#05070f", overflow: "hidden" },
  fallback: { ...StyleSheet.absoluteFillObject, backgroundColor: "#05070f" },
  absolute: {
    position: "absolute",
  },
  topLeft: {
    gap: Spacing.two,
  },
  infoBlock: {
    gap: 2,
  },
  dateText: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "500",
    textShadowColor: "rgba(0,0,0,0.6)",
    textShadowRadius: 4,
  },
  onlineText: {
    color: "rgba(255,255,255,0.85)",
    fontSize: 12,
    fontWeight: "500",
    textShadowColor: "rgba(0,0,0,0.6)",
    textShadowRadius: 4,
  },
  centerLoader: {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
  },
  devArea: {
    position: "absolute",
    bottom: Spacing.four,
    left: 0,
    right: 0,
    alignItems: "center",
    gap: Spacing.two,
  },
  devButton: {
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.5)",
    borderRadius: 8,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
    backgroundColor: "rgba(0,0,0,0.4)",
  },
  devButtonText: { color: "#ffffff" },
});
