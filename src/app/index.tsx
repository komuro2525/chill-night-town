import { Image } from "expo-image";
import { useKeepAwake } from "expo-keep-awake";
import { useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useCallback, useEffect, useRef, useState } from "react";
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

import { AutoFinishWatcher } from "@/components/auto-finish-watcher";
import { BatteryIndicator } from "@/components/battery-indicator";
import { BgmMiniPlayer } from "@/components/bgm-mini-player";
import { ClockButton } from "@/components/clock-button";
import { GrowthHintCard } from "@/components/growth-hint-card";
import { LevelBadge } from "@/components/level-badge";
import { NpcMessageCard } from "@/components/npc-message-card";
import { RecordModal, type RecordValues } from "@/components/record-modal";
import { RestoreSessionCard } from "@/components/restore-session-card";
import { RoundIconButton } from "@/components/round-icon-button";
import { StudyDayStatus } from "@/components/study-day-status";
import { TimerDisplay, formatDuration } from "@/components/timer-display";
import { TimerSetupModal, type TimerSetupValues } from "@/components/timer-setup-modal";
import { WeatherPicker } from "@/components/weather-picker";
import { WeatherRow } from "@/components/weather-row";
import { ThemedText } from "@/components/themed-text";
import { GROWTH, MIN_SAVE_MINUTES, STUDY_DAY } from "@/constants/domain";
import { Spacing } from "@/constants/theme";
import { getTownArt } from "@/constants/townArt";
import { useSettings } from "@/contexts/SettingsContext";
import { useTimer } from "@/contexts/TimerContext";
import {
  activeSessionRepo,
  maintenanceRepo,
  masterRepo,
  sessionRepo,
  townProgressRepo,
  userRepo,
  weatherRepo,
} from "@/db/repositories";
import type { StudyDaySummary } from "@/db/repositories/sessionRepo";
import type { SelectedTown } from "@/db/repositories/townProgressRepo";
import type { ActiveSession, NightWeather } from "@/db/types";
import {
  advanceDevTime,
  now as appNow,
  nowMs,
  setDevTimeToHour,
  useAppNow,
} from "@/lib/clock";
import { getPseudoOnlineCount } from "@/lib/pseudo-online";
import { formatStudyDateLabel, getStudyDate, isNightTime } from "@/lib/study-day";
import {
  getActualStudyMinutes,
  getActualStudySeconds,
  getPlannedEndMs,
} from "@/lib/timer";

// S2 ホーム画面（夜の街）。
// Phase 2-1: 選択中の街の背景（レベル連動）＋スワイプ探索（要件2.2）＋OSステータスバー非表示。
// 上部UI（日付・レベル・時計＝タイマー、各アイコン、BGMミニプレイヤー等）は後続の P2 で載せる。
export default function HomeScreen() {
  const { user, reload: reloadSettings } = useSettings();
  const timer = useTimer();
  const [selected, setSelected] = useState<SelectedTown | null>(null);
  const [summary, setSummary] = useState<StudyDaySummary | null>(null);
  const [loading, setLoading] = useState(true);
  // 開発用: レベル表示のプレビュー切替（Lv5 ⇄ 実際のレベル）。__DEV__ でのみ使う
  const [devLevelOverride, setDevLevelOverride] = useState<number | null>(null);
  // 鑑賞モード（要件2.4）: UIを一括非表示にして夜の街だけを眺める。状態は保存しない
  const [immersive, setImmersive] = useState(false);
  // 開発用: 時刻の上書き（null = 実時間）。夜間帯判定の確認に使う。__DEV__ でのみ切り替える
  const [devHour, setDevHour] = useState<number | null>(null);
  // その学習日に選択済みの天気（未選択は null）。演出・記録の参照先は daily_night_weather
  const [weather, setWeather] = useState<NightWeather | null>(null);
  // ホームの天気の行から開く選択欄（要件2.5）
  const [weatherPickerOpen, setWeatherPickerOpen] = useState(false);
  // S3 タイマー設定モーダル（要件3.1）
  const [setupOpen, setSetupOpen] = useState(false);
  // S4 タイマー表示。×で折りたたむとホームへ戻るが計測は続く（要件3.2）
  const [timerOpen, setTimerOpen] = useState(false);
  // 実績1分未満で破棄したときの控えめなメッセージ（要件3.2）
  const [discardedNote, setDiscardedNote] = useState(false);
  // 中断からの復元（要件3.2 / UC 1.1）。復元した実績（分）。null なら復元なし
  const [restoreMinutes, setRestoreMinutes] = useState<number | null>(null);
  // S6 学習成果記録。終了後に確定済みのセッションへ任意項目を書き足す（要件3.4）
  const [record, setRecord] = useState<{ id: number; minutes: number } | null>(
    null,
  );
  // 記録の保存後にかけるNPCの一言（要件7.1）。選ばれた感情に応じて出し分ける
  const [npcMessage, setNpcMessage] = useState<string | null>(null);
  // 復元の判定が済んだか。済むまでは自動終了の見張りを動かさない
  // （5:00を過ぎた状態で起動したとき、案内より先に黙って終了させないため）
  const [restoreChecked, setRestoreChecked] = useState(false);

  // 当学習日の集計を読み直す。学習日は共通関数で算出する（要件0章 / CLAUDE.md）
  const reloadSummary = useCallback(async () => {
    const s = await sessionRepo.getStudyDaySummary(getStudyDate());
    setSummary(s);
  }, []);

  // その夜の天気を読み直す（1晩＝1天気。要件2.5）
  const reloadWeather = useCallback(async () => {
    const w = await weatherRepo.getWeatherByStudyDate(getStudyDate());
    setWeather(w);
  }, []);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const [town] = await Promise.all([
          townProgressRepo.getSelectedTown(),
          reloadSummary(),
          reloadWeather(),
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
  }, [reloadSummary, reloadWeather]);

  // その夜の天気を選ぶ（要件2.5: 1晩＝1天気・最後の選択が残る）。
  // ホームの天気の行から選んだ場合は、その場で確定して演出へ反映する
  const handleSelectWeather = useCallback(
    async (w: NightWeather) => {
      if (!user) return;
      try {
        await weatherRepo.setWeather(user.id, getStudyDate(), w.id);
        setWeather(w);
      } catch (e) {
        console.error("今夜の天気の保存に失敗しました", e);
      } finally {
        setWeatherPickerOpen(false);
      }
    },
    [user],
  );

  // 学習を開始する（UC 3.1 のステップ8〜9）。
  // 天気の確定・設定の保存・計測開始をこの順で行う
  const handleStart = useCallback(
    async (v: TimerSetupValues) => {
      if (!user || !selected) return;
      try {
        const studyDate = getStudyDate();
        // 天気は開始した時点で確定する（モーダルを閉じただけでは確定しない）
        await weatherRepo.setWeather(user.id, studyDate, v.weather.id);
        // 次回の設定モーダルへ引き継ぐため、選んだモードを記憶する
        await userRepo.updateTimerPreferences({
          timerMode: v.mode,
          plannedMinutes: v.plannedMinutes ?? undefined,
          pomodoroWorkMinutes: v.workMinutes ?? undefined,
          pomodoroBreakMinutes: v.breakMinutes ?? undefined,
          pomodoroLoopCount: v.loopCount ?? undefined,
        });
        // 記憶した設定を読み直す。これをしないと同じ起動中は前回値が反映されない
        await reloadSettings();
        await activeSessionRepo.create({
          userId: user.id,
          townId: selected.town.id,
          timerMode: v.mode,
          plannedMinutes: v.plannedMinutes,
          pomodoroWorkMinutes: v.workMinutes,
          pomodoroBreakMinutes: v.breakMinutes,
          pomodoroLoopCount: v.loopCount,
          startTime: appNow().toISOString(),
          // 最初の休憩提案は一日の目標時間で出す（要件5.1）
          breakSuggestThresholdMinutes: user.daily_goal_minutes,
        });
        setWeather(v.weather);
        await timer.reload();
        setSetupOpen(false);
        setTimerOpen(true);
      } catch (e) {
        console.error("学習の開始に失敗しました", e);
      }
    },
    [user, selected, timer, reloadSettings],
  );

  // 学習を終える（要件3.2）。実績1分未満なら保存せず破棄する。
  // 手動の■と自動終了（5:00到達・ポモドーロ全ループ完了）で同じ経路を通す
  const handleFinish = useCallback(async () => {
    try {
      const result = await timer.finish();
      setTimerOpen(false);
      if (result.kind === "discarded") {
        setDiscardedNote(true);
      } else {
        // セッションはここで確定済み。以降の成果記録は任意項目の追記であり、
        // 画面から離脱しても学習した時間は失われない（要件3.4）
        await reloadSummary();
        // TODO(Phase 7): 終了演出（要件3.3）— 鐘の音とダッキング。
        //   音源は assets/audio/ambient/The sound of the bell.mp3
        setRecord({ id: result.sessionId, minutes: result.minutes });
      }
    } catch (e) {
      console.error("学習の終了に失敗しました", e);
    }
  }, [timer, reloadSummary]);

  // 自動終了（要件3.2）。鑑賞モード中に起きた場合はUIを復帰させてから表示する（要件2.4）
  const handleAutoFinish = useCallback(async () => {
    setImmersive(false);
    await handleFinish();
  }, [handleFinish]);

  // 中断からの復元（要件3.2 / UC 1.1）。
  // 強制終了・クラッシュ・端末再起動で終了処理を経ずに中断された場合、
  // 起動時に計測状態が残っている。時刻差分方式のため経過時間はそのまま引き継がれる。
  // 5:00を過ぎていれば5:00終了として扱う（getActualStudyMinutes が頭打ちにする）。
  const restoreCheckedRef = useRef(false);
  useEffect(() => {
    if (!timer.ready || restoreCheckedRef.current) return;
    restoreCheckedRef.current = true;

    const session = timer.session;
    if (!session) {
      setRestoreChecked(true);
      return;
    }

    (async () => {
      const minutes = getActualStudyMinutes(session, nowMs());
      // 実績1分未満は復元時も破棄する（要件3.2）
      if (minutes < MIN_SAVE_MINUTES) {
        await timer.finish();
        setDiscardedNote(true);
      } else {
        setRestoreMinutes(minutes);
      }
      setRestoreChecked(true);
    })().catch((e) => {
      console.error("中断セッションの復元に失敗しました", e);
      setRestoreChecked(true);
    });
  }, [timer]);

  // 復元したセッションを記録して閉じる
  const handleRestoreFinish = useCallback(async () => {
    setRestoreMinutes(null);
    await handleFinish();
  }, [handleFinish]);

  // 成果記録の任意項目を保存する（要件3.4）
  const handleSaveRecord = useCallback(
    async (v: RecordValues) => {
      if (!record) return;
      try {
        await sessionRepo.updateRecordDetails({
          sessionId: record.id,
          emotionId: v.emotionId,
          memo: v.memo,
          tagIds: v.tagIds,
        });
        // 感情に応じた一言をかける（要件7.1 / 3.4 のステップ8）。
        // TODO(Phase 4): 目標達成が成立した夜は 'goal_achieved' を優先する。
        //   達成判定（6.2①）は成長処理と一緒に実装する。文面は投入済み
        setNpcMessage(await masterRepo.pickNpcMessage("study_end", v.emotionId));
      } catch (e) {
        console.error("成果記録の保存に失敗しました", e);
      } finally {
        setRecord(null);
      }
    },
    [record],
  );

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

      {/* 鑑賞モード中はすべてのUIを隠す（鑑賞モードボタン自身を含む）。
          タイマー設定モーダル表示中も同様に隠し、背景は夜の街だけを透かす
          （ボタン類が透けるとごちゃついて見えるため） */}
      {!immersive && !setupOpen && !timerOpen && !record ? (
        <>
          {selected ? (
            <TopOverlay
              level={level}
              summary={summary}
              goalMinutes={user?.daily_goal_minutes ?? null}
              weather={weather}
              onPressWeather={() => setWeatherPickerOpen(true)}
              onPressTimer={() =>
                // 計測中なら設定ではなくタイマー表示を開く（要件2.1のインジケータ相当）
                timer.session ? setTimerOpen(true) : setSetupOpen(true)
              }
              session={timer.session}
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

          {/* ホームの天気の行から開く選択欄（選んだ時点で確定する。要件2.5） */}
          <WeatherPicker
            visible={weatherPickerOpen}
            selectedId={weather?.id ?? null}
            studyDateLabel={formatStudyDateLabel(getStudyDate())}
            onSelect={handleSelectWeather}
            onClose={() => setWeatherPickerOpen(false)}
          />
        </>
      ) : null}

      {/* 計測中（一時停止中を含む）はスリープを防止する（要件3.2） */}
      {timer.session ? <KeepScreenAwake /> : null}

      {/* 5:00到達・ポモドーロ全ループ完了を見張り、自動的に終了処理へ移す（要件3.2）。
          復元の案内が出ている間は動かさない（案内より先に黙って終了させないため） */}
      {timer.session && restoreChecked && restoreMinutes === null ? (
        <AutoFinishWatcher
          session={timer.session}
          onAutoFinish={() => void handleAutoFinish()}
        />
      ) : null}

      {/* S6 学習成果記録（要件3.4）。セッションは確定済みのため、
          保存せず閉じても学習した時間は失われない */}
      {record && user ? (
        <RecordModal
          userId={user.id}
          studyDate={getStudyDate()}
          minutes={record.minutes}
          weather={weather}
          emotionEnabled={user.emotion_record_enabled === 1}
          onChangeWeather={(w) => void handleSelectWeather(w)}
          onSave={(v) => void handleSaveRecord(v)}
          onClose={() => setRecord(null)}
        />
      ) : null}

      {/* 記録の保存後にかけるNPCの一言（要件7.1） */}
      <NpcMessageCard message={npcMessage} onClose={() => setNpcMessage(null)} />

      {/* 中断からの復元（要件3.2 / UC 1.1） */}
      <RestoreSessionCard
        visible={restoreMinutes !== null}
        minutes={restoreMinutes ?? 0}
        onFinish={() => void handleRestoreFinish()}
      />

      {/* S4 タイマー表示。×で折りたたむとホームへ戻るが、計測は続く */}
      {timerOpen && timer.session ? (
        <TimerDisplay
          session={timer.session}
          weather={weather}
          dateTimeLabel={formatDateTimeLabel(appNow())}
          onPause={() => void timer.pause()}
          onResume={() => void timer.resume()}
          onFinish={handleFinish}
          onCollapse={() => setTimerOpen(false)}
        />
      ) : null}

      {/* 実績1分未満で破棄したときの控えめな知らせ（要件3.2） */}
      {discardedNote ? (
        <Pressable
          style={styles.discardedBackdrop}
          onPress={() => setDiscardedNote(false)}
        >
          <View style={styles.discardedCard}>
            <Text style={styles.discardedText}>
              1分未満のため、記録は残していません
            </Text>
          </View>
        </Pressable>
      ) : null}

      {/* S3 タイマー設定モーダル。街の上に重ねる（背景の街と位置はそのまま透ける）。
          ホームのUIは隠してあるため、透けるのは夜の街だけ */}
      {setupOpen && user ? (
        <TimerSetupModal
          studyDate={getStudyDate()}
          dateTimeLabel={formatDateTimeLabel(appNow())}
          initialMode={user.timer_mode}
          initialPlanned={user.planned_minutes}
          initialWork={user.pomodoro_work_minutes}
          initialBreak={user.pomodoro_break_minutes}
          initialLoop={user.pomodoro_loop_count}
          initialWeather={weather}
          onStart={handleStart}
          onClose={() => setSetupOpen(false)}
        />
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
// 開発用: 時刻を進める幅（分）。5:00自動終了やポモドーロの進行の確認に使う
const DEV_ADVANCE_MINUTES = 30;

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
  weather,
  onPressWeather,
  onPressTimer,
  session,
}: {
  level: number;
  summary: StudyDaySummary | null;
  goalMinutes: number | null;
  weather: NightWeather | null;
  onPressWeather: () => void;
  onPressTimer: () => void;
  /** 計測中セッション（非計測時は null） */
  session: ActiveSession | null;
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

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      {/* 左上: バッテリー・日時・仲間 */}
      <View style={[styles.absolute, styles.topLeft, { top, left: Spacing.four }]}>
        <BatteryIndicator />
        <View style={styles.infoBlock}>
          <Text style={styles.dateText}>{dateLabel}</Text>
          {/* 今夜の天気（要件2.5: 専用の常設ボタンは設けず、情報の並びに置く） */}
          <WeatherRow weather={weather} onPress={onPressWeather} />
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
          onPress={onPressTimer}
          disabled={!canStart && !session}
          // 計測中は文字盤に「終わりの位置」を示す（カウントダウンで急かさない）
          endAt={session ? new Date(getPlannedEndMs(session, now.getTime())) : null}
        />
        {session ? (
          <Text style={styles.measuringText}>
            {formatDuration(getActualStudySeconds(session, now.getTime()))} 学習中
          </Text>
        ) : !canStart ? (
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
      {/* 時刻の上書き: 実時間 → 21:00（夜間帯内）→ 12:00（夜間帯外）を順に切り替える */}
      <Pressable onPress={onCycleDevHour} style={styles.devButton}>
        <ThemedText type="small" style={styles.devButtonText}>
          時刻: {devHourLabel(devHour)}
        </ThemedText>
      </Pressable>
      {/* 5:00自動終了・ポモドーロの進行を、実際に待たずに確認するため時刻を進める */}
      <Pressable
        onPress={() => advanceDevTime(DEV_ADVANCE_MINUTES * 60 * 1000)}
        style={styles.devButton}
      >
        <ThemedText type="small" style={styles.devButtonText}>
          時刻を+{DEV_ADVANCE_MINUTES}分進める
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
  measuringText: {
    marginTop: Spacing.two,
    width: CLOCK_SIZE,
    textAlign: "center",
    color: "rgba(255,206,138,0.95)",
    fontSize: 11,
    fontWeight: "500",
    textShadowColor: "rgba(0,0,0,0.6)",
    textShadowRadius: 4,
  },
  discardedBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(3,6,15,0.6)",
    alignItems: "center",
    justifyContent: "center",
    padding: Spacing.four,
  },
  discardedCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
    backgroundColor: "rgba(18,26,46,0.98)",
    paddingVertical: Spacing.four,
    paddingHorizontal: Spacing.five,
  },
  discardedText: {
    color: "rgba(255,255,255,0.85)",
    fontSize: 14,
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
