import type { SQLiteDatabase } from "expo-sqlite";

import { loadSqlAsset } from "./sql-loader";

// db/*.sql を「正」としてバンドル読み込みする（metro.config.js で assetExts に sql を追加済み）
// 非ASCIIファイル名でも metro のリテラル require であれば解決できる
const SCHEMA_SQL_MODULE = require("../../db/chill_night_town_スキーマ_v2.sql") as number;
const SEED_SQL_MODULE = require("../../db/chill_night_town_シードデータ.sql") as number;

/**
 * シードSQLはファイル自身が `BEGIN TRANSACTION; ... COMMIT;` で囲まれている。
 * マイグレーションは withTransactionAsync で1トランザクションにまとめるため、
 * ネストを避けて外側のトランザクション文だけを除去する。
 * （トリガー定義内の `BEGIN ... END;` は行頭が `BEGIN TRANSACTION` ではないため影響しない）
 */
function stripOuterTransaction(sql: string): string {
  return sql
    .replace(/^[ \t]*BEGIN[ \t]+TRANSACTION[ \t]*;[ \t]*$/gim, "")
    .replace(/^[ \t]*COMMIT[ \t]*;[ \t]*$/gim, "");
}

type Migration = {
  version: number;
  up: (db: SQLiteDatabase) => Promise<void>;
};

// バージョンは PRAGMA user_version で管理する。
// スキーマ変更時は新しい version を追加していく（既存 version の up は書き換えない）。
const MIGRATIONS: Migration[] = [
  {
    version: 1,
    up: async (db) => {
      const [schemaSql, seedSql] = await Promise.all([
        loadSqlAsset(SCHEMA_SQL_MODULE),
        loadSqlAsset(SEED_SQL_MODULE),
      ]);
      // スキーマ（DDL・トリガー）→ シード（マスタ投入）の順に適用する
      await db.execAsync(schemaSql);
      await db.execAsync(stripOuterTransaction(seedSql));
    },
  },
];

/** 現在の DB バージョンを取得する（未設定なら0） */
async function getUserVersion(db: SQLiteDatabase): Promise<number> {
  const row = await db.getFirstAsync<{ user_version: number }>(
    "PRAGMA user_version",
  );
  return row?.user_version ?? 0;
}

/**
 * 未適用のマイグレーションを順に実行する。
 * 各マイグレーションはトランザクションで囲み、成功時にのみ user_version を更新する（原子性を担保）。
 */
export async function runMigrations(db: SQLiteDatabase): Promise<void> {
  const current = await getUserVersion(db);
  const pending = MIGRATIONS.filter((m) => m.version > current).sort(
    (a, b) => a.version - b.version,
  );

  for (const migration of pending) {
    await db.withTransactionAsync(async () => {
      await migration.up(db);
      // PRAGMA はプレースホルダを使えないため整数リテラルを埋め込む（version は内部定義値で安全）
      await db.execAsync(`PRAGMA user_version = ${migration.version}`);
    });
  }
}
