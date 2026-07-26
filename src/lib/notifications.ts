// OSローカル通知の薄いラッパ（要件12章・4.3 / UC 10.3・12.1）。
//
// 発火はOSが行い、アプリは時刻を監視しない。登録する通知は2種類:
//   ・学習開始リマインド（毎日同時刻。要件12章）
//   ・予定のお知らせ（各予定の1週間前・前日の12:00。要件4.3）
// どちらの変更でも「全解除 → 全登録し直し」で足りる（識別子の管理は持たない）。
// これにより、片方の再登録でもう片方が消える事故を避ける。
//
// 文面の組み立て（学習開始＝18:00前後の出し分け／予定＝1週間前・前日）は純関数
// notification-message.ts・event-notice.ts に委ねる。ここはOSとのやり取りだけを担う。
// DBを読んで内容を組み立てる調整は notification-sync.ts が行う。

import * as Notifications from "expo-notifications";
import type { EventNotice } from "./event-notice";
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
 * 登録済みの通知をすべて解除し、渡された内容で登録し直す（全消し→全再登録。要件12章・4.3）。
 * 学習開始リマインド（毎日同時刻）と予定通知（日時指定）を1つの窓口でまとめて管理する。
 * @param reminderTime 学習開始リマインドの時刻 'HH:MM'。null なら出さない
 * @param eventNotices 予定のお知らせ（それぞれ fireAt に鳴らす）
 */
export async function applyNotificationSchedule({
  reminderTime,
  eventNotices,
}: {
  reminderTime: string | null;
  eventNotices: EventNotice[];
}): Promise<void> {
  await Notifications.cancelAllScheduledNotificationsAsync();

  if (reminderTime) {
    const [hour, minute] = reminderTime.split(":").map(Number);
    const content = buildNotificationContent(reminderTime);
    await Notifications.scheduleNotificationAsync({
      content: { title: content.title, body: content.body },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DAILY,
        hour,
        minute,
      },
    });
  }

  for (const n of eventNotices) {
    await Notifications.scheduleNotificationAsync({
      content: { title: n.title, body: n.body },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: n.fireAt,
      },
    });
  }
}
