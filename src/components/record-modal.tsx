import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useCallback, useEffect, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { LightColor, Spacing } from "@/constants/theme";
import { masterRepo, tagRepo, weatherRepo } from "@/db/repositories";
import type { Emotion, NightWeather, StudyTag } from "@/db/types";
import { formatTakenAtLabel } from "@/lib/night-photo";
import { photoUri } from "@/lib/night-photo-storage";
import { formatMinutes, formatStudyDateLabel } from "@/lib/study-day";
import { NightPhotoViewer } from "./night-photo-viewer";
import { Chip, MemoSection, Section, TagSection } from "./record-fields";
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
  const [pickerOpen, setPickerOpen] = useState(false);

  // 今夜の写真（要件2.6）。撮っていればここでも見られるようにする。
  // 選択欄を閉じたときに読み直すのは、そこで撮る・撮り直す・消すができるため
  const [photo, setPhoto] = useState<{
    fileName: string;
    takenAt: string;
  } | null>(null);
  const [viewingPhoto, setViewingPhoto] = useState<string | null>(null);

  const reloadPhoto = useCallback(async () => {
    try {
      const row = await weatherRepo.getDailyWeather(studyDate);
      setPhoto(
        row?.photo_file_name && row.photo_taken_at
          ? { fileName: row.photo_file_name, takenAt: row.photo_taken_at }
          : null,
      );
    } catch (e) {
      console.error("その夜の写真の読み込みに失敗しました", e);
    }
  }, [studyDate]);

  useEffect(() => {
    void reloadPhoto();
  }, [reloadPhoto]);

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

            {/* 今夜の写真（要件2.6）。撮っていれば見せる。撮り直し・削除は
                天気の欄から開く選択欄で行う（削除の入口を増やさない） */}
            {photo ? (
              <Section title="今夜の写真">
                <Pressable
                  onPress={() => setViewingPhoto(photo.fileName)}
                  accessibilityLabel="写真を拡大する"
                  style={({ pressed }) => [
                    styles.photoRow,
                    pressed && styles.photoRowPressed,
                  ]}
                >
                  <Image
                    source={{ uri: photoUri(photo.fileName) }}
                    style={styles.photoThumb}
                    contentFit="cover"
                    transition={200}
                  />
                  <Text style={styles.photoTakenAt}>
                    {formatTakenAtLabel(photo.takenAt)}
                  </Text>
                </Pressable>
              </Section>
            ) : null}

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
            <TagSection
              userId={userId}
              tags={tags}
              tagIds={tagIds}
              onToggleTag={toggleTag}
              onTagCreated={(selectable, tagId) => {
                // 復活の場合も含め、読み直した選択肢に差し替えて新しいタグを選択済みにする
                setTags(selectable);
                setTagIds((prev) => [...prev, tagId]);
              }}
            />

            {/* 振り返りメモ（任意） */}
            <MemoSection memo={memo} onChangeMemo={setMemo} />

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
        studyDate={studyDate}
        onSelect={(w) => {
          onChangeWeather(w);
          setPickerOpen(false);
          // 選択欄では写真を撮る・撮り直す・消すもできるため、閉じたら読み直す
          void reloadPhoto();
        }}
        onClose={() => {
          setPickerOpen(false);
          void reloadPhoto();
        }}
      />

      {/* 今夜の写真の拡大表示。ここでは消せない（撮り直し・削除は選択欄から） */}
      <NightPhotoViewer
        fileName={viewingPhoto}
        onClose={() => setViewingPhoto(null)}
      />
    </View>
  );
}

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
    color: LightColor,
    fontSize: 34,
    fontWeight: "300",
  },
  summaryNote: {
    color: "rgba(255,255,255,0.6)",
    fontSize: 12,
  },
  // 今夜の写真（要件2.6）。タップで拡大する
  photoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.three,
  },
  photoRowPressed: { opacity: 0.6 },
  photoThumb: {
    width: 64,
    height: 64,
    borderRadius: 10,
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  photoTakenAt: {
    color: "rgba(255,255,255,0.5)",
    fontSize: 12,
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
