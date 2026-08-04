// 学習日（18:00〜翌5:00サイクル）の帰属ルールの検証。要件0章
//
// このアプリで最も間違えやすい規則。カレンダー・目標達成判定・経験値付与が
// すべてこの結果に乗るため、日付をまたぐケースを重点的に固定する。

import {
  clampNonNegativeSeconds,
  formatDateKey,
  formatMinutes,
  getStudyDate,
  isCurrentStudyDay,
  isNightTime,
} from "../study-day";

const at = (iso: string) => new Date(iso);

describe("getStudyDate（学習日の帰属）", () => {
  it("夜に開始した場合はその日に帰属する", () => {
    expect(getStudyDate(new Date("2026-01-10T23:30:00"))).toBe("2026-01-10");
  });

  it("日付をまたいだ深夜は前夜（開始した夜）に帰属する", () => {
    // 要件0章の例: 1/10 23:30開始 → 翌1:30終了 は「1/10の記録」
    expect(getStudyDate(new Date("2026-01-11T01:30:00"))).toBe("2026-01-10");
  });

  it("4:59はまだ前夜に帰属する", () => {
    expect(getStudyDate(new Date("2026-01-11T04:59:59"))).toBe("2026-01-10");
  });

  it("5:00ちょうどからは当日に帰属する（サイクルの切れ目）", () => {
    expect(getStudyDate(new Date("2026-01-11T05:00:00"))).toBe("2026-01-11");
  });

  it("月をまたぐ深夜でも前日へ正しく戻る", () => {
    expect(getStudyDate(new Date("2026-03-01T00:30:00"))).toBe("2026-02-28");
  });

  it("年をまたぐ深夜でも前日へ正しく戻る", () => {
    expect(getStudyDate(new Date("2026-01-01T02:00:00"))).toBe("2025-12-31");
  });

  it("うるう年の3/1深夜は2/29に帰属する", () => {
    expect(getStudyDate(new Date("2028-03-01T03:00:00"))).toBe("2028-02-29");
  });

  it("昼間は「これから始まる夜」として当日に帰属する（暫定仕様）", () => {
    expect(getStudyDate(new Date("2026-01-11T12:00:00"))).toBe("2026-01-11");
  });
});

describe("isCurrentStudyDay（その夜がまだ続いているか・要件2.5 / 2.6）", () => {
  // 天気の選び直しと写真の撮り直しが「5:00まで」に限られる判定。
  // 過ぎた夜を書き換えられると記録が事実でなくなるため、境界を固定する
  test("その夜のあいだは true（21:00）", () => {
    expect(isCurrentStudyDay("2026-01-10", at("2026-01-10T21:00:00"))).toBe(true);
  });

  test("日付をまたいでも同じ夜のあいだは true（翌1:30）", () => {
    expect(isCurrentStudyDay("2026-01-10", at("2026-01-11T01:30:00"))).toBe(true);
  });

  test("4:59はまだその夜", () => {
    expect(isCurrentStudyDay("2026-01-10", at("2026-01-11T04:59:59"))).toBe(true);
  });

  test("5:00ちょうどで夜が終わる", () => {
    expect(isCurrentStudyDay("2026-01-10", at("2026-01-11T05:00:00"))).toBe(false);
  });

  test("過ぎた夜は false（過去の記録は変更しない）", () => {
    expect(isCurrentStudyDay("2026-01-09", at("2026-01-10T21:00:00"))).toBe(false);
  });

  test("まだ来ていない夜も false", () => {
    expect(isCurrentStudyDay("2026-01-11", at("2026-01-10T21:00:00"))).toBe(false);
  });
});

describe("isNightTime（夜間帯の判定・要件2.3）", () => {
  it.each([
    ["18:00ちょうどは夜間帯（開始できる）", "2026-01-10T18:00:00", true],
    ["深夜は夜間帯", "2026-01-11T02:00:00", true],
    ["4:59は夜間帯", "2026-01-11T04:59:59", true],
    ["5:00ちょうどは夜間帯外（自動終了の時刻）", "2026-01-11T05:00:00", false],
    ["昼は夜間帯外", "2026-01-11T12:00:00", false],
    ["17:59は夜間帯外", "2026-01-10T17:59:59", false],
  ])("%s", (_label, iso, expected) => {
    expect(isNightTime(new Date(iso))).toBe(expected);
  });
});

describe("formatDateKey", () => {
  it("端末ローカル基準で YYYY-MM-DD に整形する（月日は0埋め）", () => {
    expect(formatDateKey(new Date(2026, 0, 5))).toBe("2026-01-05");
  });
});

describe("clampNonNegativeSeconds（端末時刻の変更への耐性・要件3.2）", () => {
  it("負の差分は0に丸める", () => {
    expect(clampNonNegativeSeconds(-120)).toBe(0);
  });

  it("0以上はそのまま返す", () => {
    expect(clampNonNegativeSeconds(0)).toBe(0);
    expect(clampNonNegativeSeconds(90)).toBe(90);
  });
});

describe("formatMinutes（学習時間の表示）", () => {
  it.each([
    [0, "0分"],
    [45, "45分"],
    [60, "1時間"],
    [95, "1時間35分"],
    [720, "12時間"],
  ])("%i分 → %s", (input, expected) => {
    expect(formatMinutes(input)).toBe(expected);
  });
});
