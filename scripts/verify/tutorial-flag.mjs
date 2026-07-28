// 初回チュートリアルの表示済みフラグ（user.tutorial_completed / マイグレv21）の検証。
// 再実行可能な手動検証。
//
// 目的:
//   1. 最新スキーマの user に tutorial_completed 列があり、既定は 0
//   2. v21 の ADD COLUMN が旧形状の user テーブルへ列を足せる（既定0＝既存ユーザーも一度は表示）
//
// 実行: node scripts/verify/tutorial-flag.mjs

import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p) => readFileSync(join(ROOT, p), "utf8");

let failed = 0;
function check(label, cond) {
  console.log(`${cond ? "OK " : "NG "} ${label}`);
  if (!cond) failed++;
}
const cols = (db, t) =>
  db.prepare("SELECT name FROM pragma_table_info(?)").all(t).map((r) => r.name);

// --- 1. 最新スキーマ ---
{
  const db = new DatabaseSync(":memory:");
  db.exec(read("db/chill_night_town_スキーマ_v2.sql"));
  db.exec(read("db/chill_night_town_シードデータ.sql"));
  db.exec(read("db/seed_npc_v19.sql"));
  check("user に tutorial_completed 列がある", cols(db, "user").includes("tutorial_completed"));
  check("user に tutorial_seen_features 列がある", cols(db, "user").includes("tutorial_seen_features"));
  db.exec("INSERT INTO user (nickname) VALUES ('夜子')");
  const u = db.prepare("SELECT tutorial_completed, tutorial_seen_features FROM user LIMIT 1").get();
  check("tutorial_completed の既定は0", u.tutorial_completed === 0);
  check("tutorial_seen_features の既定は空文字", u.tutorial_seen_features === "");
  db.close();
}

// --- 2. v21 の ADD COLUMN（旧形状の user へ） ---
{
  const db = new DatabaseSync(":memory:");
  db.exec("CREATE TABLE user (id INTEGER PRIMARY KEY AUTOINCREMENT, nickname TEXT NOT NULL);");
  // migrations.ts v21 / v22 と同じ
  db.exec("ALTER TABLE user ADD COLUMN tutorial_completed INTEGER NOT NULL DEFAULT 0;");
  db.exec("ALTER TABLE user ADD COLUMN tutorial_seen_features TEXT NOT NULL DEFAULT '';");
  check("ALTER後 tutorial_completed 列がある", cols(db, "user").includes("tutorial_completed"));
  check("ALTER後 tutorial_seen_features 列がある", cols(db, "user").includes("tutorial_seen_features"));
  db.exec("INSERT INTO user (nickname) VALUES ('既存ユーザー')");
  const u = db.prepare("SELECT tutorial_completed, tutorial_seen_features FROM user LIMIT 1").get();
  check("既存ユーザーは tutorial_completed=0（初回一度は表示）", u.tutorial_completed === 0);
  check("既存ユーザーは tutorial_seen_features='' （各機能の初回説明は未読）", u.tutorial_seen_features === "");
  db.close();
}

console.log(failed === 0 ? "\n全チェック OK" : `\n失敗 ${failed} 件`);
process.exit(failed === 0 ? 0 : 1);
