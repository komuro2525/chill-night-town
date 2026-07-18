// マイグレーション v9（プロジェクト型目標の上限 30000分→44640分）の検証。再実行可能。
//
// 目的: 既存DB（旧CHECK: 60〜30000）を持つユーザー端末で、v9 マイグレーションが
//   town_progress を作り直しても、データを保持し、新しい上限（44640分=744時間）で
//   動くことを確かめる。migrations.ts の version 9 と同一のSQLを実行する。
//
// 実行: node scripts/verify/phase6-target-max-migration.mjs

import { DatabaseSync } from "node:sqlite";

const db = new DatabaseSync(":memory:");
// FK参照先（user/town）は本検証の対象外。CHECK・データ移送・索引だけを見るため無効化する
db.exec("PRAGMA foreign_keys = OFF");

let failures = 0;
function check(name, cond) {
  console.log(cond ? `  ✓ ${name}` : `  ✗ ${name}`);
  if (!cond) failures++;
}
function throws(name, fn) {
  try {
    fn();
    console.log(`  ✗ ${name}（例外が出るべきだが出なかった）`);
    failures++;
  } catch {
    console.log(`  ✓ ${name}`);
  }
}
const one = (sql, ...a) => db.prepare(sql).get(...a);
const run = (sql, ...a) => db.prepare(sql).run(...a);

// --- 旧スキーマ（v8時点）の town_progress を再現する ---
db.exec(`
  CREATE TABLE town_progress (
      id                          INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id                     INTEGER NOT NULL REFERENCES user(id)  ON DELETE CASCADE,
      town_id                     INTEGER NOT NULL REFERENCES town(id)  ON DELETE RESTRICT,
      current_level               INTEGER NOT NULL DEFAULT 1 CHECK (current_level BETWEEN 1 AND 5),
      cumulative_study_minutes    INTEGER NOT NULL DEFAULT 0 CHECK (cumulative_study_minutes >= 0),
      experience_points           INTEGER NOT NULL DEFAULT 0 CHECK (experience_points >= 0),
      subtitle                    TEXT,
      project_target_minutes      INTEGER CHECK (project_target_minutes IS NULL OR project_target_minutes BETWEEN 60 AND 30000),
      is_selected                 INTEGER NOT NULL DEFAULT 0 CHECK (is_selected IN (0, 1)),
      created_at                  TEXT    NOT NULL DEFAULT (datetime('now')),
      updated_at                  TEXT    NOT NULL DEFAULT (datetime('now')),
      UNIQUE (user_id, town_id)
  );
  CREATE UNIQUE INDEX idx_town_progress_selected ON town_progress(user_id) WHERE is_selected = 1;
`);
// 既存データ: 選択中の街（サブタイトル・旧上限ちょうどの目標）と、非選択の街
run(`INSERT INTO town_progress (id, user_id, town_id, current_level, cumulative_study_minutes, experience_points, subtitle, project_target_minutes, is_selected)
     VALUES (1, 1, 10, 3, 500, 4, '試験にむけて', 30000, 1)`);
run(`INSERT INTO town_progress (id, user_id, town_id, current_level, cumulative_study_minutes, experience_points, subtitle, project_target_minutes, is_selected)
     VALUES (2, 1, 11, 1, 0, 0, NULL, NULL, 0)`);

throws("移行前は 30001分（旧上限超）を保存できない", () =>
  run("UPDATE town_progress SET project_target_minutes = 30001 WHERE id = 1"),
);

// --- migrations.ts version 9 と同一の作り直し ---
db.exec(`
  CREATE TABLE town_progress_new (
      id                          INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id                     INTEGER NOT NULL REFERENCES user(id)  ON DELETE CASCADE,
      town_id                     INTEGER NOT NULL REFERENCES town(id)  ON DELETE RESTRICT,
      current_level               INTEGER NOT NULL DEFAULT 1 CHECK (current_level BETWEEN 1 AND 5),
      cumulative_study_minutes    INTEGER NOT NULL DEFAULT 0 CHECK (cumulative_study_minutes >= 0),
      experience_points           INTEGER NOT NULL DEFAULT 0 CHECK (experience_points >= 0),
      subtitle                    TEXT,
      project_target_minutes      INTEGER CHECK (project_target_minutes IS NULL OR project_target_minutes BETWEEN 60 AND 44640),
      is_selected                 INTEGER NOT NULL DEFAULT 0 CHECK (is_selected IN (0, 1)),
      created_at                  TEXT    NOT NULL DEFAULT (datetime('now')),
      updated_at                  TEXT    NOT NULL DEFAULT (datetime('now')),
      UNIQUE (user_id, town_id)
  );
  INSERT INTO town_progress_new
      (id, user_id, town_id, current_level, cumulative_study_minutes, experience_points,
       subtitle, project_target_minutes, is_selected, created_at, updated_at)
  SELECT id, user_id, town_id, current_level, cumulative_study_minutes, experience_points,
         subtitle, project_target_minutes, is_selected, created_at, updated_at
    FROM town_progress;
  DROP TABLE town_progress;
  ALTER TABLE town_progress_new RENAME TO town_progress;
  CREATE UNIQUE INDEX idx_town_progress_selected ON town_progress(user_id) WHERE is_selected = 1;
`);

console.log("v9 マイグレーション後");
check("行数が保たれる（2件）", one("SELECT COUNT(*) c FROM town_progress").c === 2);
const r1 = one("SELECT * FROM town_progress WHERE id = 1");
check("選択中の街の値が保たれる", r1.subtitle === "試験にむけて" && r1.project_target_minutes === 30000 && r1.is_selected === 1 && r1.current_level === 3);
check("選択中は1件のまま", one("SELECT COUNT(*) c FROM town_progress WHERE is_selected = 1").c === 1);
run("UPDATE town_progress SET project_target_minutes = 44640 WHERE id = 1");
check("移行後は 44640分(744時間)を保存できる", one("SELECT project_target_minutes FROM town_progress WHERE id = 1").project_target_minutes === 44640);
throws("移行後も 44641分は CHECK 違反", () =>
  run("UPDATE town_progress SET project_target_minutes = 44641 WHERE id = 1"),
);
throws("部分ユニーク索引は健在（2件目を選択中にできない）", () =>
  run("UPDATE town_progress SET is_selected = 1 WHERE id = 2"),
);

db.close();
console.log(failures === 0 ? "\n全チェック成功" : `\n${failures} 件 失敗`);
process.exit(failures === 0 ? 0 : 1);
