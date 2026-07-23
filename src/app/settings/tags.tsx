import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, View } from "react-native";

import { EditFieldModal, SettingRow, SettingSection } from "@/components/settings-ui";
import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { LIMITS } from "@/constants/domain";
import { Spacing } from "@/constants/theme";
import { useSettings } from "@/contexts/SettingsContext";
import { tagRepo } from "@/db/repositories";
import type { StudyTag } from "@/db/types";
import { validateTagName } from "@/lib/validation";

// S10 マイタグ管理画面（要件10.9 / UC 10.7）。
// マイタグの新規追加・名称変更（重複は不可）・論理削除。稼働中も操作できる。
// 学習成果記録（3.4）からも追加できるが、この画面からも追加できる。

export default function TagsScreen() {
  const { user } = useSettings();
  const [tags, setTags] = useState<StudyTag[]>([]);
  const [loading, setLoading] = useState(true);
  const [renaming, setRenaming] = useState<StudyTag | null>(null);
  const [adding, setAdding] = useState(false);

  // 有効なマイタグが上限に達しているか（追加不可）
  const atLimit = tags.length >= LIMITS.MYTAG_MAX;

  const reload = useCallback(async () => {
    try {
      setTags(await tagRepo.listMyTags());
    } catch (e) {
      console.error("マイタグの読み込みに失敗しました", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload]),
  );

  function confirmDelete(tag: StudyTag) {
    Alert.alert(
      "このタグを削除しますか",
      `「${tag.name}」を今後の選択肢から外します。過去の記録では表示され続けます。`,
      [
        { text: "やめる", style: "cancel" },
        {
          text: "削除する",
          style: "destructive",
          onPress: () => {
            void (async () => {
              try {
                await tagRepo.deactivateMyTag(tag.id);
                await reload();
              } catch (e) {
                console.error("マイタグの削除に失敗しました", e);
              }
            })();
          },
        },
      ],
    );
  }

  if (loading) {
    return (
      <ThemedView style={styles.center}>
        <ActivityIndicator />
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        {/* 追加。上限に達しているときは押せないようにして理由を添える */}
        <SettingSection>
          <SettingRow
            first
            label="新しいタグを追加"
            onPress={atLimit ? undefined : () => setAdding(true)}
            disabled={atLimit}
            right={
              !atLimit ? (
                <Ionicons name="add" size={22} color="rgba(255,255,255,0.9)" />
              ) : undefined
            }
            note={
              atLimit
                ? `上限の${LIMITS.MYTAG_MAX}個に達しています。追加するには不要なタグを削除してください`
                : undefined
            }
          />
        </SettingSection>

        {tags.length > 0 ? (
          <SettingSection
            title={`マイタグ（${tags.length} / ${LIMITS.MYTAG_MAX}）`}
            footer="タップで名前を変更、右のアイコンで削除できます。"
          >
            {tags.map((tag, i) => (
              <SettingRow
                key={tag.id}
                first={i === 0}
                label={tag.name}
                onPress={() => setRenaming(tag)}
                right={
                  <Pressable
                    onPress={() => confirmDelete(tag)}
                    hitSlop={10}
                    accessibilityLabel={`${tag.name}を削除`}
                    style={({ pressed }) => pressed && styles.pressed}
                  >
                    <Ionicons
                      name="trash-outline"
                      size={20}
                      color="rgba(217,83,79,0.9)"
                    />
                  </Pressable>
                }
              />
            ))}
          </SettingSection>
        ) : (
          <View style={styles.empty}>
            <ThemedText themeColor="textSecondary">
              まだマイタグはありません
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              上の「新しいタグを追加」から作れます
            </ThemedText>
          </View>
        )}
      </ScrollView>

      {/* 新規追加（重複・上限は非同期で検証してモーダル内に表示） */}
      <EditFieldModal
        visible={adding}
        title="新しいタグ"
        description={`${LIMITS.TAG_NAME_MAX}文字以内で入力できます`}
        initialValue=""
        placeholder="例: 数学"
        maxLength={LIMITS.TAG_NAME_MAX}
        validate={validateTagName}
        onCancel={() => setAdding(false)}
        onSubmit={async (v) => {
          if (!user) return;
          const result = await tagRepo.createMyTag(user.id, v);
          if (!result.ok) {
            return result.reason === "duplicate"
              ? "すでに同じ名前のタグがあります"
              : `マイタグは${LIMITS.MYTAG_MAX}個までです`;
          }
          await reload();
        }}
      />

      {/* 名称変更（重複は非同期で検証してモーダル内に表示） */}
      <EditFieldModal
        visible={renaming !== null}
        title="タグの名前"
        description={`${LIMITS.TAG_NAME_MAX}文字以内で入力できます`}
        initialValue={renaming?.name ?? ""}
        maxLength={LIMITS.TAG_NAME_MAX}
        validate={validateTagName}
        onCancel={() => setRenaming(null)}
        onSubmit={async (v) => {
          if (!renaming) return;
          const result = await tagRepo.renameMyTag(renaming.id, v);
          if (!result.ok) return "すでに同じ名前のタグがあります";
          await reload();
        }}
      />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  content: { padding: Spacing.four, paddingBottom: Spacing.six },
  empty: {
    alignItems: "center",
    gap: Spacing.two,
    paddingVertical: Spacing.six,
  },
  pressed: { opacity: 0.5 },
});
