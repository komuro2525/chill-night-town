import { ActivityIndicator, ScrollView, StyleSheet, View } from "react-native";

import { FeatureTutorial } from "@/components/feature-tutorial";
import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { LightColor, Spacing } from "@/constants/theme";
import { useSettings } from "@/contexts/SettingsContext";

// 設定: 夜の住人（要件7.1 / 10.12）。
// 住人は街ごとに1人いて、その街を選んでいる間その人の声でメッセージが出る。
// ここは閲覧専用——住人を選ぶ操作は無く、街の切り替え（10.5）が住人の切り替えを兼ねる。
// 他の街の住人は見せない。行ってから出会うほうが、街を移る楽しみが残るため。
// 立ち絵はまだ無いため、紹介文で人物を見せる。

export default function NpcScreen() {
  const { ready, selectedTown, townNpc } = useSettings();

  if (!ready) {
    return (
      <ThemedView style={styles.center}>
        <ActivityIndicator />
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      {/* 初めて「夜の住人」を開いたとき一度だけ、この機能の説明を出す */}
      <FeatureTutorial featureKey="npc" />
      <ScrollView contentContainerStyle={styles.content}>
        <ThemedText type="small" themeColor="textSecondary" style={styles.intro}>
          街にはそれぞれ、夜ごとに言葉を添えてくれる住人がいます。ほかの街の住人には、その街を訪れたときに会えます。
        </ThemedText>

        {townNpc ? (
          <View style={styles.card}>
            <View style={styles.cardHead}>
              <ThemedText style={styles.name}>{townNpc.name}</ThemedText>
              {selectedTown ? (
                <View style={styles.pill}>
                  <ThemedText style={styles.pillText}>
                    {selectedTown.town.name}
                  </ThemedText>
                </View>
              ) : null}
            </View>
            {townNpc.description ? (
              <ThemedText type="small" themeColor="textSecondary" style={styles.desc}>
                {townNpc.description}
              </ThemedText>
            ) : null}
          </View>
        ) : (
          // 住人が未登録の街。メッセージは既定の住人が代わりに届ける（要件7.1）
          <View style={styles.card}>
            <ThemedText type="small" themeColor="textSecondary" style={styles.desc}>
              この街の住人は、まだ姿を見せていません。夜のメッセージは、ほかの街の住人がそっと届けています。
            </ThemedText>
          </View>
        )}
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  content: { padding: Spacing.four, paddingBottom: Spacing.six, gap: Spacing.three },
  intro: { marginBottom: Spacing.one, lineHeight: 20 },
  card: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(18,26,46,0.6)",
    padding: Spacing.four,
    gap: Spacing.two,
  },
  cardHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: Spacing.two,
  },
  name: { fontSize: 16, fontWeight: "600" },
  desc: { lineHeight: 21 },
  pill: {
    paddingVertical: 3,
    paddingHorizontal: Spacing.two,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: LightColor,
  },
  pillText: { color: LightColor, fontSize: 12, fontWeight: "600" },
});
