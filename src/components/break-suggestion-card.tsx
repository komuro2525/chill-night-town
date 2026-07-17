import { useState } from "react";
import { Modal, Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import { EXTENSION_MINUTES } from "@/constants/domain";
import { Spacing } from "@/constants/theme";
import { formatMinutes } from "@/lib/study-day";
import { validateExtensionMinutes } from "@/lib/validation";

// S5 休憩提案（要件5.1 / 5.2）。
//
// その学習日の実績合計が一日の目標時間に達したときに、タイマー表示の上へ重ねて出す。
// 「頑張りすぎ防止」の機能であり、止めさせるためではなく**選ばせる**ためのもの。
//
// 選択肢は2段階。目標に届いた瞬間に4つを一度に並べると判断の負荷が高く、
// 静かな体験にそぐわないため、まず「終えるか、続けるか」の大きな問いを1つ示す。
//   1段目: 今夜はここまでにする / まだ続ける
//   2段目: 休憩する / このまま続ける / 時間を決めて続ける
//
// 「今夜はここまでにする」があるのは、目標に届いた瞬間は学習を終える意思が
// 生じやすい場面のため。これが無いと終了はタイマー表示からしか行えない。
//
// TODO(Phase 7): 表示時に控えめな効果音を1回鳴らす（要件5.1）。
//   音源（テスト用）: assets/audio/ambient/test_目標達成.mp3 ※仮。最終的に差し替える
//   分類は「効果音」（要件9）。音量0なら再生しない。フォアグラウンドのみ再生する。
//   鐘は使わない。鐘は終了演出（3.3）の音であり、継続した場合に1晩で2回鳴って
//   意味が混ざるため。ポモドーロのフェーズ切り替わり音（3.1）と同じ考え方。
//
// 文言はコンセプト準拠：責めない・急かさない。
// 「働きすぎです」ではなく「目標に届きました」と事実だけを置く。

export function BreakSuggestionCard({
  visible,
  totalMinutes,
  onFinish,
  onBreak,
  onContinue,
  onExtend,
}: {
  visible: boolean;
  /** その学習日の実績合計（分） */
  totalMinutes: number;
  /** 今夜はここまでにする（終了演出→成果記録へ。タイマー表示の終了操作と同じ） */
  onFinish: () => void;
  /** 休憩する（タイマーを一時停止する。再開はユーザーの操作による） */
  onBreak: () => void;
  /** 学習を継続する（以後、超過60分ごとに再表示） */
  onContinue: () => void;
  /** 延長を宣言する（宣言時間内は再表示しない） */
  onExtend: (minutes: number) => void;
}) {
  // "ask" = 1段目（終えるか続けるか） / "how" = 2段目（続け方） / "extend" = 延長の入力
  // 表示のたびに1段目から始める（前回2段目まで進んでいた状態を持ち越さない）。
  // 呼び出し側が visible の切り替えで作り直す想定
  const [step, setStep] = useState<"ask" | "how" | "extend">("ask");
  const [minutes, setMinutes] = useState("30");
  const [error, setError] = useState<string | null>(null);

  function handleExtend() {
    const e = validateExtensionMinutes(minutes);
    if (e) return setError(e);
    onExtend(Number(minutes));
    setStep("ask");
    setError(null);
  }

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Text style={styles.title}>今夜の目標に届きました</Text>
          <Text style={styles.body}>
            ここまでの学習は{formatMinutes(totalMinutes)}です。
          </Text>
          <Text style={styles.note}>
            続けても、休んでも、どちらでも大丈夫です。
          </Text>

          {step === "extend" ? (
            <View style={styles.extendArea}>
              <Text style={styles.extendLabel}>どれくらい続けますか？</Text>
              <View style={styles.extendRow}>
                <TextInput
                  value={minutes}
                  onChangeText={(v) => {
                    setMinutes(v.replace(/[^\d]/g, ""));
                    setError(null);
                  }}
                  keyboardType="number-pad"
                  maxLength={3}
                  style={styles.input}
                  selectionColor={LIGHT_COLOR}
                />
                <Text style={styles.unit}>分</Text>
              </View>
              <Text style={styles.hint}>
                {EXTENSION_MINUTES.MIN}〜{EXTENSION_MINUTES.MAX}分
              </Text>
              {error ? <Text style={styles.error}>{error}</Text> : null}

              <Button label="この時間で続ける" onPress={handleExtend} primary />
              <Button label="戻る" onPress={() => setStep("how")} />
            </View>
          ) : step === "how" ? (
            <View style={styles.actions}>
              <Text style={styles.stepLabel}>どう続けますか？</Text>
              <Button label="休憩する" onPress={onBreak} />
              <Button label="このまま続ける" onPress={onContinue} />
              <Button label="時間を決めて続ける" onPress={() => setStep("extend")} />
            </View>
          ) : (
            <View style={styles.actions}>
              <Button label="今夜はここまでにする" onPress={onFinish} />
              <Button label="まだ続ける" onPress={() => setStep("how")} />
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}

function Button({
  label,
  onPress,
  primary = false,
}: {
  label: string;
  onPress: () => void;
  primary?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityLabel={label}
      style={({ pressed }) => [
        styles.button,
        primary && styles.buttonPrimary,
        pressed && styles.pressed,
      ]}
    >
      <Text style={[styles.buttonText, primary && styles.buttonTextPrimary]}>
        {label}
      </Text>
    </Pressable>
  );
}

const LIGHT_COLOR = "rgba(255,206,138,0.95)";

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(3,6,15,0.8)",
    alignItems: "center",
    justifyContent: "center",
    padding: Spacing.four,
  },
  card: {
    width: "100%",
    maxWidth: 340,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
    backgroundColor: "rgba(18,26,46,0.98)",
    padding: Spacing.four,
  },
  title: {
    color: LIGHT_COLOR,
    fontSize: 17,
    fontWeight: "600",
  },
  body: {
    color: "rgba(255,255,255,0.85)",
    fontSize: 14,
    lineHeight: 22,
    marginTop: Spacing.two,
  },
  note: {
    color: "rgba(255,255,255,0.5)",
    fontSize: 12,
    lineHeight: 18,
    marginTop: Spacing.one,
  },
  actions: {
    marginTop: Spacing.four,
    gap: Spacing.two,
  },
  extendArea: {
    marginTop: Spacing.four,
    gap: Spacing.two,
  },
  stepLabel: {
    color: "rgba(255,255,255,0.7)",
    fontSize: 13,
    marginBottom: Spacing.one,
  },
  extendLabel: {
    color: "rgba(255,255,255,0.7)",
    fontSize: 13,
  },
  extendRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.two,
  },
  input: {
    width: 90,
    textAlign: "center",
    color: "#ffffff",
    fontSize: 26,
    fontWeight: "600",
    paddingVertical: Spacing.two,
    borderRadius: 10,
    backgroundColor: "rgba(255,255,255,0.1)",
  },
  unit: {
    color: "rgba(255,255,255,0.7)",
    fontSize: 14,
  },
  hint: {
    color: "rgba(255,255,255,0.4)",
    fontSize: 11,
  },
  error: {
    color: "rgba(255,180,180,0.95)",
    fontSize: 12,
  },
  button: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.4)",
    paddingVertical: Spacing.three,
    alignItems: "center",
  },
  buttonPrimary: {
    borderColor: LIGHT_COLOR,
    backgroundColor: "rgba(255,206,138,0.12)",
  },
  buttonText: {
    color: "rgba(255,255,255,0.9)",
    fontSize: 14,
    fontWeight: "500",
  },
  buttonTextPrimary: {
    color: LIGHT_COLOR,
  },
  pressed: { opacity: 0.6 },
});
