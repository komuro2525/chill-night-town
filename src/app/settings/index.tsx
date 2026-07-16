import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";

// S8 設定画面（Phase 6 で実装）。各種設定の入口（要件10章）。
// タイマー稼働中は判定・記録に影響する項目をグレーアウトする。
export default function SettingsScreen() {
  return (
    <ThemedView
      style={{ flex: 1, alignItems: "center", justifyContent: "center" }}
    >
      <ThemedText>設定画面（Phase 6 で実装）</ThemedText>
    </ThemedView>
  );
}
