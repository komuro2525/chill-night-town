import { useRouter } from "expo-router";
import { Pressable, StyleSheet, View } from "react-native";

import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { Spacing } from "@/constants/theme";
import { useSettings } from "@/contexts/SettingsContext";
import { maintenanceRepo } from "@/db/repositories";

// S2 ホーム画面（夜の街）。Phase 0/1 では土台のみ。
// Phase 2 以降で街表示・学習状況・NPC・BGMミニプレイヤー等を実装し、
// S3〜S5・S11・鑑賞モードを本画面内のオーバーレイとして重ねる。
export default function HomeScreen() {
  return (
    <ThemedView style={styles.container}>
      <DevResetButton />
    </ThemedView>
  );
}

// 開発用: データを初期化して初期設定画面へ戻す。__DEV__ 限定（本番には表示しない）。
// 正式なデータ初期化（10.10）は Phase 6 で設定画面に実装する。
function DevResetButton() {
  const router = useRouter();
  const { reload } = useSettings();

  if (!__DEV__) return null;

  async function handleReset() {
    try {
      await maintenanceRepo.resetUserData();
      await reload();
      router.replace("/setup");
    } catch (e) {
      console.error("開発用リセットに失敗しました", e);
    }
  }

  return (
    <View style={styles.devArea}>
      <Pressable onPress={handleReset} style={styles.devButton}>
        <ThemedText type="small">開発用: データ初期化して初期設定へ</ThemedText>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  devArea: {
    position: "absolute",
    bottom: Spacing.six,
    left: 0,
    right: 0,
    alignItems: "center",
  },
  devButton: {
    borderWidth: 1,
    borderColor: "#888",
    borderRadius: 8,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
  },
});
