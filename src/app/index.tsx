import { useIsFocused } from "@react-navigation/native";
import { Image } from "expo-image";
import { useKeepAwake } from "expo-keep-awake";
import { useRouter } from "expo-router";
import * as ScreenOrientation from "expo-screen-orientation";
import { StatusBar } from "expo-status-bar";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  AppState,
  type ImageSourcePropType,
  Pressable,
  Image as RNImage,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AutoFinishWatcher } from "@/components/auto-finish-watcher";
import { BgmMiniPlayer } from "@/components/bgm-mini-player";
import { BreakSuggestionCard } from "@/components/break-suggestion-card";
import { BreakSuggestionWatcher } from "@/components/break-suggestion-watcher";
import { ClockButton } from "@/components/clock-button";
import { FirstRunTutorial } from "@/components/first-run-tutorial";
import { GoodnightOverlay } from "@/components/goodnight-overlay";
import { GrowthHintCard } from "@/components/growth-hint-card";
import { LandscapeHome } from "@/components/landscape-home";
import { LevelBadge } from "@/components/level-badge";
import { LevelUpOverlay } from "@/components/level-up-overlay";
import { MeasuringIndicator } from "@/components/measuring-indicator";
import { MinimalHomeUI } from "@/components/minimal-home";
import { NpcMessageCard } from "@/components/npc-message-card";
import { PannableBackdrop } from "@/components/pannable-backdrop";
import { PomodoroPhaseWatcher } from "@/components/pomodoro-phase-watcher";
import { RecordModal, type RecordValues } from "@/components/record-modal";
import { RestoreSessionCard } from "@/components/restore-session-card";
import { RoundIconButton } from "@/components/round-icon-button";
import { StudyDayStatus } from "@/components/study-day-status";
import { ThemedText } from "@/components/themed-text";
import { TimerDisplay } from "@/components/timer-display";
import {
  TimerSetupModal,
  type TimerSetupValues,
} from "@/components/timer-setup-modal";
import { TownVideoBackdrop } from "@/components/town-video";
import { TutorialOverlay } from "@/components/tutorial-overlay";
import { WeatherOverlay } from "@/components/weather-overlay";
import { WeatherPicker } from "@/components/weather-picker";
import { WeatherRow } from "@/components/weather-row";
import { clampLoopCount, MIN_SAVE_MINUTES, STUDY_DAY } from "@/constants/domain";
import { ClockAccent, Fonts, Spacing } from "@/constants/theme";
import { getTownArt } from "@/constants/townArt";
import { getTownVideo, type TownVideo } from "@/constants/townVideo";
import { getTutorialPage } from "@/constants/tutorial";
import { useAudio } from "@/contexts/AudioContext";
import { useSettings } from "@/contexts/SettingsContext";
import { useTimer } from "@/contexts/TimerContext";
import {
  activeSessionRepo,
  devRepo,
  extensionRepo,
  growthRepo,
  maintenanceRepo,
  masterRepo,
  sessionRepo,
  townProgressRepo,
  userRepo,
  weatherRepo,
} from "@/db/repositories";
import {
  HABIT_STEP_PRODUCTION,
  HABIT_STEP_TEST,
} from "@/db/repositories/devRepo";
import type { GrowthResult } from "@/db/repositories/growthRepo";
import type { StudyDaySummary } from "@/db/repositories/sessionRepo";
import type { SelectedTown } from "@/db/repositories/townProgressRepo";
import type { ActiveSession, NightWeather } from "@/db/types";
import { getTimeOfDay } from "@/lib/background-schedule";
import {
  getContinueThreshold,
  getExtensionThreshold,
  getInitialBreakThreshold,
  getStudyDayTotalMinutes,
} from "@/lib/break-suggestion";
import {
  advanceDevTime,
  now as appNow,
  nowMs,
  setDevTimeToHour,
  useAppNow,
} from "@/lib/clock";
import {
  getLevelProgress,
  type LevelProgress,
  type LevelThresholds,
} from "@/lib/growth";
import { refreshNotifications } from "@/lib/notification-sync";
import { scheduleTestNotification } from "@/lib/notifications";
import { getPseudoOnlineCount } from "@/lib/pseudo-online";
import {
  formatDotDate,
  formatHm,
  formatWeekdayShort,
  getStudyDate,
  isNightTime,
} from "@/lib/study-day";
import {
  getActualStudyMinutes,
  getPlannedEndMs,
  getPlannedMinutes,
} from "@/lib/timer";

// S2 ホーム画面（夜の街）。
// Phase 2-1: 選択中の街の背景（レベル連動）＋スワイプ探索（要件2.2）＋OSステータスバー非表示。
// 上部UI（日付・レベル・時計＝タイマー、各アイコン、BGMミニプレイヤー等）は後続の P2 で載せる。
/** ホームで無操作が続くとアイドル最小表示へ移るまでの時間（ミリ秒） */
const HOME_IDLE_MS = 30_000;

// 初めておやすみを押したときに出す説明ページ（1ページ）。存在しなければ空
const GOODNIGHT_INTRO_PAGES = (() => {
  const page = getTutorialPage("goodnight");
  return page ? [page] : [];
})();

export default function HomeScreen() {
  const { user, reload: reloadSettings, selectedTown, townNpc } = useSettings();
  const timer = useTimer();
  const audio = useAudio();
  // 横画面表示（要件2.4）: ホームだけ横向きを許可し、閲覧専用ビューへ切り替える
  const { width: winWidth, height: winHeight } = useWindowDimensions();
  const isLandscape = winWidth > winHeight;
  const isFocused = useIsFocused();
  const [selected, setSelected] = useState<SelectedTown | null>(null);
  const [summary, setSummary] = useState<StudyDaySummary | null>(null);
  const [loading, setLoading] = useState(true);
  // 鑑賞モード（要件2.4）: UIを一括非表示にして夜の街だけを眺める。状態は保存しない
  const [immersive, setImmersive] = useState(false);
  // アイドル最小表示: ホームで一定時間無操作だと、操作系UIを隠して時刻など最小限だけ残す。
  // どこかを触ると即復帰する（状態は保存しない）
  const [idle, setIdle] = useState(false);
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
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
  // S6 学習成果記録。終了後に確定済みのセッションへ任意項目を書き足す（要件3.4）。
  // studyDate は保存した記録の学習日（開始時刻由来）。5:00自動終了・翌日の復元では
  // 現在時刻の学習日とズレるため、表示・天気の書き込み先はこちらを使う
  const [record, setRecord] = useState<{
    id: number;
    minutes: number;
    studyDate: string;
  } | null>(null);
  // 成果記録に出す天気。記録の学習日のものを引く（5:00自動終了・翌日の中断復元で
  // 終わると、記録の夜とホームの weather（現在の学習日）は別の夜になるため）
  const [recordWeather, setRecordWeather] = useState<NightWeather | null>(null);
  // 記録の保存後にかけるNPCの一言（要件7.1）。選ばれた感情に応じて出し分ける
  const [npcMessage, setNpcMessage] = useState<string | null>(null);
  // 直近の成長結果（要件6.1）。NPCメッセージの出し分けと演出に使う
  const [growth, setGrowth] = useState<GrowthResult | null>(null);
  // レベルアップ・完成の演出（要件6.1）。到達レベル。null なら表示しない
  const [levelUp, setLevelUp] = useState<{
    level: number;
    completed: boolean;
  } | null>(null);
  // 演出が暗転しきるまで背景・Lv表示に使い続ける旧レベル（要件6.1 / UC 6.1）。
  // 成長処理の時点でDBは新レベルに確定するが、暗転の裏で差し替えたいので
  // それまでは上がる前のレベルを見せておく（記録画面の裏で先に変わらないように）
  const [bgLevelHold, setBgLevelHold] = useState<number | null>(null);
  // 習慣型のレベルアップ閾値。バランス調整できるようマスタから読む（定数は参照しない）
  const [habitThresholds, setHabitThresholds] = useState<LevelThresholds>({});
  // S5 休憩提案（要件5.1）。表示中の実績合計（分）。null なら非表示
  const [breakTotal, setBreakTotal] = useState<number | null>(null);
  // 表示中のカードが「その夜で初めて目標に届いた瞬間」のものか。
  // 一晩に何度カードが出ても、達成の宣言は最初の一度だけにするための印
  const [breakGoalNewlyReached, setBreakGoalNewlyReached] = useState(false);
  // おやすみ（要件13）。暗転画面に出すNPCの一言。null なら暗転していない
  const [goodnightMessage, setGoodnightMessage] = useState<string | null>(null);
  // おやすみの暗転がしきったか。暗転中に背景のループ動画を裏で回し続けないために使う
  const [goodnightDarkened, setGoodnightDarkened] = useState(false);
  // 初めておやすみを押したときに出す説明（閉じたら実際に眠る）
  const [goodnightIntro, setGoodnightIntro] = useState(false);
  // 開発用: 習慣型のレベルアップ閾値（1レベルあたりの必要経験値）。本番=5 / テスト=1
  const [habitStep, setHabitStep] = useState(HABIT_STEP_PRODUCTION);
  // 復元の判定が済んだか。済むまでは自動終了の見張りを動かさない
  // （5:00を過ぎた状態で起動したとき、案内より先に黙って終了させないため）
  const [restoreChecked, setRestoreChecked] = useState(false);
  // レベルアップ演出を閉じた後にNPCへ渡す感情（記録の保存時=選択値／離脱時=null）
  const pendingNpcEmotion = useRef<number | null>(null);
  // このセッションのNPC（開始時のスナップショット）。終了/達成メッセージをこの住人で出す（要件7.1）
  const pendingNpcId = useRef<number | null>(null);

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

  // 習慣型のレベルアップ閾値をマスタから読む（要件6.2: 基準値はマスタで調整可能）。
  // 起動時に一度だけでよい（マスタはアプリの実行中に変わらない）
  useEffect(() => {
    let mounted = true;
    masterRepo
      .getGrowthThresholds("habit")
      .then((t) => {
        if (mounted) setHabitThresholds(t);
      })
      .catch((e) => console.error("レベル閾値の読み込みに失敗しました", e));
    return () => {
      mounted = false;
    };
  }, []);

  // 成果記録を開いたら、その記録の学習日の天気を引く。
  // ホームの weather を流用すると、5:00をまたいで終了したときに別の夜の天気を
  // 出してしまい、選び直しても行の表示が変わらない
  useEffect(() => {
    if (!record) return;
    let mounted = true;
    weatherRepo
      .getWeatherByStudyDate(record.studyDate)
      .then((w) => {
        if (mounted) setRecordWeather(w);
      })
      .catch((e) =>
        console.error("記録した夜の天気の読み込みに失敗しました", e),
      );
    return () => {
      mounted = false;
    };
  }, [record]);

  // 他の画面から戻ってきたら、その夜の天気を読み直す。
  // ホームは裏で生存し続けるため（マウント処理は再実行されない）、これが無いと
  // カレンダー（4.1）や成果記録で天気を選び直しても、背景演出（8章）と環境音（9章）が
  // 前の天気のまま取り残される
  useEffect(() => {
    if (isFocused) void reloadWeather();
  }, [isFocused, reloadWeather]);

  // 街の切り替え（S9）は SettingsContext の selectedTown を更新する。
  // ホームは裏で生存し続けるため（画面を戻ってもマウント処理は再実行されない）、
  // 背景・レベルの表示は selectedTown に追従させて最新の街へ切り替える。
  // 成長処理での即時反映（setSelected）はこの後も上書きしない
  // （selectedTown はその後の reloadSettings 時にDBの最新レベルで揃う）。
  useEffect(() => {
    setSelected(selectedTown);
  }, [selectedTown]);

  // その夜の天気に応じて環境音を自動再生する（要件9 / UC 9.1）。
  // 天気が変わるたび（選択・成果記録での変更・読み直し）に切り替える。
  // 対応する音が無い天気・未選択では鳴らない（AudioContext 側で判定）。
  // 音量設定の読み込み完了（audio.ready）を待つ。既定値のまま鳴らして
  // 「音量0にしていたのに一瞬鳴る」ことを避けるため
  const setAmbientForWeather = audio.setAmbientForWeather;
  const audioReady = audio.ready;
  useEffect(() => {
    if (!audioReady) return;
    // 天気の名前も渡す。BGMを鳴らしていないとき、ロック画面にはこの名前が出る（要件9）
    setAmbientForWeather(weather?.code ?? null, weather?.name ?? null);
  }, [weather, audioReady, setAmbientForWeather]);

  // その夜の天気を選ぶ（要件2.5: 1晩＝1天気・最後の選択が残る）。
  // ホームの天気の行から選んだ場合は、その場で確定して演出へ反映する。
  // studyDate を指定すると過去の学習日（成果記録が5:00をまたいだ場合等）へ書ける。
  // ホームの演出（weather 状態）は現在の学習日のときだけ更新する
  const handleSelectWeather = useCallback(
    async (w: NightWeather, studyDate: string = getStudyDate()) => {
      if (!user) return;
      try {
        await weatherRepo.setWeather(user.id, studyDate, w.id);
        if (studyDate === getStudyDate()) setWeather(w);
      } catch (e) {
        console.error("今夜の天気の保存に失敗しました", e);
      } finally {
        setWeatherPickerOpen(false);
      }
    },
    [user],
  );

  // タイマー設定の値を記憶する（要件3.1）。入力を終えた時点で呼ばれる。
  // 開始しなくても次回へ引き継ぐため、ここで即座にDBへ書く。
  // 設定の再読込はモーダルを閉じるときにまとめて行う（1回で足りるため）
  const handleRememberSettings = useCallback(
    (prefs: {
      mode: "simple" | "pomodoro";
      plannedMinutes?: number;
      workMinutes?: number;
      breakMinutes?: number;
      loopCount?: number;
    }) => {
      userRepo
        .updateTimerPreferences({
          timerMode: prefs.mode,
          plannedMinutes: prefs.plannedMinutes,
          pomodoroWorkMinutes: prefs.workMinutes,
          pomodoroBreakMinutes: prefs.breakMinutes,
          pomodoroLoopCount: prefs.loopCount,
        })
        .catch((e) => console.error("タイマー設定の記憶に失敗しました", e));
    },
    [],
  );

  // 設定モーダルを閉じる。記憶した値を読み直してから閉じる
  const handleCloseSetup = useCallback(async () => {
    setSetupOpen(false);
    await reloadSettings();
  }, [reloadSettings]);

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
        // このセッションの予定学習時間（黙々=設定分数／ポモドーロ=作業時間×回数。2モード共通）
        const plannedMinutes =
          v.mode === "simple"
            ? (v.plannedMinutes ?? 0)
            : (v.workMinutes ?? 0) * (v.loopCount ?? 0);
        await activeSessionRepo.create({
          userId: user.id,
          townId: selected.town.id,
          timerMode: v.mode,
          plannedMinutes: v.plannedMinutes,
          pomodoroWorkMinutes: v.workMinutes,
          pomodoroBreakMinutes: v.breakMinutes,
          pomodoroLoopCount: v.loopCount,
          startTime: appNow().toISOString(),
          // 最初の休憩提案は「目標時間」と「開始時点の実績＋今回の予定学習時間」の
          // 大きい方で出す（要件5.1改訂: 自分で決めた学習時間の途中では割り込まない）
          breakSuggestThresholdMinutes: getInitialBreakThreshold(
            user.daily_goal_minutes,
            summary?.totalMinutes ?? 0,
            plannedMinutes,
          ),
          // 開始時の住人を固定（この夜の終了/達成メッセージはこの住人で出す・要件7.1）。
          // 住人は街ごとに1人で、計測中は街を切り替えられないため実際には入れ替わらないが、
          // 記録との整合のためセッション側にも控えておく
          npcId: townNpc?.id ?? masterRepo.DEFAULT_NPC_ID,
        });
        setWeather(v.weather);
        // 前回の演出が途中で失われていた場合の保険（旧レベルの背景を残さない）
        setBgLevelHold(null);
        await timer.reload();
        // ポモドーロの切り替わり通知を予約する（UC 12.2。設定OFF・黙々モードなら何も起きない）
        void refreshNotifications();
        setSetupOpen(false);
        setTimerOpen(true);
      } catch (e) {
        console.error("学習の開始に失敗しました", e);
      }
    },
    [user, selected, timer, reloadSettings, summary?.totalMinutes, townNpc?.id],
  );

  // 街の成長処理（要件6.1 / UC 6.1）。学習記録の保存を契機に一度だけ実行する。
  // 判定に使う実績合計は保存済みの記録から取り直す（1日に複数セッションなら合算される）。
  // studyDate は保存した記録の学習日を必ず渡す。終了処理は5:00自動終了や翌日の
  // 中断復元で学習日をまたいだ後に走ることがあり、現在時刻から取り直すと
  // 別の日（合計0分）で目標達成を判定してしまう
  const applyGrowth = useCallback(
    async (actualMinutes: number, studyDate: string) => {
      if (!user || !selected) return;
      try {
        const dayTotal = await sessionRepo.getStudyDayTotalMinutes(studyDate);
        const result = await growthRepo.applyGrowth({
          userId: user.id,
          townId: selected.town.id,
          method: user.growth_method,
          studyDate,
          actualMinutes,
          dayTotalMinutes: dayTotal,
          goalMinutes: user.daily_goal_minutes,
        });
        setGrowth(result);
        // レベルが上がった場合は、演出が暗転しきるまで上がる前のレベルを見せておく。
        // 下の setSelected でDBの新レベルが入るため、これが無いと記録画面（S6）の裏で
        // 背景が無演出のまま切り替わり、レベルアップが先にわかってしまう
        if (result?.leveledUp) setBgLevelHold(result.fromLevel);
        // 演出（レベルアップ・NPCの言葉）はここでは出さない。記録画面（S6）を
        // 閉じた後に出す（showPostRecord）。記録画面と同時に出すと、演出は Modal で
        // 最前面に来るため記録画面を覆い、操作できなくなるため。
        // 成長処理（DB）自体はこの時点で確定済みなので、S6から離脱しても街は育つ。
        // 街のレベル表示・背景アートへ反映する
        const town = await townProgressRepo.getSelectedTown();
        setSelected(town);
        // 目標達成の表示（ホームの学習状況）も更新する
        await reloadSummary();
      } catch (e) {
        console.error("街の成長処理に失敗しました", e);
      }
    },
    [user, selected, reloadSummary],
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
        //
        // 成長処理（要件6.1）もこの時点で一度だけ走らせる。契機は「学習記録の保存」で
        // あり、成果記録（S6）は任意項目の追記にすぎないため。S6から離脱しても
        // 街は育つ（要件3.4 の「離脱時も成長処理を実行する」の担保）
        await reloadSummary();
        await applyGrowth(result.minutes, result.studyDate);
        // 終了演出（要件3.3）: 鐘を鳴らし、その間BGM・環境音を下げる（ダッキング）。
        // 鐘の音量が0なら演出表示のみで無音（AudioContext 側で判定・UC 3.3 備考）。
        // 街ごとに鐘の音色を変える（未登録の街は既定音）。計測中は街を切り替えられない
        // ため、選択中の街＝そのセッションの街になる。
        audio.playBell(selected?.town.code);
        // この夜の付き添いNPC（開始時のスナップショット）を控える。終了/達成メッセージに使う
        pendingNpcId.current = result.npcId;
        setRecord({
          id: result.sessionId,
          minutes: result.minutes,
          studyDate: result.studyDate,
        });
      }
    } catch (e) {
      console.error("学習の終了に失敗しました", e);
    }
  }, [timer, reloadSummary, applyGrowth, audio, selected?.town.code]);

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

  // 休憩提案の3つの選択肢（要件5.1 / 5.2）。
  // いずれも「次に提案する基準」を動かすことで、以後の表示を制御する

  // 休憩提案の選択肢（要件5.1 / 5.2）。
  //
  // どのハンドラも、非同期の処理を終えてから最後に setBreakTotal(null) で閉じる。
  // 先に閉じると、処理を待つ間だけ見張りの抑制（suppressed）が外れ、
  // 条件を満たしたままの状態で再発火して提案が二重に出るため。
  //
  // また、続けることを選んだ場合は必ず次の基準を先送りする。休憩は実績に加算されず、
  // 基準を上げないと閉じた瞬間に表示条件を満たしたままとなり再び出てしまう（要件5.1）。

  // 今夜はここまでにする: 終了処理へ移る。タイマー表示の終了操作と同じ
  const handleBreakFinish = useCallback(async () => {
    await handleFinish();
    setBreakTotal(null);
  }, [handleFinish]);

  // 休憩する: 一時停止する。再開はユーザーの操作による。次の基準は超過60分後
  const handleBreakPause = useCallback(async () => {
    const current = timer.session?.break_suggest_threshold_minutes;
    // 先に一時停止を確定させる。pause() はメモリ上のセッションを先に書き換えてから
    // DBへ書くため、待たずに reload すると停止前の状態を読み戻してしまう
    await timer.pause(); // 一時停止側で予約を落とす（UC 12.2）
    if (current !== null && current !== undefined) {
      await activeSessionRepo.updateBreakThreshold(
        getContinueThreshold(current),
      );
      // 引き上げた基準をメモリ上のセッションへ取り込む。pause() は一時停止の列しか
      // 書き換えないため、これが無いと見張りが古い基準のまま再判定し、
      // カードを閉じた瞬間にまた出る（「このまま続ける」側と同じ扱いに揃える）
      await timer.reload();
    }
    setBreakTotal(null);
  }, [timer]);

  // このまま続ける: 基準を+60分し、超過60分ごとに再表示する
  const handleBreakContinue = useCallback(async () => {
    const current = timer.session?.break_suggest_threshold_minutes;
    if (current !== null && current !== undefined) {
      await activeSessionRepo.updateBreakThreshold(
        getContinueThreshold(current),
      );
      await timer.reload();
    }
    setBreakTotal(null);
  }, [timer]);

  // 時間を決めて続ける: 宣言時間内は再表示しない（要件5.2）。
  // 宣言は休憩提案の表示制御にのみ使い、目標達成・経験値の判定には影響しない
  const handleBreakExtend = useCallback(
    async (declared: number) => {
      if (user) {
        try {
          await extensionRepo.declare(user.id, getStudyDate(), declared);
          await activeSessionRepo.updateBreakThreshold(
            getExtensionThreshold(breakTotal ?? 0, declared),
          );
          await timer.reload();
        } catch (e) {
          console.error("延長宣言に失敗しました", e);
        }
      }
      setBreakTotal(null);
    },
    [user, timer, breakTotal],
  );
  // おやすみ（要件13 / UC 13.1）。夜を閉じる演出。
  // タイマー稼働中（一時停止中を含む）は実行しない（呼び出し側でグレーアウト＋メッセージ）。
  // 確認 → 音のフェードアウト → 暗転＋NPCのおやすみメッセージ、の順で進める。
  // 実際に夜を閉じる（音のフェードアウト → 暗転＋NPCのおやすみメッセージ）
  const runGoodnight = useCallback(async () => {
    try {
      // おやすみはセッションに紐づかないため、いま選択中の街の住人で出す（要件7.1・13）
      const message = await masterRepo.pickNpcMessage(
        "goodnight",
        null,
        townNpc?.id ?? masterRepo.DEFAULT_NPC_ID,
      );
      audio.setGoodnight(true);
      setGoodnightMessage(message ?? "おやすみなさい。またこの街で。");
    } catch (e) {
      console.error("おやすみの準備に失敗しました", e);
    }
  }, [audio, townNpc?.id]);

  // 眠るかどうかの確認（キャンセルなら何もしない）。UC 13.1 のステップ2
  const confirmGoodnight = useCallback(() => {
    Alert.alert("眠りにつきますか", "音を止めて、静かに画面を閉じます。", [
      { text: "まだ起きている", style: "cancel" },
      { text: "おやすみ", onPress: () => void runGoodnight() },
    ]);
  }, [runGoodnight]);

  const handleGoodnight = useCallback(() => {
    // 鑑賞モード中でも押せるよう、UIは戻しておく
    setImmersive(false);
    // 初めておやすみを押したときは、確認より先に短い説明を出す（要件1.3・機能ごとの初回説明）。
    // 「何が起きるのか」を読んでから眠るかどうかを決められるようにするため、
    // 説明は確認の後ではなくボタンを押した時点で出す
    const seen = (user?.tutorial_seen_features ?? "")
      .split(",")
      .filter(Boolean);
    if (user && !seen.includes("goodnight")) {
      setGoodnightIntro(true);
      return;
    }
    confirmGoodnight();
  }, [user, confirmGoodnight]);

  // 暗転画面をタップしてホームへ戻る（音はフェードインで再開。要件13）
  const handleWake = useCallback(() => {
    setGoodnightMessage(null);
    // 明転は暗い側から始まるので、背景の動きは戻す時点から再開させる
    setGoodnightDarkened(false);
    audio.setGoodnight(false);
  }, [audio]);

  // 感情に応じたNPCの一言を出す（要件7.1 / 3.4 のステップ8）。
  // 同時に成立したときの優先順位は 街の完成 ＞ 目標達成 ＞ 学習終了。
  // 完成（Lv5到達）はその街で一度きりの夜なので、いちばん強い言葉を出す（要件6.1）
  const showNpcMessage = useCallback(
    async (emotionId: number | null) => {
      const trigger = growth?.completed
        ? "town_completed"
        : growth?.goalAchieved
          ? "goal_achieved"
          : "study_end";
      setNpcMessage(
        await masterRepo.pickNpcMessage(
          trigger,
          // 完成の言葉は感情で出し分けない。その夜の手応えより「ここまで来たこと」を
          // 受け止める言葉にしたいため（要件7.1: 感情ごとの候補は任意）
          trigger === "town_completed" ? null : emotionId,
          // 開始時のNPC（スナップショット）で語る。途中で街を変えても今夜は変わらない
          pendingNpcId.current ?? masterRepo.DEFAULT_NPC_ID,
        ),
      );
    },
    [growth?.completed, growth?.goalAchieved],
  );

  // 記録画面を閉じた後の流れ（要件6.1 / 7.1）。
  // レベルが上がっていれば演出を先に出し、終わったらNPCの言葉（成長の事実 → 言葉の順）。
  // 上がっていなければNPCの言葉だけを出す。保存・離脱のどちらからも通す。
  const showPostRecord = useCallback(
    (emotionId: number | null) => {
      setRecord(null);
      if (growth?.leveledUp) {
        // 演出を閉じたときにNPCを出すため、感情を保持しておく
        pendingNpcEmotion.current = emotionId;
        setLevelUp({ level: growth.toLevel, completed: growth.completed });
      } else {
        void showNpcMessage(emotionId);
      }
    },
    [growth, showNpcMessage],
  );

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
        showPostRecord(v.emotionId);
      } catch (e) {
        console.error("成果記録の保存に失敗しました", e);
        setRecord(null);
      }
    },
    [record, showPostRecord],
  );

  // 開発用: 今夜の学習記録を消して、合計を0へ戻す（__DEV__ 限定）。
  // 目標達成・休憩提案はその学習日の実績合計に依存するため、確認をやり直すのに使う
  const handleClearStudyDay = useCallback(async () => {
    try {
      await devRepo.clearStudyDayRecords(getStudyDate());
      await reloadSummary();
    } catch (e) {
      console.error("今夜の学習記録の初期化に失敗しました", e);
    }
  }, [reloadSummary]);
  // 開発用: 現在の閾値を起動時に読む（マスタはデータ初期化で戻らないため、状態を合わせる）
  useEffect(() => {
    if (!__DEV__) return;
    devRepo
      .getHabitLevelStep()
      .then(setHabitStep)
      .catch(() => {});
  }, []);

  // 開発用: レベルアップ閾値を 本番(5回/Lv) ⇄ テスト(1回/Lv) で切り替える。
  // 本番は目標達成5回で1レベルのため、演出の確認に手数がかかる
  const handleToggleHabitStep = useCallback(async () => {
    const next =
      habitStep === HABIT_STEP_TEST ? HABIT_STEP_PRODUCTION : HABIT_STEP_TEST;
    try {
      await devRepo.setHabitLevelStep(next);
      setHabitStep(next);
    } catch (e) {
      console.error("レベルアップ閾値の切り替えに失敗しました", e);
    }
  }, [habitStep]);
  // 開発用: 選択中の街のレベルを 1→2→3→4→5→1 と循環させる（__DEV__ 限定）。
  // 各レベルの見た目の確認と、レベルアップ・完成演出のやり直しを兼ねる。
  // レベルに応じて実績値も辻褄を合わせる（devRepo 側）
  const handleCycleLevel = useCallback(async () => {
    if (!user) return;
    try {
      await devRepo.cycleTownLevel(
        user.growth_method,
        selected?.progress.project_target_minutes ?? null,
      );
      // 演出用の保持レベルが残っていると切り替えが見えないので解除する
      setBgLevelHold(null);
      setSelected(await townProgressRepo.getSelectedTown());
    } catch (e) {
      console.error("レベルの切り替えに失敗しました", e);
    }
  }, [user, selected?.progress.project_target_minutes]);
  // 開発用: カレンダー確認用のダミー記録をまとめて入れる（__DEV__ 限定）。
  // 過去数日ぶん（日別マーク・複数セッション確認用）＋当年4〜6月の傾向違い
  // （ふりかえりメッセージ確認用）を1ボタンで投入する。
  const handleSeedCalendar = useCallback(async () => {
    try {
      await devRepo.seedCalendarSampleData();
      await devRepo.seedMonthlyReviewSampleData();
      await devRepo.seedAlbumStageSampleData();
      await reloadSummary();
      await reloadWeather();
      if (__DEV__)
        Alert.alert(
          "ダミー記録",
          "過去数日ぶん、4〜6月の傾向違い、アルバムの段階比較用（2か月前=20夜／1か月前=8夜／今月=3夜、通算60夜超）の記録を入れました。",
        );
    } catch (e) {
      console.error("ダミー記録の投入に失敗しました", e);
    }
  }, [reloadSummary, reloadWeather]);
  // 背景アートとLv表示に使うレベル。レベルアップ演出中は暗転しきるまで
  // 上がる前のレベルを見せる（背景とLv表示が同時に切り替わる）
  const level = bgLevelHold ?? selected?.progress.current_level ?? 1;

  // 次のレベルまでの積み上がり（要件6.1・6.2）。レベルの灯りの下に視覚だけで示す。
  // 段の判定には上の level を使う。演出中に「バッジはLv.3・進捗はLv.4の段」と
  // 食い違わないよう、表示に使うレベルと必ず揃える
  const levelProgress = useMemo(() => {
    if (!user || !selected) return null;
    return getLevelProgress({
      method: user.growth_method,
      currentLevel: level,
      exp: selected.progress.experience_points,
      cumulativeMinutes: selected.progress.cumulative_study_minutes,
      habitThresholds,
      projectTargetMinutes: selected.progress.project_target_minutes,
    });
  }, [user, selected, level, habitThresholds]);

  // 縦固定が必要な状態（操作モーダル・演出・システムイベント）。
  // これらが立っている間は横向きを許可しない＝要件2.4「操作系は縦固定／イベント時は縦へ戻す」。
  // 鑑賞モード（immersive）は縦のUI非表示であり、横向き許可の妨げにはしない
  const needsPortrait =
    setupOpen ||
    timerOpen ||
    record !== null ||
    breakTotal !== null ||
    restoreMinutes !== null ||
    levelUp !== null ||
    npcMessage !== null ||
    goodnightMessage !== null ||
    weatherPickerOpen ||
    discardedNote;

  // 向きロックの一元管理（要件2.4）。ホームにフォーカスがあり、操作/演出中でない
  // ときだけ回転を許可する。それ以外（他画面へ移動中・オーバーレイ中）は縦固定。
  // 許可には DEFAULT を使う（iOSは上下逆さ以外＝縦＋横を許可。ALL は iPhone 非対応で失敗する）。
  useEffect(() => {
    const lock =
      isFocused && !needsPortrait
        ? ScreenOrientation.OrientationLock.DEFAULT
        : ScreenOrientation.OrientationLock.PORTRAIT_UP;
    ScreenOrientation.lockAsync(lock).catch((e) =>
      console.error("画面の向きの切り替えに失敗しました", e),
    );
  }, [isFocused, needsPortrait]);

  // 離脱・アンマウント時は必ず縦へ戻す（初期設定などホーム以外を縦固定に保つ安全策）
  useEffect(() => {
    return () => {
      ScreenOrientation.lockAsync(
        ScreenOrientation.OrientationLock.PORTRAIT_UP,
      ).catch(() => {});
    };
  }, []);

  // 横向きの閲覧ビューを出すか（操作/演出中は縦へ戻すため出さない）
  const landscapeMode = isLandscape && !needsPortrait;

  // 通常のホームUI（上部情報・各ボタン）を出す条件。モーダル・鑑賞・横向き中は出さない
  const uiVisible =
    !landscapeMode && !immersive && !setupOpen && !timerOpen && !record;
  // アイドル最小表示のカウントを動かす条件（読み込み中は動かさない）。
  // isFocused を条件に含めるのは、ホームは他画面へ移動してもマウントされ続けるため。
  // これが無いと、カレンダー等に居る間も裏で無操作を数え、戻ると最小化済みになる。
  // フォーカスが外れれば idleActive=false になり、下の effect がタイマーを止めて
  // 最小表示も解除する。戻ってくると数え直す（要件2.1のアイドル最小化はホーム限定）。
  const idleActive = uiVisible && !loading && isFocused;

  // アイドル判定はコールバックから最新の可否を見たいので ref に控える
  const idleActiveRef = useRef(idleActive);
  idleActiveRef.current = idleActive;

  // 無操作タイマーを張り直す（対象状態のときだけ）。発火でアイドル最小表示へ移る
  const armIdle = useCallback(() => {
    if (idleTimer.current) clearTimeout(idleTimer.current);
    if (!idleActiveRef.current) return;
    idleTimer.current = setTimeout(() => setIdle(true), HOME_IDLE_MS);
  }, []);

  // 操作があった（触れた）ときに呼ぶ: 最小表示を解除し、無操作タイマーを張り直す
  const markActive = useCallback(() => {
    setIdle(false);
    armIdle();
  }, [armIdle]);

  // 対象状態に入ったらタイマー開始、外れたら止める。
  //
  // 外れたときに最小表示も解除するが、**横向きへ回しただけのときは解除しない**。
  // 横画面は同じ「街を眺める」状態の別の見せ方であり、端末を回して戻しただけで
  // 通常表示に戻ってしまうと、最小表示にした意図が失われるため。
  // 最小表示の解除は画面に触れたとき（markActive）に限る。
  useEffect(() => {
    if (idleActive) {
      armIdle();
    } else {
      if (idleTimer.current) clearTimeout(idleTimer.current);
      if (!landscapeMode) setIdle(false);
    }
    return () => {
      if (idleTimer.current) clearTimeout(idleTimer.current);
    };
  }, [idleActive, landscapeMode, armIdle]);

  // 前面にいる間だけ無操作を数える（見ていない時間＝背面・ロックは数えない）。
  // 背面に入ったらタイマーを止め、前面に戻ったら通常表示に戻して数え直す
  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        markActive();
      } else if (idleTimer.current) {
        clearTimeout(idleTimer.current);
      }
    });
    return () => sub.remove();
  }, [markActive]);

  return (
    <View
      style={styles.container}
      // 触りはじめでは無操作タイマーを張り直すだけにする（最小表示はまだ解除しない）。
      // 触れた瞬間に解除すると、時計を押しても onPress 前に時計が消えて詳細へ行けないため。
      // 最小表示の解除は指を離したとき（時計以外＝背景タップ／時計＝onPressで詳細）に行う。
      // capture で全ての触りはじめを拾い、responder は奪わない（子の操作は妨げない）
      onStartShouldSetResponderCapture={() => {
        armIdle();
        return false;
      }}
    >
      {/* OSのステータスバー（時刻・バッテリー）を隠して全面背景にする */}
      <StatusBar hidden />

      {/* 鑑賞モード中はOSのスリープを防止する（要件2.4） */}
      {immersive ? <KeepScreenAwake /> : null}

      {/* 背景。時間帯に応じた画像選択の1分ごとの更新はこの部品に閉じ込め、
          ホーム全体（見張り・オーバーレイ・上部UI）を毎分再描画させない */}
      <HomeBackground
        landscapeMode={landscapeMode}
        townCode={selected?.town.code}
        level={level}
        session={timer.session}
        // おやすみの暗転しきった後は、見えていない背景を回し続けない（要件13）
        motionEnabled={
          user?.background_motion_enabled === 1 && !goodnightDarkened
        }
        clockHidden={user?.minimal_clock_enabled === 0}
        weatherCode={weather?.code ?? null}
        onRestoreFromImmersive={() => {
          // 背景タップ: アイドル最小表示を解除（＝通常表示へ戻す）し、鑑賞モードも解除する
          markActive();
          if (immersive) setImmersive(false);
        }}
      />

      {loading ? (
        <ActivityIndicator style={styles.centerLoader} color="#ffffff" />
      ) : null}

      {/* 無操作が続いたときの最小表示（操作系UIを隠し、時刻など最小限だけ残す）。
          背景（夜の街）はそのまま透かす。どこかに触れると通常表示へ戻る */}
      {uiVisible && idle ? (
        <IdleOverlay
          session={timer.session}
          clockHidden={user?.minimal_clock_enabled === 0}
          // 最小表示中でも時計を押したら詳細（タイマー表示）へ。計測中のみ時計は出る
          onPressTimer={() =>
            timer.session ? setTimerOpen(true) : setSetupOpen(true)
          }
        />
      ) : null}

      {/* 鑑賞モード中はすべてのUIを隠す（鑑賞モードボタン自身を含む）。
          横向き・タイマー設定モーダル表示中も同様に隠し、背景は夜の街だけを透かす
          （ボタン類が透けるとごちゃついて見えるため）。最小表示中も通常UIは隠す */}
      {uiVisible && !idle ? (
        <>
          {selected ? (
            <TopOverlay
              level={level}
              levelProgress={levelProgress}
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
          <SideIcons
            running={timer.status !== "idle"}
            onGoodnight={handleGoodnight}
          />
          <ImmersiveButton onPress={() => setImmersive(true)} />
          <View style={[styles.absolute, styles.miniPlayer]}>
            <BgmMiniPlayer />
          </View>
          {/* 初回（初期設定完了後）に一度だけ使い方チュートリアル（最小限）を出す。閉じたら育て方のお知らせ */}
          <FirstRunTutorial />
          {/* 初回ホーム表示で一度だけ案内する（要件6.2） */}
          <GrowthHintCard />
          {/* 初めておやすみを押したときの説明。閉じたら既読にして、眠るかどうかの確認へ進む */}
          <TutorialOverlay
            visible={goodnightIntro}
            pages={GOODNIGHT_INTRO_PAGES}
            onClose={() => {
              setGoodnightIntro(false);
              void (async () => {
                try {
                  await userRepo.markFeatureTutorialSeen("goodnight");
                  await reloadSettings();
                } catch (e) {
                  console.error("おやすみ説明の既読記録に失敗しました", e);
                }
                confirmGoodnight();
              })();
            }}
          />
          <DevPanel
            townLevel={selected?.progress.current_level ?? 1}
            onCycleLevel={() => void handleCycleLevel()}
            onClearStudyDay={() => void handleClearStudyDay()}
            onSeedCalendar={() => void handleSeedCalendar()}
            habitStep={habitStep}
            onToggleHabitStep={() => void handleToggleHabitStep()}
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
            studyDate={getStudyDate()}
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

      {/* ポモドーロの作業⇄休憩の切り替わりで控えめな効果音を鳴らす（要件3.1）。
          計測中のポモドーロのときだけ見張る */}
      {timer.session && timer.session.timer_mode === "pomodoro" ? (
        <PomodoroPhaseWatcher
          session={timer.session}
          onPhaseChange={() => audio.playSfx("pomodoro_phase")}
        />
      ) : null}

      {/* S6 学習成果記録（要件3.4）。セッションは確定済みのため、
          保存せず閉じても学習した時間は失われない */}
      {record && user ? (
        <RecordModal
          userId={user.id}
          // 現在時刻ではなく保存した記録の学習日（5:00をまたいで終了しても前夜として扱う）
          studyDate={record.studyDate}
          minutes={record.minutes}
          weather={recordWeather}
          emotionEnabled={user.emotion_record_enabled === 1}
          onChangeWeather={(w) => {
            setRecordWeather(w);
            void handleSelectWeather(w, record.studyDate);
          }}
          onSave={(v) => void handleSaveRecord(v)}
          // 保存せず離脱した場合も、成長処理は実行済み。感情は空でNPC/演出へ進む（要件3.4）
          onClose={() => showPostRecord(null)}
        />
      ) : null}

      {/* 休憩提案の見張り（要件5.1）。頑張りすぎ防止がOFFなら動かない。
          復元の案内中・成果記録中・既に提案中のときは重ねて出さない */}
      {timer.session && user && restoreChecked && restoreMinutes === null ? (
        <BreakSuggestionWatcher
          session={timer.session}
          savedMinutes={summary?.totalMinutes ?? 0}
          enabled={user.overwork_prevention_enabled === 1}
          suppressed={breakTotal !== null || record !== null}
          onSuggest={() => {
            // コールバックの中では外側の絞り込みが効かないため、ここで取り直す
            const session = timer.session;
            if (!session || !user) return;
            // 鑑賞モード中はUIを復帰させてから表示する（要件2.4）
            setImmersive(false);
            // 休憩モーダルが出たことを、柔らかい通知音で1回知らせる（要件5.1・UC 5.1。鐘は使わない）
            audio.playSfx("break_notice");
            const saved = summary?.totalMinutes ?? 0;
            const total = getStudyDayTotalMinutes(saved, session, nowMs());
            setBreakTotal(total);
            // 「今夜の目標に届きました」と言えるのは、その夜で初めて届いた瞬間だけ。
            //   ・保存済みが既に目標に達している → 前のセッションで達成済み
            //   ・基準が初期値でない          → このセッションで一度カードを出した後
            // どちらかに当てはまれば、達成の宣言ではなく区切りの知らせとして出す
            const threshold = session.break_suggest_threshold_minutes ?? 0;
            const isFirstCard =
              threshold <= saved + getPlannedMinutes(session);
            setBreakGoalNewlyReached(
              isFirstCard &&
                saved < user.daily_goal_minutes &&
                total >= user.daily_goal_minutes,
            );
          }}
        />
      ) : null}

      {/* S5 休憩提案（要件5.1 / 5.2） */}
      <BreakSuggestionCard
        // 表示のたびに1段目から始める
        key={breakTotal === null ? "closed" : "open"}
        visible={breakTotal !== null}
        totalMinutes={breakTotal ?? 0}
        // 基準は「今回決めた分」なので、目標より短い予定で始めた夜は目標未達で出る。
        // その場合に「目標に届きました」と言わないよう、実績で判定して文面を変える
        reachedGoal={breakGoalNewlyReached}
        onFinish={() => void handleBreakFinish()}
        onBreak={() => void handleBreakPause()}
        onContinue={() => void handleBreakContinue()}
        onExtend={(m) => void handleBreakExtend(m)}
      />
      {/* レベルアップ・完成の演出（要件6.1）。暗転 → 灯りのひとこと → 明転で新しい背景、
          の順に自動で見せる。成長の事実 → NPCの言葉、の順は変えない。
          暗転しきったところで背景を新レベルへ差し替え、演出が終わったら
          保持しておいた感情でNPCの言葉を出す */}
      <LevelUpOverlay
        level={levelUp?.level ?? null}
        completed={levelUp?.completed ?? false}
        onBlackout={() => setBgLevelHold(null)}
        onDone={() => {
          setLevelUp(null);
          void showNpcMessage(pendingNpcEmotion.current);
        }}
      />

      {/* 記録の保存後にかけるNPCの一言（要件7.1） */}
      <NpcMessageCard
        message={npcMessage}
        onClose={() => setNpcMessage(null)}
      />

      {/* おやすみの暗転画面（要件13）。タップでホームへ復帰する */}
      <GoodnightOverlay
        message={goodnightMessage}
        onWake={handleWake}
        onBlackout={() => setGoodnightDarkened(true)}
      />

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
          initialMode={user.timer_mode}
          initialPlanned={user.planned_minutes}
          initialWork={user.pomodoro_work_minutes}
          initialBreak={user.pomodoro_break_minutes}
          // 値域を2〜10へ狭める前に保存された前回値は1のことがあるため丸める（要件3.1）
          initialLoop={clampLoopCount(user.pomodoro_loop_count)}
          initialWeather={weather}
          onStart={handleStart}
          onRememberSettings={handleRememberSettings}
          onClose={() => void handleCloseSetup()}
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

// 右側の縦並びアイコン（カレンダー・設定・おやすみ）と、その下の今夜の学習仲間
function SideIcons({
  running,
  onGoodnight,
}: {
  /** タイマー稼働中（一時停止中を含む）。おやすみは不可（要件13） */
  running: boolean;
  /** おやすみボタンが押されたとき（稼働中でないとき）に呼ぶ */
  onGoodnight: () => void;
}) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  // 夜間帯の出入りで表示が切り替わるよう、時刻の変化を見る（要件2.3と同じ判定）
  const now = useAppNow(10000);
  const online = isNightTime(now) ? getPseudoOnlineCount() : null;

  // おやすみボタン（要件13 / UC 13.1）。
  // 稼働中は「学習中はおやすみできません」と控えめに伝えるだけ（グレーアウト表示）。
  // それ以外は呼び出し側へ渡す（初回の説明・確認の順序は呼び出し側が決める）
  function handleGoodnight() {
    if (running) {
      Alert.alert(
        "学習中はおやすみできません",
        "先に学習を終えてから、そっと夜を閉じましょう。",
      );
      return;
    }
    onGoodnight();
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
        dimmed={running}
        accessibilityLabel="おやすみ"
      />
      {/* 今夜の学習仲間（要件11）。学習を開始できる夜間帯のあいだだけ出す。
          昼に「今夜の仲間」が居るのは筋が通らず、学習できない時間に人数を見せても
          置いていかれた感じにしかならないため */}
      {online !== null ? (
        <Text style={styles.onlineText}>今夜の学習人数は{online}人</Text>
      ) : null}
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
// 開発用: テスト通知が鳴るまでの秒数。押してからアプリを閉じ、画面を消すのに足りる長さ
const DEV_TEST_NOTICE_SECONDS = 10;

// 開発用の時刻上書き。夜間帯判定（要件2.3）の両側を実機で確認するために使う。
// null = 実時間 / 21 = 夜間帯内（開始できる） / 12 = 夜間帯外（開始できない）
// 上書きの実体は src/lib/clock.ts にあり、計測・5:00判定にも同じ時刻が効く。
const DEV_CLOCK_HOURS: (number | null)[] = [null, 21, 12];

function devHourLabel(hour: number | null): string {
  return hour === null ? "実時間" : `${hour}:00`;
}

// アイドル最小表示（無操作が続いたとき）。操作系UIを隠し、最小UI（時刻・日付・再生中と、
// 計測中のみ時計＋作業中）だけを残す。box-none で、時計以外のタップは背景へ透過して通常
// 表示へ戻し、時計だけはタップで詳細（タイマー表示）へ飛べる（要件2.4）。
function IdleOverlay({
  session,
  clockHidden,
  onPressTimer,
}: {
  session: ActiveSession | null;
  /** 設定「学習中の時計」（要件10.16）がOFFか */
  clockHidden: boolean;
  onPressTimer: () => void;
}) {
  const insets = useSafeAreaInsets();
  return (
    <Animated.View
      style={StyleSheet.absoluteFill}
      pointerEvents="box-none"
      entering={FadeIn.duration(600)}
    >
      <MinimalHomeUI
        session={session}
        insets={insets}
        clockHidden={clockHidden}
        onPressClock={onPressTimer}
      />
    </Animated.View>
  );
}

// 上部オーバーレイ。左上: バッテリー＋日時＋今夜の学習仲間、右上: 大きな時計＝タイマー、
// 時計の左に Lv バッジ。右側アイコン（カレンダー/設定/おやすみ）・左下（目）・下部BGMは後続で追加する。
function TopOverlay({
  level,
  levelProgress,
  summary,
  goalMinutes,
  weather,
  onPressWeather,
  onPressTimer,
  session,
}: {
  level: number;
  /** 次のレベルまでの積み上がり。街の完成・判定不能なら null（何も出さない） */
  levelProgress: LevelProgress | null;
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
  const top = insets.top + Spacing.two;

  // 学習時間・目標達成は「保存済みの記録 ＋ 稼働中セッション」の合算で見る（UC 2.1 備考）。
  // 保存済みだけを見ていると、学習中は数字が増えず達成にもならない。
  //
  // 達成の判定に daily_goal_achievement（経験値の付与済み記録）を使わないのは、
  // あれが「終了時に・習慣型のときだけ」書かれる成長側の台帳のため。
  // プロジェクト型では永久に書かれず、何時間学習しても達成にならなかった。
  // ただし付与済みなら達成として扱う。目標時間を後から引き上げても、
  // 一度示した達成を取り消さないため（レベルが下がらないのと同じ考え方）
  const dayTotalMinutes = getStudyDayTotalMinutes(
    summary?.totalMinutes ?? 0,
    session,
    now.getTime(),
  );
  const goalAchieved =
    (summary?.achieved ?? false) ||
    (goalMinutes !== null && dayTotalMinutes >= goalMinutes);

  // 夜間帯（18:00〜翌5:00）のみ学習を開始できる（要件2.3）。
  // useNow が定期的に更新されるため、時刻の変化時にも判定し直される
  const canStart = isNightTime(now);

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      {/* 左上。性質の違うものを3つの塊に分けて置く（要件2.1）:
            ① 今夜の様子（日時・天気・学習仲間）
            ② 今夜の学習（時間・目標達成）
            ③ 街の育ち（レベル・次の灯りまで）
          バッテリーはここには出さない。無操作30秒でアイドル最小表示へ移り、
          そこで日付・時刻とともに大きく出るため、通常表示では二重になる */}
      <View
        style={[styles.absolute, styles.topLeft, { top, left: Spacing.four }]}
      >
        {/* ① 今夜の様子。天気だけがタップできる（要件2.5: 専用ボタンは設けない）。
            学習仲間（要件11）は右側のおやすみボタンの下へ置いている */}
        <View style={styles.infoBlock}>
          {/* 最小表示の置き時計と同じ書式（ドット区切り・セリフ体・広い字間）だが、
              罫線は引かず、時刻も小さくする。通常表示では数十秒しか見ない情報で、
              主役は街と学習状況のため、家族に見えつつ一段控えめにする */}
          <Text style={styles.dateText}>{formatDotDate(now)}</Text>
          <View style={styles.clockRow}>
            <Text style={styles.timeText}>{formatHm(now)}</Text>
            <Text style={styles.weekdayText}>{formatWeekdayShort(now)}</Text>
          </View>
          {/* 日時から半行ぶん離す。詰めすぎると時刻の一部のように見えるため
              （間隔はホーム側で持つ。この部品はモーダルでも使うため素のまま置く） */}
          <View style={styles.weatherRow}>
            <WeatherRow weather={weather} onPress={onPressWeather} />
          </View>
        </View>

        {/* ② 当学習日の学習時間・目標達成状況（要件2.1 / UC 2.1 備考） */}
        {summary && goalMinutes !== null ? (
          <StudyDayStatus
            totalMinutes={dayTotalMinutes}
            goalMinutes={goalMinutes}
            achieved={goalAchieved}
          />
        ) : null}

        {/* ③ 街の育ち。達成 → 経験値 → レベルのつながりが見えるよう、
            学習状況のすぐ下に置く（従来は時計の左だった） */}
        <View style={styles.growthBlock}>
          <LevelBadge level={level} progress={levelProgress} />
        </View>
      </View>

      {/* 右上: 大きなアナログ時計＝タイマー。夜間帯外は非活性（要件2.3） */}
      <View style={[styles.absolute, { top, right: Spacing.four }]}>
        <ClockButton
          size={CLOCK_SIZE}
          now={now}
          onPress={onPressTimer}
          disabled={!canStart && !session}
          // 計測中は文字盤に「終わりの位置」を示す（カウントダウンで急かさない）
          endAt={
            session ? new Date(getPlannedEndMs(session, now.getTime())) : null
          }
          // 一時停止中は回さない（止まっていることが光で分かる）
          running={session !== null && session.pause_started_at === null}
        />
        {session ? (
          <MeasuringIndicator session={session} width={CLOCK_SIZE} />
        ) : !canStart ? (
          <Text
            style={styles.closedText}
            numberOfLines={1}
            adjustsFontSizeToFit
          >
            この街が目覚めるのは{STUDY_DAY.START_HOUR}:00から
          </Text>
        ) : null}
      </View>

    </View>
  );
}

// ホーム背景（縦＝街のパン／横＝閲覧ビュー／街のアート未登録＝暗色）。
// 時間帯に応じた画像選択の更新（1分ごと）をこの部品に閉じ込め、ホーム全体
// （見張り・オーバーレイ・上部UI）を毎分再描画させない（要件8 / 背景スケジュール）。
// 現状は差分素材が無く常に night 画像だが、素材が入れば時刻に応じて切り替わる。
function HomeBackground({
  landscapeMode,
  townCode,
  level,
  session,
  motionEnabled,
  clockHidden,
  weatherCode,
  onRestoreFromImmersive,
}: {
  landscapeMode: boolean;
  /** 選択中の街コード（未選択は undefined） */
  townCode: string | undefined;
  level: number;
  session: ActiveSession | null;
  /** 設定「背景を動かす」（要件10.11）。OFFなら動画素材があっても静止画 */
  motionEnabled: boolean;
  /** 設定「学習中の時計」（要件10.16）がOFFか。横画面の最小UIへ渡す */
  clockHidden: boolean;
  /** その学習日に選択された天気（要件8）。未選択は null＝演出なし */
  weatherCode: string | null | undefined;
  /** 鑑賞モード中に背景をタップしたときの復帰 */
  onRestoreFromImmersive: () => void;
}) {
  const now = useAppNow(60000);
  const timeOfDay = getTimeOfDay(now);
  const art = townCode ? getTownArt(townCode, level, timeOfDay) : undefined;
  // 動画は登録がある組み合わせだけ。無ければ静止画のまま（時間帯のフォールバックはしない）。
  // パターンが複数ある枠は学習日ごとに1つ選ぶ（同じ夜のあいだは切り替わらない）
  const video =
    motionEnabled && townCode
      ? getTownVideo(townCode, level, timeOfDay, getStudyDate(now))
      : undefined;

  if (landscapeMode) {
    // 横向き（要件2.4）: 街の全景だけを表示する閲覧専用ビュー。
    // 天気の演出は最小情報表示より下に敷きたいため、ビューの内側で重ねる
    return (
      <LandscapeHome
        art={art}
        video={video}
        session={session}
        weatherCode={weatherCode}
        effectsEnabled={motionEnabled}
        clockHidden={clockHidden}
      />
    );
  }
  return (
    <>
      {art ? (
        <TownBackground
          art={art}
          video={video}
          onTap={onRestoreFromImmersive}
        />
      ) : (
        <View style={styles.fallback} />
      )}
      {/* 天気の演出（要件8）。街より上・UIより下。スワイプでは動かさない
          （雨はカメラの手前にあるもので、街と一緒に流れると視点がおかしくなる） */}
      <WeatherOverlay weatherCode={weatherCode} enabled={motionEnabled} />
    </>
  );
}

// 選択中の街の背景。画面を覆うサイズ（cover）で表示し、スワイプで街を探索する（要件2.2）。
// 初期設定の拡大表示と同じ、境界クランプ付きのなめらかなパンで動かす（PannableBackdrop）。
// 動画素材があり「背景を動かす」がONのときはループ動画、それ以外は静止画を敷く。
function TownBackground({
  art,
  video,
  onTap,
}: {
  art: ImageSourcePropType;
  /** ループ動画（無ければ静止画のみ） */
  video: TownVideo | undefined;
  /** 背景のタップ（鑑賞モードからの復帰に使う） */
  onTap?: () => void;
}) {
  // 動画は実寸を取得できないため登録値を使う。静止画は素材から実寸を取る
  const resolved = RNImage.resolveAssetSource(art);
  const intrinsicWidth = video?.width ?? resolved.width;
  const intrinsicHeight = video?.height ?? resolved.height;

  return (
    <PannableBackdrop
      intrinsicWidth={intrinsicWidth}
      intrinsicHeight={intrinsicHeight}
      onTap={onTap}
    >
      {video ? (
        <TownVideoBackdrop video={video} poster={art} />
      ) : (
        <Image
          source={art}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
        />
      )}
    </PannableBackdrop>
  );
}

// 開発用の操作パネル。__DEV__ 限定（本番には表示しない）。
// 詳細は docs/開発用テストボタン.md を参照。
function DevPanel({
  townLevel,
  onCycleLevel,
  onClearStudyDay,
  onSeedCalendar,
  habitStep,
  onToggleHabitStep,
  devHour,
  onCycleDevHour,
}: {
  townLevel: number;
  onCycleLevel: () => void;
  onClearStudyDay: () => void;
  onSeedCalendar: () => void;
  habitStep: number;
  onToggleHabitStep: () => void;
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
      {/* レベルを 1→2→3→4→5→1 と循環（背景アート・Lv表示に反映。実績値も辻褄を合わせる） */}
      <Pressable onPress={onCycleLevel} style={styles.devButton}>
        <ThemedText type="small" style={styles.devButtonText}>
          レベル: Lv{townLevel}
        </ThemedText>
      </Pressable>
      {/* 時刻の上書き: 実時間 → 21:00（夜間帯内）→ 12:00（夜間帯外）を順に切り替える */}
      <Pressable onPress={onCycleDevHour} style={styles.devButton}>
        <ThemedText type="small" style={styles.devButtonText}>
          時刻: {devHourLabel(devHour)}
        </ThemedText>
      </Pressable>
      {/* 今夜の学習記録を消す。目標達成・休憩提案の確認をやり直すため */}
      <Pressable onPress={onClearStudyDay} style={styles.devButton}>
        <ThemedText type="small" style={styles.devButtonText}>
          今夜の学習時間を初期化
        </ThemedText>
      </Pressable>
      {/* カレンダー確認用のダミー記録（過去数日＋4〜6月の傾向違い＋アルバムの段階比較）をまとめて入れる */}
      <Pressable onPress={onSeedCalendar} style={styles.devButton}>
        <ThemedText type="small" style={styles.devButtonText}>
          カレンダー用のダミー記録を入れる
        </ThemedText>
      </Pressable>
      {/* 習慣型のレベルアップ閾値: 本番=5回/Lv ⇄ テスト=1回/Lv */}
      <Pressable onPress={onToggleHabitStep} style={styles.devButton}>
        <ThemedText type="small" style={styles.devButtonText}>
          レベルアップ:{" "}
          {habitStep === 1 ? "1回/Lv(テスト)" : `${habitStep}回/Lv(本番)`}
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
      {/* 10秒後に鳴るテスト通知。押したらアプリを閉じる・画面を消して届くか見る。
          届かなければOS側（許可・集中モード・通知の要約）の問題と切り分けられる */}
      <Pressable
        onPress={() => void scheduleTestNotification(DEV_TEST_NOTICE_SECONDS)}
        style={styles.devButton}
      >
        <ThemedText type="small" style={styles.devButtonText}>
          テスト通知（{DEV_TEST_NOTICE_SECONDS}秒後）
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
    // 学習仲間の1行は丸アイコンより横に長い。中央揃えのままだとその幅に引きずられて
    // アイコンが左へずれてしまうため、右端に揃えて位置を固定する
    alignItems: "flex-end",
  },
  immersiveButton: {
    left: Spacing.four,
    bottom: Spacing.six,
  },
  miniPlayer: {
    right: Spacing.four,
    bottom: Spacing.six,
  },
  // 3つの塊（今夜の様子／今夜の学習／街の育ち）は、塊どうしを広めに空けて
  // 区切りを作る。塊の中は詰めることで、線を引かずにまとまりを見せる
  topLeft: {
    gap: Spacing.three,
  },
  infoBlock: {
    gap: 2,
  },
  // 天気と学習仲間は「今夜の様子」としてひと続きに読ませる
  tonightRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  // レベルの灯りと積み上がりの並びは LevelBadge が持つ（真下に揃える必要があるため）
  growthBlock: {
    alignSelf: "flex-start",
  },
  // 最小表示の置き時計と同じ書式で、一段控えめに（罫線なし・時刻も小さい）
  dateText: {
    color: "rgba(255,255,255,0.88)",
    fontSize: 11,
    fontWeight: "500",
    letterSpacing: 2,
    fontFamily: Fonts.serif,
    textShadowColor: "rgba(0,0,0,0.6)",
    textShadowRadius: 4,
  },
  clockRow: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: Spacing.two,
  },
  // 日時から半行ぶん下げる（infoBlock の gap 2pt に上乗せする）
  weatherRow: {
    marginTop: Spacing.two,
  },
  timeText: {
    color: "rgba(255,255,255,0.95)",
    fontSize: 22,
    fontWeight: "300",
    letterSpacing: 2,
    fontFamily: Fonts.serif,
    textShadowColor: "rgba(0,0,0,0.6)",
    textShadowRadius: 5,
  },
  weekdayText: {
    color: ClockAccent,
    fontSize: 11,
    fontWeight: "500",
    letterSpacing: 2,
    fontFamily: Fonts.serif,
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
  // おやすみボタンの下に置く今夜の学習仲間（要件11）。丸アイコンより控えめに。
  // アイコンの並び（gap）よりもう一段空けて、ボタン群と地続きに見えないようにする
  onlineText: {
    marginTop: Spacing.three,
    color: "rgba(255,255,255,0.9)",
    fontSize: 12,
    fontWeight: "500",
    letterSpacing: 0.5,
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
