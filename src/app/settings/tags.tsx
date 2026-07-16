import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";

// S10 マイタグ管理画面（Phase 6 で実装）。
// マイタグの名称変更・論理削除（要件10.9 / UC 10.7）。
export default function TagsScreen() {
  return (
    <ThemedView
      style={{ flex: 1, alignItems: "center", justifyContent: "center" }}
    >
      <ThemedText>マイタグ管理画面（Phase 6 で実装）</ThemedText>
    </ThemedView>
  );
}
