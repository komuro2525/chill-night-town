// カレンダーからのタグ・メモ編集（sessionRepo.updateSessionContent）のDB検証。再実行可能。
//
// 目的: 過去の学習記録のタグ・メモだけを書き換え、**感情は保持する**こと（要件4.1）を確かめる。
//   updateSessionContent と同一のSQLを実スキーマ＋シードに対して実行する。
//
// 実行: node scripts/verify/session-content-edit.mjs

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
function check(name, cond) {
  console.log(cond ? `  ✓ ${name}` : `  ✗ ${name}`);
  if (!cond) failures++;
}
const one = (sql, ...a) => db.prepare(sql).get(...a);
const all = (sql, ...a) => db.prepare(sql).all(...a);
const run = (sql, ...a) => db.prepare(sql).run(...a);

// updateSessionContent と同一のSQL（感情には触れない）
function updateSessionContent(sessionId, memo, tagIds) {
  run(
    "UPDATE study_session SET memo = ?, updated_at = datetime('now') WHERE id = ?",
    memo && memo.length > 0 ? memo : null,
    sessionId,
  );
  run("DELETE FROM session_tag WHERE study_session_id = ?", sessionId);
  for (const t of tagIds) {
    run("INSERT INTO session_tag (study_session_id, study_tag_id) VALUES (?, ?)", sessionId, t);
  }
}

// --- 準備: ユーザーと、感情・メモ・タグ付きの学習記録を1件作る ---
run("INSERT INTO user (nickname, daily_goal_minutes) VALUES ('夜子', 60)");
const userId = one("SELECT id FROM user LIMIT 1").id;
const townId = one("SELECT id FROM town WHERE is_active = 1 ORDER BY display_order LIMIT 1").id;
// 感情=achievement, 標準タグ 1,2 を付与, メモ 'old'。updated_at は古い値にしておく
run(
  `INSERT INTO study_session
     (user_id, town_id, emotion_id, timer_mode, study_date, start_time, end_time,
      planned_minutes, duration_minutes, memo, updated_at)
   VALUES (?, ?, ?, 'simple', '2026-01-10', '2026-01-10T21:00:00.000Z', '2026-01-10T21:30:00.000Z',
           30, 30, 'old', '2000-01-01 00:00:00')`,
  userId, townId,
  one("SELECT id FROM emotion WHERE code = 'achievement'").id,
);
const sessionId = one("SELECT id FROM study_session LIMIT 1").id;
const emotionBefore = one("SELECT emotion_id FROM study_session WHERE id = ?", sessionId).emotion_id;
run("INSERT INTO session_tag (study_session_id, study_tag_id) VALUES (?, 1), (?, 2)", sessionId, sessionId);

console.log("A. タグ・メモの更新");
updateSessionContent(sessionId, "new memo", [3]); // タグを 1,2 → 3 に張り替え
const afterA = one("SELECT emotion_id, memo, updated_at FROM study_session WHERE id = ?", sessionId);
check("メモが更新される", afterA.memo === "new memo");
check("感情は保持される（emotion_id 不変）", afterA.emotion_id === emotionBefore && afterA.emotion_id !== null);
check("updated_at が更新される", afterA.updated_at !== "2000-01-01 00:00:00");
const tagsA = all("SELECT study_tag_id FROM session_tag WHERE study_session_id = ? ORDER BY study_tag_id", sessionId).map((r) => r.study_tag_id);
check("タグが張り替わる（1,2 → 3）", JSON.stringify(tagsA) === JSON.stringify([3]));

console.log("B. メモを空に・タグを全消し");
updateSessionContent(sessionId, "", []);
const afterB = one("SELECT emotion_id, memo FROM study_session WHERE id = ?", sessionId);
check("空メモは NULL になる", afterB.memo === null);
check("感情はなお保持される", afterB.emotion_id === emotionBefore);
check("タグを全て外せる", all("SELECT 1 FROM session_tag WHERE study_session_id = ?", sessionId).length === 0);

console.log("C. マイタグ含む複数タグの付与");
run("INSERT INTO study_tag (user_id, name, is_custom, is_active, display_order) VALUES (?, '英作文', 1, 1, 1)", userId);
const myTagId = one("SELECT id FROM study_tag WHERE name = '英作文'").id;
updateSessionContent(sessionId, "再開", [1, myTagId]);
const tagsC = all("SELECT study_tag_id FROM session_tag WHERE study_session_id = ? ORDER BY study_tag_id", sessionId).map((r) => r.study_tag_id);
check("標準タグ＋マイタグを付与できる", JSON.stringify(tagsC) === JSON.stringify([1, myTagId].sort((a, b) => a - b)));

db.close();
console.log(failures === 0 ? "\n全チェック成功" : `\n${failures} 件 失敗`);
process.exit(failures === 0 ? 0 : 1);
