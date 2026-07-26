import { useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet } from "react-native";

import { SettingRow, SettingSection } from "@/components/settings-ui";
import { ThemedView } from "@/components/themed-view";
import { Spacing } from "@/constants/theme";
import { masterRepo } from "@/db/repositories";
import type { AmbientSound } from "@/db/types";

// 音楽のクレジット一覧（要件9）。アプリで流れる曲とアーティストをまとめて表示する。
// フリー音源のクレジット表記義務は、この画面と曲の「…」メニューのクレジットで満たす。

export default function CreditsScreen() {
  const [tracks, setTracks] = useState<AmbientSound[]>([]);
  const [loading, setLoading] = useState(true);

  useFocusEffect(
    useCallback(() => {
      let mounted = true;
      (async () => {
        try {
          const list = await masterRepo.getBgmTracks();
          if (mounted) setTracks(list);
        } catch (e) {
          console.error("クレジットの読み込みに失敗しました", e);
        } finally {
          if (mounted) setLoading(false);
        }
      })();
      return () => {
        mounted = false;
      };
    }, []),
  );

  return (
    <ThemedView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll}>
        {loading ? (
          <ActivityIndicator style={styles.loader} />
        ) : (
          <SettingSection
            title="音楽"
            footer="アプリで流れる音楽と、そのアーティストです。"
          >
            {tracks.map((t, i) => (
              <SettingRow
                key={t.id}
                first={i === 0}
                label={t.name}
                value={t.artist ?? "—"}
              />
            ))}
          </SettingSection>
        )}
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { padding: Spacing.four, paddingBottom: Spacing.six },
  loader: { marginTop: Spacing.six },
});
