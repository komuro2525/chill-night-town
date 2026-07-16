// ユーザー（user）参照リポジトリ
// 1端末=1ユーザーのため、常に0件または1件。
// Phase 0 では起動ゲート用の存在判定と取得のみ実装する。
// ユーザー作成（初期設定）は Phase 1、設定更新は各Phaseで追加する。

import { getDatabase } from "../database";
import type { User } from "../types";

/** ユーザーが存在するか（初期設定完了判定。要件1.1） */
export async function hasUser(): Promise<boolean> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ count: number }>(
    "SELECT COUNT(*) AS count FROM user",
  );
  return (row?.count ?? 0) > 0;
}

/** ユーザーを取得する（存在しなければ null） */
export async function getUser(): Promise<User | null> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<User>("SELECT * FROM user LIMIT 1");
  return row ?? null;
}
