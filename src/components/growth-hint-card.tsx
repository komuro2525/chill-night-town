import { useState } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";

import { Spacing } from "@/constants/theme";
import { useSettings } from "@/contexts/SettingsContext";
import { userRepo } from "@/db/repositories";

// 「育て方のお知らせ」カード（要件6.2の周知）。
// 初回ホーム表示で一度だけ案内する。情報提示のみで、その場では切り替えない
// （切替UI本体は設定画面 10.6 / Phase 6）。
// 閉じたら user.growth_hint_dismissed = 1 を永続化し、二度と表示しない。
export function GrowthHintCard() {
  const { ready, user, reload } = useSettings();
  // 閉じた瞬間にDB更新の完了を待たず消すためのローカル状態
  const [closed, setClosed] = useState(false);

  const visible =
    ready && user !== null && user.growth_hint_dismissed === 0 && !closed;

  async function handleDismiss() {
    setClosed(true);
    try {
      await userRepo.markGrowthHintDismissed();
      await reload();
    } catch (e) {
      // 失敗しても次回また案内されるだけなので、ユーザーを妨げない
      console.error("育て方のお知らせの表示済み記録に失敗しました", e);
    }
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={handleDismiss}
    >
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Text style={styles.title}>この街の育て方</Text>

          <Text style={styles.body}>
            いまは
            <Text style={styles.emphasis}>毎日コツコツ</Text>
            の育て方になっています。一日の目標時間を達成した夜に、街の灯りがひとつ増えていきます。
          </Text>
          <Text style={styles.body}>
            「試験までに30時間」のように、
            <Text style={styles.emphasis}>目標に向かって育てる</Text>
            方法もあります。
          </Text>
          <Text style={styles.note}>
            どちらもあとから設定でいつでも変えられます。いまは、そのままで大丈夫です。
          </Text>

          <Pressable
            onPress={handleDismiss}
            style={({ pressed }) => [styles.button, pressed && styles.pressed]}
            accessibilityLabel="お知らせを閉じる"
          >
            <Text style={styles.buttonText}>わかった</Text>
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
    gap: Spacing.three,
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
  emphasis: {
    color: "rgba(255,206,138,0.95)",
    fontWeight: "600",
  },
  note: {
    color: "rgba(255,255,255,0.55)",
    fontSize: 13,
    lineHeight: 20,
  },
  button: {
    marginTop: Spacing.one,
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
