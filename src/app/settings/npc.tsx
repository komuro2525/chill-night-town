import { useCallback } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from "react-native";

import { FeatureTutorial } from "@/components/feature-tutorial";
import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { LightColor, Spacing } from "@/constants/theme";
import { useSettings } from "@/contexts/SettingsContext";
import { townProgressRepo } from "@/db/repositories";

// 設定: 夜の住人（要件7.1 / 10.12）。
// 街には住人が複数いて、その中から語り手を選ぶ。選択は街ごとに残るため、
// 街を移って戻れば前に選んだ住人が迎える。
// 他の街の住人は見せない。行ってから出会うほうが、街を移る楽しみが残るため。
// 記録・判定には影響しないので稼働中も変更できる（今夜のメッセージは開始時の住人のまま）。
// 立ち絵はまだ無いため、紹介文で人物を見せる。

export default function NpcScreen() {
  const { ready, selectedTown, townNpcs, townNpc, reload } = useSettings();

  const select = useCallback(
    async (npcId: number) => {
      if (!selectedTown || npcId === townNpc?.id) return;
      try {
        await townProgressRepo.updateSelectedNpc(selectedTown.town.id, npcId);
        await reload();
      } catch (e) {
        console.error("住人の変更に失敗しました", e);
      }
    },
    [selectedTown, townNpc?.id, reload],
  );

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
          {selectedTown
            ? `${selectedTown.town.name}には、夜ごとに言葉を添えてくれる住人がいます。誰の声で過ごすか選べます。ほかの街の住人には、その街を訪れたときに会えます。`
            : "街にはそれぞれ、夜ごとに言葉を添えてくれる住人がいます。"}
        </ThemedText>

        {townNpcs.length > 0 ? (
          townNpcs.map((npc) => {
            const selected = npc.id === townNpc?.id;
            return (
              <Pressable
                key={npc.id}
                onPress={() => void select(npc.id)}
                disabled={selected}
                style={({ pressed }) => [
                  styles.card,
                  selected && styles.cardSelected,
                  pressed && !selected && styles.pressed,
                ]}
              >
                <View style={styles.cardHead}>
                  <ThemedText style={styles.name}>{npc.name}</ThemedText>
                  {selected ? (
                    <View style={styles.pill}>
                      <ThemedText style={styles.pillText}>選択中</ThemedText>
                    </View>
                  ) : (
                    <ThemedText type="small" themeColor="textSecondary">
                      タップして選ぶ
                    </ThemedText>
                  )}
                </View>
                {npc.description ? (
                  <ThemedText type="small" themeColor="textSecondary" style={styles.desc}>
                    {npc.description}
                  </ThemedText>
                ) : null}
              </Pressable>
            );
          })
        ) : (
          // 住人が未登録の街。メッセージは既定の住人が代わりに届ける（要件7.1）
          <View style={styles.card}>
            <ThemedText type="small" themeColor="textSecondary" style={styles.desc}>
              この街の住人は、まだ姿を見せていません。夜のメッセージは、ほかの街の住人がそっと届けています。
            </ThemedText>
          </View>
        )}

        <ThemedText type="small" themeColor="textSecondary" style={styles.note}>
          学習中でも変えられます。今夜のぶんは、始めたときの住人のままです。
        </ThemedText>
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  content: { padding: Spacing.four, paddingBottom: Spacing.six, gap: Spacing.three },
  intro: { marginBottom: Spacing.one, lineHeight: 20 },
  note: { marginTop: Spacing.one, lineHeight: 20 },
  card: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(18,26,46,0.6)",
    padding: Spacing.four,
    gap: Spacing.two,
  },
  cardSelected: { borderColor: LightColor },
  pressed: { opacity: 0.85 },
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
