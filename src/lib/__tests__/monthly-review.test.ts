// 月のふりかえりメッセージの純ロジック検証（要件4.2の拡張 / 7.1と別系統）。
//
// カテゴリ比率のしきい値による傾向の出し分けは、画面を見ても正しさが分かりにくく、
// 崩れると振り返りの意味（たたえる相手・トーン）が変わる。境界とメッセージ選択の
// 決定性（月ごと固定・飽きさせない）を固定する。

import {
  buildReviewMessage,
  classifyReviewTone,
  REVIEW_MESSAGES,
  tallyFromCounts,
  type EmotionTally,
} from "../monthly-review";

const tally = (
  positive: number,
  neutral: number,
  negative: number,
): EmotionTally => ({ positive, neutral, negative });

describe("tallyFromCounts（感情別回数→カテゴリ合計）", () => {
  it("カテゴリごとに合算する", () => {
    expect(
      tallyFromCounts([
        { category: "positive", count: 3 },
        { category: "positive", count: 2 },
        { category: "neutral", count: 1 },
        { category: "negative", count: 4 },
      ]),
    ).toEqual({ positive: 5, neutral: 1, negative: 4 });
  });

  it("空なら全て0", () => {
    expect(tallyFromCounts([])).toEqual({ positive: 0, neutral: 0, negative: 0 });
  });
});

describe("classifyReviewTone（傾向の分類）", () => {
  it("記録ゼロは sparse", () => {
    expect(classifyReviewTone(tally(0, 0, 0))).toBe("sparse");
  });

  it("ネガ皆無でポジ75%以上は all_positive", () => {
    // 8/10 = 0.8、ネガ0
    expect(classifyReviewTone(tally(8, 2, 0))).toBe("all_positive");
  });

  it("ポジ優勢でも境界未満（75%未満）は all_positive にしない", () => {
    // 7/10 = 0.7 < 0.75 → ネガ0・ニュートラル副次なので positive_with_neutral
    expect(classifyReviewTone(tally(7, 3, 0))).toBe("positive_with_neutral");
  });

  it("ポジ優勢＋ネガが副次に目立つ（N>0 かつ N>=U）は positive_with_negative", () => {
    // ポジ6・ニュートラル1・ネガ3（総10, ポジ0.6が最優勢, N=3>=U=1）
    expect(classifyReviewTone(tally(6, 1, 3))).toBe("positive_with_negative");
  });

  it("ポジ優勢でネガよりニュートラルが目立てば positive_with_neutral", () => {
    // ポジ6・ニュートラル3・ネガ1（N=1 < U=3）
    expect(classifyReviewTone(tally(6, 3, 1))).toBe("positive_with_neutral");
  });

  it("ニュートラル優勢でネガが目立たなければ calm_steady", () => {
    // 3:6:1 → ニュートラル優勢、ネガ(1) < ポジ(3) → calm_steady
    expect(classifyReviewTone(tally(3, 6, 1))).toBe("calm_steady");
  });

  it("ニュートラル優勢でもネガがポジ以上に目立てば calm_with_struggle", () => {
    // 1:6:3 → ニュートラル優勢、ネガ(3) >= ポジ(1) → calm_with_struggle
    expect(classifyReviewTone(tally(1, 6, 3))).toBe("calm_with_struggle");
  });

  it("ネガ優勢でポジが乏しければ persevered", () => {
    // 1:2:6 → ネガ0.6(<0.75)、ポジ(1) < ニュートラル(2) → persevered
    expect(classifyReviewTone(tally(1, 2, 6))).toBe("persevered");
  });

  it("ネガ優勢でも前向きが一定あれば persevered_with_light", () => {
    // 3:1:6 → ネガ0.6(<0.75)、ポジ(3) >= ニュートラル(1) → persevered_with_light
    expect(classifyReviewTone(tally(3, 1, 6))).toBe("persevered_with_light");
  });

  it("ネガが75%以上を占めれば deep_struggle", () => {
    // 1:1:8 → ネガ0.8 >= 0.75 → deep_struggle
    expect(classifyReviewTone(tally(1, 1, 8))).toBe("deep_struggle");
  });

  it("最優勢が45%未満かつ2位が30%以上なら mixed（拮抗）", () => {
    // 4:3:3（総10）→ 最優勢0.4<0.45, 2位0.3>=0.3 → mixed
    expect(classifyReviewTone(tally(4, 3, 3))).toBe("mixed");
  });

  it("最優勢が45%以上なら拮抗にはしない（mixedより優勢判定を優先）", () => {
    // 5:3:2 → 最優勢0.5 >= 0.45 → mixedにならず、ポジ優勢＋ネガ(2)<ニュートラル(3)で positive_with_neutral
    expect(classifyReviewTone(tally(5, 3, 2))).toBe("positive_with_neutral");
  });

  it("同数の tie-break は positive>neutral>negative（やさしい方へ）", () => {
    // 3:3:3 → 最優勢0.333<0.45 かつ 2位0.333>=0.3 → mixed（優勢判定前に拮抗で拾う）
    expect(classifyReviewTone(tally(3, 3, 3))).toBe("mixed");
    // 5:5:0 → 最優勢0.5、tieはpositive優先。ネガ0だが0.5<0.75なので positive_with_neutral
    expect(classifyReviewTone(tally(5, 5, 0))).toBe("positive_with_neutral");
  });
});

describe("buildReviewMessage（月ごと固定・飽きさせない選択）", () => {
  it("同じ年月・同じ傾向なら常に同じ文面（固定）", () => {
    const params = {
      tally: tally(6, 1, 3),
      topEmotionLabel: "😊 達成感",
      year: 2026,
      month: 3,
    };
    expect(buildReviewMessage(params)).toBe(buildReviewMessage(params));
  });

  it("{emotion} は最多感情ラベルへ置換される", () => {
    const msg = buildReviewMessage({
      tally: tally(6, 1, 3),
      topEmotionLabel: "😊 達成感",
      year: 2026,
      month: 3,
    });
    expect(msg).toContain("😊 達成感");
    expect(msg).not.toContain("{emotion}");
  });

  it("最多感情が無い場合は代替語で埋める（未置換を残さない）", () => {
    const msg = buildReviewMessage({
      tally: tally(6, 1, 3),
      topEmotionLabel: null,
      year: 2026,
      month: 3,
    });
    expect(msg).not.toContain("{emotion}");
    expect(msg).toContain("いちばん多かった気持ち");
  });

  it("sparse は感情ラベルを使わない（{emotion}を含まない定数）", () => {
    for (const text of REVIEW_MESSAGES.sparse) {
      expect(text).not.toContain("{emotion}");
    }
    // 天気なし → 天気の一言は付かない。改行整形だけ施した本文になる
    const raw =
      REVIEW_MESSAGES.sparse[(2026 * 12 + 3) % REVIEW_MESSAGES.sparse.length];
    const expected = raw.replace(/。/g, "。\n").replace(/\n+$/, "");
    const msg = buildReviewMessage({
      tally: tally(0, 0, 0),
      topEmotionLabel: null,
      year: 2026,
      month: 3,
    });
    expect(msg).toBe(expected);
  });

  it("文（。）ごとに改行が入る（読みやすさ）", () => {
    const msg = buildReviewMessage({
      tally: tally(6, 1, 3),
      topEmotionLabel: "😊 達成感",
      year: 2026,
      month: 3,
    });
    expect(msg).toContain("\n");
    // 末尾に余分な改行を残さない
    expect(msg.endsWith("\n")).toBe(false);
    // 改行数は「文の数 − 1」（最後の文の後ろには付かない）
    const sentences = (msg.match(/。/g) ?? []).length;
    const breaks = (msg.match(/\n/g) ?? []).length;
    expect(breaks).toBe(sentences - 1);
  });

  it("最多の夜の天気があれば、天気に触れる一言が最後に加わる", () => {
    const msg = buildReviewMessage({
      tally: tally(6, 1, 3),
      topEmotionLabel: "😊 達成感",
      topWeatherLabel: "🌧 雨音の夜",
      year: 2026,
      month: 3,
    });
    expect(msg).toContain("🌧 雨音の夜");
    expect(msg).not.toContain("{weather}");
  });

  it("天気が無ければ天気の一言は付かない", () => {
    const msg = buildReviewMessage({
      tally: tally(6, 1, 3),
      topEmotionLabel: "😊 達成感",
      topWeatherLabel: null,
      year: 2026,
      month: 3,
    });
    expect(msg).not.toContain("{weather}");
    for (const note of ["感じたまま", "目に映った", "心がそう見た", "夜空の記憶"]) {
      expect(msg).not.toContain(note);
    }
  });

  it("年月が変わると候補内で循環し、文面が変わりうる", () => {
    // 同じ傾向でも、候補数を跨ぐ連続した月で全て同じにはならない
    const base = { tally: tally(6, 1, 3), topEmotionLabel: "😊 達成感" };
    const variantCount = REVIEW_MESSAGES.positive_with_negative.length;
    const msgs = new Set(
      Array.from({ length: variantCount }, (_, i) =>
        buildReviewMessage({ ...base, year: 2026, month: 1 + i }),
      ),
    );
    // 連続する variantCount か月ぶんで、全候補が1回ずつ出そろう
    expect(msgs.size).toBe(variantCount);
  });

  it("非sparseの全トーンに {emotion} を含む候補があり、置換後に未展開が残らない", () => {
    const tones = {
      all_positive: tally(9, 1, 0),
      positive_with_neutral: tally(6, 3, 1),
      positive_with_negative: tally(6, 1, 3),
      calm_steady: tally(3, 6, 1),
      calm_with_struggle: tally(1, 6, 3),
      mixed: tally(4, 3, 3),
      persevered_with_light: tally(3, 1, 6),
      persevered: tally(1, 2, 6),
      deep_struggle: tally(1, 1, 8),
    } as const;
    for (const [, t] of Object.entries(tones)) {
      const msg = buildReviewMessage({
        tally: t,
        topEmotionLabel: "🔥 集中できた",
        year: 2026,
        month: 5,
      });
      expect(msg).not.toContain("{emotion}");
      expect(msg.length).toBeGreaterThan(20);
    }
  });
});
