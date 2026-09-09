import {
  getSeason,
  getTimeOfDay,
  getTimeOfDayStartMinutes,
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

describe("getTimeOfDay 春（sunrise4:45/day5:45/sunset17:30/night18:30/latenight23:00）", () => {
  const tod = (hh: number, mm: number): TimeOfDay =>
    getTimeOfDay(at(4, 1, hh, mm));
  test("04:44 は latenight（日跨ぎの尾）", () =>
    expect(tod(4, 44)).toBe("latenight"));
  test("04:45 ちょうどは sunrise", () => expect(tod(4, 45)).toBe("sunrise"));
  test("05:44 は sunrise", () => expect(tod(5, 44)).toBe("sunrise"));
  test("05:45 ちょうどは day", () => expect(tod(5, 45)).toBe("day"));
  test("17:29 は day", () => expect(tod(17, 29)).toBe("day"));
  test("17:30 ちょうどは sunset", () => expect(tod(17, 30)).toBe("sunset"));
  test("18:29 は sunset", () => expect(tod(18, 29)).toBe("sunset"));
  test("18:30 ちょうどは night", () => expect(tod(18, 30)).toBe("night"));
  test("22:59 は night（latenight開始の直前）", () =>
    expect(tod(22, 59)).toBe("night"));
  test("23:00 ちょうどは latenight", () =>
    expect(tod(23, 0)).toBe("latenight"));
  test("00:00 は latenight", () => expect(tod(0, 0)).toBe("latenight"));
});

describe("getTimeOfDay 夏（sunrise4:10/day5:10/sunset18:15/night19:30/latenight23:00）", () => {
  const tod = (hh: number, mm: number): TimeOfDay =>
    getTimeOfDay(at(7, 1, hh, mm));
  test("04:09 は latenight", () => expect(tod(4, 9)).toBe("latenight"));
  test("04:10 ちょうどは sunrise", () => expect(tod(4, 10)).toBe("sunrise"));
  test("05:09 は sunrise", () => expect(tod(5, 9)).toBe("sunrise"));
  test("05:10 ちょうどは day", () => expect(tod(5, 10)).toBe("day"));
  test("18:14 は day", () => expect(tod(18, 14)).toBe("day"));
  test("18:15 ちょうどは sunset", () => expect(tod(18, 15)).toBe("sunset"));
  test("19:29 は sunset", () => expect(tod(19, 29)).toBe("sunset"));
  test("19:30 ちょうどは night", () => expect(tod(19, 30)).toBe("night"));
  test("23:00 は latenight", () => expect(tod(23, 0)).toBe("latenight"));
});

describe("getTimeOfDay 秋（sunrise5:20/day6:20/sunset16:40/night17:45）", () => {
  const tod = (hh: number, mm: number): TimeOfDay =>
    getTimeOfDay(at(10, 1, hh, mm));
  test("05:19 は latenight", () => expect(tod(5, 19)).toBe("latenight"));
  test("05:20 ちょうどは sunrise", () => expect(tod(5, 20)).toBe("sunrise"));
  test("06:19 は sunrise", () => expect(tod(6, 19)).toBe("sunrise"));
  test("06:20 ちょうどは day", () => expect(tod(6, 20)).toBe("day"));
  test("16:39 は day", () => expect(tod(16, 39)).toBe("day"));
  test("16:40 ちょうどは sunset", () => expect(tod(16, 40)).toBe("sunset"));
  test("17:44 は sunset", () => expect(tod(17, 44)).toBe("sunset"));
  test("17:45 ちょうどは night", () => expect(tod(17, 45)).toBe("night"));
});

describe("getTimeOfDay 冬（sunrise6:10/day7:10/sunset16:00/night17:10/latenight23:00）", () => {
  const tod = (hh: number, mm: number): TimeOfDay =>
    getTimeOfDay(at(1, 15, hh, mm));
  test("06:09 は latenight（sunrise開始の直前）", () =>
    expect(tod(6, 9)).toBe("latenight"));
  test("06:10 ちょうどは sunrise", () => expect(tod(6, 10)).toBe("sunrise"));
  test("07:09 は sunrise", () => expect(tod(7, 9)).toBe("sunrise"));
  test("07:10 ちょうどは day", () => expect(tod(7, 10)).toBe("day"));
  test("15:59 は day", () => expect(tod(15, 59)).toBe("day"));
  test("16:00 ちょうどは sunset", () => expect(tod(16, 0)).toBe("sunset"));
  test("17:09 は sunset", () => expect(tod(17, 9)).toBe("sunset"));
  test("17:10 ちょうどは night", () => expect(tod(17, 10)).toBe("night"));
});

// 時間帯の開始時刻（開発用の時刻切り替えで代表時刻として使う）。
// 「その時刻へ合わせたら、狙った時間帯になる」ことが要になるため、
// 全季節×全5帯で getTimeOfDay と往復させて確かめる。
describe("getTimeOfDayStartMinutes（時間帯の開始時刻）", () => {
  const ALL: TimeOfDay[] = ["sunrise", "day", "sunset", "night", "latenight"];
  // 各季節の代表日（getSeason がその季節を返す月を選ぶ）
  const SEASON_DAYS: { label: string; month: number; day: number }[] = [
    { label: "春", month: 4, day: 1 },
    { label: "夏", month: 7, day: 1 },
    { label: "秋", month: 10, day: 1 },
    { label: "冬", month: 1, day: 15 },
  ];

  for (const s of SEASON_DAYS) {
    for (const tod of ALL) {
      test(`${s.label}: ${tod} の開始時刻に合わせると ${tod} になる`, () => {
        const base = at(s.month, s.day, 12, 0);
        const minutes = getTimeOfDayStartMinutes(tod, base);
        const moved = at(
          s.month,
          s.day,
          Math.floor(minutes / 60),
          minutes % 60,
        );
        expect(getTimeOfDay(moved)).toBe(tod);
      });
    }
  }

  test("春の各帯の開始時刻（スケジュール表どおり）", () => {
    const base = at(4, 1, 12, 0);
    expect(getTimeOfDayStartMinutes("sunrise", base)).toBe(4 * 60 + 45);
    expect(getTimeOfDayStartMinutes("day", base)).toBe(5 * 60 + 45);
    expect(getTimeOfDayStartMinutes("sunset", base)).toBe(17 * 60 + 30);
    expect(getTimeOfDayStartMinutes("night", base)).toBe(18 * 60 + 30);
    expect(getTimeOfDayStartMinutes("latenight", base)).toBe(23 * 60);
  });

  test("季節で開始時刻が変わる（冬の sunrise は春より遅い）", () => {
    expect(getTimeOfDayStartMinutes("sunrise", at(1, 15, 12, 0))).toBe(
      6 * 60 + 10,
    );
    expect(getTimeOfDayStartMinutes("sunrise", at(4, 1, 12, 0))).toBe(
      4 * 60 + 45,
    );
  });
});
