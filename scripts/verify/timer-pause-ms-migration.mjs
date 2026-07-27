// 一時停止の累積をミリ秒で持つ変更（要件3.2）のデータ層の検証。再実行可能な手動検証。
//
// 目的:
//   1. 最新スキーマの active_session が paused_accumulated_ms を持つ（旧 _seconds は無い）
//   2. v18 マイグレーション（列名変更＋×1000）で既存の秒→ミリ秒へ正しく変換される
//   3. resume() の SQL（julianday によるミリ秒累積）が秒未満の停止も丸めずに積む
//
// 実行: node scripts/verify/timer-pause-ms-migration.mjs

import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const schema = readFileSync(join(ROOT, "db", "chill_night_town_スキーマ_v2.sql"), "utf8");
const seed = readFileSync(join(ROOT, "db", "chill_night_town_シードデータ.sql"), "utf8");

let failed = 0;
function check(label, cond) {
  console.log(`${cond ? "OK " : "NG "} ${label}`);
  if (!cond) failed++;
}

// --- 1. 最新スキーマは paused_accumulated_ms を持つ ---
{
  const db = new DatabaseSync(":memory:");
  db.exec(schema);
  db.exec(seed);
  const cols = db
    .prepare("SELECT name FROM pragma_table_info('active_session')")
    .all()
    .map((r) => r.name);
  check("最新スキーマに paused_accumulated_ms がある", cols.includes("paused_accumulated_ms"));
  check("最新スキーマに旧 paused_accumulated_seconds は無い", !cols.includes("paused_accumulated_seconds"));
  db.close();
}

// --- 2. v18 マイグレーション（旧・秒 → ミリ秒）---
{
  const db = new DatabaseSync(":memory:");
  // 旧カラムの最小テーブルを用意して1行入れる
  db.exec(`CREATE TABLE active_session(
    start_time TEXT NOT NULL,
    paused_accumulated_seconds INTEGER NOT NULL DEFAULT 0 CHECK (paused_accumulated_seconds >= 0),
    pause_started_at TEXT
  );`);
  db.exec("INSERT INTO active_session(start_time, paused_accumulated_seconds) VALUES('2026-01-10T14:00:00.000Z', 7)");
  // migrations.ts の v18 と同じ SQL
  db.exec(`
    ALTER TABLE active_session RENAME COLUMN paused_accumulated_seconds TO paused_accumulated_ms;
    UPDATE active_session SET paused_accumulated_ms = paused_accumulated_ms * 1000;
  `);
  const ms = db.prepare("SELECT paused_accumulated_ms AS ms FROM active_session").get().ms;
  check("7秒 → 7000ミリ秒へ変換される", ms === 7000);
  // 列名変更後も CHECK (>=0) が生きている
  let checkAlive = false;
  try { db.exec("UPDATE active_session SET paused_accumulated_ms = -1"); }
  catch { checkAlive = true; }
  check("列名変更後も CHECK(>=0) が有効", checkAlive);
  db.close();
}

// --- 3. resume() の julianday ミリ秒累積 ---
{
  const db = new DatabaseSync(":memory:");
  db.exec(schema);
  db.exec(seed);
  db.prepare("INSERT INTO user (nickname, daily_goal_minutes) VALUES ('夜子', 60)").run();
  const userId = db.prepare("SELECT id FROM user LIMIT 1").get().id;
  const townId = db.prepare("SELECT id FROM town LIMIT 1").get().id;
  // 一時停止中の simple セッションを1件作る（累積は既に 200ms あるとする）
  db.prepare(
    `INSERT INTO active_session
       (user_id, town_id, timer_mode, planned_minutes, start_time, paused_accumulated_ms, pause_started_at)
     VALUES (?, ?, 'simple', 30, '2026-01-10T14:00:00.000Z', 200, '2026-01-10T14:05:00.900Z')`,
  ).run(userId, townId);

  // activeSessionRepo.resume() と同じ SQL。0.2秒（200ms）の停止を累積へ足す
  db.prepare(
    `UPDATE active_session
        SET paused_accumulated_ms =
              paused_accumulated_ms
              + MAX(0, CAST(ROUND((julianday(?) - julianday(pause_started_at)) * 86400000) AS INTEGER)),
            pause_started_at = NULL,
            updated_at = datetime('now')
      WHERE pause_started_at IS NOT NULL`,
  ).run("2026-01-10T14:05:01.100Z");

  const row = db.prepare("SELECT paused_accumulated_ms AS ms, pause_started_at AS p FROM active_session").get();
  // 既存200ms + 今回の停止 約200ms = 約400ms（julianday の丸めで ±1ms 許容）
  check("秒未満の停止も丸めずに累積される（≒400ms）", Math.abs(row.ms - 400) <= 1);
  check("再開後は pause_started_at が NULL", row.p === null);
  db.close();
}

console.log(failed === 0 ? "\n全チェック OK" : `\n失敗 ${failed} 件`);
process.exit(failed === 0 ? 0 : 1);
