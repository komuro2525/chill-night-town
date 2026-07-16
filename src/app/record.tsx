import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";

// S6 学習成果記録画面（Phase 3 で実装）。
// 終了演出後・中断復元後に遷移。離脱時は自動保存する（UC 3.4）。縦固定・モーダル表示。
export default function RecordScreen() {
  return (
    <ThemedView
      style={{ flex: 1, alignItems: "center", justifyContent: "center" }}
    >
      <ThemedText>学習成果記録画面（Phase 3 で実装）</ThemedText>
    </ThemedView>
  );
}
