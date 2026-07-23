import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, View } from "react-native";

import { EditFieldModal, SettingRow, SettingSection } from "@/components/settings-ui";
import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { LIMITS } from "@/constants/domain";
import { LightColor, Spacing } from "@/constants/theme";
import { useSettings } from "@/contexts/SettingsContext";
import { tagRepo } from "@/db/repositories";
import type { StudyTag } from "@/db/types";
import { validateTagName } from "@/lib/validation";

// S10 タグ管理画面（要件10.9 / UC 10.7）。
// 標準タグ・マイタグの新規追加・名称変更（重複は不可）・論理削除。稼働中も操作できる。
// 標準タグも編集・削除でき、有効タグ全体（標準＋マイタグ）で上限20件。
// 学習成果記録（3.4）からも追加できるが、この画面からも追加できる。

export default function TagsScreen() {
  const { user } = useSettings();
  const [tags, setTags] = useState<StudyTag[]>([]);
  const [loading, setLoading] = useState(true);
  const [renaming, setRenaming] = useState<StudyTag | null>(null);
  const [adding, setAdding] = useState(false);
  // 複数選択して削除するモードと、選択中のタグID（要件10.9）
  const [selecting, setSelecting] = useState(false);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);

  // 有効なタグ（標準＋マイタグ）が上限に達しているか（追加不可）
  const atLimit = tags.length >= LIMITS.MYTAG_MAX;
  const allSelected = tags.length > 0 && selectedIds.length === tags.length;

  const reload = useCallback(async () => {
    try {
      setTags(await tagRepo.listManagedTags());
    } catch (e) {
      console.error("タグの読み込みに失敗しました", e);
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
                await tagRepo.deactivateTag(tag.id);
                await reload();
              } catch (e) {
                console.error("タグの削除に失敗しました", e);
              }
            })();
          },
        },
      ],
    );
  }

  function enterSelection() {
    setSelecting(true);
    setSelectedIds([]);
  }

  function exitSelection() {
    setSelecting(false);
    setSelectedIds([]);
  }

  function toggleSelect(id: number) {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  function toggleSelectAll() {
    setSelectedIds(allSelected ? [] : tags.map((t) => t.id));
  }

  // 複数選択したタグをまとめて削除する。含まれる件数を確認メッセージに明示する（要件10.9）
  function confirmBulkDelete() {
    const n = selectedIds.length;
    if (n === 0) return;
    Alert.alert(
      `選択した${n}個のタグを削除しますか`,
      `${n}個のタグを今後の選択肢から外します。過去の記録では表示され続けます。`,
      [
        { text: "やめる", style: "cancel" },
        {
          text: `削除する（${n}）`,
          style: "destructive",
          onPress: () => {
            void (async () => {
              try {
                await tagRepo.deactivateTags(selectedIds);
                exitSelection();
                await reload();
              } catch (e) {
                console.error("タグのまとめて削除に失敗しました", e);
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
        {/* 追加。選択（まとめて削除）モード中は隠す。上限時は押せないようにして理由を添える */}
        {!selecting ? (
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
        ) : null}

        {tags.length > 0 ? (
          <SettingSection
            title={`タグ（${tags.length} / ${LIMITS.MYTAG_MAX}）`}
            footer={
              selecting
                ? "削除するタグをタップで選び、下の「削除」を押します。"
                : "標準タグも含めて、タップで名前を変更、右のアイコンで削除できます。"
            }
          >
            {tags.map((tag, i) => {
              const checked = selectedIds.includes(tag.id);
              return (
                <SettingRow
                  key={tag.id}
                  first={i === 0}
                  label={tag.name}
                  hideChevron={selecting}
                  onPress={
                    selecting ? () => toggleSelect(tag.id) : () => setRenaming(tag)
                  }
                  right={
                    selecting ? (
                      <Ionicons
                        name={checked ? "checkmark-circle" : "ellipse-outline"}
                        size={24}
                        color={checked ? LightColor : "rgba(255,255,255,0.35)"}
                      />
                    ) : (
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
                    )
                  }
                />
              );
            })}
          </SettingSection>
        ) : (
          <View style={styles.empty}>
            <ThemedText themeColor="textSecondary">
              まだタグはありません
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              上の「新しいタグを追加」から作れます
            </ThemedText>
          </View>
        )}

        {/* まとめて削除（複数選択）の操作。タグがあるときだけ出す */}
        {tags.length > 0 ? (
          selecting ? (
            <SettingSection>
              <SettingRow
                first
                label={allSelected ? "すべての選択を解除" : "すべて選択"}
                onPress={toggleSelectAll}
              />
              <SettingRow
                label={`選択したタグを削除（${selectedIds.length}）`}
                danger
                disabled={selectedIds.length === 0}
                onPress={selectedIds.length > 0 ? confirmBulkDelete : undefined}
              />
              <SettingRow label="選択をやめる" onPress={exitSelection} />
            </SettingSection>
          ) : (
            <SettingSection>
              <SettingRow first label="複数選択して削除" onPress={enterSelection} />
            </SettingSection>
          )
        ) : null}
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
              : `タグは${LIMITS.MYTAG_MAX}個までです`;
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
          const result = await tagRepo.renameTag(renaming.id, v);
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
