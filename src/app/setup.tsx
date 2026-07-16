import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Image as RNImage,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";
import {
  Gesture,
  GestureDetector,
  GestureHandlerRootView,
} from "react-native-gesture-handler";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import {
  DAILY_GOAL_MINUTES,
  LIMITS,
  NOTIFICATION_WINDOW,
} from "@/constants/domain";
import { Spacing } from "@/constants/theme";
import { getTownArt } from "@/constants/townArt";
import { useSettings } from "@/contexts/SettingsContext";
import { masterRepo, setupRepo } from "@/db/repositories";
import type { Town } from "@/db/types";
import { useTheme } from "@/hooks/use-theme";
import {
  validateDailyGoalMinutes,
  validateNickname,
  validateNotificationTime,
} from "@/lib/validation";

// 街グリッドの列数（要件6.1: MVPは2街。将来増えても2列で折り返す）
const TOWN_GRID_COLUMNS = 2;
const SCREEN_PADDING = Spacing.five;
const GRID_GAP = Spacing.three;

// S1 初期設定画面（UC 1.2）。
// ニックネーム・目標時間・街選択・通知設定を入力し、ユーザーと関連レコードを作成する。
// 完了後はホーム画面へ遷移する。文言はコンセプト準拠（責めない・急かさない）。
export default function SetupScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { reload } = useSettings();
  const { width } = useWindowDimensions();

  const [towns, setTowns] = useState<Town[]>([]);
  const [townsLoading, setTownsLoading] = useState(true);

  const [nickname, setNickname] = useState("");
  const [goalText, setGoalText] = useState("");
  const [selectedTownId, setSelectedTownId] = useState<number | null>(null);
  const [notificationEnabled, setNotificationEnabled] = useState(false);
  const [notificationTime, setNotificationTime] = useState("");
  const [expandedTown, setExpandedTown] = useState<Town | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // 正方形カードの一辺（画面幅からパディングと列間を差し引いて等分）
  const cardSize = Math.floor(
    (width - SCREEN_PADDING * 2 - GRID_GAP * (TOWN_GRID_COLUMNS - 1)) /
      TOWN_GRID_COLUMNS,
  );

  useEffect(() => {
    let mounted = true;
    masterRepo
      .getTowns()
      .then((rows) => {
        if (!mounted) return;
        setTowns(rows);
        // 既定は未選択とし、ユーザーがタップして選択する
      })
      .catch((e) => {
        console.error("街の読み込みに失敗しました", e);
        if (mounted) setError("街の読み込みに失敗しました");
      })
      .finally(() => {
        if (mounted) setTownsLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, []);

  // 通知時刻の入力補助: 数字のみ4桁まで受け付け、2桁打ち終えたら ":" を自動挿入する。
  // 削除操作中（前回入力より短くなった場合）は ":" を付け直さず、編集しやすくする。
  function handleNotificationTimeChange(text: string) {
    const digits = text.replace(/\D/g, "").slice(0, 4);
    let formatted: string;
    if (digits.length >= 3) {
      formatted = `${digits.slice(0, 2)}:${digits.slice(2)}`;
    } else if (digits.length === 2) {
      const deleting = text.length < notificationTime.length;
      formatted = deleting ? digits : `${digits}:`;
    } else {
      formatted = digits;
    }
    setNotificationTime(formatted);
  }

  async function handleSubmit() {
    if (saving) return;

    const nicknameError = validateNickname(nickname);
    if (nicknameError) return setError(nicknameError);

    const goalError = validateDailyGoalMinutes(goalText);
    if (goalError) return setError(goalError);

    if (selectedTownId == null) return setError("街を選んでください");

    if (notificationEnabled) {
      const timeError = validateNotificationTime(notificationTime);
      if (timeError) return setError(timeError);
    }

    setError(null);
    setSaving(true);
    try {
      await setupRepo.completeSetup({
        nickname: nickname.trim(),
        dailyGoalMinutes: Number(goalText.trim()),
        selectedTownId,
        notificationEnabled,
        notificationTime: notificationEnabled ? notificationTime.trim() : null,
      });
      await reload();
      router.replace("/");
    } catch (e) {
      console.error("初期設定の保存に失敗しました", e);
      setError("保存に失敗しました。時間をおいて再度お試しください");
      setSaving(false);
    }
  }

  const inputStyle = {
    backgroundColor: theme.backgroundElement,
    color: theme.text,
    borderColor: theme.backgroundSelected,
  };

  return (
    <ThemedView style={styles.container}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.header}>
            <ThemedText type="subtitle">夜の街へようこそ</ThemedText>
            <ThemedText themeColor="textSecondary">
              はじめに、いくつか教えてください。
            </ThemedText>
          </View>

          {/* ニックネーム */}
          <View style={styles.field}>
            <ThemedText type="smallBold">ニックネーム</ThemedText>
            <TextInput
              value={nickname}
              onChangeText={setNickname}
              placeholder="この街での呼び名"
              placeholderTextColor={theme.textSecondary}
              maxLength={LIMITS.NICKNAME_MAX}
              style={[styles.input, inputStyle]}
            />
          </View>

          {/* 一日の学習目標時間（既定値60はプレースホルダとして薄く表示） */}
          <View style={styles.field}>
            <ThemedText type="smallBold">一日の学習目標時間（分）</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {DAILY_GOAL_MINUTES.MIN}〜{DAILY_GOAL_MINUTES.MAX}分
            </ThemedText>
            <TextInput
              value={goalText}
              onChangeText={setGoalText}
              keyboardType="number-pad"
              placeholder={`例: ${DAILY_GOAL_MINUTES.DEFAULT}`}
              placeholderTextColor={theme.textSecondary}
              maxLength={3}
              style={[styles.input, inputStyle]}
            />
          </View>

          {/* 街の選択（正方形グリッド） */}
          <View style={styles.field}>
            <ThemedText type="smallBold">育てる街</ThemedText>
            {townsLoading ? (
              <ActivityIndicator style={{ marginTop: Spacing.three }} />
            ) : (
              <View style={styles.grid}>
                {towns.map((town) => (
                  <TownCard
                    key={town.id}
                    town={town}
                    size={cardSize}
                    selected={town.id === selectedTownId}
                    onSelect={() => setSelectedTownId(town.id)}
                    onExpand={() => setExpandedTown(town)}
                    theme={theme}
                  />
                ))}
              </View>
            )}
          </View>

          {/* 通知設定 */}
          <View style={styles.field}>
            <View style={styles.switchRow}>
              <ThemedText type="smallBold">学習開始予定時間の通知</ThemedText>
              <Switch
                value={notificationEnabled}
                onValueChange={setNotificationEnabled}
              />
            </View>
            {notificationEnabled ? (
              <TextInput
                value={notificationTime}
                onChangeText={handleNotificationTimeChange}
                keyboardType="number-pad"
                placeholder="通知時刻（例: 21:00）"
                placeholderTextColor={theme.textSecondary}
                maxLength={5}
                style={[styles.input, inputStyle]}
              />
            ) : null}
            {notificationEnabled ? (
              <ThemedText type="small" themeColor="textSecondary">
                {NOTIFICATION_WINDOW.START_LABEL}〜翌
                {NOTIFICATION_WINDOW.END_LABEL} の範囲で設定できます
              </ThemedText>
            ) : null}
          </View>

          {error ? (
            <ThemedText type="small" style={styles.error}>
              {error}
            </ThemedText>
          ) : null}

          <Pressable
            onPress={handleSubmit}
            disabled={saving}
            style={[
              styles.submit,
              { backgroundColor: theme.text, opacity: saving ? 0.5 : 1 },
            ]}
          >
            {saving ? (
              <ActivityIndicator color={theme.background} />
            ) : (
              <ThemedText type="smallBold" style={{ color: theme.background }}>
                この街ではじめる
              </ThemedText>
            )}
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* 街の全景モーダル（拡大表示） */}
      <TownPreviewModal
        town={expandedTown}
        onClose={() => setExpandedTown(null)}
      />
    </ThemedView>
  );
}

// 街カード（正方形）。アートがあれば背景を切り抜き表示、なければ準備中プレースホルダ。
function TownCard({
  town,
  size,
  selected,
  onSelect,
  onExpand,
  theme,
}: {
  town: Town;
  size: number;
  selected: boolean;
  onSelect: () => void;
  onExpand: () => void;
  theme: ReturnType<typeof useTheme>;
}) {
  const art = getTownArt(town.code, 1);

  return (
    <View
      style={[
        styles.card,
        {
          width: size,
          height: size,
          borderColor: selected ? theme.text : "transparent",
          backgroundColor: theme.backgroundElement,
        },
      ]}
    >
      {art ? (
        <Pressable style={StyleSheet.absoluteFill} onPress={onSelect}>
          <Image source={art} style={StyleSheet.absoluteFill} contentFit="cover" />
        </Pressable>
      ) : (
        <View style={[StyleSheet.absoluteFill, styles.placeholder]}>
          <ThemedText type="small" themeColor="textSecondary">
            準備中
          </ThemedText>
        </View>
      )}

      {/* 下部に街名（可読性のため半透明の帯） */}
      <View style={styles.nameOverlay} pointerEvents="none">
        <ThemedText type="smallBold" style={styles.overlayText} numberOfLines={1}>
          {town.name}
        </ThemedText>
      </View>

      {/* 左上: 選択中チェック */}
      {selected ? (
        <View style={[styles.checkBadge, { backgroundColor: theme.text }]}>
          <ThemedText style={[styles.checkMark, { color: theme.background }]}>
            ✓
          </ThemedText>
        </View>
      ) : null}

      {/* 右上: 拡大ボタン（アートのある街のみ） */}
      {art ? (
        <Pressable
          style={styles.expandButton}
          onPress={onExpand}
          hitSlop={8}
          accessibilityLabel={`${town.name}を拡大表示`}
        >
          <ExpandIcon />
        </Pressable>
      ) : null}
    </View>
  );
}

// 拡大（全画面）アイコンを4隅のコーナーブラケットで描画する（画像アセット不要）。
function ExpandIcon({ color = "#ffffff", size = 16 }: { color?: string; size?: number }) {
  const bracket = size * 0.4;
  const thickness = 2;
  return (
    <View style={{ width: size, height: size }}>
      <View
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: bracket,
          height: bracket,
          borderTopWidth: thickness,
          borderLeftWidth: thickness,
          borderColor: color,
        }}
      />
      <View
        style={{
          position: "absolute",
          top: 0,
          right: 0,
          width: bracket,
          height: bracket,
          borderTopWidth: thickness,
          borderRightWidth: thickness,
          borderColor: color,
        }}
      />
      <View
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          width: bracket,
          height: bracket,
          borderBottomWidth: thickness,
          borderLeftWidth: thickness,
          borderColor: color,
        }}
      />
      <View
        style={{
          position: "absolute",
          bottom: 0,
          right: 0,
          width: bracket,
          height: bracket,
          borderBottomWidth: thickness,
          borderRightWidth: thickness,
          borderColor: color,
        }}
      />
    </View>
  );
}

// 拡大表示の最小・最大倍率
const MODAL_ZOOM_MIN = 1;
const MODAL_ZOOM_MAX = 4;

// 街の全景を全画面で表示するモーダル。× で元の画面へ戻る。
// ピンチで拡大縮小、拡大中はドラッグで移動、ダブルタップで拡大/リセット。
// TODO(後日): 横向き時に画面いっぱい（contentFit="cover"）で表示する。
//   現状アプリは縦固定（app.json orientation=portrait）のため、
//   expo-screen-orientation でこのモーダル表示中のみ横を解放する対応が別途必要。
function TownPreviewModal({
  town,
  onClose,
}: {
  town: Town | null;
  onClose: () => void;
}) {
  const art = town ? getTownArt(town.code, 1) : undefined;
  const visible = town != null && art != null;

  // 画面サイズと画像の実寸から、contain 表示時の画像サイズを求める。
  // これを使って「拡大中に動かせる範囲（可動域）」を算出し、端で止める。
  const { width: winW, height: winH } = useWindowDimensions();
  const resolved = art ? RNImage.resolveAssetSource(art) : null;
  const baseFit = resolved
    ? Math.min(winW / resolved.width, winH / resolved.height)
    : 1;
  const dispW = resolved ? resolved.width * baseFit : winW;
  const dispH = resolved ? resolved.height * baseFit : winH;

  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const savedTranslateX = useSharedValue(0);
  const savedTranslateY = useSharedValue(0);

  // 別の街を開いた／閉じたときはズーム状態を初期化する
  useEffect(() => {
    scale.value = 1;
    savedScale.value = 1;
    translateX.value = 0;
    translateY.value = 0;
    savedTranslateX.value = 0;
    savedTranslateY.value = 0;
  }, [
    town?.id,
    scale,
    savedScale,
    translateX,
    translateY,
    savedTranslateX,
    savedTranslateY,
  ]);

  const pinch = Gesture.Pinch()
    .onUpdate((e) => {
      scale.value = Math.min(
        Math.max(savedScale.value * e.scale, MODAL_ZOOM_MIN * 0.8),
        MODAL_ZOOM_MAX,
      );
    })
    .onEnd(() => {
      const next = Math.min(
        Math.max(scale.value, MODAL_ZOOM_MIN),
        MODAL_ZOOM_MAX,
      );
      scale.value = withTiming(next);
      savedScale.value = next;
      // 新しい倍率の可動域へ平行移動をクランプする
      const maxX = Math.max(0, (dispW * next - winW) / 2);
      const maxY = Math.max(0, (dispH * next - winH) / 2);
      const clampedX = Math.min(Math.max(translateX.value, -maxX), maxX);
      const clampedY = Math.min(Math.max(translateY.value, -maxY), maxY);
      translateX.value = withTiming(clampedX);
      translateY.value = withTiming(clampedY);
      savedTranslateX.value = clampedX;
      savedTranslateY.value = clampedY;
    });

  const pan = Gesture.Pan()
    .onUpdate((e) => {
      // 現在の倍率での可動域内に収める（画像の端で止まり、画面外へ飛ばない）
      const maxX = Math.max(0, (dispW * scale.value - winW) / 2);
      const maxY = Math.max(0, (dispH * scale.value - winH) / 2);
      translateX.value = Math.min(
        Math.max(savedTranslateX.value + e.translationX, -maxX),
        maxX,
      );
      translateY.value = Math.min(
        Math.max(savedTranslateY.value + e.translationY, -maxY),
        maxY,
      );
    })
    .onEnd(() => {
      savedTranslateX.value = translateX.value;
      savedTranslateY.value = translateY.value;
    });

  // 移動はスワイプ（パン）、拡大縮小はピンチのみ。
  // タップでの拡大縮小は誤爆するため設けない。
  const composed = Gesture.Simultaneous(pinch, pan);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: scale.value },
    ],
  }));

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      supportedOrientations={["portrait", "landscape"]}
    >
      {/* Modal は別の native 階層に描画されるため、ジェスチャ用に Root を内側にも置く */}
      <GestureHandlerRootView style={styles.flex}>
        <View style={styles.modalBackdrop}>
          {art ? (
            <GestureDetector gesture={composed}>
              {/* 画像と同じサイズのビューを直接動かす（中央基準・可動域クランプ） */}
              <Animated.View
                style={[{ width: dispW, height: dispH }, animatedStyle]}
              >
                <Image
                  source={art}
                  style={StyleSheet.absoluteFill}
                  contentFit="cover"
                />
              </Animated.View>
            </GestureDetector>
          ) : null}
          <Pressable
            style={styles.modalClose}
            onPress={onClose}
            hitSlop={12}
            accessibilityLabel="閉じる"
          >
            <ThemedText style={styles.modalCloseMark}>×</ThemedText>
          </Pressable>
        </View>
      </GestureHandlerRootView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { flex: 1 },
  content: {
    padding: SCREEN_PADDING,
    gap: Spacing.five,
  },
  header: { gap: Spacing.two, marginTop: Spacing.five },
  field: { gap: Spacing.two },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
    fontSize: 16,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: GRID_GAP,
    marginTop: Spacing.two,
  },
  card: {
    borderWidth: 2,
    borderRadius: 12,
    overflow: "hidden",
  },
  placeholder: {
    alignItems: "center",
    justifyContent: "center",
  },
  nameOverlay: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    backgroundColor: "rgba(0,0,0,0.45)",
  },
  overlayText: { color: "#ffffff" },
  checkBadge: {
    position: "absolute",
    top: Spacing.two,
    left: Spacing.two,
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  checkMark: { fontSize: 14, fontWeight: "700", lineHeight: 16 },
  expandButton: {
    position: "absolute",
    top: Spacing.two,
    right: Spacing.two,
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.45)",
  },
  switchRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  error: { color: "#d9534f" },
  submit: {
    borderRadius: 12,
    paddingVertical: Spacing.four,
    alignItems: "center",
    justifyContent: "center",
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.92)",
    alignItems: "center",
    justifyContent: "center",
  },
  modalClose: {
    position: "absolute",
    top: Spacing.six,
    right: Spacing.four,
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.5)",
  },
  modalCloseMark: { color: "#ffffff", fontSize: 26, lineHeight: 28 },
});
