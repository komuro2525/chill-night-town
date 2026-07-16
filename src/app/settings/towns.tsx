import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";

// S9 街選択画面（Phase 6 で実装）。
// 街の切り替え・サブタイトル編集・プロジェクト型目標設定（要件6.4 / UC 6.3）。
export default function TownsScreen() {
  return (
    <ThemedView
      style={{ flex: 1, alignItems: "center", justifyContent: "center" }}
    >
      <ThemedText>街選択画面（Phase 6 で実装）</ThemedText>
    </ThemedView>
  );
}
