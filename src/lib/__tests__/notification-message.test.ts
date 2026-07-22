import {
  buildNotificationContent,
  isCountdownTime,
} from "../notification-message";

// 学習開始予定の通知の文面の出し分け（要件12章 / UC 12.1）。
//
// 18:00より前（17:30〜17:59）はカウントダウン、18:00以降は通常リマインド。
// 境界（17:59＝あと1分／18:00ちょうど＝通常）を取り違えると、開始できない時間に
// 「開始しましょう」と促す不整合が起きる。通知はOSが後で出すため画面で気づけない。

describe("isCountdownTime（18:00より前か）", () => {
  test("17:30 はカウントダウン対象（範囲の下限）", () => {
    expect(isCountdownTime("17:30")).toBe(true);
  });

  test("17:59 はカウントダウン対象（範囲の上限）", () => {
    expect(isCountdownTime("17:59")).toBe(true);
  });

  test("18:00 ちょうどはカウントダウンではない（通常リマインド）", () => {
    expect(isCountdownTime("18:00")).toBe(false);
  });

  test("21:00（夜間帯）は通常", () => {
    expect(isCountdownTime("21:00")).toBe(false);
  });

  test("翌4:30（深夜帯）は通常", () => {
    expect(isCountdownTime("04:30")).toBe(false);
  });
});

describe("buildNotificationContent（文面の組み立て）", () => {
  test("17:30 は「あと30分」のカウントダウン", () => {
    const c = buildNotificationContent("17:30");
    expect(c.body).toContain("30分");
    expect(c.title).toBe("もうすぐ夜がひらきます");
  });

  test("17:59 は「あと1分」のカウントダウン（境界）", () => {
    const c = buildNotificationContent("17:59");
    expect(c.body).toContain("1分");
  });

  test("18:00 ちょうどは通常の開始リマインド", () => {
    const c = buildNotificationContent("18:00");
    expect(c.title).toBe("夜がひらきました");
    expect(c.body).not.toContain("あと");
  });

  test("21:00 は通常の開始リマインド", () => {
    const c = buildNotificationContent("21:00");
    expect(c.title).toBe("夜がひらきました");
  });

  test("翌4:30 は通常の開始リマインド", () => {
    const c = buildNotificationContent("04:30");
    expect(c.title).toBe("夜がひらきました");
  });

  test("感嘆符を使わない（コンセプト準拠）", () => {
    for (const time of ["17:30", "17:59", "18:00", "21:00", "04:30"]) {
      const c = buildNotificationContent(time);
      expect(c.title + c.body).not.toMatch(/[!！]/);
    }
  });
});
