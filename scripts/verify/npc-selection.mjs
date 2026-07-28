// 複数NPC・NPC選択（要件7.1の拡張 / マイグレv19）のデータ層の検証。再実行可能な手動検証。
//
// 目的:
//   1. 新規初期化相当（スキーマ＋本体シード＋seed_npc_v19）で NPC が3人・各52本になる。
//      user.selected_npc_id / active_session.npc_id 列が存在する
//   2. pickNpcMessage 相当のSQL: npc_id 絞り込み・感情一致→感情NULL・既定NPC(1)フォールバック
//   3. selected_npc_id の保存（既定=1、更新できる）
//   4. v19 マイグレーションの ADD COLUMN（旧形状テーブルへ列を足せる・user の既定=1）
//
// 実行: node scripts/verify/npc-selection.mjs

import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p) => readFileSync(join(ROOT, p), "utf8");
const schema = read("db/chill_night_town_スキーマ_v2.sql");
const seed = read("db/chill_night_town_シードデータ.sql");
const npcSeed = read("db/seed_npc_v19.sql");

let failed = 0;
function check(label, cond) {
  console.log(`${cond ? "OK " : "NG "} ${label}`);
  if (!cond) failed++;
}
const cols = (db, table) =>
  db
    .prepare(`SELECT name FROM pragma_table_info(?)`)
    .all(table)
    .map((r) => r.name);

// pickNpcMessage 相当（masterRepo.ts と同じ手順）
function pick(db, npcId, trigger, emotionId) {
  const forNpc = (id) => {
    if (emotionId != null) {
      const r = db
        .prepare(
          `SELECT message FROM npc_message WHERE npc_id=? AND trigger_type=? AND is_active=1 AND emotion_id=? ORDER BY RANDOM() LIMIT 1`,
        )
        .get(id, trigger, emotionId);
      if (r) return r.message;
    }
    const f = db
      .prepare(
        `SELECT message FROM npc_message WHERE npc_id=? AND trigger_type=? AND is_active=1 AND emotion_id IS NULL ORDER BY RANDOM() LIMIT 1`,
      )
      .get(id, trigger);
    return f ? f.message : null;
  };
  const sel = forNpc(npcId);
  if (sel != null) return sel;
  return npcId === 1 ? null : forNpc(1);
}
const ownerOf = (db, message) =>
  db.prepare(`SELECT npc_id FROM npc_message WHERE message=? LIMIT 1`).get(message)
    ?.npc_id;

// --- 1. 新規初期化相当 ---
{
  const db = new DatabaseSync(":memory:");
  db.exec(schema);
  db.exec(seed);
  db.exec(npcSeed);

  const npcCount = db.prepare("SELECT count(*) c FROM npc WHERE is_active=1").get().c;
  check("NPC は3人", npcCount === 3);
  const per = db
    .prepare("SELECT npc_id, count(*) c FROM npc_message GROUP BY npc_id ORDER BY npc_id")
    .all();
  check(
    "各NPC 52本ずつ",
    per.length === 3 && per.every((r) => r.c === 52),
  );
  // 冪等性: seed_npc_v19 を再度流しても件数は増えない（先頭で全消し→入れ直すため）
  db.exec(npcSeed);
  const per2 = db
    .prepare("SELECT npc_id, count(*) c FROM npc_message GROUP BY npc_id")
    .all();
  check("再シードしても各52本のまま（冪等）", per2.every((r) => r.c === 52));
  // 紹介文は改行入り（設定画面で見やすく）
  const descs = db.prepare("SELECT description FROM npc ORDER BY id").all();
  check("3人とも紹介文に改行がある", descs.every((d) => d.description.includes("\n")));
  check("user.selected_npc_id 列がある", cols(db, "user").includes("selected_npc_id"));
  check("active_session.npc_id 列がある", cols(db, "active_session").includes("npc_id"));

  // --- 3. selected_npc_id の既定と更新 ---
  db.exec("INSERT INTO user (nickname) VALUES ('夜子')");
  const def = db.prepare("SELECT selected_npc_id FROM user LIMIT 1").get().selected_npc_id;
  check("selected_npc_id の既定は1", def === 1);
  db.exec("UPDATE user SET selected_npc_id = 2");
  const upd = db.prepare("SELECT selected_npc_id FROM user LIMIT 1").get().selected_npc_id;
  check("selected_npc_id を更新できる", upd === 2);

  // --- 2. pickNpcMessage 相当 ---
  const tired = db.prepare("SELECT id FROM emotion WHERE code='tired'").get().id;
  const m2 = pick(db, 2, "study_end", tired);
  check("npc=2 の感情別メッセージは npc2 のもの", ownerOf(db, m2) === 2);
  const m3 = pick(db, 3, "study_end", tired);
  check("npc=3 は npc3 のもの（NPCで声色が分かれる）", ownerOf(db, m3) === 3 && m3 !== m2);
  const mStart = pick(db, 2, "study_start", null);
  check("感情なしトリガーは感情NULL候補から出る（npc2）", ownerOf(db, mStart) === 2);
  const mFallback = pick(db, 99, "goodnight", null);
  check("未登録NPCは既定NPC(1)へフォールバックする", ownerOf(db, mFallback) === 1);
  const mNoneDefault = pick(db, 1, "study_end", tired);
  check("既定NPC自身は普通に引ける", ownerOf(db, mNoneDefault) === 1);

  db.close();
}

// --- 4. v19 の ADD COLUMN（旧形状テーブルへ列を足す） ---
{
  const db = new DatabaseSync(":memory:");
  // npc は FK 参照先として用意（node:sqlite は既定で FK 無効だが定義上あわせる）
  db.exec(`CREATE TABLE npc (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT);`);
  db.exec(`CREATE TABLE user (id INTEGER PRIMARY KEY AUTOINCREMENT, nickname TEXT NOT NULL);`);
  db.exec(`CREATE TABLE active_session (user_id INTEGER PRIMARY KEY, start_time TEXT NOT NULL);`);
  // migrations.ts v19 と同じ ALTER（REFERENCES は付けない＝SQLiteのADD COLUMN制約回避）
  db.exec(`
    ALTER TABLE user ADD COLUMN selected_npc_id INTEGER NOT NULL DEFAULT 1;
    ALTER TABLE active_session ADD COLUMN npc_id INTEGER;
  `);
  check("ALTER後 user に selected_npc_id がある", cols(db, "user").includes("selected_npc_id"));
  check("ALTER後 active_session に npc_id がある", cols(db, "active_session").includes("npc_id"));
  // 実際のv19では npc(1)＝書店の店主 が既存。selected_npc_id の既定1が参照できる
  db.exec("INSERT INTO npc (id, name) VALUES (1, '書店の店主')");
  db.exec("INSERT INTO user (nickname) VALUES ('既存ユーザー')");
  const d = db.prepare("SELECT selected_npc_id FROM user LIMIT 1").get().selected_npc_id;
  check("既存ユーザーは selected_npc_id=1 になる", d === 1);
  db.close();
}

console.log(failed === 0 ? "\n全チェック OK" : `\n失敗 ${failed} 件`);
process.exit(failed === 0 ? 0 : 1);
