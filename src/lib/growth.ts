// 街の成長の判定（要件6章）。純関数。
//
// ここには**取り消せないルール**が集まる。間違えるとユーザーが積み上げたものを壊すため、
// DBに触れない純関数として切り出し、境界をテストで固定する。
//
//   ・街のレベルは一度上がったら下がらない（過去に到達した最高レベルを維持する）
//   ・経験値は1学習日につき最大1回。付与後は目標時間を変えても取り消さない
//   ・Lv.5（街完成）で打ち止め。以降も実績の加算は続くがレベルは上がらない
//
// 成長方式は2つ（要件6.2）:
//   ・習慣型   : 目標達成した学習日に経験値+1。累計経験値でレベルを判定する
//   ・プロジェクト型: 累計学習時間が街ごとの目標学習時間に近づくほどレベルが上がる

import { GROWTH } from "@/constants/domain";
import type { GrowthMethod } from "@/db/types";

/** レベル → 到達に必要な値。習慣型は累計経験値、プロジェクト型は累計学習時間（分） */
export type LevelThresholds = Record<number, number>;

/**
 * プロジェクト型のレベル基準（要件6.2② / テーブル定義書 town_progress の仕様補足）。
 *
 * 目標学習時間から動的に算出する（growth_level_threshold の project 行は使わない）。
 *   Lv2 = 目標×1/5 ／ Lv3 = 目標×2/5 ／ Lv4 = 目標×3/5 ／ Lv5 = 目標そのもの
 *
 * **Lv5 だけ意図的に長い**（目標の 3/5 → 5/5 で、他の段の2倍）。
 * 「目標学習時間の達成＝街の完成（Lv.5）」（要件6.2②）を満たすため、
 * 最後の段は目標そのものに固定する。要件・テーブル定義書の例と一致する:
 *   目標50時間 → Lv2:10時間 / Lv3:20時間 / Lv4:30時間 / Lv5:50時間
 *   目標10時間(600分) → Lv2:120分 / Lv3:240分 / Lv4:360分 / Lv5:600分
 */
export function getProjectThresholds(targetMinutes: number): LevelThresholds {
  const step = targetMinutes / GROWTH.MAX_LEVEL;
  return {
    2: Math.ceil(step),
    3: Math.ceil(step * 2),
    4: Math.ceil(step * 3),
    5: targetMinutes,
  };
}

/**
 * 値と閾値から到達レベルを求める。
 * 条件を満たす限り繰り返し上げる（一度の保存で複数レベル分を満たしたらそこまで上げる。要件6.1）。
 */
export function getLevelFromValue(
  value: number,
  thresholds: LevelThresholds,
): number {
  let level = 1;
  for (let next = 2; next <= GROWTH.MAX_LEVEL; next++) {
    const required = thresholds[next];
    // 閾値が未定義の段は、そこで打ち切る（それ以上は上げられない）
    if (required === undefined || value < required) break;
    level = next;
  }
  return level;
}

/**
 * 実際に設定するレベル。**レベルは下がらない**（要件6.1）。
 *
 * 成長方式の切り替えや目標学習時間の変更で判定基準が変わり、算出結果が
 * 現在より低くなることがある。その場合も現在のレベルを維持する。
 * 「下がらない」を保証する箇所をここ1つに集約している。
 */
export function resolveNextLevel(
  currentLevel: number,
  computedLevel: number,
): number {
  return Math.min(GROWTH.MAX_LEVEL, Math.max(currentLevel, computedLevel));
}

/**
 * 経験値を付与すべきか（要件6.2①）。
 *
 * 習慣型のときのみ付与する。1学習日につき最大1回（付与済みなら何もしない）。
 * 判定はその学習日の実績学習時間の合計で行う（1日に複数セッションなら合算）。
 */
export function shouldGrantExp(
  method: GrowthMethod,
  alreadyGranted: boolean,
  dayTotalMinutes: number,
  goalMinutes: number,
): boolean {
  if (method !== "habit") return false;
  if (alreadyGranted) return false;
  return dayTotalMinutes >= goalMinutes;
}

/**
 * 成長後のレベルを求める。
 *
 * @param method  選択中の成長方式。判定にはこの方式の実績値のみを使う（要件6.2）
 * @param currentLevel 現在のレベル（過去最高）
 * @param exp     成長後の累計経験値（習慣型で使う）
 * @param cumulativeMinutes 成長後の累計学習時間（プロジェクト型で使う）
 * @param habitThresholds 習慣型の閾値（マスタ growth_level_threshold から読む）
 * @param projectTargetMinutes プロジェクト型の目標学習時間（未設定なら null）
 */
export function computeLevel(params: {
  method: GrowthMethod;
  currentLevel: number;
  exp: number;
  cumulativeMinutes: number;
  habitThresholds: LevelThresholds;
  projectTargetMinutes: number | null;
}): number {
  const {
    method,
    currentLevel,
    exp,
    cumulativeMinutes,
    habitThresholds,
    projectTargetMinutes,
  } = params;

  if (method === "habit") {
    return resolveNextLevel(currentLevel, getLevelFromValue(exp, habitThresholds));
  }

  // プロジェクト型で目標が未設定なら判定できない。レベルは維持する
  if (projectTargetMinutes === null) return currentLevel;

  return resolveNextLevel(
    currentLevel,
    getLevelFromValue(cumulativeMinutes, getProjectThresholds(projectTargetMinutes)),
  );
}
