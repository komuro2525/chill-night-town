import { Ionicons } from "@expo/vector-icons";
import { useEffect, useState } from "react";
import {
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
import { Spacing } from "@/constants/theme";
import { masterRepo, tagRepo } from "@/db/repositories";
import type { Emotion, NightWeather, StudyTag } from "@/db/types";
import { formatMinutes, formatStudyDateLabel } from "@/lib/study-day";
import { validateTagName } from "@/lib/validation";
import { WeatherPicker } from "./weather-picker";
import { WeatherRow } from "./weather-row";

// S6 学習成果記録（要件3.4 / UC 3.4）。
//
// セッション（時刻・実績学習時間）は終了時に確定済みのため、
// **この画面から離脱しても学習した時間は失われない**（要件3.4）。
// ここで入力するのは感情・タグ・メモという任意項目だけであり、
// 保存せず閉じた場合は空のまま確定する。
//
// 天気はここでも変更できる（「振り返ってみたら今夜は嵐の夜だった」を許容する）。
// 1晩＝1天気のため、変更はその学習日の天気そのものを上書きする（要件2.5）。

const CATEGORY_LABELS: Record<string, string> = {
  positive: "うまくいった",
  neutral: "おだやか",
  negative: "しんどかった",
};
const CATEGORY_ORDER = ["positive", "neutral", "negative"] as const;

export type RecordValues = {
  emotionId: number | null;
  memo: string;
  tagIds: number[];
};

export function RecordModal({
  userId,
  studyDate,
  minutes,
  weather,
  emotionEnabled,
  onChangeWeather,
  onSave,
  onClose,
}: {
  userId: number;
  studyDate: string;
  /** 確定済みの実績学習時間（分） */
  minutes: number;
  weather: NightWeather | null;
  /** 感情記録の設定（10.5）。OFFなら感情欄を出さない */
  emotionEnabled: boolean;
  onChangeWeather: (w: NightWeather) => void;
  onSave: (values: RecordValues) => void;
  /** 保存せず閉じる（セッションは確定済みのため失われない） */
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const [emotions, setEmotions] = useState<Emotion[]>([]);
  const [tags, setTags] = useState<StudyTag[]>([]);
  const [emotionId, setEmotionId] = useState<number | null>(null);
  const [tagIds, setTagIds] = useState<number[]>([]);
  const [memo, setMemo] = useState("");
  const [newTag, setNewTag] = useState("");
  const [tagError, setTagError] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const [e, t] = await Promise.all([
          masterRepo.getEmotions(),
          tagRepo.getSelectableTags(),
        ]);
        if (!mounted) return;
        setEmotions(e);
        setTags(t);
      } catch (err) {
        console.error("成果記録の選択肢の読み込みに失敗しました", err);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  function toggleTag(id: number) {
    setTagIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  async function handleAddTag() {
    const e = validateTagName(newTag);
    if (e) return setTagError(e);

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
      // 復活の場合も含め、選択肢を読み直して新しいタグを選択済みにする
      setTags(await tagRepo.getSelectableTags());
      setTagIds((prev) => [...prev, result.tag.id]);
      setNewTag("");
      setTagError(null);
    } catch (err) {
      console.error("マイタグの登録に失敗しました", err);
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
            <Text style={styles.title}>今夜の記録</Text>
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
            {/* 学習した時間（確定済み） */}
            <View style={styles.summary}>
              <Text style={styles.summaryLabel}>
                {formatStudyDateLabel(studyDate)}
              </Text>
              <Text style={styles.summaryTime}>{formatMinutes(minutes)}</Text>
              <Text style={styles.summaryNote}>お疲れさまでした</Text>
            </View>

            {/* 夜の天気（変更できる） */}
            <Section title="今夜の天気">
              <WeatherRow weather={weather} onPress={() => setPickerOpen(true)} />
            </Section>

            {/* 感情（設定がONのときだけ・任意） */}
            {emotionEnabled ? (
              <Section title="どんな気持ち？" optional>
                {CATEGORY_ORDER.map((category) => {
                  const items = emotions.filter((e) => e.category === category);
                  if (items.length === 0) return null;
                  return (
                    <View key={category} style={styles.emotionGroup}>
                      <Text style={styles.categoryLabel}>
                        {CATEGORY_LABELS[category]}
                      </Text>
                      <View style={styles.chips}>
                        {items.map((e) => (
                          <Chip
                            key={e.id}
                            label={`${e.emoji ?? ""} ${e.name}`}
                            selected={emotionId === e.id}
                            // もう一度押すと選択を外せる（任意項目のため）
                            onPress={() =>
                              setEmotionId((prev) => (prev === e.id ? null : e.id))
                            }
                          />
                        ))}
                      </View>
                    </View>
                  );
                })}
              </Section>
            ) : null}

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
                  selectionColor={LIGHT_COLOR}
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
                selectionColor={LIGHT_COLOR}
              />
              <Text style={styles.counter}>
                {memo.length} / {LIMITS.MEMO_MAX}
              </Text>
            </Section>

            <Pressable
              onPress={() => onSave({ emotionId, memo, tagIds })}
              accessibilityLabel="記録を保存する"
              style={({ pressed }) => [styles.saveButton, pressed && styles.pressed]}
            >
              <Text style={styles.saveText}>記録する</Text>
            </Pressable>

            <Text style={styles.note}>
              入力はどれも任意です。閉じても学習した時間は残ります
            </Text>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>

      <WeatherPicker
        visible={pickerOpen}
        selectedId={weather?.id ?? null}
        studyDateLabel={formatStudyDateLabel(studyDate)}
        onSelect={(w) => {
          onChangeWeather(w);
          setPickerOpen(false);
        }}
        onClose={() => setPickerOpen(false)}
      />
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

const LIGHT_COLOR = "rgba(255,206,138,0.95)";

const styles = StyleSheet.create({
  overlay: { ...StyleSheet.absoluteFillObject },
  flex: { flex: 1 },
  scrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(3,6,15,0.85)",
  },
  content: { flex: 1, paddingHorizontal: Spacing.four },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  title: {
    color: "rgba(255,255,255,0.95)",
    fontSize: 24,
    fontWeight: "600",
  },
  divider: {
    height: 1,
    backgroundColor: "rgba(255,255,255,0.2)",
    marginTop: Spacing.two,
  },
  scroll: { paddingBottom: Spacing.six },
  summary: {
    alignItems: "center",
    marginTop: Spacing.four,
    gap: 2,
  },
  summaryLabel: {
    color: "rgba(255,255,255,0.55)",
    fontSize: 12,
  },
  summaryTime: {
    color: LIGHT_COLOR,
    fontSize: 34,
    fontWeight: "300",
  },
  summaryNote: {
    color: "rgba(255,255,255,0.6)",
    fontSize: 12,
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
  optional: {
    color: "rgba(255,255,255,0.4)",
    fontSize: 11,
  },
  emotionGroup: { marginBottom: Spacing.three },
  categoryLabel: {
    color: "rgba(255,255,255,0.45)",
    fontSize: 11,
    marginBottom: Spacing.one,
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
    borderColor: LIGHT_COLOR,
    backgroundColor: "rgba(255,206,138,0.12)",
  },
  chipText: {
    color: "rgba(255,255,255,0.8)",
    fontSize: 13,
  },
  chipTextSelected: {
    color: LIGHT_COLOR,
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
  saveButton: {
    marginTop: Spacing.five,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.5)",
    backgroundColor: "rgba(255,255,255,0.08)",
    paddingVertical: Spacing.three,
    alignItems: "center",
  },
  saveText: {
    color: "rgba(255,255,255,0.95)",
    fontSize: 15,
    fontWeight: "500",
  },
  pressed: { opacity: 0.6 },
  note: {
    color: "rgba(255,255,255,0.4)",
    fontSize: 11,
    textAlign: "center",
    marginTop: Spacing.three,
  },
});
