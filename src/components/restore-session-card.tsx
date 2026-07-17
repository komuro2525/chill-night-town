import { Modal, Pressable, StyleSheet, Text, View } from "react-native";

import { Spacing } from "@/constants/theme";
import { formatMinutes } from "@/lib/study-day";

// 中断セッションの復元（要件3.2「中断からの復元」/ UC 1.1）。
//
// アプリの強制終了・クラッシュ・端末再起動などで終了処理を経ずに中断された場合、
// 次回起動時に保存済みの時刻情報からセッションを復元し、終了処理へ誘導する。
//
// 計測は時刻差分方式のため、中断中も「時間は流れていた」ことになる。
// ここでは経過を勝手に捨てず、実績をユーザーへ提示したうえで記録に進む。
// 5:00を過ぎていれば5:00終了として扱う（判定は呼び出し側が timer.ts で行う）。

export function RestoreSessionCard({
  visible,
  minutes,
  onFinish,
}: {
  visible: boolean;
  /** 復元した実績学習時間（分） */
  minutes: number;
  /** 記録して閉じる */
  onFinish: () => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Text style={styles.title}>前回の学習が終わっていません</Text>
          <Text style={styles.body}>
            {formatMinutes(minutes)}の学習を記録します。
          </Text>
          <Text style={styles.note}>
            アプリが閉じられていた間も、時間はそのまま数えています。
          </Text>

          <Pressable
            onPress={onFinish}
            style={({ pressed }) => [styles.button, pressed && styles.pressed]}
            accessibilityLabel="記録する"
          >
            <Text style={styles.buttonText}>記録する</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(3,6,15,0.75)",
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
    gap: Spacing.two,
  },
  title: {
    color: "rgba(255,255,255,0.95)",
    fontSize: 17,
    fontWeight: "600",
  },
  body: {
    color: "rgba(255,255,255,0.8)",
    fontSize: 14,
    lineHeight: 22,
  },
  note: {
    color: "rgba(255,255,255,0.5)",
    fontSize: 12,
    lineHeight: 18,
  },
  button: {
    marginTop: Spacing.three,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.5)",
    backgroundColor: "rgba(255,255,255,0.08)",
    paddingVertical: Spacing.three,
    alignItems: "center",
  },
  pressed: {
    opacity: 0.6,
  },
  buttonText: {
    color: "rgba(255,255,255,0.95)",
    fontSize: 15,
    fontWeight: "500",
  },
});
