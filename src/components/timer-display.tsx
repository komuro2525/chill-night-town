import { Ionicons } from "@expo/vector-icons";
import {
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Spacing } from "@/constants/theme";
import type { ActiveSession, NightWeather } from "@/db/types";
import { useAppNow } from "@/lib/clock";
import {
  getActualStudySeconds,
  getElapsedSeconds,
  getPlannedEndMs,
  getPomodoroPhase,
} from "@/lib/timer";
import { WeatherRow } from "./weather-row";

// S4 学習タイマー表示（要件3.2 / UC 3.2）。
//
// ホーム画面（夜の街）の上に重なるオーバーレイ。学習中もユーザーは街に留まる。
// 経過時間は保持せず、現在時刻と active_session から都度算出する（時刻差分方式）。
//
// 「×」で折りたたむとホームへ戻るが、計測は続く（ホームのインジケータで表示する）。
// 学習を「中止」して記録を残さない機能は用意しない。終了は必ず■を経由する（要件3.2）。

const CIRCLE_MAX = 320;
const CONTROL_SIZE = 56;

/** 時刻を HH:MM にする（終わりの目安の表示用） */
function formatClockTime(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** 秒を HH:MM:SS にする */
export function formatDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(Math.floor(s / 3600))}:${p(Math.floor((s % 3600) / 60))}:${p(s % 60)}`;
}

export function TimerDisplay({
  session,
  weather,
  dateTimeLabel,
  onPause,
  onResume,
  onFinish,
  onCollapse,
}: {
  session: ActiveSession;
  weather: NightWeather | null;
  dateTimeLabel: string;
  onPause: () => void;
  onResume: () => void;
  onFinish: () => void;
  /** ×: 折りたたんでホームへ戻る（計測は継続する） */
  onCollapse: () => void;
}) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const circle = Math.min(CIRCLE_MAX, width - Spacing.four * 2);
  const now = useAppNow(1000);

  const isPaused = session.pause_started_at !== null;
  const elapsed = getElapsedSeconds(session, now.getTime());
  // 表示する時間は「実績学習時間」。ポモドーロの休憩フェーズは含めない（要件0章）
  const actual = getActualStudySeconds(session, now.getTime());
  const phase =
    session.timer_mode === "pomodoro"
      ? getPomodoroPhase(session, elapsed)
      : null;
  // 終わりの位置（ホーム画面の時計の赤い針と同じ時刻）。
  // 計測中はタイマー表示が画面を覆い時計が見えないため、ここにも置く。
  // カウントダウンにはしない（減っていく数字で急かさないため）
  const plannedEnd = new Date(getPlannedEndMs(session, now.getTime()));

  return (
    <View style={styles.overlay}>
      <View style={styles.scrim} pointerEvents="none" />

      <View style={[styles.content, { paddingTop: insets.top + Spacing.three }]}>
        <View style={styles.header}>
          <Text style={styles.title}>今夜の学習</Text>
          <Pressable
            onPress={onCollapse}
            hitSlop={10}
            accessibilityLabel="タイマーを閉じる（計測は続きます）"
            style={({ pressed }) => pressed && styles.pressed}
          >
            <Ionicons name="close-circle" size={38} color="rgba(255,255,255,0.85)" />
          </Pressable>
        </View>
        <View style={styles.divider} />
        <Text style={styles.dateTime}>{dateTimeLabel}</Text>

        {/* 設定モーダルのモード切替と同じ位置・同じ高さに、現在のモードを置く。
            円の位置を設定画面と揃えるためでもある */}
        <View style={styles.modeArea}>
          <View style={styles.modePill}>
            <Text style={styles.modeText}>
              {session.timer_mode === "simple" ? "黙々モード" : "ポモドーロモード"}
            </Text>
          </View>
        </View>

        <View style={styles.weather}>
          {/* 計測中は天気を表示のみ（変更はホーム・成果記録から） */}
          <WeatherRow weather={weather} onPress={() => {}} />
        </View>

        <View
          style={[
            styles.circle,
            { width: circle, height: circle, borderRadius: circle / 2 },
          ]}
        >
          <View style={styles.circleInner}>
            {phase ? (
              <>
                <Text style={styles.loop}>
                  {phase.loop}/{session.pomodoro_loop_count}
                </Text>
                <Text style={styles.phase}>
                  {phase.kind === "work" ? "作業中" : "休憩中"}
                </Text>
              </>
            ) : (
              <Text style={styles.phase}>{isPaused ? "一時停止中" : "学習中"}</Text>
            )}

            <Text style={styles.time}>{formatDuration(actual)}</Text>

            <Text style={styles.plannedEnd}>
              {formatClockTime(plannedEnd)} ごろに終わる予定
            </Text>

            {isPaused && phase ? (
              <Text style={styles.pausedNote}>一時停止中</Text>
            ) : null}
          </View>

          {/* 操作: 終了 / 一時停止・再開。位置は設定モーダルの開始ボタンと揃える */}
          <View style={[styles.controls, { bottom: circle * 0.07 }]}>
            <ControlButton
              name="stop"
              label="学習を終える"
              onPress={onFinish}
            />
            <ControlButton
              name={isPaused ? "play" : "pause"}
              label={isPaused ? "再開する" : "一時停止する"}
              onPress={isPaused ? onResume : onPause}
            />
          </View>
        </View>

        <Text style={styles.note}>
          ×で街に戻れます。計測は続きます
        </Text>
      </View>
    </View>
  );
}

function ControlButton({
  name,
  label,
  onPress,
}: {
  name: React.ComponentProps<typeof Ionicons>["name"];
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityLabel={label}
      style={({ pressed }) => [styles.control, pressed && styles.pressed]}
    >
      <Ionicons name={name} size={26} color="rgba(255,255,255,0.95)" />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  overlay: { ...StyleSheet.absoluteFillObject },
  scrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(3,6,15,0.72)",
  },
  content: {
    flex: 1,
    paddingHorizontal: Spacing.four,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  title: {
    color: "rgba(255,255,255,0.95)",
    fontSize: 24,
    fontWeight: "600",
  },
  divider: {
    height: 1,
    backgroundColor: "rgba(255,255,255,0.2)",
    marginTop: Spacing.two,
  },
  dateTime: {
    color: "rgba(255,255,255,0.8)",
    fontSize: 13,
    fontWeight: "500",
    marginTop: Spacing.two,
  },
  // 設定モーダルの segment と同じ寸法にする（円の位置を揃えるため）
  modeArea: {
    flexDirection: "row",
    alignSelf: "center",
    marginTop: Spacing.four,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.08)",
    padding: 3,
  },
  modePill: {
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.four,
    borderRadius: 999,
    backgroundColor: "rgba(18,26,46,0.9)",
    borderWidth: 1,
    borderColor: "rgba(255,206,138,0.95)",
  },
  modeText: {
    color: "rgba(255,206,138,0.95)",
    fontSize: 13,
    fontWeight: "600",
  },
  weather: {
    alignSelf: "center",
    marginTop: Spacing.three,
  },
  circle: {
    alignSelf: "center",
    marginTop: Spacing.three,
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.28)",
    backgroundColor: "rgba(18,26,46,0.75)",
    alignItems: "center",
    justifyContent: "center",
  },
  circleInner: {
    alignItems: "center",
    gap: Spacing.one,
    marginBottom: CONTROL_SIZE + Spacing.five,
  },
  loop: {
    color: "rgba(255,255,255,0.7)",
    fontSize: 16,
  },
  phase: {
    color: "rgba(255,255,255,0.9)",
    fontSize: 20,
    fontWeight: "500",
  },
  time: {
    color: "#ffffff",
    fontSize: 46,
    fontWeight: "300",
    fontVariant: ["tabular-nums"],
    marginTop: Spacing.one,
  },
  plannedEnd: {
    color: "rgba(255,255,255,0.5)",
    fontSize: 12,
    marginTop: Spacing.one,
  },
  pausedNote: {
    color: "rgba(255,255,255,0.55)",
    fontSize: 12,
  },
  controls: {
    position: "absolute",
    flexDirection: "row",
    gap: Spacing.four,
  },
  control: {
    width: CONTROL_SIZE,
    height: CONTROL_SIZE,
    borderRadius: CONTROL_SIZE / 2,
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.95)",
    backgroundColor: "rgba(18,26,46,0.4)",
    alignItems: "center",
    justifyContent: "center",
  },
  pressed: {
    opacity: 0.6,
  },
  note: {
    color: "rgba(255,255,255,0.45)",
    fontSize: 11,
    textAlign: "center",
    marginTop: "auto",
    marginBottom: Spacing.six,
  },
});
