// 街の育成進捗（town_progress）参照・更新リポジトリ。
// Phase 2 で選択中の街の取得、Phase 4 で成長処理（growthRepo）、
// Phase 6 で街選択画面（要件6.4 / 10.5）の一覧・切替・サブタイトル・目標時間を扱う。

import { getDatabase } from "../database";
import type { Town, TownProgress } from "../types";

export type SelectedTown = { town: Town; progress: TownProgress };
export type TownWithProgress = { town: Town; progress: TownProgress };

/** 選択中の街とその育成進捗を取得する（未選択なら null） */
export async function getSelectedTown(): Promise<SelectedTown | null> {
  const db = await getDatabase();
  const progress = await db.getFirstAsync<TownProgress>(
    "SELECT * FROM town_progress WHERE is_selected = 1 LIMIT 1",
  );
  if (!progress) return null;
  const town = await db.getFirstAsync<Town>(
    "SELECT * FROM town WHERE id = ?",
    progress.town_id,
  );
  if (!town) return null;
  return { town, progress };
}

/**
 * 有効な街の一覧を、それぞれの育成進捗とともに取得する（要件6.4 / UC 6.3 手順1）。
 * 初期設定で全街ぶんの town_progress が作られているため（setupRepo）、
 * 進捗行が無い街は通常発生しない（あればスキップする）。
 */
export async function listTownsWithProgress(): Promise<TownWithProgress[]> {
  const db = await getDatabase();
  const towns = await db.getAllAsync<Town>(
    "SELECT * FROM town WHERE is_active = 1 ORDER BY display_order",
  );
  const result: TownWithProgress[] = [];
  for (const town of towns) {
    const progress = await db.getFirstAsync<TownProgress>(
      "SELECT * FROM town_progress WHERE town_id = ?",
      town.id,
    );
    if (progress) result.push({ town, progress });
  }
  return result;
}

/**
 * 選択中の街を切り替える（要件6.4 / 10.5）。稼働中不可はUI側で制御。
 * is_selected=1 は1行のみ許可する部分ユニーク索引（idx_town_progress_selected）が
 * あるため、先に全解除してから対象を選択する（同一トランザクション内で順序を守る）。
 */
export async function selectTown(townId: number): Promise<void> {
  const db = await getDatabase();
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      "UPDATE town_progress SET is_selected = 0 WHERE is_selected = 1",
    );
    await db.runAsync(
      "UPDATE town_progress SET is_selected = 1, updated_at = datetime('now') WHERE town_id = ?",
      townId,
    );
  });
}

/**
 * 街のサブタイトルを設定・変更する（要件6.4 / UC 6.3 手順3）。稼働中も可。
 * 空文字は NULL として保存する（上限20文字は呼び出し側で検証）。
 */
export async function updateSubtitle(
  townId: number,
  subtitle: string | null,
): Promise<void> {
  const db = await getDatabase();
  const trimmed = subtitle?.trim() ?? "";
  const value = trimmed.length > 0 ? trimmed : null;
  await db.runAsync(
    "UPDATE town_progress SET subtitle = ?, updated_at = datetime('now') WHERE town_id = ?",
    value,
    townId,
  );
}

/**
 * プロジェクト型の目標学習時間（分）を設定・変更する（要件6.4 / UC 6.3 手順4）。稼働中不可。
 * レベル再判定は呼び出し側で growthRepo.recomputeTownLevel を続けて呼ぶこと。
 * 値域（60〜30000分）はスキーマの CHECK が担保する。
 */
export async function updateProjectTargetMinutes(
  townId: number,
  minutes: number,
): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    "UPDATE town_progress SET project_target_minutes = ?, updated_at = datetime('now') WHERE town_id = ?",
    minutes,
    townId,
  );
}
