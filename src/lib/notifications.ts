// 学習開始予定のOSローカル通知（要件12章 / UC 10.3・12.1）。
//
// expo-notifications の薄いラッパ。発火はOSが行い、アプリは時刻を監視しない。
// 設定保存時にスケジュール登録し、OFF・時刻変更時は解除・再登録する。
//
// 本アプリが登録する通知は「毎日同時刻の学習開始リマインド」1件だけのため、
// 再登録は「全解除 → 登録し直し」で足りる（識別子の管理は持たない）。
//
// 文面の出し分け（18:00前はカウントダウン／以降は通常）は純関数
// notification-message.ts に委ねる。ここはOSとのやり取りだけを担う。

import * as Notifications from "expo-notifications";
import { buildNotificationContent } from "./notification-message";

// フォアグラウンド時も通知を表示する（音は鳴らさない＝アプリ内の静けさを保つ）。
// モジュール読み込み時に一度だけ設定する
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

/**
 * 通知許可を確保する（要件12章）。
 * 既に許可済みなら何もせず true。未取得で要求可能なら要求する。
 * @returns 許可されていれば true。拒否・要求不可なら false
 */
export async function ensureNotificationPermission(): Promise<boolean> {
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  if (!current.canAskAgain) return false;
  const requested = await Notifications.requestPermissionsAsync();
  return requested.granted;
}

/**
 * 毎日同時刻の学習開始リマインドを登録し直す（要件12章）。
 * 既存の登録を全解除してから、指定時刻で1件登録する。
 * @param time 'HH:MM'（許容範囲の検証は呼び出し側で済ませること）
 */
export async function scheduleDailyReminder(time: string): Promise<void> {
  await cancelReminder();
  const [hour, minute] = time.split(":").map(Number);
  const content = buildNotificationContent(time);
  await Notifications.scheduleNotificationAsync({
    content: { title: content.title, body: content.body },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DAILY,
      hour,
      minute,
    },
  });
}

/** 登録済みの通知をすべて解除する（通知OFF時。要件12章） */
export async function cancelReminder(): Promise<void> {
  await Notifications.cancelAllScheduledNotificationsAsync();
}
