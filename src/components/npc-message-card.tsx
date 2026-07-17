import { Modal, Pressable, StyleSheet, Text, View } from "react-native";

import { Spacing } from "@/constants/theme";

// NPCメッセージの表示（要件7.1）。
//
// 学習記録を保存した後に、選ばれた感情に応じた一言をかける。
// 目標に届いた夜でも手応えが無いことがあり、その食い違いを受け止める言葉が要る、
// というのが感情ごとに出し分ける理由（要件7.1）。
//
// タップで閉じるだけの、静かなカードにしている。
// TODO(Phase 4): NPCの立ち絵を添える（素材制作後）。

export function NpcMessageCard({
  message,
  onClose,
}: {
  /** 表示するメッセージ。null なら出さない */
  message: string | null;
  onClose: () => void;
}) {
  return (
    <Modal
      visible={message !== null}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable style={styles.backdrop} onPress={onClose}>
        <View style={styles.card}>
          <Text style={styles.message}>{message}</Text>
        </View>
        <Text style={styles.hint}>画面をタップして閉じる</Text>
      </Pressable>
    </Modal>
  );
}

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
    borderColor: "rgba(255,206,138,0.35)",
    backgroundColor: "rgba(18,26,46,0.98)",
    paddingVertical: Spacing.five,
    paddingHorizontal: Spacing.four,
  },
  message: {
    color: "rgba(255,255,255,0.92)",
    fontSize: 15,
    lineHeight: 26,
    textAlign: "center",
  },
  hint: {
    color: "rgba(255,255,255,0.35)",
    fontSize: 11,
    marginTop: Spacing.four,
  },
});
