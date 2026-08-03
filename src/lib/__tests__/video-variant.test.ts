import { buildVariantSeed, pickVariantIndex } from "../video-variant";

// 背景のループ動画に複数パターンがあるときの選び方（要件2.2）。
//
// この処理が壊れると「見ている前で背景が別の動画に切り替わる」という、
// 静かな世界観をいちばん損なう壊れ方をする。しかも画面を1瞬見ただけでは
// 「たまたま切り替わった」のか「毎回変わっている」のか判別できない。
// 決定性（同じ学習日なら必ず同じ）と、学習日が変われば変わること、
// 添字が必ず範囲内に収まることを固定する。

describe("pickVariantIndex（動画パターンの決定的な抽選）", () => {
  test("同じシードなら何度呼んでも同じ添字（描画のたびに変わらない）", () => {
    const seed = "2026-08-01:nightTown:night:lv3";
    const first = pickVariantIndex(seed, 2);
    for (let i = 0; i < 50; i++) {
      expect(pickVariantIndex(seed, 2)).toBe(first);
    }
  });

  test("パターンが1つなら常に0（選ぶ余地がない）", () => {
    expect(pickVariantIndex("なんでもよい", 1)).toBe(0);
  });

  test("パターンが0・負でも0を返す（例外を投げない）", () => {
    expect(pickVariantIndex("seed", 0)).toBe(0);
    expect(pickVariantIndex("seed", -1)).toBe(0);
  });

  test("空文字のシードでも例外を投げず範囲内に収まる", () => {
    expect(pickVariantIndex("", 3)).toBeGreaterThanOrEqual(0);
    expect(pickVariantIndex("", 3)).toBeLessThan(3);
  });

  test("添字は必ず 0〜count-1 に収まる（負にならない）", () => {
    // ハッシュは符号付き32bitのため、符号なしへ直し損ねると負の添字が出る
    for (let day = 1; day <= 31; day++) {
      const date = `2026-08-${String(day).padStart(2, "0")}`;
      for (const count of [2, 3, 5]) {
        const index = pickVariantIndex(
          buildVariantSeed(date, "nightTown", "night", 3),
          count,
        );
        expect(Number.isInteger(index)).toBe(true);
        expect(index).toBeGreaterThanOrEqual(0);
        expect(index).toBeLessThan(count);
      }
    }
  });

  test("学習日が変われば選び直される（1か月のうちに両方のパターンが出る）", () => {
    const seen = new Set<number>();
    for (let day = 1; day <= 31; day++) {
      const date = `2026-08-${String(day).padStart(2, "0")}`;
      seen.add(pickVariantIndex(buildVariantSeed(date, "nightTown", "night", 3), 2));
    }
    // 毎日同じ動画になっていない（＝日替わりとして機能している）
    expect(seen.size).toBe(2);
  });
});

describe("buildVariantSeed（シードの組み立て）", () => {
  test("学習日・街・時間帯・レベルがすべて反映される", () => {
    expect(buildVariantSeed("2026-08-01", "nightTown", "night", 3)).toBe(
      "2026-08-01:nightTown:night:lv3",
    );
  });

  test("同じ日でも枠が違えば別のシード（全部の枠が一斉に同じ添字を引かない）", () => {
    const base = buildVariantSeed("2026-08-01", "nightTown", "night", 3);
    expect(buildVariantSeed("2026-08-01", "nightTown", "night", 4)).not.toBe(base);
    expect(buildVariantSeed("2026-08-01", "nightTown", "latenight", 3)).not.toBe(base);
    expect(buildVariantSeed("2026-08-01", "castleTown", "night", 3)).not.toBe(base);
  });

  test("同じ枠でも学習日が違えば別のシード", () => {
    expect(buildVariantSeed("2026-08-02", "nightTown", "night", 3)).not.toBe(
      buildVariantSeed("2026-08-01", "nightTown", "night", 3),
    );
  });
});
