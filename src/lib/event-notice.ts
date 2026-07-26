// カレンダーの予定（4章）のお知らせを組み立てる純関数。
//
// 予定日（暦日 'YYYY-MM-DD'）ごとに「1週間前」「前日」の**12:00**に鳴らす通知を作る。
// すでに過ぎた発火時刻は捨てる（例: 3日後の予定なら1週間前の通知はもう過ぎているので前日だけ）。
// 発火時刻・文面は画面を見ても正しさが分からず、間違えると誤った時刻に通知が飛ぶため、
// ここに集約してテストで固定する。文面はコンセプト準拠（急かさない・感嘆符なし）。

/** OSへ登録する予定通知1件（fireAt にその内容で鳴らす） */
export type EventNotice = {
  /** 発火する日時（ローカル） */
  fireAt: Date;
  title: string;
  body: string;
};

/** 予定通知を鳴らす時刻（時）。昼にそっと知らせる（夜の学習中＝深夜を避ける） */
export const EVENT_NOTICE_HOUR = 12;

/**
 * 予定の一覧と現在時刻から、これから鳴らす予定通知を組み立てる。
 * @param events 予定（event_date は 'YYYY-MM-DD'）
 * @param nowInstant 現在時刻（この時刻より後の発火だけ残す）
 */
export function buildEventNotices(
  events: { event_date: string; title: string }[],
  nowInstant: Date,
): EventNotice[] {
  const nowMs = nowInstant.getTime();
  const notices: EventNotice[] = [];

  for (const ev of events) {
    const [y, m, d] = ev.event_date.split("-").map(Number);
    if (!y || !m || !d) continue; // 不正な日付は無視する

    // その暦日の「◯日前の 12:00」（JSの Date は日の繰り下がり＝前月へも正しく丸める）
    const weekBefore = new Date(y, m - 1, d - 7, EVENT_NOTICE_HOUR, 0, 0, 0);
    const dayBefore = new Date(y, m - 1, d - 1, EVENT_NOTICE_HOUR, 0, 0, 0);

    if (weekBefore.getTime() > nowMs) {
      notices.push({
        fireAt: weekBefore,
        title: "予定のお知らせ",
        body: `${m}月${d}日は「${ev.title}」の予定です。あと1週間、今夜も無理なく。`,
      });
    }
    if (dayBefore.getTime() > nowMs) {
      notices.push({
        fireAt: dayBefore,
        title: "予定のお知らせ",
        body: `明日は「${ev.title}」の予定です。今夜も少しだけ。`,
      });
    }
  }

  return notices;
}
