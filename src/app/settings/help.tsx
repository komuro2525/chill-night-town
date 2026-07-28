import { useState } from "react";
import { ScrollView, StyleSheet } from "react-native";

import { SettingRow, SettingSection } from "@/components/settings-ui";
import { ThemedView } from "@/components/themed-view";
import { TutorialOverlay } from "@/components/tutorial-overlay";
import { Spacing } from "@/constants/theme";
import { TUTORIAL_PAGES } from "@/constants/tutorial";

// 設定 > 使い方（要件1.3）。各機能の説明を一覧し、タップでその説明を開く。
// 初回チュートリアルや機能ごとの初回説明と同じ内容を、いつでも読み返せる。
// ここからの閲覧は表示済みフラグ（tutorial_completed / tutorial_seen_features）に影響しない。
export default function HelpScreen() {
  // 開くページ（null=閉じている）
  const [tutorialAt, setTutorialAt] = useState<number | null>(null);

  return (
    <ThemedView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <SettingSection
          title="各機能の説明"
          footer="はじめてのときに出た案内を、いつでも読み返せます。項目を選ぶとその説明が開きます。"
        >
          <SettingRow first label="最初から見る" onPress={() => setTutorialAt(0)} />
          {TUTORIAL_PAGES.map((page, i) => (
            <SettingRow
              key={page.key}
              label={page.title}
              onPress={() => setTutorialAt(i)}
            />
          ))}
        </SettingSection>
      </ScrollView>

      <TutorialOverlay
        visible={tutorialAt !== null}
        initialIndex={tutorialAt ?? 0}
        onClose={() => setTutorialAt(null)}
      />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: Spacing.four, paddingBottom: Spacing.six },
});
