import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";

// S1 初期設定画面（Phase 1 で実装）。
// ニックネーム・目標時間・街選択・通知設定の入力とユーザー作成（UC 1.2）。
export default function SetupScreen() {
  return (
    <ThemedView
      style={{ flex: 1, alignItems: "center", justifyContent: "center" }}
    >
      <ThemedText>初期設定画面（Phase 1 で実装）</ThemedText>
    </ThemedView>
  );
}
