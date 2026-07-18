import { useRouter } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Switch, View } from "react-native";

import { EditFieldModal, SettingRow, SettingSection } from "@/components/settings-ui";
import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { Spacing } from "@/constants/theme";
import { useSettings } from "@/contexts/SettingsContext";
import { useTimer } from "@/contexts/TimerContext";
import { growthRepo, townProgressRepo, userRepo } from "@/db/repositories";
import type { GrowthMethod } from "@/db/types";
import { useTheme } from "@/hooks/use-theme";
import { formatMinutes } from "@/lib/study-day";
import {
  validateDailyGoalMinutes,
  validateNickname,
  validateProjectTargetHours,
} from "@/lib/validation";

// S8 設定画面（要件10章）。各種設定の入口。
// タイマー稼働中は、判定・記録に影響する項目（目標時間・成長方式・街切替・初期化）を
// グレーアウトし「学習中は変更できません」と添える（要件10 共通ルール）。
// 音量(10.4)・通知(10.3)は音声・通知基盤（Phase 7）に依存するため、本画面では
// 「準備中」の無効行として置くだけとする。

const RUNNING_NOTE = "学習中は変更できません";

export default function SettingsScreen() {
  const router = useRouter();
  const { user, ready, reload, selectedTown } = useSettings();
  const { status } = useTimer();
  const running = status !== "idle";

  const [editing, setEditing] = useState<"nickname" | "goal" | null>(null);
  const [projectPrompt, setProjectPrompt] = useState(false);

  // 選択中の街は SettingsContext が保持する。S9 で変更すると context 側が更新され、
  // 戻ってきたときには既に最新（非同期の再読み込み待ちが無いのでラグが出ない）。

  if (!ready || !user) {
    return (
      <ThemedView style={styles.center}>
        <ActivityIndicator />
      </ThemedView>
    );
  }

  const method = user.growth_method;

  // 成長方式を切り替える。プロジェクト型へ切り替えるときは、必ずモーダルで
  // 目標時間を確認・設定させる（既存の目標があれば初期値に入れておく）。
  async function changeMethod(next: GrowthMethod) {
    if (running || next === method || !user) return;
    if (next === "project") {
      setProjectPrompt(true);
      return;
    }
    await userRepo.updateGrowthMethod(next);
    if (selectedTown) {
      await growthRepo.recomputeTownLevel(user.id, selectedTown.town.id, next);
    }
    await reload();
  }

  // プロジェクト型に切り替えるときの目標時間確定。目標を保存→方式切替→レベル再判定。
  async function confirmProjectTarget(hoursText: string) {
    if (!user || !selectedTown) return;
    const minutes = Number(hoursText.trim()) * 60;
    await townProgressRepo.updateProjectTargetMinutes(selectedTown.town.id, minutes);
    await userRepo.updateGrowthMethod("project");
    await growthRepo.recomputeTownLevel(user.id, selectedTown.town.id, "project");
    await reload();
  }

  return (
    <ThemedView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        {/* プロフィール */}
        <SettingSection title="プロフィール">
          <SettingRow
            first
            label="ニックネーム"
            value={user.nickname}
            onPress={() => setEditing("nickname")}
          />
          <SettingRow
            label="1日の目標時間"
            value={formatMinutes(user.daily_goal_minutes)}
            onPress={running ? undefined : () => setEditing("goal")}
            disabled={running}
            note={running ? RUNNING_NOTE : undefined}
          />
        </SettingSection>

        {/* 街の育て方 */}
        <SettingSection
          title="街の育て方"
          footer={
            method === "habit"
              ? "達成した夜に、街の灯りが少し育ちます。"
              : "積み重ねた学習時間が、目標に向かって街を育てます。"
          }
        >
          <View style={[styles.methodRow, running && styles.disabled]}>
            <ThemedText>成長方式</ThemedText>
            <Segmented
              value={method}
              disabled={running}
              options={[
                { value: "habit", label: "習慣型" },
                { value: "project", label: "プロジェクト型" },
              ]}
              onChange={(v) => void changeMethod(v)}
            />
          </View>
          {running ? (
            <View style={styles.methodNote}>
              <ThemedText type="small" themeColor="textSecondary">
                {RUNNING_NOTE}
              </ThemedText>
            </View>
          ) : null}
          <SettingRow
            label="街の切り替え"
            value={
              selectedTown
                ? selectedTown.progress.subtitle
                  ? `${selectedTown.town.name}（${selectedTown.progress.subtitle}）`
                  : selectedTown.town.name
                : undefined
            }
            onPress={() => router.push("/settings/towns")}
          />
        </SettingSection>

        {/* 記録 */}
        <SettingSection title="記録">
          <SettingRow
            first
            label="気持ちの記録"
            note="学習のふりかえりで、その夜の気持ちを選べます"
            right={
              <Switch
                value={user.emotion_record_enabled === 1}
                onValueChange={async (v) => {
                  await userRepo.updateEmotionRecordEnabled(v);
                  await reload();
                }}
              />
            }
          />
          <SettingRow
            label="頑張りすぎ防止"
            note="長くなった夜に、そっと休憩を提案します"
            right={
              <Switch
                value={user.overwork_prevention_enabled === 1}
                onValueChange={async (v) => {
                  await userRepo.updateOverworkPreventionEnabled(v);
                  await reload();
                }}
              />
            }
          />
          <SettingRow label="マイタグの管理" onPress={() => router.push("/settings/tags")} />
        </SettingSection>

        {/* 音・通知（Phase 7 で実装） */}
        <SettingSection title="音・通知">
          <SettingRow first label="音量" value="準備中" disabled />
          <SettingRow label="通知" value="準備中" disabled />
        </SettingSection>
      </ScrollView>

      {/* ニックネーム編集 */}
      <EditFieldModal
        visible={editing === "nickname"}
        title="ニックネーム"
        initialValue={user.nickname}
        placeholder="この街での呼び名"
        maxLength={20}
        validate={validateNickname}
        onCancel={() => setEditing(null)}
        onSubmit={async (v) => {
          await userRepo.updateNickname(v);
          await reload();
        }}
      />

      {/* 目標時間編集 */}
      <EditFieldModal
        visible={editing === "goal"}
        title="1日の目標時間（分）"
        description="10〜720分。習慣型の達成判定・休憩提案の基準になります。"
        initialValue={String(user.daily_goal_minutes)}
        keyboardType="number-pad"
        maxLength={3}
        validate={validateDailyGoalMinutes}
        onCancel={() => setEditing(null)}
        onSubmit={async (v) => {
          await userRepo.updateDailyGoalMinutes(Number(v));
          await reload();
        }}
      />

      {/* プロジェクト型の目標時間（切替時に未設定なら求める） */}
      <EditFieldModal
        visible={projectPrompt}
        title="目標学習時間（時間）"
        description="1〜744時間。この時間の達成で街が完成します。"
        initialValue={
          selectedTown?.progress.project_target_minutes != null
            ? String(Math.round(selectedTown.progress.project_target_minutes / 60))
            : ""
        }
        placeholder="例: 10"
        keyboardType="number-pad"
        maxLength={3}
        validate={validateProjectTargetHours}
        onCancel={() => setProjectPrompt(false)}
        onSubmit={confirmProjectTarget}
      />
    </ThemedView>
  );
}

// 2択のセグメント。世界観に合わせ控えめな配色にする。
function Segmented<T extends string>({
  value,
  options,
  onChange,
  disabled,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  disabled?: boolean;
}) {
  const theme = useTheme();
  return (
    <View style={[styles.segment, { backgroundColor: theme.backgroundSelected }]}>
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <Pressable
            key={opt.value}
            onPress={() => !disabled && onChange(opt.value)}
            style={[styles.segItem, active && { backgroundColor: theme.background }]}
            accessibilityState={{ selected: active }}
          >
            <ThemedText type="small" themeColor={active ? "text" : "textSecondary"}>
              {opt.label}
            </ThemedText>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  content: { padding: Spacing.four, paddingBottom: Spacing.six },
  methodRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    minHeight: 52,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    gap: Spacing.three,
  },
  methodNote: {
    paddingHorizontal: Spacing.three,
    paddingBottom: Spacing.two,
  },
  disabled: { opacity: 0.4 },
  segment: { flexDirection: "row", borderRadius: 999, padding: 3 },
  segItem: {
    paddingVertical: Spacing.one,
    paddingHorizontal: Spacing.three,
    borderRadius: 999,
  },
});
