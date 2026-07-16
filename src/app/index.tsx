import { ThemedView } from "@/components/themed-view";

// S2 ホーム画面（夜の街）。Phase 0 では土台のみ。
// Phase 2 以降で街表示・学習状況・NPC・BGMミニプレイヤー等を実装し、
// S3〜S5・S11・鑑賞モードを本画面内のオーバーレイとして重ねる。
export default function HomeScreen() {
  return <ThemedView style={{ flex: 1 }} />;
}
