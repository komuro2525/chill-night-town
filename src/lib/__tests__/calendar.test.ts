// カレンダー表示の純関数の検証。要件4章
//
// グリッド生成は月初の曜日やうるう年でずれやすく、画面を見ても正しさが分からない。
// 最頻の算出は同数時の tie-break で挙動が変わる。境界を固定する。

import {
  getMonthGrid,
  getMonthRange,
  pickMostFrequent,
  shiftMonth,
} from "../calendar";

/** null を除いた実日付のセルだけ取り出す */
function days(grid: ReturnType<typeof getMonthGrid>) {
  return grid.filter((c) => c !== null).map((c) => c!.day);
}

describe("getMonthGrid（月グリッドの生成）", () => {
  it("グリッドは常に7の倍数（長方形）になる", () => {
    for (const [y, m] of [
      [2026, 1],
      [2026, 2],
      [2026, 4],
      [2028, 2],
    ] as const) {
      expect(getMonthGrid(y, m).length % 7).toBe(0);
    }
  });

  it("先頭は月初の曜日ぶん空セルで詰める", () => {
    // 2026-01-01 は木曜（getDay=4）→ 先頭に4つの null
    const grid = getMonthGrid(2026, 1);
    expect(grid.slice(0, 4)).toEqual([null, null, null, null]);
    expect(grid[4]).toMatchObject({ day: 1, dateKey: "2026-01-01" });
  });

  it("月初が日曜なら先頭に空セルは無い", () => {
    // 2026-03-01 は日曜（getDay=0）
    const grid = getMonthGrid(2026, 3);
    expect(grid[0]).toMatchObject({ day: 1, dateKey: "2026-03-01" });
  });

  it("月の日数を正しく並べる（31日・30日）", () => {
    expect(days(getMonthGrid(2026, 1)).at(-1)).toBe(31);
    expect(days(getMonthGrid(2026, 4)).at(-1)).toBe(30);
  });

  it("平年の2月は28日", () => {
    expect(days(getMonthGrid(2026, 2)).at(-1)).toBe(28);
  });

  it("うるう年の2月は29日", () => {
    expect(days(getMonthGrid(2028, 2)).at(-1)).toBe(29);
  });

  it("dateKey は study_date と同じ 'YYYY-MM-DD' 形式（0埋め）", () => {
    const grid = getMonthGrid(2026, 1);
    const first = grid.find((c) => c?.day === 5);
    expect(first).toMatchObject({ dateKey: "2026-01-05" });
  });
});

describe("getMonthRange（集計の絞り込み範囲）", () => {
  it("月初〜月末の study_date を返す", () => {
    expect(getMonthRange(2026, 1)).toEqual({
      start: "2026-01-01",
      end: "2026-01-31",
    });
  });

  it("平年2月は末日28、うるう年2月は29", () => {
    expect(getMonthRange(2026, 2).end).toBe("2026-02-28");
    expect(getMonthRange(2028, 2).end).toBe("2028-02-29");
  });
});

describe("shiftMonth（月の切り替え・年またぎ）", () => {
  it("翌月へ進む", () => {
    expect(shiftMonth(2026, 1, 1)).toEqual({ year: 2026, month: 2 });
  });

  it("12月から翌年1月へ進む", () => {
    expect(shiftMonth(2026, 12, 1)).toEqual({ year: 2027, month: 1 });
  });

  it("1月から前年12月へ戻る", () => {
    expect(shiftMonth(2026, 1, -1)).toEqual({ year: 2025, month: 12 });
  });
});

describe("pickMostFrequent（最頻の算出・要件4.2）", () => {
  const order = new Map([
    [1, 1],
    [2, 2],
    [3, 3],
  ]);

  it("最も多い要素を返す", () => {
    const counts = new Map([
      [1, 2],
      [2, 5],
      [3, 1],
    ]);
    expect(pickMostFrequent(counts, order)).toBe(2);
  });

  it("同数のときは display_order の若い方を選ぶ（tie-break）", () => {
    const counts = new Map([
      [3, 3],
      [1, 3],
      [2, 3],
    ]);
    // 全部3回 → order が最小の 1 を選ぶ
    expect(pickMostFrequent(counts, order)).toBe(1);
  });

  it("空なら null", () => {
    expect(pickMostFrequent(new Map(), order)).toBeNull();
  });

  it("順序が未知の要素は後回しになる", () => {
    const counts = new Map([
      [9, 2],
      [1, 2],
    ]);
    // 同数。id=1 は order=1、id=9 は order 不明（Infinity）→ 1 を選ぶ
    expect(pickMostFrequent(counts, order)).toBe(1);
  });
});
