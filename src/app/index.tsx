import { Image } from "expo-image";
import { useKeepAwake } from "expo-keep-awake";
import { useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useCallback, useEffect, useState } from "react";
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
import { BgmMiniPlayer } from "@/components/bgm-mini-player";
import { ClockButton } from "@/components/clock-button";
import { GrowthHintCard } from "@/components/growth-hint-card";
import { LevelBadge } from "@/components/level-badge";
import { RoundIconButton } from "@/components/round-icon-button";
import { StudyDayStatus } from "@/components/study-day-status";
import { ThemedText } from "@/components/themed-text";
import { GROWTH, STUDY_DAY } from "@/constants/domain";
import { Spacing } from "@/constants/theme";
import { getTownArt } from "@/constants/townArt";
import { useSettings } from "@/contexts/SettingsContext";
import {
  devSeedRepo,
  maintenanceRepo,
  sessionRepo,
  townProgressRepo,
} from "@/db/repositories";
import type { StudyDaySummary } from "@/db/repositories/sessionRepo";
import type { SelectedTown } from "@/db/repositories/townProgressRepo";
import { setDevTimeToHour, useAppNow } from "@/lib/clock";
import { getPseudoOnlineCount } from "@/lib/pseudo-online";
import { getStudyDate, isNightTime } from "@/lib/study-day";

// S2 ホーム画面（夜の街）。
// Phase 2-1: 選択中の街の背景（レベル連動）＋スワイプ探索（要件2.2）＋OSステータスバー非表示。
// 上部UI（日付・レベル・時計＝タイマー、各アイコン、BGMミニプレイヤー等）は後続の P2 で載せる。
export default function HomeScreen() {
  const { user } = useSettings();
  const [selected, setSelected] = useState<SelectedTown | null>(null);
  const [summary, setSummary] = useState<StudyDaySummary | null>(null);
  const [loading, setLoading] = useState(true);
  // 開発用: レベル表示のプレビュー切替（Lv5 ⇄ 実際のレベル）。__DEV__ でのみ使う
  const [devLevelOverride, setDevLevelOverride] = useState<number | null>(null);
  // 鑑賞モード（要件2.4）: UIを一括非表示にして夜の街だけを眺める。状態は保存しない
  const [immersive, setImmersive] = useState(false);
  // 開発用: 時刻の上書き（null = 実時間）。夜間帯判定の確認に使う。__DEV__ でのみ切り替える
  const [devHour, setDevHour] = useState<number | null>(null);

  // 当学習日の集計を読み直す。学習日は共通関数で算出する（要件0章 / CLAUDE.md）
  const reloadSummary = useCallback(async () => {
    const s = await sessionRepo.getStudyDaySummary(getStudyDate());
    setSummary(s);
  }, []);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const [town] = await Promise.all([
          townProgressRepo.getSelectedTown(),
          reloadSummary(),
        ]);
        if (mounted) setSelected(town);
      } catch (e) {
        console.error("ホーム画面の読み込みに失敗しました", e);
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [reloadSummary]);

  // 表示に使うレベル（開発用プレビュー中はその値）。背景アートとLv表示の両方に効かせる
  const level = devLevelOverride ?? selected?.progress.current_level ?? 1;
  const art = selected ? getTownArt(selected.town.code, level) : undefined;

  return (
    <View style={styles.container}>
      {/* OSのステータスバー（時刻・バッテリー）を隠して全面背景にする */}
      <StatusBar hidden />

      {/* 鑑賞モード中はOSのスリープを防止する（要件2.4） */}
      {immersive ? <KeepScreenAwake /> : null}

      {art ? (
        // 鑑賞モード中に画面をタップするとUIを復帰する（スワイプ探索は継続できる）
        <TownBackground
          art={art}
          onTap={() => {
            if (immersive) setImmersive(false);
          }}
        />
      ) : (
        <View style={styles.fallback} />
      )}

      {loading ? (
        <ActivityIndicator style={styles.centerLoader} color="#ffffff" />
      ) : null}

      {/* 鑑賞モード中はすべてのUIを隠す（鑑賞モードボタン自身を含む） */}
      {!immersive ? (
        <>
          {selected ? (
            <TopOverlay
              level={level}
              summary={summary}
              goalMinutes={user?.daily_goal_minutes ?? null}
            />
          ) : null}
          <SideIcons />
          <ImmersiveButton onPress={() => setImmersive(true)} />
          <View style={[styles.absolute, styles.miniPlayer]}>
            <BgmMiniPlayer />
          </View>
          {/* 初回ホーム表示で一度だけ案内する（要件6.2） */}
          <GrowthHintCard />
          <DevPanel
            onToggleLevel={() =>
              setDevLevelOverride((prev) =>
                prev === GROWTH.MAX_LEVEL ? null : GROWTH.MAX_LEVEL,
              )
            }
            onSessionsChanged={reloadSummary}
            devHour={devHour}
            onCycleDevHour={() => {
              const i = DEV_CLOCK_HOURS.indexOf(devHour);
              const next = DEV_CLOCK_HOURS[(i + 1) % DEV_CLOCK_HOURS.length];
              setDevHour(next);
              // 実体は clock.ts の1箇所。計測・5:00判定にも同じ時刻が効く
              setDevTimeToHour(next);
            }}
          />
        </>
      ) : null}
    </View>
  );
}

// 鑑賞モード中のみマウントし、その間だけスリープを防止する
function KeepScreenAwake() {
  useKeepAwake();
  return null;
}

// 右側の縦並びアイコン（カレンダー・設定・おやすみ）
function SideIcons() {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  function handleGoodnight() {
    // TODO(Phase 7): おやすみ機能（要件13章）。確認 → 音のフェードアウト → 暗転＋NPCメッセージ →
    //   タップで復帰。タイマー稼働中はグレーアウトする。音の実装後に対応する。
    if (__DEV__) {
      Alert.alert("おやすみ", "おやすみ機能はこの後の段階で実装します。");
    }
  }

  return (
    <View
      style={[
        styles.absolute,
        styles.sideIcons,
        { top: insets.top + Spacing.two + CLOCK_SIZE + Spacing.four },
      ]}
    >
      <RoundIconButton
        name="calendar-outline"
        onPress={() => router.push("/calendar")}
        accessibilityLabel="カレンダーを開く"
      />
      <RoundIconButton
        name="settings-outline"
        onPress={() => router.push("/settings")}
        accessibilityLabel="設定を開く"
      />
      <RoundIconButton
        name="moon-outline"
        onPress={handleGoodnight}
        accessibilityLabel="おやすみ"
      />
    </View>
  );
}

// 左下: 鑑賞モード（UI非表示）ボタン
function ImmersiveButton({ onPress }: { onPress: () => void }) {
  return (
    <View style={[styles.absolute, styles.immersiveButton]}>
      <RoundIconButton
        name="eye-outline"
        onPress={onPress}
        accessibilityLabel="UIを隠して街を眺める"
      />
    </View>
  );
}

// アナログ時計サイズ（本格デザインは後で差し替え）
const CLOCK_SIZE = 155;
// 開発用パネルの下端位置。BGMミニプレイヤー（bottom: Spacing.six ＋ 高さ約80）を避ける
const DEV_PANEL_BOTTOM = 176;
// 開発用: ダミー学習記録1件あたりの実績分数（既定の目標60分に2回で届く値）
const DEV_DUMMY_SESSION_MINUTES = 35;

// 開発用の時刻上書き。夜間帯判定（要件2.3）の両側を実機で確認するために使う。
// null = 実時間 / 21 = 夜間帯内（開始できる） / 12 = 夜間帯外（開始できない）
// 上書きの実体は src/lib/clock.ts にあり、計測・5:00判定にも同じ時刻が効く。
const DEV_CLOCK_HOURS: (number | null)[] = [null, 21, 12];

function devHourLabel(hour: number | null): string {
  return hour === null ? "実時間" : `${hour}:00`;
}
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
function TopOverlay({
  level,
  summary,
  goalMinutes,
}: {
  level: number;
  summary: StudyDaySummary | null;
  goalMinutes: number | null;
}) {
  const insets = useSafeAreaInsets();
  // アプリ内の現在時刻（開発用の上書きが効く）。時計・日時表示・夜間帯判定で共有する
  const now = useAppNow(10000);
  const dateLabel = formatDateTimeLabel(now);
  const online = getPseudoOnlineCount();
  const top = insets.top + Spacing.two;

  // 夜間帯（18:00〜翌5:00）のみ学習を開始できる（要件2.3）。
  // useNow が定期的に更新されるため、時刻の変化時にも判定し直される
  const canStart = isNightTime(now);

  function handleTimerPress() {
    // TODO(Phase 3): タイマー設定モーダル（S3）を開く。
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
        {/* 当学習日の学習時間・目標達成状況（要件2.1） */}
        {summary && goalMinutes !== null ? (
          <StudyDayStatus
            totalMinutes={summary.totalMinutes}
            goalMinutes={goalMinutes}
            achieved={summary.achieved}
          />
        ) : null}
      </View>

      {/* 右上: 大きなアナログ時計＝タイマー。夜間帯外は非活性（要件2.3） */}
      <View style={[styles.absolute, { top, right: Spacing.four }]}>
        <ClockButton
          size={CLOCK_SIZE}
          now={now}
          onPress={handleTimerPress}
          disabled={!canStart}
        />
        {!canStart ? (
          <Text style={styles.closedText}>
            この街が目覚めるのは {STUDY_DAY.START_HOUR}:00 から
          </Text>
        ) : null}
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
function TownBackground({
  art,
  onTap,
}: {
  art: ImageSourcePropType;
  /** 背景のタップ（鑑賞モードからの復帰に使う） */
  onTap?: () => void;
}) {
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

  // タップ（動きのないときだけ成立）。ドラッグ時はパンが動くので競合しない。
  // コールバックはJSスレッドで実行する（worklet から直接JS関数を呼ばないため）
  const tap = Gesture.Tap()
    .runOnJS(true)
    .onEnd(() => {
      onTap?.();
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
        <Image source={art} style={StyleSheet.absoluteFill} contentFit="cover" />
      </Animated.View>
    </GestureDetector>
  );
}

// 開発用の操作パネル。__DEV__ 限定（本番には表示しない）。
// 詳細は docs/開発用テストボタン.md を参照。
function DevPanel({
  onToggleLevel,
  onSessionsChanged,
  devHour,
  onCycleDevHour,
}: {
  onToggleLevel: () => void;
  onSessionsChanged: () => Promise<void>;
  devHour: number | null;
  onCycleDevHour: () => void;
}) {
  const router = useRouter();
  const { reload, user } = useSettings();

  if (!__DEV__) return null;

  // 本物の学習記録は Phase 3 のタイマーで作る。それまでの表示確認用
  async function handleAddDummySession() {
    if (!user) return;
    try {
      await devSeedRepo.addDummySession(
        getStudyDate(),
        DEV_DUMMY_SESSION_MINUTES,
        user.daily_goal_minutes,
      );
      await onSessionsChanged();
    } catch (e) {
      console.error("ダミー記録の追加に失敗しました", e);
    }
  }

  async function handleClearSessions() {
    try {
      await devSeedRepo.clearSessions(getStudyDate());
      await onSessionsChanged();
    } catch (e) {
      console.error("ダミー記録の削除に失敗しました", e);
    }
  }

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
      {/* 時刻の上書き: 実時間 → 21:00（夜間帯内）→ 12:00（夜間帯外）を順に切り替える */}
      <Pressable onPress={onCycleDevHour} style={styles.devButton}>
        <ThemedText type="small" style={styles.devButtonText}>
          時刻: {devHourLabel(devHour)}
        </ThemedText>
      </Pressable>
      {/* 当学習日にダミーの学習記録を足す（Phase 3 のタイマー実装まで表示確認用） */}
      <Pressable onPress={handleAddDummySession} style={styles.devButton}>
        <ThemedText type="small" style={styles.devButtonText}>
          学習記録+{DEV_DUMMY_SESSION_MINUTES}分
        </ThemedText>
      </Pressable>
      <Pressable onPress={handleClearSessions} style={styles.devButton}>
        <ThemedText type="small" style={styles.devButtonText}>
          今夜の記録を消す
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
  sideIcons: {
    right: Spacing.four,
    gap: Spacing.three,
  },
  immersiveButton: {
    left: Spacing.four,
    bottom: Spacing.six,
  },
  miniPlayer: {
    right: Spacing.four,
    bottom: Spacing.six,
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
  closedText: {
    marginTop: Spacing.two,
    width: CLOCK_SIZE,
    textAlign: "center",
    color: "rgba(255,255,255,0.75)",
    fontSize: 11,
    lineHeight: 16,
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
    // 画面下部は本来のUI（左: 鑑賞モードボタン／右: BGMミニプレイヤー）が占めるため、
    // 開発用パネルはそれらより上に逃がす
    bottom: DEV_PANEL_BOTTOM,
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
