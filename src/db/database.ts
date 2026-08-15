import { openDatabaseAsync, type SQLiteDatabase } from "expo-sqlite";

import { runMigrations } from "./migrations";

const DATABASE_NAME = "chill_night_town.db";

// 単一コネクションをアプリ全体で共有する。
// Promise をキャッシュすることで初期化（オープン＋マイグレーション）は1回だけ実行される。
let databasePromise: Promise<SQLiteDatabase> | null = null;

async function openAndInitialize(): Promise<SQLiteDatabase> {
  const db = await openDatabaseAsync(DATABASE_NAME);
  // SQLite は既定で外部キー制約が無効。コネクションごとに毎回有効化する（スキーマ冒頭の指示）
  await db.execAsync("PRAGMA foreign_keys = ON;");
  await runMigrations(db);
  return db;
}

/**
 * 初期化済みの DB を取得する。初回呼び出し時にオープンとマイグレーションを行い、
 * 以降は同一インスタンスを返す。
 *
 * 失敗した Promise はキャッシュに残さない。残すと、起動時の一度きりの失敗
 * （オープンの競合など）で以後アプリが生きているあいだ全てのDBアクセスが
 * 同じエラーを返し続け、画面の再読み込みでも復帰できなくなるため。
 */
export function getDatabase(): Promise<SQLiteDatabase> {
  if (!databasePromise) {
    const attempt = openAndInitialize().catch((e) => {
      if (databasePromise === attempt) databasePromise = null;
      throw e;
    });
    databasePromise = attempt;
  }
  return databasePromise;
}
