import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import { LIMITS } from "@/constants/domain";
import { LightColor, Spacing } from "@/constants/theme";
import { tagRepo } from "@/db/repositories";
import type { StudyTag } from "@/db/types";
import { validateTagName } from "@/lib/validation";

// 学習記録の入力欄の共通部品。
// 学習成果記録（record-modal）とカレンダーからの編集（session-edit-modal）で
// タグ・メモの入力を同じ体裁・同じルールにそろえるため、ここへ一元化する。

/** 見出し付きのセクション（「任意」ラベルを添えられる） */
export function Section({
  title,
  optional = false,
  children,
}: {
  title: string;
  optional?: boolean;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>{title}</Text>
        {optional ? <Text style={styles.optional}>任意</Text> : null}
      </View>
      {children}
    </View>
  );
}

/** 選択チップ（感情・タグの選択に使う） */
export function Chip({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityLabel={label}
      accessibilityState={{ selected }}
      style={({ pressed }) => [
        styles.chip,
        selected && styles.chipSelected,
        pressed && styles.pressed,
      ]}
    >
      <Text style={[styles.chipText, selected && styles.chipTextSelected]}>
        {label}
      </Text>
    </Pressable>
  );
}

/**
 * 学習内容タグのセクション（複数選択＋マイタグの新規追加。要件3.4）。
 *
 * 新規タグの入力・検証・登録（重複/上限エラーの表示を含む）はここで完結する。
 * 登録に成功したら、読み直した選択肢一覧と新タグのIDを onTagCreated で親へ返す
 * （親は一覧の差し替えと選択への追加を行う。論理削除済みタグを一覧へ
 * 残したい画面では、親側で merge し直せるよう一覧ごと渡す）。
 */
export function TagSection({
  userId,
  tags,
  tagIds,
  onToggleTag,
  onTagCreated,
}: {
  userId: number;
  /** 選択肢に出すタグ */
  tags: StudyTag[];
  /** 選択中のタグID */
  tagIds: number[];
  onToggleTag: (id: number) => void;
  /** マイタグ登録後: 読み直した選択肢一覧と新タグのID */
  onTagCreated: (selectable: StudyTag[], tagId: number) => void;
}) {
  const [newTag, setNewTag] = useState("");
  const [tagError, setTagError] = useState<string | null>(null);

  async function handleAddTag() {
    const err = validateTagName(newTag);
    if (err) return setTagError(err);
    try {
      const result = await tagRepo.createMyTag(userId, newTag);
      if (!result.ok) {
        setTagError(
          result.reason === "duplicate"
            ? "すでに同じ名前のタグがあります"
            : `マイタグは${LIMITS.MYTAG_MAX}個までです`,
        );
        return;
      }
      // 復活の場合も含め、選択肢を読み直して親へ返す
      onTagCreated(await tagRepo.getSelectableTags(), result.tag.id);
      setNewTag("");
      setTagError(null);
    } catch (e) {
      console.error("マイタグの登録に失敗しました", e);
    }
  }

  return (
    <Section title="何をした？" optional>
      <View style={styles.chips}>
        {tags.map((t) => (
          <Chip
            key={t.id}
            label={t.name}
            selected={tagIds.includes(t.id)}
            onPress={() => onToggleTag(t.id)}
          />
        ))}
      </View>

      <View style={styles.newTagRow}>
        <TextInput
          value={newTag}
          onChangeText={(v) => {
            setNewTag(v);
            setTagError(null);
          }}
          placeholder="タグを追加"
          placeholderTextColor="rgba(255,255,255,0.35)"
          maxLength={LIMITS.TAG_NAME_MAX}
          style={styles.newTagInput}
          selectionColor={LightColor}
        />
        <Pressable
          onPress={() => void handleAddTag()}
          disabled={newTag.trim().length === 0}
          accessibilityLabel="タグを追加する"
          style={({ pressed }) => [
            styles.addButton,
            newTag.trim().length === 0 && styles.addButtonDisabled,
            pressed && styles.pressed,
          ]}
        >
          <Ionicons name="add" size={22} color="rgba(255,255,255,0.95)" />
        </Pressable>
      </View>
      <Text style={styles.tagHint}>{LIMITS.TAG_NAME_MAX}文字以内</Text>
      {tagError ? <Text style={styles.error}>{tagError}</Text> : null}
    </Section>
  );
}

/** 振り返りメモのセクション（任意・上限500文字。要件3.4） */
export function MemoSection({
  memo,
  onChangeMemo,
}: {
  memo: string;
  onChangeMemo: (v: string) => void;
}) {
  return (
    <Section title="ひとこと" optional>
      <TextInput
        value={memo}
        onChangeText={onChangeMemo}
        placeholder="今夜のことを、少しだけ"
        placeholderTextColor="rgba(255,255,255,0.35)"
        multiline
        maxLength={LIMITS.MEMO_MAX}
        style={styles.memo}
        selectionColor={LightColor}
      />
      <Text style={styles.counter}>
        {memo.length} / {LIMITS.MEMO_MAX}
      </Text>
    </Section>
  );
}

const styles = StyleSheet.create({
  section: { marginTop: Spacing.five },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.two,
    marginBottom: Spacing.two,
  },
  sectionTitle: {
    color: "rgba(255,255,255,0.9)",
    fontSize: 15,
    fontWeight: "500",
  },
  optional: {
    color: "rgba(255,255,255,0.4)",
    fontSize: 11,
  },
  chips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.two,
  },
  chip: {
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.25)",
    backgroundColor: "rgba(255,255,255,0.05)",
  },
  chipSelected: {
    borderColor: LightColor,
    backgroundColor: "rgba(255,206,138,0.12)",
  },
  chipText: {
    color: "rgba(255,255,255,0.8)",
    fontSize: 13,
  },
  chipTextSelected: {
    color: LightColor,
    fontWeight: "600",
  },
  newTagRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.two,
    marginTop: Spacing.three,
  },
  newTagInput: {
    flex: 1,
    color: "#ffffff",
    fontSize: 14,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
    borderRadius: 10,
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  addButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.5)",
    alignItems: "center",
    justifyContent: "center",
  },
  addButtonDisabled: { opacity: 0.3 },
  memo: {
    minHeight: 90,
    color: "#ffffff",
    fontSize: 14,
    lineHeight: 21,
    padding: Spacing.three,
    borderRadius: 10,
    backgroundColor: "rgba(255,255,255,0.08)",
    textAlignVertical: "top",
  },
  counter: {
    alignSelf: "flex-end",
    color: "rgba(255,255,255,0.35)",
    fontSize: 11,
    marginTop: Spacing.one,
  },
  tagHint: {
    color: "rgba(255,255,255,0.4)",
    fontSize: 11,
    marginTop: Spacing.two,
  },
  error: {
    color: "rgba(255,180,180,0.95)",
    fontSize: 12,
    marginTop: Spacing.two,
  },
  pressed: { opacity: 0.6 },
});
