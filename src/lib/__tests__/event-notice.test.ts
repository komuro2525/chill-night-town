import { buildEventNotices, EVENT_NOTICE_HOUR } from "../event-notice";

// 予定通知の組み立て（要件4.3）。1週間前・前日の12:00、過ぎた分は捨てる。
// 発火時刻・件数を取り違えると誤った時刻に通知が飛ぶため固定する。

/** ローカル日時を作る（月は1〜12） */
function at(month: number, day: number, hh = 0, mm = 0): Date {
  return new Date(2026, month - 1, day, hh, mm, 0, 0);
}

describe("buildEventNotices（予定の通知を組み立てる・要件4.3）", () => {
  test("10日後の予定: 1週間前と前日の2件、いずれも12:00", () => {
    // 現在 8/1 10:00、予定 8/11 → 1週間前=8/4 12:00 / 前日=8/10 12:00
    const notices = buildEventNotices(
      [{ event_date: "2026-08-11", title: "テスト" }],
      at(8, 1, 10, 0),
    );
    expect(notices).toHaveLength(2);
    expect(notices[0].fireAt.getTime()).toBe(at(8, 4, EVENT_NOTICE_HOUR, 0).getTime());
    expect(notices[1].fireAt.getTime()).toBe(at(8, 10, EVENT_NOTICE_HOUR, 0).getTime());
    expect(notices[0].body).toContain("テスト");
  });

  test("1週間を切って登録: 1週間前は過ぎているので前日だけ", () => {
    // 現在 8/8 10:00、予定 8/11 → 1週間前=8/4（過去・捨てる）/ 前日=8/10 12:00
    const notices = buildEventNotices(
      [{ event_date: "2026-08-11", title: "面談" }],
      at(8, 8, 10, 0),
    );
    expect(notices).toHaveLength(1);
    expect(notices[0].fireAt.getTime()).toBe(at(8, 10, EVENT_NOTICE_HOUR, 0).getTime());
    expect(notices[0].body).toContain("明日");
  });

  test("前日12:00をちょうど過ぎていれば前日通知も出さない", () => {
    // 現在 8/10 12:00 ちょうど（> ではないので捨てる）、予定 8/11
    const notices = buildEventNotices(
      [{ event_date: "2026-08-11", title: "テスト" }],
      at(8, 10, EVENT_NOTICE_HOUR, 0),
    );
    expect(notices).toHaveLength(0);
  });

  test("当日・過去の予定: 通知は出さない", () => {
    const now = at(8, 11, 9, 0);
    expect(buildEventNotices([{ event_date: "2026-08-11", title: "当日" }], now)).toHaveLength(0);
    expect(buildEventNotices([{ event_date: "2026-08-01", title: "過去" }], now)).toHaveLength(0);
  });

  test("月をまたぐ前日: 9/1の前日は8/31 12:00", () => {
    const notices = buildEventNotices(
      [{ event_date: "2026-09-01", title: "月初" }],
      at(8, 30, 10, 0),
    );
    // 1週間前=8/25（過去）/ 前日=8/31 12:00
    expect(notices).toHaveLength(1);
    expect(notices[0].fireAt.getTime()).toBe(at(8, 31, EVENT_NOTICE_HOUR, 0).getTime());
  });

  test("複数の予定: それぞれ分の通知を作る", () => {
    const notices = buildEventNotices(
      [
        { event_date: "2026-08-20", title: "A" },
        { event_date: "2026-08-25", title: "B" },
      ],
      at(8, 1, 0, 0),
    );
    // A: 8/13,8/19 / B: 8/18,8/24 = 4件
    expect(notices).toHaveLength(4);
  });

  test("不正な日付は無視する", () => {
    expect(buildEventNotices([{ event_date: "bad", title: "x" }], at(8, 1))).toHaveLength(0);
  });
});
