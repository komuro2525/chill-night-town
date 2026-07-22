// マイグレーション v10（街をフォルダ名ベースの4街へ）の検証。再実行可能。
//
// 目的: 既存DB（town_01 / town_02 の2街）を持つ端末で、v10 マイグレーションが
//   - town_01 / town_02 を nightTown / castleTown へ改称し（code / name）
//   - snowTown / starHill を追加し
//   - 既存の育成進捗（town_progress）を保持したまま
//   - 既存ユーザーへ追加2街ぶんの進捗行を作る
//   ことを確かめる。migrations.ts の version 10 と同一のSQLを実行する。
//
// 実行: node scripts/verify/town-folder-migration.mjs

import { DatabaseSync } from "node:sqlite";

const db = new DatabaseSync(":memory:");
db.exec("PRAGMA foreign_keys = OFF");

let failures = 0;
function check(name, cond) {
  console.log(cond ? `  ✓ ${name}` : `  ✗ ${name}`);
  if (!cond) failures++;
}
const one = (sql, ...a) => db.prepare(sql).get(...a);
const all = (sql, ...a) => db.prepare(sql).all(...a);
const run = (sql, ...a) => db.prepare(sql).run(...a);

// --- 既存DB（v9時点）の再現: town 2件・user 1名・town_progress 2件 ---
db.exec(`
  CREATE TABLE town (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    description TEXT,
    display_order INTEGER NOT NULL,
    is_active INTEGER NOT NULL DEFAULT 1
  );
  CREATE TABLE user (id INTEGER PRIMARY KEY AUTOINCREMENT);
  CREATE TABLE town_progress (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    town_id INTEGER NOT NULL,
    current_level INTEGER NOT NULL DEFAULT 1,
    cumulative_study_minutes INTEGER NOT NULL DEFAULT 0,
    experience_points INTEGER NOT NULL DEFAULT 0,
    subtitle TEXT,
    project_target_minutes INTEGER,
    is_selected INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE (user_id, town_id)
  );
`);
run("INSERT INTO town (id, code, name, description, display_order) VALUES (1, 'town_01', '第一の街（仮）', 'x', 1)");
run("INSERT INTO town (id, code, name, description, display_order) VALUES (2, 'town_02', '第二の街（仮）', 'x', 2)");
run("INSERT INTO user (id) VALUES (1)");
// 選択中の街1（育成が進んでいる・サブタイトルあり）と、非選択の街2
run(`INSERT INTO town_progress (user_id, town_id, current_level, cumulative_study_minutes, experience_points, subtitle, is_selected)
     VALUES (1, 1, 4, 900, 12, '試験にむけて', 1)`);
run(`INSERT INTO town_progress (user_id, town_id, is_selected) VALUES (1, 2, 0)`);

// --- migrations.ts version 10 と同一のSQL ---
db.exec(`
  UPDATE town SET code = 'nightTown',  name = 'nightTown'  WHERE code = 'town_01';
  UPDATE town SET code = 'castleTown', name = 'castleTown' WHERE code = 'town_02';
  INSERT INTO town (code, name, description, display_order) VALUES
      ('snowTown', 'snowTown', 'テーマ未定。素材制作時に名称・説明を更新する', 3),
      ('starHill', 'starHill', 'テーマ未定。素材制作時に名称・説明を更新する', 4);
  INSERT INTO town_progress (user_id, town_id)
  SELECT u.id, t.id
    FROM user u
    CROSS JOIN town t
   WHERE t.code IN ('snowTown', 'starHill')
     AND NOT EXISTS (
       SELECT 1 FROM town_progress tp
        WHERE tp.user_id = u.id AND tp.town_id = t.id
     );
`);

console.log("v10 マイグレーション後");

// A. 街マスタ
check("街が4件になる", one("SELECT COUNT(*) c FROM town").c === 4);
check("town_01 → nightTown（code/name とも）", (() => {
  const t = one("SELECT code, name FROM town WHERE id = 1");
  return t.code === "nightTown" && t.name === "nightTown";
})());
check("town_02 → castleTown（code/name とも）", (() => {
  const t = one("SELECT code, name FROM town WHERE id = 2");
  return t.code === "castleTown" && t.name === "castleTown";
})());
check("snowTown / starHill が display_order 3,4 で追加される", (() => {
  const rows = all("SELECT code, display_order FROM town WHERE code IN ('snowTown','starHill') ORDER BY display_order");
  return rows.length === 2 && rows[0].code === "snowTown" && rows[0].display_order === 3 && rows[1].code === "starHill" && rows[1].display_order === 4;
})());
check("code は一意のまま（重複なし）", one("SELECT COUNT(DISTINCT code) d, COUNT(*) c FROM town").d === 4);

// B. 既存の育成進捗が保持される（改称は id 据え置きのため失われない）
check("nightTown の育成進捗が保たれる", (() => {
  const p = one("SELECT * FROM town_progress WHERE town_id = 1");
  return p.current_level === 4 && p.cumulative_study_minutes === 900 && p.experience_points === 12 && p.subtitle === "試験にむけて" && p.is_selected === 1;
})());
check("選択中は1件のまま（他所を勝手に選択しない）", one("SELECT COUNT(*) c FROM town_progress WHERE is_selected = 1").c === 1);

// C. 既存ユーザーへ追加2街の進捗行が作られる
check("既存ユーザーの進捗行が 4件（2→4）になる", one("SELECT COUNT(*) c FROM town_progress WHERE user_id = 1").c === 4);
check("追加街の進捗は Lv1・未選択・未育成", (() => {
  const rows = all(`SELECT tp.current_level, tp.is_selected, tp.cumulative_study_minutes
                      FROM town_progress tp JOIN town t ON t.id = tp.town_id
                     WHERE t.code IN ('snowTown','starHill')`);
  return rows.length === 2 && rows.every((r) => r.current_level === 1 && r.is_selected === 0 && r.cumulative_study_minutes === 0);
})());

// D. 冪等性の確認は不要（version 管理で一度きり適用）だが、二重挿入しない条件（NOT EXISTS）を確認
db.exec(`
  INSERT INTO town_progress (user_id, town_id)
  SELECT u.id, t.id FROM user u CROSS JOIN town t
   WHERE t.code IN ('snowTown', 'starHill')
     AND NOT EXISTS (SELECT 1 FROM town_progress tp WHERE tp.user_id = u.id AND tp.town_id = t.id);
`);
check("同じSQLを再実行しても進捗行は増えない（NOT EXISTS ガード）", one("SELECT COUNT(*) c FROM town_progress WHERE user_id = 1").c === 4);

db.close();
console.log(failures === 0 ? "\n全チェック成功" : `\n${failures} 件 失敗`);
process.exit(failures === 0 ? 0 : 1);
