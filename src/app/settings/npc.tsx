import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from "react-native";

import { FeatureTutorial } from "@/components/feature-tutorial";
import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { LightColor, Spacing } from "@/constants/theme";
import { useSettings } from "@/contexts/SettingsContext";
import { masterRepo, userRepo } from "@/db/repositories";
import type { Npc } from "@/db/types";

// 設定: 夜の住人（NPC）の選択（要件7.1）。
// 選んだ住人の声色でアプリのメッセージが出る。立ち絵はまだ無いため、紹介文で見せる。
// NPCは記録・判定に影響しないため、稼働中でも変更できる（今夜のメッセージは開始時の住人で出る）。

export default function NpcScreen() {
  const { user, ready, reload: reloadSettings } = useSettings();
  const [npcs, setNpcs] = useState<Npc[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    try {
      const [list] = await Promise.all([masterRepo.getNpcs(), reloadSettings()]);
      setNpcs(list);
    } catch (e) {
      console.error("NPCの読み込みに失敗しました", e);
    } finally {
      setLoading(false);
    }
  }, [reloadSettings]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const select = useCallback(
    async (id: number) => {
      if (id === user?.selected_npc_id) return;
      try {
        await userRepo.updateSelectedNpc(id);
        await reload();
      } catch (e) {
        console.error("NPCの変更に失敗しました", e);
      }
    },
    [user?.selected_npc_id, reload],
  );

  if (!ready || loading) {
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
          この街には、夜ごとに言葉を添えてくれる住人がいます。誰の声で過ごすか、いつでも選べます。
        </ThemedText>

        {npcs.map((npc) => {
          const selected = npc.id === user?.selected_npc_id;
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
        })}
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
