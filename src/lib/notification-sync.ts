// 通知の内容をDBから組み立てて、OSへ登録し直す調整層（要件12章・4.3）。
//
// 通知は「全消し→全再登録」で管理するため（notifications.ts）、変更のたびに
// 現在の設定と予定を読み直して丸ごと登録し直す。学習開始リマインドと予定通知の
// 両方を1つの窓口（refreshNotifications）に集約し、片方の変更で他方が消える事故を避ける。
//
// 呼び出す場面: 通知設定の変更・予定の追加/変更/削除・アプリ起動時（再起動後の張り直し）。

import { eventRepo, settingsRepo, userRepo } from "@/db/repositories";
import { now } from "./clock";
import { buildEventNotices } from "./event-notice";
import { applyNotificationSchedule } from "./notifications";

/**
 * 一度に登録する予定通知の上限。OS（特にiOS）の保留ローカル通知の上限（64件程度）を
 * 超えると一部が黙って登録されないため、発火が近い順に絞る（学習開始リマインドの1枠も残す）。
 */
const MAX_EVENT_NOTICES = 60;

/** now() の暦日を 'YYYY-MM-DD' で返す（予定の絞り込み基準。学習日ではなく暦日） */
function todayDateString(): string {
  const d = now();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

// 「全消し→全再登録」は途中に await を挟むため、同時に走ると互いの登録を消し合って
// 二重登録などが起きうる。直前の実行に continuation を繋いで必ず直列に実行する。
let queue: Promise<void> = Promise.resolve();

async function doRefresh(): Promise<void> {
  try {
    const setting = await settingsRepo.getNotificationSetting();
    const reminderTime =
      setting?.is_enabled === 1 ? setting.scheduled_time : null;

    let eventNotices: ReturnType<typeof buildEventNotices> = [];
    if (setting?.event_notice_enabled === 1) {
      const user = await userRepo.getUser();
      if (user) {
        const upcoming = await eventRepo.getUpcomingEvents(
          user.id,
          todayDateString(),
        );
        eventNotices = buildEventNotices(upcoming, now())
          // 発火が近い順に上限まで（OSの保留上限を超えないため）
          .sort((a, b) => a.fireAt.getTime() - b.fireAt.getTime())
          .slice(0, MAX_EVENT_NOTICES);
      }
    }

    await applyNotificationSchedule({ reminderTime, eventNotices });
  } catch (e) {
    console.error("通知の再登録に失敗しました", e);
  }
}

/**
 * 現在の通知設定と予定を読み直し、OSの通知登録を丸ごと張り直す（直列実行）。
 * - is_enabled: 学習開始リマインド（scheduled_time）
 * - event_notice_enabled: 各予定の1週間前・前日の12:00のお知らせ
 * 通知許可が無い等で失敗しても黙って握りつぶす（許可の要求は設定側で行う）。
 */
export function refreshNotifications(): Promise<void> {
  queue = queue.catch(() => {}).then(doRefresh);
  return queue;
}
