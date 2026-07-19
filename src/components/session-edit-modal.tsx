import { Ionicons } from "@expo/vector-icons";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { LIMITS } from "@/constants/domain";
import { LightColor, Spacing } from "@/constants/theme";
import { sessionRepo, tagRepo } from "@/db/repositories";
import type { DaySessionRecord } from "@/db/repositories/calendarRepo";
import type { StudyTag } from "@/db/types";
import { formatMinutes } from "@/lib/study-day";
import { validateTagName } from "@/lib/validation";

// カレンダーの日別詳細から、1セッションのタグ・メモを編集する（要件4.1）。
//
// 感情・学習時間・天気は編集対象外。感情はその時の気持ちの記録として**読み取り専用**で示す。
// タグ・メモのUIは学習成果記録（record-modal）と同じ体裁・同じルールにそろえる。


function formatTimeRange(startIso: string, endIso: string): string {
  const t = (iso: string) => {
    const d = new Date(iso);
    const p = (n: number) => String(n).padStart(2, "0");
    return `${p(d.getHours())}:${p(d.getMinutes())}`;
  };
  return `${t(startIso)}〜${t(endIso)}`;
}

export function SessionEditModal({
  userId,
  session,
  onSaved,
  onClose,
}: {
  userId: number;
  /** 編集対象のセッション。null なら閉じている */
  session: DaySessionRecord | null;
  /** 保存が完了した（親は日別詳細を読み直す） */
  onSaved: () => void;
  /** 保存せず閉じる */
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const [tags, setTags] = useState<StudyTag[]>([]);
  const [tagIds, setTagIds] = useState<number[]>([]);
  const [memo, setMemo] = useState("");
  const [newTag, setNewTag] = useState("");
  const [tagError, setTagError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // 対象が変わるたびに、そのセッションの現在値で初期化する
  useEffect(() => {
    if (!session) return;
    setTagIds(session.tags.map((t) => t.id));
    setMemo(session.memo ?? "");
    setNewTag("");
    setTagError(null);
    setSaving(false);
    (async () => {
      try {
        const selectable = await tagRepo.getSelectableTags();
        // セッションが持つが選択肢に無いタグ（論理削除済み）も末尾に出して操作できるようにする
        const extra = session.tags.filter(
          (t) => !selectable.some((s) => s.id === t.id),
        );
        setTags([...selectable, ...extra]);
      } catch (e) {
        console.error("タグの読み込みに失敗しました", e);
      }
    })();
  }, [session]);

  if (!session) return null;

  function toggleTag(id: number) {
    setTagIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

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
      setTags(await tagRepo.getSelectableTags());
      setTagIds((prev) => [...prev, result.tag.id]);
      setNewTag("");
      setTagError(null);
    } catch (e) {
      console.error("マイタグの登録に失敗しました", e);
    }
  }

  async function handleSave() {
    if (saving || !session) return;
    setSaving(true);
    try {
      await sessionRepo.updateSessionContent({
        sessionId: session.id,
        memo,
        tagIds,
      });
      onSaved();
    } catch (e) {
      console.error("記録の更新に失敗しました", e);
      setSaving(false);
    }
  }

  return (
    <View style={styles.overlay}>
      <View style={styles.scrim} pointerEvents="none" />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View style={[styles.content, { paddingTop: insets.top + Spacing.three }]}>
          <View style={styles.header}>
            <Text style={styles.title}>記録を整える</Text>
            <Pressable
              onPress={onClose}
              hitSlop={10}
              accessibilityLabel="閉じる"
              style={({ pressed }) => pressed && styles.pressed}
            >
              <Ionicons name="close-circle" size={38} color="rgba(255,255,255,0.85)" />
            </Pressable>
          </View>
          <View style={styles.divider} />

          <ScrollView
            style={styles.flex}
            contentContainerStyle={styles.scroll}
            keyboardShouldPersistTaps="handled"
          >
            {/* 読み取り専用: 時間・実績・感情（感情は編集させない） */}
            <View style={styles.summary}>
              <Text style={styles.summaryTime}>
                {formatTimeRange(session.startTime, session.endTime)}
              </Text>
              <Text style={styles.summaryDur}>
                {formatMinutes(session.durationMinutes)}
              </Text>
              {session.emotion ? (
                <Text style={styles.summaryEmotion}>
                  {session.emotion.emoji} {session.emotion.name}
                </Text>
              ) : null}
              <Text style={styles.readonlyNote}>
                気持ち・学習時間はそのまま残ります
              </Text>
            </View>

            {/* 学習内容タグ（複数選択・任意） */}
            <Section title="何をした？" optional>
              <View style={styles.chips}>
                {tags.map((t) => (
                  <Chip
                    key={t.id}
                    label={t.name}
                    selected={tagIds.includes(t.id)}
                    onPress={() => toggleTag(t.id)}
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

            {/* 振り返りメモ（任意） */}
            <Section title="ひとこと" optional>
              <TextInput
                value={memo}
                onChangeText={setMemo}
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

            <Pressable
              onPress={() => void handleSave()}
              disabled={saving}
              accessibilityLabel="変更を保存する"
              style={({ pressed }) => [
                styles.saveButton,
                pressed && styles.pressed,
                saving && styles.addButtonDisabled,
              ]}
            >
              {saving ? (
                <ActivityIndicator color="rgba(255,255,255,0.95)" />
              ) : (
                <Text style={styles.saveText}>保存する</Text>
              )}
            </Pressable>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

function Section({
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

function Chip({
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

const styles = StyleSheet.create({
  overlay: { ...StyleSheet.absoluteFillObject },
  flex: { flex: 1 },
  scrim: {
    ...StyleSheet.absoluteFillObject,
    // 不透明にして下の日別詳細を透かさない（透けると読みづらい）
    backgroundColor: "#05070f",
  },
  content: { flex: 1, paddingHorizontal: Spacing.four },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  title: { color: "rgba(255,255,255,0.95)", fontSize: 22, fontWeight: "600" },
  divider: {
    height: 1,
    backgroundColor: "rgba(255,255,255,0.2)",
    marginTop: Spacing.two,
  },
  scroll: { paddingBottom: Spacing.six },
  summary: { alignItems: "center", marginTop: Spacing.four, gap: 2 },
  summaryTime: { color: "rgba(255,255,255,0.55)", fontSize: 12 },
  summaryDur: { color: LightColor, fontSize: 30, fontWeight: "300" },
  summaryEmotion: { color: "rgba(255,255,255,0.8)", fontSize: 14, marginTop: 2 },
  readonlyNote: {
    color: "rgba(255,255,255,0.4)",
    fontSize: 11,
    marginTop: Spacing.one,
  },
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
  optional: { color: "rgba(255,255,255,0.4)", fontSize: 11 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: Spacing.two },
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
  chipText: { color: "rgba(255,255,255,0.8)", fontSize: 13 },
  chipTextSelected: { color: LightColor, fontWeight: "600" },
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
  saveButton: {
    marginTop: Spacing.five,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.5)",
    backgroundColor: "rgba(255,255,255,0.08)",
    paddingVertical: Spacing.three,
    alignItems: "center",
  },
  saveText: { color: "rgba(255,255,255,0.95)", fontSize: 15, fontWeight: "500" },
  pressed: { opacity: 0.6 },
});
