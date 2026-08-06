// カレンダー表示の純関数の検証。要件4章
//
// グリッド生成は月初の曜日やうるう年でずれやすく、画面を見ても正しさが分からない。
// 最頻の算出は同数時の tie-break で挙動が変わる。境界を固定する。

import {
  getAlbumStage,
  getMonthGrid,
  getMonthRange,
  isMonthComplete,
  pickLongestNight,
  pickMostFrequent,
  shiftMonth,
  tallyStartHours,
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

describe("isMonthComplete（完了した過去月の判定）", () => {
  it("今日の学習日が属する当月は未完了（false）", () => {
    // 2026-01 の途中（15日）に見ている当月は、まだ終わっていない
    expect(isMonthComplete(2026, 1, "2026-01-15")).toBe(false);
  });

  it("月末当日はまだ未完了（末日を過ぎていない）", () => {
    expect(isMonthComplete(2026, 1, "2026-01-31")).toBe(false);
  });

  it("翌月に入っていれば前月は完了（true）", () => {
    expect(isMonthComplete(2026, 1, "2026-02-01")).toBe(true);
  });

  it("未来の月は未完了（false）", () => {
    expect(isMonthComplete(2026, 3, "2026-01-15")).toBe(false);
  });

  it("年をまたいでも判定できる", () => {
    // 2025-12 は 2026-01 時点で完了、2026-01 は 2025-12 時点で未完了
    expect(isMonthComplete(2025, 12, "2026-01-01")).toBe(true);
    expect(isMonthComplete(2026, 1, "2025-12-31")).toBe(false);
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

describe("getAlbumStage（アルバムの見え方の段階・要件4.2 / 4.4）", () => {
  it("月次: 5夜で2段階目、15夜で3段階目（境界のちょうどで上がる）", () => {
    expect(getAlbumStage(4, "monthly")).toBe(1);
    expect(getAlbumStage(5, "monthly")).toBe(2);
    expect(getAlbumStage(14, "monthly")).toBe(2);
    expect(getAlbumStage(15, "monthly")).toBe(3);
  });

  it("通算: 20夜で2段階目、60夜で3段階目", () => {
    expect(getAlbumStage(19, "overall")).toBe(1);
    expect(getAlbumStage(20, "overall")).toBe(2);
    expect(getAlbumStage(59, "overall")).toBe(2);
    expect(getAlbumStage(60, "overall")).toBe(3);
  });

  it("月次と通算でしきい値が異なる（1か月は最大31夜のため）", () => {
    // 同じ15夜でも、月次は3段階目・通算はまだ1段階目
    expect(getAlbumStage(15, "monthly")).toBe(3);
    expect(getAlbumStage(15, "overall")).toBe(1);
  });

  it("記録が無くても1段階目（欠けた状態にしない）", () => {
    expect(getAlbumStage(0, "monthly")).toBe(1);
    expect(getAlbumStage(0, "overall")).toBe(1);
  });

  it("上限は無く、増え続けても3段階目で止まる", () => {
    expect(getAlbumStage(1000, "overall")).toBe(3);
    expect(getAlbumStage(31, "monthly")).toBe(3);
  });
});

describe("tallyStartHours（よく灯していた時間帯・要件4.2）", () => {
  /** ローカル時刻で指定した日時を、DBと同じUTCのISO文字列にする */
  const iso = (y: number, m: number, d: number, h: number) =>
    new Date(y, m - 1, d, h, 30).toISOString();

  it("開始時刻をローカル時刻の時で数える（UTC文字列のまま数えない）", () => {
    // 保存はUTCのISO文字列。21時台に始めた記録は、時差に関わらず21時台に数える
    expect(tallyStartHours([iso(2026, 1, 10, 21), iso(2026, 1, 11, 21)])).toEqual([
      { hour: 21, count: 2 },
    ]);
  });

  it("夜の並び（18時台→翌4時台）で返す", () => {
    const result = tallyStartHours([
      iso(2026, 1, 10, 1),
      iso(2026, 1, 10, 23),
      iso(2026, 1, 10, 18),
      iso(2026, 1, 11, 4),
    ]);
    expect(result.map((r) => r.hour)).toEqual([18, 23, 1, 4]);
  });

  it("記録の無い時間帯は並べない", () => {
    const result = tallyStartHours([iso(2026, 1, 10, 22)]);
    expect(result).toEqual([{ hour: 22, count: 1 }]);
  });

  it("夜間帯の外（5:00〜17:59）は「昼」としてまとめ、最後に置く", () => {
    const result = tallyStartHours([
      iso(2026, 1, 10, 9),
      iso(2026, 1, 10, 15),
      iso(2026, 1, 10, 20),
    ]);
    expect(result).toEqual([
      { hour: 20, count: 1 },
      { hour: null, count: 2 },
    ]);
  });

  it("境界: 18時台は夜、17時台は昼。5時台は昼、4時台は夜", () => {
    expect(tallyStartHours([iso(2026, 1, 10, 18)])[0].hour).toBe(18);
    expect(tallyStartHours([iso(2026, 1, 10, 17)])[0].hour).toBeNull();
    expect(tallyStartHours([iso(2026, 1, 10, 5)])[0].hour).toBeNull();
    expect(tallyStartHours([iso(2026, 1, 10, 4)])[0].hour).toBe(4);
  });

  it("記録が無ければ空", () => {
    expect(tallyStartHours([])).toEqual([]);
  });
});

describe("pickLongestNight（いちばん長かった夜・要件4.4）", () => {
  it("実績合計が最大の夜を返す", () => {
    expect(
      pickLongestNight([
        { studyDate: "2026-01-10", minutes: 45 },
        { studyDate: "2026-02-03", minutes: 180 },
        { studyDate: "2026-03-21", minutes: 120 },
      ]),
    ).toEqual({ studyDate: "2026-02-03", minutes: 180 });
  });

  it("同じ時間なら古い夜を選ぶ（tie-break）", () => {
    // 入力順に依らず古い方。新しい記録が増えても最長の夜が移り替わらないこと
    expect(
      pickLongestNight([
        { studyDate: "2026-03-01", minutes: 120 },
        { studyDate: "2026-01-05", minutes: 120 },
        { studyDate: "2026-02-10", minutes: 120 },
      ]),
    ).toEqual({ studyDate: "2026-01-05", minutes: 120 });
  });

  it("年をまたいでも古い夜を選べる（辞書順比較）", () => {
    expect(
      pickLongestNight([
        { studyDate: "2026-01-02", minutes: 90 },
        { studyDate: "2025-12-31", minutes: 90 },
      ]),
    ).toEqual({ studyDate: "2025-12-31", minutes: 90 });
  });

  it("記録が無ければ null", () => {
    expect(pickLongestNight([])).toBeNull();
  });

  it("0分の夜しか無ければ null（0分の夜は最長として出さない）", () => {
    expect(
      pickLongestNight([
        { studyDate: "2026-01-10", minutes: 0 },
        { studyDate: "2026-01-11", minutes: 0 },
      ]),
    ).toBeNull();
  });

  it("0分の夜は候補から外し、実績のある夜を選ぶ", () => {
    expect(
      pickLongestNight([
        { studyDate: "2026-01-09", minutes: 0 },
        { studyDate: "2026-01-10", minutes: 30 },
      ]),
    ).toEqual({ studyDate: "2026-01-10", minutes: 30 });
  });
});
