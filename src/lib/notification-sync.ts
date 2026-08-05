// 通知の内容をDBから組み立てて、OSへ登録し直す調整層（要件12章・4.3 / UC 12.2）。
//
// 通知は「全消し→全再登録」で管理するため（notifications.ts）、変更のたびに
// 現在の設定・予定・計測状態を読み直して丸ごと登録し直す。学習開始リマインド・予定通知・
// 学習中のお知らせを1つの窓口（refreshNotifications）に集約し、
// ひとつの変更で他が消える事故を避ける。
//
// 呼び出す場面: 通知設定の変更・予定の追加/変更/削除・アプリ起動時（再起動後の張り直し）・
// タイマーの開始/一時停止/再開/終了（予約を取り直すため）。

import {
  activeSessionRepo,
  eventRepo,
  sessionRepo,
  settingsRepo,
  userRepo,
} from "@/db/repositories";
import { now, nowMs } from "./clock";
import { buildEventNotices } from "./event-notice";
import { applyNotificationSchedule } from "./notifications";
import { buildStudyNotices } from "./study-notice";
import { getStudyDate } from "./study-day";

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

    // 学習中のお知らせ（UC 12.2）。計測中でなければ active_session が無く、
    // 一時停止中なら純関数側が空を返すため、ここでは分岐を持たない。
    //
    // 目標到達の判定にはその学習日の「保存済み」実績合計が要る。進行中のぶんは
    // active_session から純関数が算出するため、ここでは保存済みだけを渡す。
    // 学習日は**セッションの開始時刻**から求める（現在時刻ではない。要件0章。
    // 深夜0時をまたいで計測している最中に張り直すと、暦日で取れば別の日になってしまう）。
    let studyNotices: ReturnType<typeof buildStudyNotices> = [];
    if (setting?.study_notice_enabled === 1) {
      const active = await activeSessionRepo.getActiveSession();
      if (active) {
        const user = await userRepo.getUser();
        const studyDate = getStudyDate(new Date(Date.parse(active.start_time)));
        const summary = await sessionRepo.getStudyDaySummary(studyDate);
        studyNotices = buildStudyNotices({
          session: active,
          atMs: nowMs(),
          savedMinutes: summary.totalMinutes,
          goalMinutes: user?.daily_goal_minutes ?? 0,
        });
      }
    }

    await applyNotificationSchedule({
      reminderTime,
      eventNotices,
      studyNotices,
    });
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
