import { useEffect, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { getTutorialPage } from "@/constants/tutorial";
import { LightColor, Spacing } from "@/constants/theme";
import { useSettings } from "@/contexts/SettingsContext";
import { masterRepo, userRepo } from "@/db/repositories";
import type { NightWeather } from "@/db/types";

// 初めて天気の選択欄を開いたとき、この機能の説明を一度だけ選択欄の上に重ねる（要件1.3）。
// ホーム・タイマー設定のどちらから開いても同じキー("weather")で、片方で見れば再表示しない。
const WEATHER_TUTORIAL = getTutorialPage("weather");

// 今夜の天気の選択欄（要件2.5 / 3.1 / 3.4）。
//
// 天気を選ぶ場所は3つある（ホーム画面の天気の行・タイマー設定モーダル・成果記録）が、
// どこで触っても同じものだと分かるよう、選択UIは本コンポーネントに集約する。
//
// 「1晩＝1天気」であり、選び直すとその学習日の天気を上書きする（最後の選択が残る）。
// 保存は呼び出し側が行う（タイマー設定モーダルでは開始ボタンを押すまで確定しないため）。

export function WeatherPicker({
  visible,
  selectedId,
  studyDateLabel,
  onSelect,
  onClose,
}: {
  visible: boolean;
  /** 選択中の天気（未選択は null） */
  selectedId: number | null;
  /** 「1/10（金）の夜」等。どの夜の天気かを明示する（要件2.5） */
  studyDateLabel: string;
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
          <Text style={styles.title}>今夜はどんな夜？</Text>
          <Text style={styles.subtitle}>{studyDateLabel}</Text>

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
