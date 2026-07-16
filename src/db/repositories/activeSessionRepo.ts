// 計測中セッション（active_session）参照リポジトリ
// 計測中のみ1件存在する。行の有無が「未終了セッションあり」の判定になる（要件1.1 / 3.2）。
// Phase 0 では起動ゲート用の存在判定と取得のみ実装する。
// 生成・更新・削除（計測操作）は Phase 3 で追加する。

import { getDatabase } from "../database";
import type { ActiveSession } from "../types";

/** 未終了（計測中）セッションが存在するか */
export async function hasActiveSession(): Promise<boolean> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ count: number }>(
    "SELECT COUNT(*) AS count FROM active_session",
  );
  return (row?.count ?? 0) > 0;
}

/** 計測中セッションを取得する（なければ null） */
export async function getActiveSession(): Promise<ActiveSession | null> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<ActiveSession>(
    "SELECT * FROM active_session LIMIT 1",
  );
  return row ?? null;
}
