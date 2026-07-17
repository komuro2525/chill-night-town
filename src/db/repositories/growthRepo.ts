// 街の成長処理（要件6.1 / UC 6.1）。
//
// 学習記録の保存を契機に、選択中の街へ実績を加算しレベルを判定する。
//
// 加算・付与・達成記録・レベル更新を**1トランザクション**で行う。
// 途中で失敗して「経験値は付いたが達成記録が無い」状態になると、次の保存でも
// 未付与と判定され二重に付与されてしまう（＝要件6.2①「1学習日につき最大1回」が壊れる）。
//
// 判定そのものは src/lib/growth.ts の純関数に委ね、ここはDBの読み書きだけを担う。

import { computeLevel, shouldGrantExp } from "@/lib/growth";
import { getDatabase } from "../database";
import type { GrowthMethod, TownProgress } from "../types";
import { getGrowthThresholds } from "./masterRepo";

export type GrowthResult = {
  /** レベルが上がったか */
  leveledUp: boolean;
  fromLevel: number;
  toLevel: number;
  /** この保存で目標達成が成立し、経験値を付与したか（要件7.1: NPCメッセージの出し分けに使う） */
  goalAchieved: boolean;
  /** この保存で街が完成した（Lv5へ初めて到達した）か。完成演出は一度だけ */
  completed: boolean;
  /** 成長後の進捗（表示の更新に使う） */
  progress: TownProgress;
};

/**
 * 選択中の街へ実績を加算し、レベルを判定する（UC 6.1）。
 *
 * @param method 選択中の成長方式（アプリ全体で共通。要件6.2）
 * @param actualMinutes 保存した学習記録の実績学習時間（分）
 * @param dayTotalMinutes その学習日の実績学習時間の合計（保存済みの記録の合算）
 * @param goalMinutes 一日の学習目標時間
 */
export async function applyGrowth(params: {
  userId: number;
  townId: number;
  method: GrowthMethod;
  studyDate: string;
  actualMinutes: number;
  dayTotalMinutes: number;
  goalMinutes: number;
}): Promise<GrowthResult | null> {
  const { userId, townId, method, studyDate, actualMinutes, dayTotalMinutes, goalMinutes } =
    params;

  const db = await getDatabase();
  // 閾値はマスタから読む（要件6.2: バランス調整はマスタの更新のみで行える）
  const habitThresholds = await getGrowthThresholds("habit");

  let result: GrowthResult | null = null;

  await db.withTransactionAsync(async () => {
    const before = await db.getFirstAsync<TownProgress>(
      "SELECT * FROM town_progress WHERE user_id = ? AND town_id = ?",
      userId,
      townId,
    );
    if (!before) return;

    // その学習日に経験値が付与済みか。行の有無で判定する（要件6.2①）
    const granted = await db.getFirstAsync<{ count: number }>(
      "SELECT COUNT(*) AS count FROM daily_goal_achievement WHERE user_id = ? AND study_date = ?",
      userId,
      studyDate,
    );
    const alreadyGranted = (granted?.count ?? 0) > 0;

    const grantExp = shouldGrantExp(
      method,
      alreadyGranted,
      dayTotalMinutes,
      goalMinutes,
    );

    // 累計学習時間は成長方式に関わらず常に加算する（要件6.1）
    const cumulative = before.cumulative_study_minutes + actualMinutes;
    const exp = before.experience_points + (grantExp ? 1 : 0);

    const toLevel = computeLevel({
      method,
      currentLevel: before.current_level,
      exp,
      cumulativeMinutes: cumulative,
      habitThresholds,
      projectTargetMinutes: before.project_target_minutes,
    });

    if (grantExp) {
      // 付与した事実を残す。この行があるかどうかだけで「付与済み」を判定するため、
      // 以後その学習日に目標時間が変更されても取り消されない（要件6.2①）
      await db.runAsync(
        "INSERT INTO daily_goal_achievement (user_id, study_date) VALUES (?, ?)",
        userId,
        studyDate,
      );
    }

    await db.runAsync(
      `UPDATE town_progress
          SET cumulative_study_minutes = ?, experience_points = ?, current_level = ?,
              updated_at = datetime('now')
        WHERE user_id = ? AND town_id = ?`,
      cumulative,
      exp,
      toLevel,
      userId,
      townId,
    );

    const after = await db.getFirstAsync<TownProgress>(
      "SELECT * FROM town_progress WHERE user_id = ? AND town_id = ?",
      userId,
      townId,
    );
    if (!after) return;

    result = {
      leveledUp: toLevel > before.current_level,
      fromLevel: before.current_level,
      toLevel,
      goalAchieved: grantExp,
      // Lv5へ「初めて」到達したか。レベルは下がらないため、この遷移は本質的に一度きり。
      // 専用のフラグは持たない
      completed: before.current_level < 5 && toLevel === 5,
      progress: after,
    };
  });

  return result;
}

/**
 * 実績値を変えずに、選択中の成長方式で街のレベルだけを再判定する（要件6.1 / UC 6.2・6.3）。
 *
 * 成長方式の変更（10.6）・プロジェクト型目標学習時間の変更（6.4）で判定基準が変わったときに呼ぶ。
 * 累計学習時間・経験値は保持し、`computeLevel`（`resolveNextLevel` 内包）で
 * **上がる方向にのみ**動かす（レベルは下がらない）。基準が緩くなって新たに条件を
 * 満たしたレベルへは即時上昇し、厳しくなっても現在のレベルを維持する。
 *
 * @param method 判定に使う成長方式（変更後の値を渡す）
 * @returns 再判定後の進捗（対象が無ければ null）
 */
export async function recomputeTownLevel(
  userId: number,
  townId: number,
  method: GrowthMethod,
): Promise<TownProgress | null> {
  const db = await getDatabase();
  const habitThresholds = await getGrowthThresholds("habit");

  let updated: TownProgress | null = null;

  await db.withTransactionAsync(async () => {
    const before = await db.getFirstAsync<TownProgress>(
      "SELECT * FROM town_progress WHERE user_id = ? AND town_id = ?",
      userId,
      townId,
    );
    if (!before) return;

    const toLevel = computeLevel({
      method,
      currentLevel: before.current_level,
      exp: before.experience_points,
      cumulativeMinutes: before.cumulative_study_minutes,
      habitThresholds,
      projectTargetMinutes: before.project_target_minutes,
    });

    if (toLevel !== before.current_level) {
      await db.runAsync(
        `UPDATE town_progress SET current_level = ?, updated_at = datetime('now')
          WHERE user_id = ? AND town_id = ?`,
        toLevel,
        userId,
        townId,
      );
    }

    updated = { ...before, current_level: toLevel };
  });

  return updated;
}
