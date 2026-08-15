import { Image } from "expo-image";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { getTutorialPage } from "@/constants/tutorial";
import { LightColor, Spacing } from "@/constants/theme";
import { useAudio } from "@/contexts/AudioContext";
import { useSettings } from "@/contexts/SettingsContext";
import { masterRepo, userRepo, weatherRepo } from "@/db/repositories";
import type { NightWeather } from "@/db/types";
import { canAttachPhoto, formatTakenAtLabel } from "@/lib/night-photo";
import { captureNightPhoto } from "@/lib/night-photo-capture";
import { deletePhotoFile, photoUri } from "@/lib/night-photo-storage";
import { formatStudyDateLabel } from "@/lib/study-day";
import { NightPhotoViewer } from "./night-photo-viewer";

// 初めて天気の選択欄を開いたとき、この機能の説明を一度だけ選択欄の上に重ねる（要件1.3）。
// ホーム・タイマー設定のどちらから開いても同じキー("weather")で、片方で見れば再表示しない。
const WEATHER_TUTORIAL = getTutorialPage("weather");

// 今夜のこと（写真と天気の選択欄。要件2.5 / 2.6 / 3.1 / 3.4）。
//
// 天気を選ぶ場所は3つある（ホーム画面の天気の行・タイマー設定モーダル・成果記録）が、
// どこで触っても同じものだと分かるよう、選択UIは本コンポーネントに集約する。
//
// 上段が写真・下段が天気で、並びがそのまま「写真 → 天気」の順を表す（要件2.6）。
// 外を見て撮り、その写真を見ながら「今夜はどんな夜だったか」を選ぶのが実際の順序のため。
//
// 「1晩＝1天気」であり、選び直すとその学習日の天気を上書きする（最後の選択が残る）。
// 天気の保存は呼び出し側が行う（タイマー設定モーダルでは開始ボタンを押すまで確定しない）。
// 一方、写真は撮った時点でここが保存する（実体のあるファイルであり、開始の有無とは無関係）。

export function WeatherPicker({
  visible,
  selectedId,
  studyDate,
  onSelect,
  onClose,
}: {
  visible: boolean;
  /** 選択中の天気（未選択は null） */
  selectedId: number | null;
  /** 対象の学習日（'YYYY-MM-DD'）。どの夜の記録かの表示と、写真の帰属に使う */
  studyDate: string;
  onSelect: (weather: NightWeather) => void;
  onClose: () => void;
}) {
  const [weathers, setWeathers] = useState<NightWeather[]>([]);

  // 天気機能の初回説明（選択欄に重ねて出す）。片方で見れば以後は出さない
  const { user, reload: reloadSettings } = useSettings();
  const [introClosed, setIntroClosed] = useState(false);
  const seenFeatures = (user?.tutorial_seen_features ?? "")
    .split(",")
    .filter(Boolean);
  const showIntro =
    visible &&
    WEATHER_TUTORIAL !== undefined &&
    user !== null &&
    !seenFeatures.includes("weather") &&
    !introClosed;

  async function closeIntro() {
    setIntroClosed(true);
    try {
      await userRepo.markFeatureTutorialSeen("weather");
      await reloadSettings();
    } catch (e) {
      console.error("天気説明の既読記録に失敗しました", e);
    }
  }

  useEffect(() => {
    let mounted = true;
    masterRepo
      .getNightWeathers()
      .then((list) => {
        if (mounted) setWeathers(list);
      })
      .catch((e) => console.error("夜の天気の読み込みに失敗しました", e));
    return () => {
      mounted = false;
    };
  }, []);

  // --- その夜の写真（要件2.6） ---
  const { runAndRestoreAudio } = useAudio();
  const [photo, setPhoto] = useState<{
    fileName: string;
    takenAt: string;
  } | null>(null);
  const [capturing, setCapturing] = useState(false);
  // 拡大表示中の写真（null なら閉じている）
  const [viewingPhoto, setViewingPhoto] = useState<string | null>(null);

  // 写真の欄を出すのは、まだ終わっていない夜のときだけ。
  // 過ぎた夜には足せない（削除だけはカレンダーから行える。要件2.6）。
  // 撮るかどうかは常に任意（押さなければカメラ権限も要求しない）ため、
  // 機能自体のON/OFF設定は持たない
  const canTakePhoto = canAttachPhoto(studyDate);

  useEffect(() => {
    if (!visible) return;
    let mounted = true;
    weatherRepo
      .getDailyWeather(studyDate)
      .then((row) => {
        if (!mounted) return;
        setPhoto(
          row?.photo_file_name && row.photo_taken_at
            ? { fileName: row.photo_file_name, takenAt: row.photo_taken_at }
            : null,
        );
      })
      .catch((e) => console.error("その夜の写真の読み込みに失敗しました", e));
    return () => {
      mounted = false;
    };
  }, [visible, studyDate]);

  const takePhoto = useCallback(async () => {
    if (!user || capturing) return;
    setCapturing(true);
    try {
      const result = await captureNightPhoto(studyDate, runAndRestoreAudio);
      if (result.status === "denied") {
        Alert.alert(
          "カメラを使えません",
          "写真は今夜の空を残すときだけ使います。端末の設定からカメラを許可すると撮れるようになります。",
        );
        return;
      }
      if (result.status === "failed") {
        Alert.alert("写真を残せませんでした", "少し時間をおいて試してください。");
        return;
      }
      if (result.status === "cancelled") return;

      // ファイルの保存が成功してからDBを更新する（逆順だと実体のない参照が残る）
      const previous = photo?.fileName;
      await weatherRepo.setPhoto(
        user.id,
        studyDate,
        result.fileName,
        result.takenAt.toISOString(),
      );
      setPhoto({
        fileName: result.fileName,
        takenAt: result.takenAt.toISOString(),
      });
      // 撮り直しなら古い実体を捨てる（1学習日1枚）
      if (previous && previous !== result.fileName) deletePhotoFile(previous);
    } catch (e) {
      // 保存や記録の書き込みで落ちても、握りつぶさず静かに知らせる
      // （ここで投げると呼び出し元は void のため誰も拾えず、押しても無反応に見える）
      console.error("その夜の写真の保存に失敗しました", e);
      Alert.alert("写真を残せませんでした", "少し時間をおいて試してください。");
    } finally {
      setCapturing(false);
    }
  }, [user, capturing, studyDate, runAndRestoreAudio, photo]);

  const removePhoto = useCallback(() => {
    if (!photo) return;
    Alert.alert("今夜の写真を消しますか", "元に戻すことはできません。", [
      { text: "やめる", style: "cancel" },
      {
        text: "消す",
        style: "destructive",
        onPress: () => {
          void (async () => {
            try {
              await weatherRepo.clearPhoto(studyDate);
              deletePhotoFile(photo.fileName);
              setPhoto(null);
            } catch (e) {
              console.error("その夜の写真の削除に失敗しました", e);
            }
          })();
        },
      },
    ]);
  }, [photo, studyDate]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.root}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        {/* カード内のタップで閉じないよう、伝播を止める */}
        <Pressable style={styles.card} onPress={() => {}}>
          <Text style={styles.title}>今夜のこと</Text>
          <Text style={styles.subtitle}>{formatStudyDateLabel(studyDate)}</Text>

          {/* 上段: その夜の写真（任意）。撮ってから下段で天気を選ぶ流れ（要件2.6） */}
          {canTakePhoto ? (
            photo ? (
              <View style={styles.photoRow}>
                {/* タップで拡大（つまんで寄せる・指で動かせる。見るだけで加工はしない） */}
                <Pressable
                  onPress={() => setViewingPhoto(photo.fileName)}
                  accessibilityLabel="写真を拡大する"
                  style={({ pressed }) => [pressed && styles.pressed]}
                >
                  <Image
                    source={{ uri: photoUri(photo.fileName) }}
                    style={styles.thumbnail}
                    contentFit="cover"
                    transition={200}
                  />
                </Pressable>
                <View style={styles.photoMeta}>
                  <Text style={styles.photoTakenAt}>
                    {formatTakenAtLabel(photo.takenAt)}
                  </Text>
                  <View style={styles.photoActions}>
                    <Pressable
                      onPress={() => void takePhoto()}
                      disabled={capturing}
                      style={({ pressed }) => [pressed && styles.pressed]}
                      accessibilityLabel="撮り直す"
                    >
                      <Text style={styles.photoAction}>撮り直す</Text>
                    </Pressable>
                    <Pressable
                      onPress={removePhoto}
                      style={({ pressed }) => [pressed && styles.pressed]}
                      accessibilityLabel="消す"
                    >
                      <Text style={styles.photoAction}>消す</Text>
                    </Pressable>
                  </View>
                </View>
              </View>
            ) : (
              <Pressable
                onPress={() => void takePhoto()}
                disabled={capturing}
                style={({ pressed }) => [
                  styles.photoButton,
                  pressed && styles.pressed,
                ]}
                accessibilityLabel="今夜の空を撮る"
              >
                {capturing ? (
                  <ActivityIndicator color={LightColor} />
                ) : (
                  <Text style={styles.photoButtonText}>📷 今夜の空を撮る</Text>
                )}
              </Pressable>
            )
          ) : null}

          {/* 下段: 夜の天気。写真を撮った直後で未選択なら、そのまま選択へ続ける */}
          <Text style={styles.sectionLabel}>
            {photo && selectedId === null
              ? "この夜はどんな夜だった？"
              : "どんな夜？"}
          </Text>

          <ScrollView style={styles.list} showsVerticalScrollIndicator={false}>
            {weathers.map((w) => {
              const isSelected = w.id === selectedId;
              return (
                <Pressable
                  key={w.id}
                  onPress={() => onSelect(w)}
                  style={({ pressed }) => [
                    styles.item,
                    isSelected && styles.itemSelected,
                    pressed && styles.pressed,
                  ]}
                  accessibilityLabel={w.name}
                  accessibilityState={{ selected: isSelected }}
                >
                  <Text style={styles.emoji}>{w.emoji}</Text>
                  <Text style={[styles.name, isSelected && styles.nameSelected]}>
                    {w.name}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>

          <Pressable
            onPress={onClose}
            style={({ pressed }) => [styles.closeButton, pressed && styles.pressed]}
            accessibilityLabel="閉じる"
          >
            <Text style={styles.closeText}>閉じる</Text>
          </Pressable>
        </Pressable>
      </Pressable>

      {/* 初回だけ、天気機能の説明を選択欄の上に重ねる（Modalを重ねず同一Modal内のViewで出す） */}
      {showIntro && WEATHER_TUTORIAL ? (
        <View style={styles.introCover}>
          <View style={styles.introCard}>
            <Text style={styles.introTitle}>{WEATHER_TUTORIAL.title}</Text>
            {WEATHER_TUTORIAL.body.map((paragraph, i) => (
              <Text key={i} style={styles.introBody}>
                {paragraph}
              </Text>
            ))}
            <Pressable
              onPress={() => void closeIntro()}
              style={({ pressed }) => [styles.introButton, pressed && styles.pressed]}
              accessibilityLabel="わかった"
            >
              <Text style={styles.introButtonText}>わかった</Text>
            </Pressable>
          </View>
        </View>
      ) : null}

      {/* 撮った写真の拡大表示。消すのは上の「消す」に任せ、ここでは出さない */}
      <NightPhotoViewer
        fileName={viewingPhoto}
        onClose={() => setViewingPhoto(null)}
      />
      </View>
    </Modal>
  );
}


const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(3,6,15,0.75)",
    alignItems: "center",
    justifyContent: "center",
    padding: Spacing.four,
  },
  introCover: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(6,10,20,0.98)",
    alignItems: "center",
    justifyContent: "center",
    padding: Spacing.five,
  },
  introCard: {
    width: "100%",
    maxWidth: 340,
    gap: Spacing.three,
  },
  introTitle: {
    color: "rgba(255,255,255,0.96)",
    fontSize: 20,
    fontWeight: "700",
    letterSpacing: 1,
  },
  introBody: {
    color: "rgba(255,255,255,0.82)",
    fontSize: 15,
    lineHeight: 26,
  },
  introButton: {
    marginTop: Spacing.two,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: LightColor,
    paddingVertical: Spacing.three,
    alignItems: "center",
  },
  introButtonText: {
    color: LightColor,
    fontSize: 15,
    fontWeight: "600",
  },
  card: {
    width: "100%",
    maxWidth: 340,
    maxHeight: "80%",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
    backgroundColor: "rgba(18,26,46,0.98)",
    padding: Spacing.four,
  },
  title: {
    color: "rgba(255,255,255,0.95)",
    fontSize: 17,
    fontWeight: "600",
  },
  subtitle: {
    color: "rgba(255,255,255,0.55)",
    fontSize: 12,
    marginTop: 2,
    marginBottom: Spacing.three,
  },
  list: {
    flexGrow: 0,
  },
  // --- その夜の写真（要件2.6）。天気の上に置き、並びで「写真 → 天気」を表す ---
  photoButton: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.28)",
    paddingVertical: Spacing.three,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 48,
  },
  photoButtonText: {
    color: "rgba(255,255,255,0.8)",
    fontSize: 14,
  },
  photoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.three,
  },
  thumbnail: {
    width: 56,
    height: 56,
    borderRadius: 10,
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  photoMeta: {
    flex: 1,
    gap: 4,
  },
  photoTakenAt: {
    color: "rgba(255,255,255,0.55)",
    fontSize: 12,
  },
  photoActions: {
    flexDirection: "row",
    gap: Spacing.four,
  },
  photoAction: {
    color: LightColor,
    fontSize: 13,
  },
  sectionLabel: {
    color: "rgba(255,255,255,0.7)",
    fontSize: 13,
    marginTop: Spacing.three,
    marginBottom: Spacing.two,
  },
  item: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.three,
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.three,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "transparent",
  },
  itemSelected: {
    borderColor: LightColor,
    backgroundColor: "rgba(255,206,138,0.1)",
  },
  pressed: {
    opacity: 0.6,
  },
  emoji: {
    fontSize: 20,
  },
  name: {
    color: "rgba(255,255,255,0.85)",
    fontSize: 15,
  },
  nameSelected: {
    color: LightColor,
    fontWeight: "600",
  },
  closeButton: {
    marginTop: Spacing.three,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.5)",
    paddingVertical: Spacing.three,
    alignItems: "center",
  },
  closeText: {
    color: "rgba(255,255,255,0.95)",
    fontSize: 15,
    fontWeight: "500",
  },
});
