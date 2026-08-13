import { Alert, Linking, ScrollView, StyleSheet, Switch } from "react-native";
import { useState } from "react";

import {
  EditFieldModal,
  formatClockInput,
  SettingRow,
  SettingSection,
} from "@/components/settings-ui";
import { ThemedView } from "@/components/themed-view";
import { Spacing } from "@/constants/theme";
import { useSettings } from "@/contexts/SettingsContext";
import { settingsRepo } from "@/db/repositories";
import { ensureNotificationPermission } from "@/lib/notifications";
import { refreshNotifications } from "@/lib/notification-sync";
import { validateNotificationTime } from "@/lib/validation";

// 通知の設定（要件10.3 / 10.13 / 12章）。設定画面（S8）から開く下位画面。
//
// 発火はすべてOSが行う（アプリは時刻を監視しない）。設定を保存したら
// refreshNotifications() で全消し→全再登録し、OSの登録状態と設定を一致させる。
// いずれもタイマー稼働中に変更できる（判定・記録に影響しないため）。

// 通知を初めてONにするときの既定時刻（夜間帯のうち一般的な時刻）
const DEFAULT_NOTIFICATION_TIME = "21:00";

/**
 * 通知許可が得られなかったときの案内（要件12章: OSの設定画面から変更できる旨を表示する）。
 * 一度拒否された後はアプリから許可を要求できないため、OSの設定を開く導線を添える。
 * @param what 許可されると何ができるかの説明（通知の種類ごとに変わる）
 */
function alertNotificationDenied(what: string) {
  Alert.alert(
    "通知が許可されていません",
    `端末の設定から Chill Night Town の通知を許可すると、${what}。`,
    [
      { text: "閉じる", style: "cancel" },
      { text: "設定を開く", onPress: () => void Linking.openSettings() },
    ],
  );
}

export default function NotificationSettingsScreen() {
  const { reload, notificationSetting } = useSettings();
  const [timeEditOpen, setTimeEditOpen] = useState(false);

  const notifyEnabled = notificationSetting?.is_enabled === 1;
  const notifyTime = notificationSetting?.scheduled_time ?? null;
  const eventNoticeEnabled = notificationSetting?.event_notice_enabled === 1;
  const studyNoticeEnabled = notificationSetting?.study_notice_enabled === 1;

  // 3つとも既にONなら、まとめてONにする意味がないので入口を出さない
  const allEnabled = notifyEnabled && eventNoticeEnabled && studyNoticeEnabled;

  // まとめてONにする操作。ひとつずつ切り替える手間を省くための入口で、
  // それ自体は設定値を持たない（押すと下の3つがそろってONになるだけ）。
  // OSの許可の確認は一度だけ行う
  async function handleEnableAll() {
    try {
      const granted = await ensureNotificationPermission();
      if (!granted) {
        alertNotificationDenied("学習の時間まわりのお知らせを受け取れます");
        return;
      }
      // 学習開始の通知には時刻が要る。設定済みならその時刻を保つ
      await settingsRepo.updateNotificationSetting(
        true,
        notifyTime ?? DEFAULT_NOTIFICATION_TIME,
      );
      await settingsRepo.updateEventNoticeEnabled(true);
      await settingsRepo.updateStudyNoticeEnabled(true);
      await refreshNotifications();
      await reload();
    } catch (e) {
      console.error("通知設定の一括更新に失敗しました", e);
    }
  }

  // 学習開始の通知のON/OFF（要件10.3 / 12章）。ONにするときはOSの許可を確保し、
  // 拒否されたらOFFのままにしてOSの設定から変更できる旨を伝える（要件12章）
  async function handleToggleNotification(next: boolean) {
    try {
      if (next) {
        const granted = await ensureNotificationPermission();
        if (!granted) {
          alertNotificationDenied("学習開始の時刻をお知らせできます");
          return; // OFFのまま（Switchは notifyEnabled を見るので戻る）
        }
        const time = notifyTime ?? DEFAULT_NOTIFICATION_TIME;
        await settingsRepo.updateNotificationSetting(true, time);
      } else {
        await settingsRepo.updateNotificationSetting(false, null);
      }
      // 学習開始リマインドと予定通知をまとめて張り直す（全消し→全再登録）
      await refreshNotifications();
      await reload();
    } catch (e) {
      console.error("通知設定の更新に失敗しました", e);
    }
  }

  // 通知時刻の変更（ONのあいだのみ）。保存して登録し直す
  async function handleChangeNotificationTime(time: string) {
    try {
      await settingsRepo.updateNotificationSetting(true, time);
      await refreshNotifications();
      await reload();
    } catch (e) {
      console.error("通知時刻の更新に失敗しました", e);
    }
  }

  // 予定のお知らせ（4.3）のON/OFF。ONにするときは通知許可を確保する
  async function handleToggleEventNotice(next: boolean) {
    try {
      if (next) {
        const granted = await ensureNotificationPermission();
        if (!granted) {
          alertNotificationDenied("予定のお知らせを受け取れます");
          return;
        }
      }
      await settingsRepo.updateEventNoticeEnabled(next);
      await refreshNotifications();
      await reload();
    } catch (e) {
      console.error("予定通知設定の更新に失敗しました", e);
    }
  }

  // 学習中のお知らせ（UC 10.10 / 12.2）のON/OFF。
  // ONにした時点で計測中なら、張り直しの中でその場で以後の出来事が予約される
  async function handleToggleStudyNotice(next: boolean) {
    try {
      if (next) {
        const granted = await ensureNotificationPermission();
        if (!granted) {
          alertNotificationDenied(
            "休憩や目標到達など、学習中の出来事をお知らせできます",
          );
          return;
        }
      }
      await settingsRepo.updateStudyNoticeEnabled(next);
      await refreshNotifications();
      await reload();
    } catch (e) {
      console.error("学習中のお知らせ設定の更新に失敗しました", e);
    }
  }

  return (
    <ThemedView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        {/* まとめてONにする入口。状態は持たないので、3つともONのときは出さない */}
        {allEnabled ? null : (
          <SettingSection>
            <SettingRow
              first
              label="すべてのお知らせを受け取る"
              note="下の3つをまとめてオンにします"
              onPress={() => void handleEnableAll()}
            />
          </SettingSection>
        )}

        {/* 画面名が「通知」なので、セクション見出しは重ねずに置く */}
        <SettingSection>
          <SettingRow
            first
            label="学習開始の通知"
            note="設定した時刻に、そっと学習の始まりをお知らせします"
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
          <SettingRow
            label="予定のお知らせ"
            note="カレンダーの予定の1週間前と前日の昼に、そっとお知らせします"
            right={
              <Switch
                value={eventNoticeEnabled}
                onValueChange={(v) => void handleToggleEventNotice(v)}
              />
            }
          />
          <SettingRow
            label="学習中のお知らせ"
            note="アプリを離れているあいだ、休憩の始まりと終わり・目標に届いたとき・夜が明けたときをお知らせします"
            right={
              <Switch
                value={studyNoticeEnabled}
                onValueChange={(v) => void handleToggleStudyNotice(v)}
              />
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
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: Spacing.four, paddingBottom: Spacing.six },
});
