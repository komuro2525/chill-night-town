// 入力検証の検証。要件1.2 / 3.1 / 3.4 / 5.2 / 12章
//
// 値域は docs（要件定義書）とスキーマの CHECK 制約が正。
// ここではその境界（ちょうど・1つ外側）を固定し、ドキュメントとのズレを検出する。

import {
  validateDailyGoalMinutes,
  validateExtensionMinutes,
  validateMemo,
  validateNickname,
  validateNotificationTime,
  validatePlannedMinutes,
  validatePomodoroBreakMinutes,
  validatePomodoroLoopCount,
  validatePomodoroWorkMinutes,
  validateTagName,
} from "../validation";

/** 検証が通ったか（null = エラーなし） */
const ok = (result: string | null) => result === null;

describe("validateNickname（必須・20文字以内）", () => {
  it("空・空白のみは弾く", () => {
    expect(ok(validateNickname(""))).toBe(false);
    expect(ok(validateNickname("   "))).toBe(false);
  });

  it("20文字ちょうどは通り、21文字は弾く", () => {
    expect(ok(validateNickname("あ".repeat(20)))).toBe(true);
    expect(ok(validateNickname("あ".repeat(21)))).toBe(false);
  });
});

describe("validateDailyGoalMinutes（10〜720分）", () => {
  it.each([
    ["9分は値域外", "9", false],
    ["10分ちょうどは通る", "10", true],
    ["720分ちょうどは通る", "720", true],
    ["721分は値域外", "721", false],
  ])("%s", (_label, input, expected) => {
    expect(ok(validateDailyGoalMinutes(input))).toBe(expected);
  });

  it("未入力・数字以外は弾く", () => {
    expect(ok(validateDailyGoalMinutes(""))).toBe(false);
    expect(ok(validateDailyGoalMinutes("六十"))).toBe(false);
    expect(ok(validateDailyGoalMinutes("60分"))).toBe(false);
    expect(ok(validateDailyGoalMinutes("-60"))).toBe(false);
  });
});

describe("validatePlannedMinutes（黙々モードの予定学習時間・10〜660分）", () => {
  it.each([
    ["9", false],
    ["10", true],
    ["660", true],
    ["661", false],
  ])("%s分 → 通る:%s", (input, expected) => {
    expect(ok(validatePlannedMinutes(input))).toBe(expected);
  });
});

describe("validatePomodoro*（作業5〜120分 / 休憩1〜30分 / 繰り返し1〜10回）", () => {
  it("作業時間の境界", () => {
    expect(ok(validatePomodoroWorkMinutes("4"))).toBe(false);
    expect(ok(validatePomodoroWorkMinutes("5"))).toBe(true);
    expect(ok(validatePomodoroWorkMinutes("120"))).toBe(true);
    expect(ok(validatePomodoroWorkMinutes("121"))).toBe(false);
  });

  it("休憩時間の境界", () => {
    expect(ok(validatePomodoroBreakMinutes("0"))).toBe(false);
    expect(ok(validatePomodoroBreakMinutes("1"))).toBe(true);
    expect(ok(validatePomodoroBreakMinutes("30"))).toBe(true);
    expect(ok(validatePomodoroBreakMinutes("31"))).toBe(false);
  });

  it("繰り返し回数の境界", () => {
    expect(ok(validatePomodoroLoopCount("0"))).toBe(false);
    expect(ok(validatePomodoroLoopCount("1"))).toBe(true);
    expect(ok(validatePomodoroLoopCount("10"))).toBe(true);
    expect(ok(validatePomodoroLoopCount("11"))).toBe(false);
  });

  it("繰り返し回数のメッセージは「分」ではなく「回」で伝える", () => {
    expect(validatePomodoroLoopCount("11")).toContain("回");
  });
});

describe("validateExtensionMinutes（延長宣言・5〜120分）", () => {
  it.each([
    ["4", false],
    ["5", true],
    ["120", true],
    ["121", false],
  ])("%s分 → 通る:%s", (input, expected) => {
    expect(ok(validateExtensionMinutes(input))).toBe(expected);
  });
});

describe("validateTagName（必須・20文字以内）", () => {
  it("空は弾く", () => {
    expect(ok(validateTagName("  "))).toBe(false);
  });

  it("20文字ちょうどは通り、21文字は弾く", () => {
    expect(ok(validateTagName("あ".repeat(20)))).toBe(true);
    expect(ok(validateTagName("あ".repeat(21)))).toBe(false);
  });
});

describe("validateMemo（任意・500文字以内）", () => {
  it("空は通る（任意項目のため）", () => {
    expect(ok(validateMemo(""))).toBe(true);
  });

  it("500文字ちょうどは通り、501文字は弾く", () => {
    expect(ok(validateMemo("あ".repeat(500)))).toBe(true);
    expect(ok(validateMemo("あ".repeat(501)))).toBe(false);
  });
});

describe("validateNotificationTime（17:30〜翌4:30・要件12章）", () => {
  it("形式が HH:MM でなければ弾く", () => {
    expect(ok(validateNotificationTime("21"))).toBe(false);
    expect(ok(validateNotificationTime("2100"))).toBe(false);
    expect(ok(validateNotificationTime("25:00"))).toBe(false);
    expect(ok(validateNotificationTime("21:60"))).toBe(false);
  });

  it.each([
    ["17:29は範囲外", "17:29", false],
    ["17:30ちょうどは通る（夜の準備を促す通知）", "17:30", true],
    ["21:00は通る", "21:00", true],
    ["23:59は通る", "23:59", true],
    ["00:00は通る（日付をまたぐ）", "00:00", true],
    ["04:30ちょうどは通る", "04:30", true],
    ["04:31は範囲外（5:00の自動終了に配慮）", "04:31", false],
    ["12:00は範囲外（タイマーを開始できない時間）", "12:00", false],
  ])("%s", (_label, input, expected) => {
    expect(ok(validateNotificationTime(input))).toBe(expected);
  });
});
