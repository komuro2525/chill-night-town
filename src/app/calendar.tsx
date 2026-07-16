import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";

// S7 カレンダー画面（Phase 5 で実装）。
// 日別記録閲覧・月次サマリー・夜の天気アルバム（要件4章）。
export default function CalendarScreen() {
  return (
    <ThemedView
      style={{ flex: 1, alignItems: "center", justifyContent: "center" }}
    >
      <ThemedText>カレンダー画面（Phase 5 で実装）</ThemedText>
    </ThemedView>
  );
}
