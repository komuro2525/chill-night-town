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

describe("getTimeOfDay 春（sunrise5:00/day7:00/sunset17:30/night18:30/latenight23:00）", () => {
  const tod = (hh: number, mm: number): TimeOfDay => getTimeOfDay(at(4, 1, hh, mm));
  test("04:59 は latenight（日跨ぎの尾）", () => expect(tod(4, 59)).toBe("latenight"));
  test("05:00 ちょうどは sunrise", () => expect(tod(5, 0)).toBe("sunrise"));
  test("07:00 ちょうどは day", () => expect(tod(7, 0)).toBe("day"));
  test("17:29 は day", () => expect(tod(17, 29)).toBe("day"));
  test("17:30 ちょうどは sunset", () => expect(tod(17, 30)).toBe("sunset"));
  test("18:29 は sunset", () => expect(tod(18, 29)).toBe("sunset"));
  test("18:30 ちょうどは night", () => expect(tod(18, 30)).toBe("night"));
  test("22:59 は night（latenight開始の直前）", () => expect(tod(22, 59)).toBe("night"));
  test("23:00 ちょうどは latenight", () => expect(tod(23, 0)).toBe("latenight"));
  test("00:00 は latenight", () => expect(tod(0, 0)).toBe("latenight"));
});

describe("getTimeOfDay 夏（sunrise4:00/day6:00/sunset18:15/night19:30/latenight23:00）", () => {
  const tod = (hh: number, mm: number): TimeOfDay => getTimeOfDay(at(7, 1, hh, mm));
  test("03:59 は latenight", () => expect(tod(3, 59)).toBe("latenight"));
  test("04:00 は sunrise", () => expect(tod(4, 0)).toBe("sunrise"));
  test("06:00 は day", () => expect(tod(6, 0)).toBe("day"));
  test("18:14 は day", () => expect(tod(18, 14)).toBe("day"));
  test("18:15 ちょうどは sunset", () => expect(tod(18, 15)).toBe("sunset"));
  test("19:29 は sunset", () => expect(tod(19, 29)).toBe("sunset"));
  test("19:30 ちょうどは night", () => expect(tod(19, 30)).toBe("night"));
  test("23:00 は latenight", () => expect(tod(23, 0)).toBe("latenight"));
});

describe("getTimeOfDay 秋（sunset16:40/night17:45）", () => {
  const tod = (hh: number, mm: number): TimeOfDay => getTimeOfDay(at(10, 1, hh, mm));
  test("16:39 は day", () => expect(tod(16, 39)).toBe("day"));
  test("16:40 ちょうどは sunset", () => expect(tod(16, 40)).toBe("sunset"));
  test("17:44 は sunset", () => expect(tod(17, 44)).toBe("sunset"));
  test("17:45 ちょうどは night", () => expect(tod(17, 45)).toBe("night"));
});

describe("getTimeOfDay 冬（sunrise6:00/day8:00/sunset16:00/night17:10/latenight23:00）", () => {
  const tod = (hh: number, mm: number): TimeOfDay => getTimeOfDay(at(1, 15, hh, mm));
  test("05:59 は latenight（sunrise開始の直前）", () => expect(tod(5, 59)).toBe("latenight"));
  test("06:00 は sunrise", () => expect(tod(6, 0)).toBe("sunrise"));
  test("08:00 は day", () => expect(tod(8, 0)).toBe("day"));
  test("15:59 は day", () => expect(tod(15, 59)).toBe("day"));
  test("16:00 ちょうどは sunset", () => expect(tod(16, 0)).toBe("sunset"));
  test("17:09 は sunset", () => expect(tod(17, 9)).toBe("sunset"));
  test("17:10 ちょうどは night", () => expect(tod(17, 10)).toBe("night"));
});
