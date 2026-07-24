// カレンダーの予定・メモ（4章）のデータ層の検証。再実行可能な手動検証。
//
// 目的: eventRepo / settingsRepo（予定通知分）と同じSQLを node:sqlite で発行し、
//   予定のCRUD・月内の予定日抽出・予定通知の全体ON/OFF・v16マイグレーションを確かめる。
//
// 実行: node scripts/verify/calendar-event.mjs

import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const schema = readFileSync(join(ROOT, "db", "chill_night_town_スキーマ_v2.sql"), "utf8");
const seed = readFileSync(join(ROOT, "db", "chill_night_town_シードデータ.sql"), "utf8");

const db = new DatabaseSync(":memory:");
db.exec(schema);
db.exec(seed);

let failures = 0;
const check = (name, cond) => {
  console.log(`  ${cond ? "✓" : "✗"} ${name}`);
  if (!cond) failures++;
};
const one = (sql, ...a) => db.prepare(sql).get(...a);
const all = (sql, ...a) => db.prepare(sql).all(...a);
const run = (sql, ...a) => db.prepare(sql).run(...a);

run("INSERT INTO user (nickname, daily_goal_minutes) VALUES ('夜子', 60)");
const userId = one("SELECT id FROM user LIMIT 1").id;
run("INSERT INTO notification_setting (user_id) VALUES (?)", userId);

console.log("A. 予定通知の全体ON/OFF（notification_setting.event_notice_enabled）");
check("既定はOFF(0)", one("SELECT event_notice_enabled FROM notification_setting").event_notice_enabled === 0);
run("UPDATE notification_setting SET event_notice_enabled = 1");
check("ONにできる", one("SELECT event_notice_enabled FROM notification_setting").event_notice_enabled === 1);

console.log("B. 予定のCRUD（calendar_event）");
const add = (date, title) =>
  run("INSERT INTO calendar_event (user_id, event_date, title) VALUES (?, ?, ?)", userId, date, title);
add("2026-08-01", "テスト");
add("2026-08-01", "面談"); // 同じ日に複数
add("2026-08-10", "レポート提出");
add("2026-07-20", "過去の予定");

const aug1 = all("SELECT title FROM calendar_event WHERE user_id=? AND event_date='2026-08-01' ORDER BY id", userId).map((r) => r.title);
check("同じ日に複数の予定を持てる", JSON.stringify(aug1) === JSON.stringify(["テスト", "面談"]));

const dates = all("SELECT DISTINCT event_date FROM calendar_event WHERE user_id=? AND event_date BETWEEN '2026-08-01' AND '2026-08-31' ORDER BY event_date", userId).map((r) => r.event_date);
check("月内の予定日を重複なしで抽出できる", JSON.stringify(dates) === JSON.stringify(["2026-08-01", "2026-08-10"]));

const upcoming = all("SELECT event_date FROM calendar_event WHERE user_id=? AND event_date >= '2026-07-25' ORDER BY event_date, id", userId).map((r) => r.event_date);
check("これから来る予定だけ日付順で取れる（過去は除く）", JSON.stringify(upcoming) === JSON.stringify(["2026-08-01", "2026-08-01", "2026-08-10"]));

// タイトル変更（updateEventTitle 相当。本体は id で更新するが、検証は対象を title で特定）
run("UPDATE calendar_event SET title='期末テスト' WHERE user_id=? AND event_date='2026-08-01' AND title='テスト'", userId);
check("タイトルを変更できる", all("SELECT 1 AS x FROM calendar_event WHERE event_date='2026-08-01' AND title='期末テスト'").length === 1);

// 削除（deleteEvent 相当）。同じ日の別予定（面談）は残る
run("DELETE FROM calendar_event WHERE user_id=? AND event_date='2026-08-01' AND title='期末テスト'", userId);
const remain = all("SELECT title FROM calendar_event WHERE event_date='2026-08-01'").map((r) => r.title);
check("削除できる（同じ日の別予定は残る）", JSON.stringify(remain) === JSON.stringify(["面談"]));

console.log("C. マイグレーション v16（新規テーブル・列追加）");
const mdb = new DatabaseSync(":memory:");
mdb.exec(`
  CREATE TABLE user (id INTEGER PRIMARY KEY);
  INSERT INTO user (id) VALUES (1);
  CREATE TABLE notification_setting (
    user_id INTEGER PRIMARY KEY REFERENCES user(id) ON DELETE CASCADE,
    is_enabled INTEGER NOT NULL DEFAULT 0,
    scheduled_time TEXT,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  INSERT INTO notification_setting (user_id, is_enabled) VALUES (1, 1);
`);
// v16 の up() と同じSQL
mdb.exec(`
  CREATE TABLE calendar_event (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES user(id) ON DELETE CASCADE,
      event_date TEXT NOT NULL,
      title TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX idx_calendar_event_user_date ON calendar_event(user_id, event_date);
`);
mdb.exec("ALTER TABLE notification_setting ADD COLUMN event_notice_enabled INTEGER NOT NULL DEFAULT 0 CHECK (event_notice_enabled IN (0, 1))");
check("calendar_event を作成できる", mdb.prepare("SELECT COUNT(*) AS n FROM calendar_event").get().n === 0);
check("event_notice_enabled を既定0で追加できる（既存の is_enabled は保持）", (() => {
  const r = mdb.prepare("SELECT is_enabled, event_notice_enabled FROM notification_setting").get();
  return r.is_enabled === 1 && r.event_notice_enabled === 0;
})());
mdb.close();

db.close();
console.log(failures === 0 ? "\n全チェック成功" : `\n${failures} 件 失敗`);
process.exit(failures === 0 ? 0 : 1);
