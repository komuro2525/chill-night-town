import { Ionicons } from "@expo/vector-icons";
import { useEffect, useState } from "react";
import {
  Keyboard,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { POMODORO, SIMPLE_PLANNED_MINUTES, STUDY_DAY } from "@/constants/domain";
import { LightColor, Spacing } from "@/constants/theme";
import type { NightWeather, TimerMode } from "@/db/types";
import { formatStudyDateLabel } from "@/lib/study-day";
import {
  validatePlannedMinutes,
  validatePomodoroBreakMinutes,
  validatePomodoroLoopCount,
  validatePomodoroWorkMinutes,
} from "@/lib/validation";
import { WeatherPicker } from "./weather-picker";
import { WeatherRow } from "./weather-row";

// S3 タイマー設定モーダル（要件3.1 / UC 3.1）。
//
// 独立した画面ではなく、ホーム画面（夜の街）の上に重ねる表示とする（要件3章）。
// 背景の街はそのまま透けて見え、スワイプで動かしていた位置も保たれる。
//
// 設定値の記憶と天気の確定は、扱いが違う（要件3.1 備考）:
//   ・タイマーモード・時間の値は**入力を終えた時点**で記憶する（開始しなくても引き継ぐ）。
//     設定を見直しただけで閉じた場合にも覚えていてほしいため。値域外は記憶しない
//   ・天気は**開始を押すまで確定しない**。背景演出・環境音へ反映され、1晩＝1天気として
//     記録に残る確定行為のため。閉じた場合は変更を破棄し、ホーム画面で選択済みだった天気が残る

const CIRCLE_MAX = 320;
const START_BUTTON_SIZE = 76;

export type TimerSetupValues = {
  mode: TimerMode;
  /** 黙々モードのみ */
  plannedMinutes: number | null;
  /** 以下3つはポモドーロモードのみ */
  workMinutes: number | null;
  breakMinutes: number | null;
  loopCount: number | null;
  /** 確定する今夜の天気 */
  weather: NightWeather;
};

export function TimerSetupModal({
  studyDate,
  dateTimeLabel,
  initialMode,
  initialPlanned,
  initialWork,
  initialBreak,
  initialLoop,
  initialWeather,
  onStart,
  onRememberSettings,
  onClose,
}: {
  studyDate: string;
  /** ホームと同じ日時表記（例: 2026/01/10(土) 21:00 PM） */
  dateTimeLabel: string;
  /** 前回の設定（要件3.1: 記憶して次回は前回値を入れた状態で表示する） */
  initialMode: TimerMode;
  initialPlanned: number;
  initialWork: number;
  initialBreak: number;
  initialLoop: number;
  /** その学習日に選択済みの天気（未選択は null） */
  initialWeather: NightWeather | null;
  onStart: (values: TimerSetupValues) => void;
  /** 設定値を次回のために記憶する。入力を終えた時点で呼ぶ（値域外では呼ばない） */
  onRememberSettings: (prefs: {
    mode: TimerMode;
    plannedMinutes?: number;
    workMinutes?: number;
    breakMinutes?: number;
    loopCount?: number;
  }) => void;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const circle = Math.min(CIRCLE_MAX, width - Spacing.four * 2);

  const [mode, setMode] = useState<TimerMode>(initialMode);
  const [planned, setPlanned] = useState(String(initialPlanned));
  const [work, setWork] = useState(String(initialWork));
  const [brk, setBrk] = useState(String(initialBreak));
  const [loop, setLoop] = useState(initialLoop);
  // 天気はモーダル内の下書き。開始を押すまで確定しない
  const [weather, setWeather] = useState<NightWeather | null>(initialWeather);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 天気を選び直したらエラー表示を消す（責める表示を残さない）
  useEffect(() => {
    if (weather) setError(null);
  }, [weather]);

  // 入力を終えた時点で、その値を次回のために記憶する（要件3.1）。
  // 値域外は記憶しない（次回に開始できない値が入った状態で開くのを避けるため）。
  // 1文字ごとではなく入力の終了時に呼ぶことで、書き込みを1回にまとめている
  function rememberSimple(value: string) {
    if (validatePlannedMinutes(value)) return;
    onRememberSettings({ mode: "simple", plannedMinutes: Number(value) });
  }

  function rememberPomodoro(next: { work?: string; brk?: string; loop?: number }) {
    const w = next.work ?? work;
    const b = next.brk ?? brk;
    const l = next.loop ?? loop;
    if (
      validatePomodoroWorkMinutes(w) ??
      validatePomodoroBreakMinutes(b) ??
      validatePomodoroLoopCount(String(l))
    ) {
      return;
    }
    onRememberSettings({
      mode: "pomodoro",
      workMinutes: Number(w),
      breakMinutes: Number(b),
      loopCount: l,
    });
  }

  function handleStart() {
    // 天気はその学習日で未選択なら必須（要件3.1）。
    // 「選んでください」と告げるだけでは選択欄を開き直す手間が増えるため、
    // その場で選択欄を出す（責めるより、次にすべきことを示す）
    if (!weather) {
      setPickerOpen(true);
      return;
    }

    if (mode === "simple") {
      const e = validatePlannedMinutes(planned);
      if (e) return setError(e);
      onStart({
        mode,
        plannedMinutes: Number(planned),
        workMinutes: null,
        breakMinutes: null,
        loopCount: null,
        weather,
      });
      return;
    }

    const e =
      validatePomodoroWorkMinutes(work) ??
      validatePomodoroBreakMinutes(brk) ??
      validatePomodoroLoopCount(String(loop));
    if (e) return setError(e);
    onStart({
      mode,
      plannedMinutes: null,
      workMinutes: Number(work),
      breakMinutes: Number(brk),
      loopCount: loop,
      weather,
    });
  }

  return (
    <View style={styles.overlay}>
      {/* 街を隠しきらず、うっすら透かす（学習中も夜の街に留まる。要件3章） */}
      <View style={styles.scrim} pointerEvents="none" />

      {/* 入力欄の外をタップしたら入力を終了する（要件3.1 備考）。
          Pressable は子のタップを妨げないため、ボタン類はそのまま押せる */}
      <Pressable
        style={[styles.content, { paddingTop: insets.top + Spacing.three }]}
        onPress={Keyboard.dismiss}
        accessible={false}
      >
        {/* ヘッダー: タイトル＋閉じる */}
        <View style={styles.header}>
          <Text style={styles.title}>今夜の学習</Text>
          <Pressable
            onPress={onClose}
            hitSlop={10}
            accessibilityLabel="閉じる"
            style={({ pressed }) => pressed && styles.pressed}
          >
            <Ionicons name="close-circle" size={38} color="rgba(255,255,255,0.85)" />
          </Pressable>
        </View>
        <View style={styles.divider} />
        <Text style={styles.dateTime}>{dateTimeLabel}</Text>

        {/* モード切替（前回のモードを選択済みで表示する） */}
        <View style={styles.segment}>
          <SegmentButton
            label="黙々モード"
            active={mode === "simple"}
            onPress={() => {
              Keyboard.dismiss();
              setMode("simple");
              setError(null);
              rememberSimple(planned);
            }}
          />
          <SegmentButton
            label="ポモドーロモード"
            active={mode === "pomodoro"}
            onPress={() => {
              Keyboard.dismiss();
              setMode("pomodoro");
              setError(null);
              rememberPomodoro({});
            }}
          />
        </View>

        {/* 今夜の天気（ホーム画面の天気の行と同じ部品） */}
        <View style={styles.weather}>
          <WeatherRow weather={weather} onPress={() => setPickerOpen(true)} />
        </View>

        {/* 設定の円 */}
        <View
          style={[
            styles.circle,
            { width: circle, height: circle, borderRadius: circle / 2 },
          ]}
        >
          {mode === "simple" ? (
            <View style={[styles.circleInner, styles.circleInnerSimple]}>
              <Text style={styles.fieldLabel}>予定学習時間（分）</Text>
              <MinutesInput
                value={planned}
                onChangeText={setPlanned}
                onEndEditing={() => rememberSimple(planned)}
                wide
              />
              <Text style={styles.hint}>
                {SIMPLE_PLANNED_MINUTES.MIN}〜{SIMPLE_PLANNED_MINUTES.MAX}分
              </Text>
            </View>
          ) : (
            <View style={styles.circleInner}>
              <Text style={styles.fieldLabel}>繰り返し</Text>
              <Stepper
                value={loop}
                min={POMODORO.LOOP_COUNT.MIN}
                max={POMODORO.LOOP_COUNT.MAX}
                onChange={(v) => {
                  Keyboard.dismiss();
                  setLoop(v);
                  setError(null);
                  // 入力欄ではないので、押した瞬間に記憶する
                  rememberPomodoro({ loop: v });
                }}
              />
              <View style={styles.pomodoroRow}>
                <View style={styles.pomodoroField}>
                  <Text style={styles.fieldLabel}>作業</Text>
                  <MinutesInput
                    value={work}
                    onChangeText={setWork}
                    onEndEditing={() => rememberPomodoro({ work })}
                  />
                </View>
                <View style={styles.pomodoroField}>
                  <Text style={styles.fieldLabel}>休憩</Text>
                  <MinutesInput
                    value={brk}
                    onChangeText={setBrk}
                    onEndEditing={() => rememberPomodoro({ brk })}
                  />
                </View>
              </View>
            </View>
          )}

          {/* 開始。モードによらず同じ位置に置くため、円の下端へ絶対配置する */}
          <Pressable
            onPress={handleStart}
            accessibilityLabel="学習を開始する"
            style={({ pressed }) => [
              styles.startButton,
              { bottom: circle * 0.07 },
              pressed && styles.pressed,
            ]}
          >
            <Ionicons name="play" size={34} color="rgba(255,255,255,0.95)" />
          </Pressable>
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        {/* 5:00自動終了の明示（要件3.2: 開始時に画面上で明示する） */}
        <Text style={styles.note}>
          {STUDY_DAY.END_HOUR}:00 になると、夜は静かに眠ります
        </Text>
      </Pressable>

      <WeatherPicker
        visible={pickerOpen}
        selectedId={weather?.id ?? null}
        studyDateLabel={formatStudyDateLabel(studyDate)}
        onSelect={(w) => {
          setWeather(w);
          setPickerOpen(false);
        }}
        onClose={() => setPickerOpen(false)}
      />
    </View>
  );
}

function SegmentButton({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityLabel={label}
      accessibilityState={{ selected: active }}
      style={[styles.segmentButton, active && styles.segmentButtonActive]}
    >
      <Text style={[styles.segmentText, active && styles.segmentTextActive]}>
        {label}
      </Text>
    </Pressable>
  );
}

/** 分の入力欄（数字のみ） */
function MinutesInput({
  value,
  onChangeText,
  onEndEditing,
  wide = false,
}: {
  value: string;
  onChangeText: (v: string) => void;
  /** 入力を終えた時点（キーボードを閉じた・他をタップした）で呼ばれる */
  onEndEditing?: () => void;
  wide?: boolean;
}) {
  return (
    <TextInput
      value={value}
      onChangeText={(t) => onChangeText(t.replace(/[^\d]/g, ""))}
      onEndEditing={onEndEditing}
      onBlur={onEndEditing}
      keyboardType="number-pad"
      maxLength={3}
      style={[styles.input, wide && styles.inputWide]}
      selectionColor="rgba(255,206,138,0.95)"
    />
  );
}

/** 繰り返し回数の増減（値域外へは進めない） */
function Stepper({
  value,
  min,
  max,
  onChange,
}: {
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
}) {
  return (
    <View style={styles.stepper}>
      <StepperButton
        name="chevron-back"
        disabled={value <= min}
        onPress={() => onChange(Math.max(min, value - 1))}
        label="繰り返し回数を減らす"
      />
      <View style={styles.stepperValue}>
        <Text style={styles.stepperText}>{value}</Text>
      </View>
      <StepperButton
        name="chevron-forward"
        disabled={value >= max}
        onPress={() => onChange(Math.min(max, value + 1))}
        label="繰り返し回数を増やす"
      />
    </View>
  );
}

function StepperButton({
  name,
  disabled,
  onPress,
  label,
}: {
  name: "chevron-back" | "chevron-forward";
  disabled: boolean;
  onPress: () => void;
  label: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      hitSlop={6}
      accessibilityLabel={label}
      style={({ pressed }) => [
        styles.stepperButton,
        disabled && styles.stepperButtonDisabled,
        pressed && styles.pressed,
      ]}
    >
      <Ionicons name={name} size={20} color="rgba(255,255,255,0.95)" />
    </Pressable>
  );
}


const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
  },
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
  segment: {
    flexDirection: "row",
    alignSelf: "center",
    marginTop: Spacing.four,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.08)",
    padding: 3,
  },
  segmentButton: {
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.four,
    borderRadius: 999,
  },
  segmentButtonActive: {
    backgroundColor: "rgba(18,26,46,0.9)",
    borderWidth: 1,
    borderColor: LightColor,
  },
  segmentText: {
    color: "rgba(255,255,255,0.6)",
    fontSize: 13,
  },
  segmentTextActive: {
    color: LightColor,
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
    gap: Spacing.two,
    // 下端の開始ボタンと重ならないよう、内容を上へ寄せる
    marginBottom: START_BUTTON_SIZE + Spacing.five,
  },
  // 黙々モードは項目が少なく上に寄って見えるため、1行ぶん下げて円の中心へ寄せる
  circleInnerSimple: {
    marginTop: Spacing.four,
  },
  fieldLabel: {
    color: "rgba(255,255,255,0.7)",
    fontSize: 12,
  },
  input: {
    minWidth: 84,
    textAlign: "center",
    color: "#ffffff",
    fontSize: 30,
    fontWeight: "600",
    paddingVertical: Spacing.one,
    borderRadius: 10,
    backgroundColor: "rgba(255,255,255,0.1)",
  },
  inputWide: {
    minWidth: 130,
    fontSize: 38,
  },
  hint: {
    color: "rgba(255,255,255,0.45)",
    fontSize: 11,
  },
  pomodoroRow: {
    flexDirection: "row",
    gap: Spacing.five,
    marginTop: Spacing.two,
  },
  pomodoroField: {
    alignItems: "center",
    gap: Spacing.one,
  },
  stepper: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.three,
  },
  stepperButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.5)",
    alignItems: "center",
    justifyContent: "center",
  },
  stepperButtonDisabled: {
    opacity: 0.3,
  },
  stepperValue: {
    minWidth: 60,
    paddingVertical: Spacing.one,
    borderRadius: 10,
    backgroundColor: "rgba(255,255,255,0.1)",
    alignItems: "center",
  },
  stepperText: {
    color: "#ffffff",
    fontSize: 24,
    fontWeight: "600",
  },
  startButton: {
    position: "absolute",
    width: START_BUTTON_SIZE,
    height: START_BUTTON_SIZE,
    borderRadius: START_BUTTON_SIZE / 2,
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.95)",
    backgroundColor: "rgba(18,26,46,0.4)",
    alignItems: "center",
    justifyContent: "center",
    paddingLeft: 4, // ▶ の見た目の重心を中央へ
  },
  pressed: {
    opacity: 0.6,
  },
  error: {
    color: "rgba(255,180,180,0.95)",
    fontSize: 13,
    textAlign: "center",
    marginTop: Spacing.three,
  },
  note: {
    color: "rgba(255,255,255,0.45)",
    fontSize: 11,
    textAlign: "center",
    marginTop: "auto",
    marginBottom: Spacing.six,
  },
});
