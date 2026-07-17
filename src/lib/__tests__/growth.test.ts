// 街の成長の判定の検証。要件6.1 / 6.2
//
// ここには取り消せないルールが集まる。壊れるとユーザーが積み上げたもの
// （経験値・レベル）が失われ、しかも画面を見ても間違いに気づけない。
// 特に「レベルは下がらない」「経験値は取り消さない」を重点的に固定する。

import type { LevelThresholds } from "../growth";
import {
  computeLevel,
  getLevelFromValue,
  getProjectThresholds,
  resolveNextLevel,
  shouldGrantExp,
} from "../growth";

/** 習慣型の閾値（マスタ growth_level_threshold のシードと同じ値） */
const HABIT: LevelThresholds = { 2: 5, 3: 10, 4: 15, 5: 20 };

describe("getProjectThresholds（プロジェクト型のレベル基準・要件6.2②）", () => {
  it("要件6.2②の例と一致する（目標50時間）", () => {
    // Lv.1（初期状態）→ Lv.2：10時間 → Lv.3：20時間 → Lv.4：30時間 → Lv.5（街完成）：50時間
    const h = (n: number) => n * 60;
    expect(getProjectThresholds(h(50))).toEqual({
      2: h(10),
      3: h(20),
      4: h(30),
      5: h(50),
    });
  });

  it("テーブル定義書の例と一致する（目標10時間＝600分）", () => {
    expect(getProjectThresholds(600)).toEqual({ 2: 120, 3: 240, 4: 360, 5: 600 });
  });

  it("Lv5は目標そのもの（目標学習時間の達成＝街の完成）", () => {
    expect(getProjectThresholds(600)[5]).toBe(600);
    expect(getProjectThresholds(777)[5]).toBe(777);
  });

  it("最後の段だけ意図的に長い（Lv4→Lv5は他の段の2倍）", () => {
    const t = getProjectThresholds(600);
    expect(t[3] - t[2]).toBe(120);
    expect(t[4] - t[3]).toBe(120);
    // Lv4→Lv5 は 240分ぶん（Lv5を目標に固定しているため）
    expect(t[5] - t[4]).toBe(240);
  });

  it("割り切れない目標でも、Lv5は目標ちょうどで到達できる", () => {
    // 途中の段は切り上げるが、Lv5は目標そのものなので必ず届く
    const t = getProjectThresholds(601);
    expect(t[5]).toBe(601);
    expect(getLevelFromValue(601, t)).toBe(5);
  });
});

describe("getLevelFromValue（条件を満たす限り繰り返し上げる・要件6.1）", () => {
  it.each([
    [0, 1],
    [4, 1],
    [5, 2],
    [9, 2],
    [10, 3],
    [15, 4],
    [20, 5],
  ])("累計経験値 %i → Lv%i", (exp, expected) => {
    expect(getLevelFromValue(exp, HABIT)).toBe(expected);
  });

  it("一度に複数レベル分を満たしたら、その段まで上がる", () => {
    // Lv1 の状態から経験値が一気に15になれば Lv4 まで上がる
    expect(getLevelFromValue(15, HABIT)).toBe(4);
  });

  it("Lv5を超えても打ち止め（実績の加算は続くがレベルは上がらない）", () => {
    expect(getLevelFromValue(100, HABIT)).toBe(5);
  });
});

describe("resolveNextLevel（レベルは下がらない・要件6.1）", () => {
  it("算出結果が現在より高ければ上げる", () => {
    expect(resolveNextLevel(2, 4)).toBe(4);
  });

  it("算出結果が現在より低くても下げない", () => {
    // 方式の切り替えや目標の変更で基準が変わっても、過去最高を維持する
    expect(resolveNextLevel(4, 1)).toBe(4);
  });

  it("Lv5を超えることはない", () => {
    expect(resolveNextLevel(5, 9)).toBe(5);
  });
});

describe("shouldGrantExp（経験値の付与・要件6.2①）", () => {
  it("習慣型で、未付与で、その学習日の合計が目標に達していれば付与する", () => {
    expect(shouldGrantExp("habit", false, 60, 60)).toBe(true);
  });

  it("目標に1分でも足りなければ付与しない", () => {
    expect(shouldGrantExp("habit", false, 59, 60)).toBe(false);
  });

  it("同じ学習日に2回目は付与しない（1学習日につき最大1回）", () => {
    expect(shouldGrantExp("habit", true, 120, 60)).toBe(false);
  });

  it("プロジェクト型では付与しない（経験値は習慣型選択中のみ）", () => {
    expect(shouldGrantExp("project", false, 120, 60)).toBe(false);
  });
});

describe("computeLevel（成長後のレベル）", () => {
  it("習慣型は累計経験値で判定する", () => {
    expect(
      computeLevel({
        method: "habit",
        currentLevel: 1,
        exp: 10,
        cumulativeMinutes: 99999,
        habitThresholds: HABIT,
        projectTargetMinutes: null,
      }),
    ).toBe(3);
  });

  it("プロジェクト型は累計学習時間で判定する", () => {
    // 目標600分に対し累計360分 → Lv4
    expect(
      computeLevel({
        method: "project",
        currentLevel: 1,
        exp: 0,
        cumulativeMinutes: 360,
        habitThresholds: HABIT,
        projectTargetMinutes: 600,
      }),
    ).toBe(4);
  });

  it("プロジェクト型で目標が未設定ならレベルを維持する（判定できないため）", () => {
    expect(
      computeLevel({
        method: "project",
        currentLevel: 3,
        exp: 0,
        cumulativeMinutes: 99999,
        habitThresholds: HABIT,
        projectTargetMinutes: null,
      }),
    ).toBe(3);
  });

  it("方式を切り替えて実績値が変わっても、レベルは下がらない", () => {
    // 習慣型でLv4まで育てた街を、実績時間の少ないプロジェクト型で判定しても下がらない
    expect(
      computeLevel({
        method: "project",
        currentLevel: 4,
        exp: 15,
        cumulativeMinutes: 10,
        habitThresholds: HABIT,
        projectTargetMinutes: 600,
      }),
    ).toBe(4);
  });

  it("目標学習時間を引き上げても、レベルは下がらない", () => {
    // 目標600分でLv5に到達した後、目標を6000分へ引き上げた
    expect(
      computeLevel({
        method: "project",
        currentLevel: 5,
        exp: 0,
        cumulativeMinutes: 600,
        habitThresholds: HABIT,
        projectTargetMinutes: 6000,
      }),
    ).toBe(5);
  });

  it("目標学習時間を引き下げたら、新たに満たした段へ即時上昇する（要件6.2②）", () => {
    // 累計600分・目標6000分ならLv1だが、目標を600分へ下げるとLv5に達する
    expect(
      computeLevel({
        method: "project",
        currentLevel: 1,
        exp: 0,
        cumulativeMinutes: 600,
        habitThresholds: HABIT,
        projectTargetMinutes: 600,
      }),
    ).toBe(5);
  });

  it("習慣型の閾値はマスタから渡された値を使う（バランス調整に追随する）", () => {
    // マスタを Lv2=3 に変更した想定
    const tuned: LevelThresholds = { 2: 3, 3: 6, 4: 9, 5: 12 };
    expect(
      computeLevel({
        method: "habit",
        currentLevel: 1,
        exp: 3,
        cumulativeMinutes: 0,
        habitThresholds: tuned,
        projectTargetMinutes: null,
      }),
    ).toBe(2);
  });
});
