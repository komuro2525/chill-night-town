import {
  getSeason,
  getTimeOfDay,
  type TimeOfDay,
} from "../background-schedule";

// 背景の「季節×時間帯」判定の検証（docs/背景_季節×時間帯スケジュール.md）。
//
// 各時間帯の切り替わり境界は季節で変わり、画面を見ても正しさが分からない。
// 差し替え後は背景表示がこの結果に乗るため、境界（下限ちょうど・その手前）を固定する。

/** ローカル日時を作る（月は1〜12で指定） */
function at(month: number, day: number, hh: number, mm: number): Date {
  return new Date(2026, month - 1, day, hh, mm, 0, 0);
}

describe("getSeason（月で決まる季節）", () => {
  test("3〜5月は春", () => {
    expect(getSeason(at(3, 1, 12, 0))).toBe("spring");
    expect(getSeason(at(5, 31, 12, 0))).toBe("spring");
  });
  test("6〜8月は夏", () => {
    expect(getSeason(at(6, 1, 12, 0))).toBe("summer");
    expect(getSeason(at(8, 15, 12, 0))).toBe("summer");
  });
  test("9〜11月は秋", () => {
    expect(getSeason(at(9, 1, 12, 0))).toBe("autumn");
    expect(getSeason(at(11, 30, 12, 0))).toBe("autumn");
  });
  test("12・1・2月は冬", () => {
    expect(getSeason(at(12, 1, 12, 0))).toBe("winter");
    expect(getSeason(at(1, 15, 12, 0))).toBe("winter");
    expect(getSeason(at(2, 28, 12, 0))).toBe("winter");
  });
});

describe("getTimeOfDay 春（sunrise5/day7/sunset17/night19/latenight23）", () => {
  const tod = (hh: number, mm: number): TimeOfDay => getTimeOfDay(at(4, 1, hh, mm));
  test("04:59 は latenight（日跨ぎの尾）", () => expect(tod(4, 59)).toBe("latenight"));
  test("05:00 ちょうどは sunrise", () => expect(tod(5, 0)).toBe("sunrise"));
  test("06:59 は sunrise", () => expect(tod(6, 59)).toBe("sunrise"));
  test("07:00 ちょうどは day", () => expect(tod(7, 0)).toBe("day"));
  test("16:59 は day", () => expect(tod(16, 59)).toBe("day"));
  test("17:00 ちょうどは sunset", () => expect(tod(17, 0)).toBe("sunset"));
  test("18:59 は sunset", () => expect(tod(18, 59)).toBe("sunset"));
  test("19:00 ちょうどは night", () => expect(tod(19, 0)).toBe("night"));
  test("22:59 は night（latenight開始の直前）", () => expect(tod(22, 59)).toBe("night"));
  test("23:00 ちょうどは latenight", () => expect(tod(23, 0)).toBe("latenight"));
  test("00:00 は latenight", () => expect(tod(0, 0)).toBe("latenight"));
});

describe("getTimeOfDay 夏（sunrise4/day6/sunset18/night20/latenight23）", () => {
  const tod = (hh: number, mm: number): TimeOfDay => getTimeOfDay(at(7, 1, hh, mm));
  test("03:59 は latenight", () => expect(tod(3, 59)).toBe("latenight"));
  test("04:00 は sunrise", () => expect(tod(4, 0)).toBe("sunrise"));
  test("06:00 は day", () => expect(tod(6, 0)).toBe("day"));
  test("18:00 は sunset", () => expect(tod(18, 0)).toBe("sunset"));
  test("20:00 は night", () => expect(tod(20, 0)).toBe("night"));
  test("23:00 は latenight", () => expect(tod(23, 0)).toBe("latenight"));
});

describe("getTimeOfDay 秋（30分刻みの境界）", () => {
  const tod = (hh: number, mm: number): TimeOfDay => getTimeOfDay(at(10, 1, hh, mm));
  test("16:29 は day", () => expect(tod(16, 29)).toBe("day"));
  test("16:30 ちょうどは sunset", () => expect(tod(16, 30)).toBe("sunset"));
  test("18:29 は sunset", () => expect(tod(18, 29)).toBe("sunset"));
  test("18:30 ちょうどは night", () => expect(tod(18, 30)).toBe("night"));
});

describe("getTimeOfDay 冬（sunrise6/day8/sunset16/night18/latenight23）", () => {
  const tod = (hh: number, mm: number): TimeOfDay => getTimeOfDay(at(1, 15, hh, mm));
  test("05:59 は latenight（sunrise開始の直前）", () => expect(tod(5, 59)).toBe("latenight"));
  test("06:00 は sunrise", () => expect(tod(6, 0)).toBe("sunrise"));
  test("08:00 は day", () => expect(tod(8, 0)).toBe("day"));
  test("16:00 は sunset", () => expect(tod(16, 0)).toBe("sunset"));
  test("18:00 は night", () => expect(tod(18, 0)).toBe("night"));
});
