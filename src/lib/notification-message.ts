// 学習開始予定の通知の文面（要件12章 / UC 12.1）。純関数。
//
// 通知時刻によって文面を出し分ける:
//   ・18:00より前（17:30〜17:59）… まだ学習を開始できない時間のため、通常の開始
//     リマインドではなく「夜が目覚めるまであと◯分」のカウントダウン。
//     ◯分＝18:00−通知時刻（スケジュール登録時に静的に確定できる）
//   ・18:00以降（〜翌4:30）… 通常の学習開始リマインド
//
// どちらになるかは時刻だけで決まり、画面を見ても分からない（通知はOSが後で出す）。
// 境界（17:59＝あと1分／18:00ちょうど＝通常）を取り違えると出し分けが崩れるため、
// ここに集約してテストで固定する。文面はコンセプト準拠（責めない・急かさない・感嘆符なし）。

import { NOTIFICATION_WINDOW } from "@/constants/domain";

/** OSへ渡す通知の内容 */
export type NotificationContent = {
  title: string;
  body: string;
};

/** 'HH:MM' を0時からの分に変換する（内部利用） */
function toMinutesOfDay(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

/**
 * 通知時刻が「18:00より前（カウントダウン対象）」か。
 * 17:30〜17:59 のときだけ true。18:00ちょうど以降・深夜帯は false。
 */
export function isCountdownTime(time: string): boolean {
  const minutes = toMinutesOfDay(time);
  return (
    minutes >= NOTIFICATION_WINDOW.START_MINUTES &&
    minutes < NOTIFICATION_WINDOW.NIGHT_WAKE_MINUTES
  );
}

/**
 * 通知時刻から文面を組み立てる（要件12章）。
 * @param time 'HH:MM'（許容範囲の検証は validateNotificationTime が担う）
 */
export function buildNotificationContent(time: string): NotificationContent {
  if (isCountdownTime(time)) {
    const remaining = NOTIFICATION_WINDOW.NIGHT_WAKE_MINUTES - toMinutesOfDay(time);
    return {
      title: "もうすぐ夜がひらきます",
      body: `夜が目覚めるまで、あと${remaining}分。`,
    };
  }
  return {
    title: "夜がひらきました",
    body: "今夜も、静かにはじめませんか。",
  };
}
