import { Image } from "expo-image";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from "react-native";

import { LevelBadge } from "@/components/level-badge";
import { EditFieldModal, SettingRow } from "@/components/settings-ui";
import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { Spacing } from "@/constants/theme";
import { getTownArt, hasTownArt } from "@/constants/townArt";
import { useSettings } from "@/contexts/SettingsContext";
import { useTimer } from "@/contexts/TimerContext";
import { growthRepo, townProgressRepo } from "@/db/repositories";
import type { TownWithProgress } from "@/db/repositories/townProgressRepo";
import { formatMinutes } from "@/lib/study-day";
import { validateProjectTargetHours } from "@/lib/validation";

// S9 街選択画面（要件6.4 / UC 6.3）。
// 街の切り替え（稼働中不可）／サブタイトル編集（稼働中も可）／
// プロジェクト型の目標学習時間の設定・変更（稼働中不可）。
// 育成進捗（レベル・累計・経験値）は街ごとに個別保持され、切り替えでは失われない。

const LIGHT_COLOR = "rgba(255,206,138,0.95)";

type Editing =
  | { kind: "subtitle"; townId: number; current: string }
  | { kind: "target"; townId: number; current: string }
  | null;

export default function TownsScreen() {
  const { user, ready, reload: reloadSettings } = useSettings();
  const { status } = useTimer();
  const running = status !== "idle";

  const [towns, setTowns] = useState<TownWithProgress[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Editing>(null);

  // 街一覧（この画面の表示）と、選択中の街（SettingsContext・S8 が参照）の両方を更新する。
  // 後者も更新することで、戻ったときに S8 が最新のサブタイトル・レベルを即表示できる。
  const reload = useCallback(async () => {
    try {
      const [list] = await Promise.all([
        townProgressRepo.listTownsWithProgress(),
        reloadSettings(),
      ]);
      setTowns(list);
    } catch (e) {
      console.error("街の読み込みに失敗しました", e);
    } finally {
      setLoading(false);
    }
  }, [reloadSettings]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const isProject = user?.growth_method === "project";

  async function selectTown(townId: number, selectable: boolean) {
    if (running || !selectable) return;
    await townProgressRepo.selectTown(townId);
    await reload();
  }

  async function saveSubtitle(townId: number, value: string) {
    await townProgressRepo.updateSubtitle(townId, value);
    await reload();
  }

  async function saveTarget(townId: number, hoursText: string) {
    if (!user) return;
    const minutes = Number(hoursText.trim()) * 60;
    await townProgressRepo.updateProjectTargetMinutes(townId, minutes);
    // 目標が変わると基準が変わるためレベルを再判定する（下がらない・要件6.1）
    await growthRepo.recomputeTownLevel(user.id, townId, "project");
    await reload();
  }

  if (!ready || loading) {
    return (
      <ThemedView style={styles.center}>
        <ActivityIndicator />
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        {running ? (
          <ThemedText type="small" themeColor="textSecondary" style={styles.notice}>
            学習中は街を切り替えできません。サブタイトルの編集はできます。
          </ThemedText>
        ) : null}

        {towns.map(({ town, progress }) => {
          const art = getTownArt(town.code, progress.current_level);
          const hasArt = hasTownArt(town.code); // 素材のある街だけ選択できる
          const selected = progress.is_selected === 1;
          const selectable = hasArt && !selected;

          return (
            <View key={town.id} style={styles.card}>
              <Pressable
                onPress={() => void selectTown(town.id, selectable)}
                disabled={!selectable || running}
                style={({ pressed }) => [styles.art, pressed && selectable && styles.pressed]}
              >
                {art ? (
                  <Image source={art} style={StyleSheet.absoluteFill} contentFit="cover" />
                ) : (
                  <View style={[StyleSheet.absoluteFill, styles.placeholder]}>
                    <ThemedText type="small" themeColor="textSecondary">
                      準備中
                    </ThemedText>
                  </View>
                )}

                {/* 上段: レベル（左）・選択状態（右） */}
                <View style={styles.artTop} pointerEvents="none">
                  {hasArt ? <LevelBadge level={progress.current_level} /> : <View />}
                  {selected ? (
                    <View style={styles.selectedPill}>
                      <ThemedText style={styles.selectedText}>選択中</ThemedText>
                    </View>
                  ) : null}
                </View>

                {/* 下段: 街名（サブタイトル）・操作ヒント */}
                <View style={styles.artBottom} pointerEvents="none">
                  <ThemedText style={styles.townName} numberOfLines={1}>
                    {progress.subtitle ? `${town.name}（${progress.subtitle}）` : town.name}
                  </ThemedText>
                  {hasArt && !selected ? (
                    <ThemedText style={styles.hint}>
                      {running ? "学習中は切り替えできません" : "タップして選ぶ"}
                    </ThemedText>
                  ) : null}
                </View>
              </Pressable>

              {/* 操作: サブタイトル・（プロジェクト型のみ）目標時間。準備中の街は操作しない */}
              {hasArt ? (
              <View style={styles.footer}>
                <SettingRow
                  first
                  label="サブタイトル"
                  value={progress.subtitle ?? "（未設定）"}
                  onPress={() =>
                    setEditing({ kind: "subtitle", townId: town.id, current: progress.subtitle ?? "" })
                  }
                />
                {isProject ? (
                  <SettingRow
                    label="目標学習時間"
                    value={
                      progress.project_target_minutes != null
                        ? formatMinutes(progress.project_target_minutes)
                        : "未設定"
                    }
                    onPress={
                      running
                        ? undefined
                        : () =>
                            setEditing({
                              kind: "target",
                              townId: town.id,
                              current:
                                progress.project_target_minutes != null
                                  ? String(Math.round(progress.project_target_minutes / 60))
                                  : "",
                            })
                    }
                    disabled={running}
                    note={running ? "学習中は変更できません" : undefined}
                  />
                ) : null}
              </View>
              ) : null}
            </View>
          );
        })}
      </ScrollView>

      {/* サブタイトル編集（上限20文字・空で解除。稼働中も可） */}
      <EditFieldModal
        visible={editing?.kind === "subtitle"}
        title="サブタイトル"
        description="「試験にむけて」など、この街につける言葉（20文字以内・任意）。空にすると外せます。"
        initialValue={editing?.kind === "subtitle" ? editing.current : ""}
        placeholder="例: 試験にむけて"
        maxLength={20}
        onCancel={() => setEditing(null)}
        onSubmit={(v) => {
          if (editing?.kind === "subtitle") return saveSubtitle(editing.townId, v);
        }}
      />

      {/* プロジェクト型の目標時間（時間単位）。変更後にレベル再判定 */}
      <EditFieldModal
        visible={editing?.kind === "target"}
        title="目標学習時間（時間）"
        description="1〜500時間。この時間の達成で街が完成します。"
        initialValue={editing?.kind === "target" ? editing.current : ""}
        placeholder="例: 10"
        keyboardType="number-pad"
        maxLength={3}
        validate={validateProjectTargetHours}
        onCancel={() => setEditing(null)}
        onSubmit={(v) => {
          if (editing?.kind === "target") return saveTarget(editing.townId, v);
        }}
      />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  content: { padding: Spacing.four, paddingBottom: Spacing.six, gap: Spacing.four },
  notice: { marginBottom: Spacing.one },
  card: {
    borderRadius: 14,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.4)",
    backgroundColor: "rgba(18,26,46,0.6)",
  },
  art: {
    width: "100%",
    aspectRatio: 16 / 9,
    justifyContent: "space-between",
    backgroundColor: "#0b1020",
  },
  pressed: { opacity: 0.85 },
  placeholder: { alignItems: "center", justifyContent: "center" },
  artTop: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    padding: Spacing.three,
  },
  artBottom: {
    padding: Spacing.three,
    gap: 2,
    backgroundColor: "rgba(0,0,0,0.35)",
  },
  townName: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "600",
    textShadowColor: "rgba(0,0,0,0.7)",
    textShadowRadius: 4,
  },
  hint: {
    color: "rgba(255,255,255,0.85)",
    fontSize: 12,
    textShadowColor: "rgba(0,0,0,0.7)",
    textShadowRadius: 3,
  },
  selectedPill: {
    paddingVertical: 3,
    paddingHorizontal: Spacing.two,
    borderRadius: 999,
    backgroundColor: "rgba(0,0,0,0.5)",
    borderWidth: 1,
    borderColor: LIGHT_COLOR,
  },
  selectedText: { color: LIGHT_COLOR, fontSize: 12, fontWeight: "600" },
  footer: { backgroundColor: "rgba(255,255,255,0.04)" },
});
