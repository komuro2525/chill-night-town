import type { SQLiteDatabase } from "expo-sqlite";

import { loadSqlAsset } from "./sql-loader";

// db/*.sql を「正」としてバンドル読み込みする（metro.config.js で assetExts に sql を追加済み）
// 非ASCIIファイル名でも metro のリテラル require であれば解決できる
//
// import は使えない: metro はビルド時に「リテラルの require()」を走査してアセットを同梱する。
// import に置き換えるとSQLがバンドルされず、DBを初期化できずアプリが起動しなくなる。
// eslint-disable-next-line @typescript-eslint/no-require-imports -- metro のアセット同梱にはリテラル require が必須
const SCHEMA_SQL_MODULE = require("../../db/chill_night_town_スキーマ_v2.sql") as number;
// eslint-disable-next-line @typescript-eslint/no-require-imports -- 同上
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

// 現在のスキーマバージョン（db/*.sql が表す「最新」の版）。
// スキーマを変更したら、スキーマSQLを更新しつつ本値を+1し、DELTA_MIGRATIONS に差分を追加する。
const SCHEMA_VERSION = 3;

// 既存DB（過去バージョン）向けの差分マイグレーション（version >= 2）。
// 新規インストールはスキーマSQL（=最新）を適用して一気に SCHEMA_VERSION まで上がるため、
// ここには「既存DBを最新へ追いつかせる ALTER 等」だけを列挙する（新規では実行しない）。
// スキーマSQL側にも同じ変更を必ず反映すること（新規と既存で最終形を一致させる）。
const DELTA_MIGRATIONS: Migration[] = [
  {
    version: 2,
    up: async (db) => {
      // 初回ホームの成長方式お知らせ表示済みフラグ
      await db.execAsync(
        "ALTER TABLE user ADD COLUMN growth_hint_dismissed INTEGER NOT NULL DEFAULT 0 CHECK (growth_hint_dismissed IN (0, 1))",
      );
    },
  },
  {
    version: 3,
    up: async (db) => {
      // BGM音源マスタの修正: file_path を実ファイル名に合わせ、登録漏れの1曲を追加する
      await db.runAsync(
        "UPDATE ambient_sound SET file_path = ? WHERE code = ?",
        "assets/audio/bgm/2_23_AM.mp3",
        "bgm_223am",
      );
      await db.runAsync(
        `INSERT OR IGNORE INTO ambient_sound (code, sound_type, name, artist, file_path)
         VALUES (?, 'bgm', ?, NULL, ?)`,
        "bgm_lofigirl",
        "ローファイ少女は今日も寝不足",
        "assets/audio/bgm/ローファイ少女は今日も寝不足.mp3",
      );
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

/** 新規DBへ最新スキーマ＋シードを適用し、SCHEMA_VERSION まで一気に上げる */
async function initializeFreshDatabase(db: SQLiteDatabase): Promise<void> {
  const [schemaSql, seedSql] = await Promise.all([
    loadSqlAsset(SCHEMA_SQL_MODULE),
    loadSqlAsset(SEED_SQL_MODULE),
  ]);
  await db.withTransactionAsync(async () => {
    // スキーマ（DDL・トリガー）→ シード（マスタ投入）の順に適用する
    await db.execAsync(schemaSql);
    await db.execAsync(stripOuterTransaction(seedSql));
    // PRAGMA はプレースホルダを使えないため整数リテラルを埋め込む（内部定義値で安全）
    await db.execAsync(`PRAGMA user_version = ${SCHEMA_VERSION}`);
  });
}

/**
 * DBを最新スキーマへ整える。
 * - 新規（user_version=0）: 最新スキーマSQL＋シードを適用（差分マイグレーションは実行しない）
 * - 既存（user_version>=1）: 不足分の差分マイグレーションを順に適用
 * 各処理はトランザクションで囲み、成功時にのみ user_version を更新する（原子性を担保）。
 */
export async function runMigrations(db: SQLiteDatabase): Promise<void> {
  const current = await getUserVersion(db);

  if (current === 0) {
    await initializeFreshDatabase(db);
    return;
  }

  const pending = DELTA_MIGRATIONS.filter((m) => m.version > current).sort(
    (a, b) => a.version - b.version,
  );
  for (const migration of pending) {
    await db.withTransactionAsync(async () => {
      await migration.up(db);
      await db.execAsync(`PRAGMA user_version = ${migration.version}`);
    });
  }
}
