// 街の育成進捗（town_progress）参照リポジトリ。
// Phase 2 では選択中の街とそのレベルを取得する（背景表示に使用）。
// 加算・レベル更新（成長処理）は Phase 4 で追加する。

import { getDatabase } from "../database";
import type { Town, TownProgress } from "../types";

export type SelectedTown = { town: Town; progress: TownProgress };

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
