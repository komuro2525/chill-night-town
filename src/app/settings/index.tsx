import { useRouter } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Switch, View } from "react-native";

import {
  EditFieldModal,
  formatClockInput,
  SettingRow,
  SettingSection,
  VolumeRow,
} from "@/components/settings-ui";
import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { DAILY_GOAL_MINUTES, LIMITS, PROJECT_TARGET } from "@/constants/domain";
import { Spacing } from "@/constants/theme";
import { useAudio, type SoundCategory } from "@/contexts/AudioContext";
import { useSettings } from "@/contexts/SettingsContext";
import { useTimer } from "@/contexts/TimerContext";
import { growthRepo, maintenanceRepo, settingsRepo, townProgressRepo, userRepo } from "@/db/repositories";
import type { GrowthMethod } from "@/db/types";
import { useTheme } from "@/hooks/use-theme";
import {
  cancelReminder,
  ensureNotificationPermission,
  scheduleDailyReminder,
} from "@/lib/notifications";
import { formatMinutes } from "@/lib/study-day";
import {
  validateDailyGoalMinutes,
  validateNickname,
  validateNotificationTime,
  validateProjectTargetHours,
} from "@/lib/validation";

// S8 設定画面（要件10章）。各種設定の入口。
// タイマー稼働中は、判定・記録に影響する項目（目標時間・成長方式・街切替・初期化）を
// グレーアウトし「学習中は変更できません」と添える（要件10 共通ルール）。

const RUNNING_NOTE = "学習中は変更できません";
// 通知を初めてONにするときの既定時刻（夜間帯のうち一般的な時刻）
const DEFAULT_NOTIFICATION_TIME = "21:00";

export default function SettingsScreen() {
  const router = useRouter();
  const { user, ready, reload, selectedTown, notificationSetting } = useSettings();
  const { status } = useTimer();
  const audio = useAudio();
  const running = status !== "idle";

  // 音量の変更（10.4）。保存したうえで、その音量が分かるようプレビュー音を鳴らす。
  // タイマー稼働中も変更できる（判定・記録に影響しないため）
  function handleVolumeChange(category: SoundCategory, value: number) {
    void audio.setVolume(category, value).then(() => audio.playPreview(category));
  }

  const [editing, setEditing] = useState<"nickname" | "goal" | null>(null);
  const [projectPrompt, setProjectPrompt] = useState(false);
  const [timeEditOpen, setTimeEditOpen] = useState(false);

  const notifyEnabled = notificationSetting?.is_enabled === 1;
  const notifyTime = notificationSetting?.scheduled_time ?? null;

  // 通知のON/OFF（要件10.3 / 12章）。ONにするときはOSの許可を確保し、
  // 拒否されたらOFFへ戻してOSの設定から変更できる旨を伝える（要件12章）。
  // 発火はOSが行い、設定保存時にスケジュール登録・解除する（アプリは時刻を監視しない）
  async function handleToggleNotification(next: boolean) {
    try {
      if (next) {
        const granted = await ensureNotificationPermission();
        if (!granted) {
          Alert.alert(
            "通知が許可されていません",
            "端末の設定から Chill Night Town の通知を許可すると、学習開始の時刻をお知らせできます。",
          );
          return; // OFFのまま（Switchは notifyEnabled を見るので戻る）
        }
        const time = notifyTime ?? DEFAULT_NOTIFICATION_TIME;
        await settingsRepo.updateNotificationSetting(true, time);
        await scheduleDailyReminder(time);
      } else {
        await settingsRepo.updateNotificationSetting(false, null);
        await cancelReminder();
      }
      await reload();
    } catch (e) {
      console.error("通知設定の更新に失敗しました", e);
    }
  }

  // 通知時刻の変更（ONのあいだのみ）。保存して登録し直す
  async function handleChangeNotificationTime(time: string) {
    try {
      await settingsRepo.updateNotificationSetting(true, time);
      await scheduleDailyReminder(time);
      await reload();
    } catch (e) {
      console.error("通知時刻の更新に失敗しました", e);
    }
  }

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

  // アプリ内データの初期化（要件10.10）。復元不可を明記して確認し、初期設定へ戻す。
  function handleReset() {
    if (running) return;
    Alert.alert(
      "このアプリのデータを初期化しますか",
      "学習記録・街の育成・設定・マイタグなど、すべてのデータを削除します。削除したデータは元に戻せません。",
      [
        { text: "やめる", style: "cancel" },
        {
          text: "初期化する",
          style: "destructive",
          onPress: () => {
            void (async () => {
              try {
                await maintenanceRepo.resetUserData();
                await reload();
                router.replace("/setup");
              } catch (e) {
                console.error("データの初期化に失敗しました", e);
              }
            })();
          },
        },
      ],
    );
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

        {/* 音（要件9 / 10.4）。音量0の音は再生処理自体を行わない */}
        <SettingSection
          title="音"
          footer="0にすると、その音は鳴らなくなります。"
        >
          <VolumeRow
            first
            label="BGM"
            value={audio.volumes.bgm}
            onChange={(v) => handleVolumeChange("bgm", v)}
          />
          <VolumeRow
            label="環境音"
            note="夜の天気に合わせて流れる音"
            value={audio.volumes.ambient}
            onChange={(v) => handleVolumeChange("ambient", v)}
          />
          <VolumeRow
            label="効果音"
            value={audio.volumes.sfx}
            onChange={(v) => handleVolumeChange("sfx", v)}
          />
          <VolumeRow
            label="鐘の音"
            note="学習を終えたときの音"
            value={audio.volumes.bell}
            onChange={(v) => handleVolumeChange("bell", v)}
          />
        </SettingSection>

        {/* 通知（要件10.3 / 12章）。発火はOSが行う。稼働中も変更可 */}
        <SettingSection
          title="通知"
          footer="設定した時刻に、そっと学習の始まりをお知らせします。"
        >
          <SettingRow
            first
            label="学習開始の通知"
            right={
              <Switch
                value={notifyEnabled}
                onValueChange={(v) => void handleToggleNotification(v)}
              />
            }
          />
          {notifyEnabled ? (
            <SettingRow
              label="通知時刻"
              value={notifyTime ?? DEFAULT_NOTIFICATION_TIME}
              onPress={() => setTimeEditOpen(true)}
            />
          ) : null}
        </SettingSection>

        {/* データ */}
        <SettingSection title="データ">
          <SettingRow
            first
            label="このアプリのデータを初期化"
            danger
            onPress={running ? undefined : handleReset}
            disabled={running}
            note={
              running
                ? RUNNING_NOTE
                : "すべての記録・設定を消して最初からやり直します"
            }
          />
        </SettingSection>
      </ScrollView>

      {/* 通知時刻の編集（通知ONのあいだのみ） */}
      <EditFieldModal
        visible={timeEditOpen}
        title="通知時刻"
        description="17:30〜翌4:30 の範囲で設定できます。18:00より前は夜の始まりまでのカウントダウンをお知らせします。"
        initialValue={notifyTime ?? DEFAULT_NOTIFICATION_TIME}
        placeholder="21:00"
        keyboardType="number-pad"
        maxLength={5}
        transform={formatClockInput}
        validate={validateNotificationTime}
        onCancel={() => setTimeEditOpen(false)}
        onSubmit={async (v) => {
          await handleChangeNotificationTime(v);
          setTimeEditOpen(false);
        }}
      />

      {/* ニックネーム編集 */}
      <EditFieldModal
        visible={editing === "nickname"}
        title="ニックネーム"
        initialValue={user.nickname}
        placeholder="この街での呼び名"
        maxLength={LIMITS.NICKNAME_MAX}
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
        description={`${DAILY_GOAL_MINUTES.MIN}〜${DAILY_GOAL_MINUTES.MAX}分。習慣型の達成判定・休憩提案の基準になります。`}
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
        description={`${PROJECT_TARGET.HOURS.MIN}〜${PROJECT_TARGET.HOURS.MAX}時間。この時間の達成で街が完成します。`}
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
