// 街ごとのNPC配置（要件7.1 / マイグレv24）のデータ層の検証。再実行可能な手動検証。
//
// 目的:
//   1. 新規初期化相当（スキーマ＋本体シード＋seed_npc）で、住人が街ごとに1人ずつ紐づく。
//      user から selected_npc_id が消え、active_session.npc_id（スナップショット）は残る
//   2. getNpcByTown 相当のSQL: 選択中の街から住人を1人引ける
//   3. pickNpcMessage 相当: その街の住人の声で出る。文面が未整備の街（城下町・雪国）は
//      既定NPC(1)＝書店の店主へフォールバックする
//   4. seed_npc.sql の冪等性（何度流しても本数が変わらない・住人が増えない）
//   5. v24 マイグレーションが旧形状のDBで通る（town_id 追加／退去した住人の参照外し／
//      selected_npc_id の DROP COLUMN）
//
// 実行: node scripts/verify/npc-town.mjs

import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p) => readFileSync(join(ROOT, p), "utf8");
const schema = read("db/chill_night_town_スキーマ_v2.sql");
const seed = read("db/chill_night_town_シードデータ.sql");
const npcSeed = read("db/seed_npc.sql");

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

// masterRepo.getNpcByTown 相当（同じ街に複数いれば id の小さい方＝既定の住人）
const npcOfTown = (db, code) =>
  db
    .prepare(
      `SELECT n.id, n.name FROM npc n JOIN town t ON t.id = n.town_id
        WHERE t.code = ? AND n.is_active = 1 ORDER BY n.id LIMIT 1`,
    )
    .get(code);

// masterRepo.pickNpcMessage 相当（同じ手順で追う）
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

  check("user に selected_npc_id 列が無い", !cols(db, "user").includes("selected_npc_id"));
  check("npc に town_id 列がある", cols(db, "npc").includes("town_id"));
  check(
    "active_session.npc_id（開始時のスナップショット）は残っている",
    cols(db, "active_session").includes("npc_id"),
  );

  // 住人は街ごとに1人。街が違えば別人であること（声色が街に紐づく）
  const bookstore = npcOfTown(db, "nightTown");
  const observatory = npcOfTown(db, "starHill");
  const teahouse = npcOfTown(db, "castleTown");
  const stove = npcOfTown(db, "snowTown");
  check("夜の街の住人は書店の店主(1)", bookstore?.id === 1 && bookstore.name === "書店の店主");
  check(
    "星見の丘の住人は天文台の管理人(3)",
    observatory?.id === 3 && observatory.name === "天文台の管理人",
  );
  check("夜桜の城下町の住人は茶屋の女将(4)", teahouse?.id === 4);
  check("雪国の住人はストーブ番の若者(5)", stove?.id === 5);
  check(
    "住人はすべて街に属している（town_id が空の住人がいない）",
    db.prepare("SELECT count(*) c FROM npc WHERE town_id IS NULL").get().c === 0,
  );
  check(
    "1つの街に住人は1人（当初の配置）",
    db
      .prepare(
        "SELECT count(*) c FROM (SELECT town_id FROM npc GROUP BY town_id HAVING count(*) > 1)",
      )
      .get().c === 0,
  );
  // 旧2人目（喫茶店のマスター）はセリフ集から外れたので退去済み
  check(
    "セリフ集に載っていない住人はDBにいない（id=2 は欠番）",
    db.prepare("SELECT count(*) c FROM npc WHERE id = 2").get().c === 0,
  );
  check(
    "退去した住人のメッセージも残っていない",
    db.prepare("SELECT count(*) c FROM npc_message WHERE npc_id = 2").get().c === 0,
  );

  // 文面の本数（セリフ集の内訳: 感情なし＋感情ごと）
  const countOf = (id) =>
    db.prepare("SELECT count(*) c FROM npc_message WHERE npc_id=?").get(id).c;
  check("書店の店主は52本", countOf(1) === 52);
  check("天文台の管理人は52本", countOf(3) === 52);
  check(
    "文面が未整備の住人は0本（茶屋の女将・ストーブ番の若者）",
    countOf(4) === 0 && countOf(5) === 0,
  );
  check(
    "紹介文は全員に入っている（改行入りで設定画面に出せる）",
    db
      .prepare("SELECT description FROM npc")
      .all()
      .every((d) => d.description && d.description.includes("\n")),
  );

  // --- 4. 冪等性 ---
  db.exec(npcSeed);
  check("再シードしても本数は変わらない（冪等）", countOf(1) === 52 && countOf(3) === 52);
  check("再シードしても住人は増えない", db.prepare("SELECT count(*) c FROM npc").get().c === 4);

  // --- 2 & 3. メッセージの選択 ---
  const tired = db.prepare("SELECT id FROM emotion WHERE code='tired'").get().id;
  const mNight = pick(db, bookstore.id, "study_end", tired);
  check("夜の街では書店の店主の声で出る", ownerOf(db, mNight) === 1);
  const mHill = pick(db, observatory.id, "study_end", tired);
  check(
    "星見の丘では天文台の管理人の声で出る（街で声色が分かれる）",
    ownerOf(db, mHill) === 3 && mHill !== mNight,
  );
  const mHillStart = pick(db, observatory.id, "study_start", null);
  check("感情なしのタイミングも街の住人から出る", ownerOf(db, mHillStart) === 3);
  // 文面が未整備の街は、既定の住人が代わりに話す（無言にはしない）
  const mCastle = pick(db, teahouse.id, "goodnight", null);
  check("文面が未整備の城下町は既定NPC(1)へフォールバックする", ownerOf(db, mCastle) === 1);
  const mSnow = pick(db, stove.id, "goal_achieved", tired);
  check("文面が未整備の雪国も既定NPC(1)へフォールバックする", ownerOf(db, mSnow) === 1);

  db.close();
}

// --- 5. v24 マイグレーション（旧形状のDBへ適用できるか） ---
{
  const db = new DatabaseSync(":memory:");
  // v23 時点の形状を最小限で再現する（npc に town_id が無く、user が住人を選んでいる状態）
  db.exec(`
    CREATE TABLE town (id INTEGER PRIMARY KEY AUTOINCREMENT, code TEXT NOT NULL UNIQUE, name TEXT NOT NULL);
    CREATE TABLE emotion (id INTEGER PRIMARY KEY AUTOINCREMENT, code TEXT NOT NULL UNIQUE);
    CREATE TABLE npc (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        description TEXT,
        is_active INTEGER NOT NULL DEFAULT 1
    );
    CREATE TABLE npc_message (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        npc_id INTEGER NOT NULL REFERENCES npc(id) ON DELETE CASCADE,
        trigger_type TEXT NOT NULL,
        emotion_id INTEGER REFERENCES emotion(id) ON DELETE RESTRICT,
        message TEXT NOT NULL,
        is_active INTEGER NOT NULL DEFAULT 1
    );
    CREATE TABLE user (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nickname TEXT NOT NULL,
        selected_npc_id INTEGER NOT NULL DEFAULT 1 REFERENCES npc(id) ON DELETE RESTRICT
    );
    CREATE TABLE active_session (
        user_id INTEGER PRIMARY KEY,
        start_time TEXT NOT NULL,
        npc_id INTEGER REFERENCES npc(id) ON DELETE RESTRICT
    );
  `);
  db.exec(`
    INSERT INTO town (code, name) VALUES
      ('nightTown','夜の街'),('castleTown','城下町'),('snowTown','雪国'),('starHill','星見の丘');
    INSERT INTO emotion (code) VALUES
      ('achievement'),('focused'),('persevered'),('enjoyed'),('calm'),('as_usual'),
      ('sleepy'),('tired'),('down'),('anxious'),('stuck');
    INSERT INTO npc (id, name) VALUES (1,'書店の店主'),(2,'喫茶店のマスター'),(3,'天文台の管理人');
    INSERT INTO npc_message (npc_id, trigger_type, message) VALUES (2,'goodnight','旧マスターの一言');
    INSERT INTO user (nickname, selected_npc_id) VALUES ('夜子', 2);
    -- 退去する住人を指したまま計測中のセッションがある状態（学習中に移行が走るケース）
    INSERT INTO active_session (user_id, start_time, npc_id) VALUES (1, '2026-08-01T23:00:00', 2);
  `);
  // FK を有効にした状態で通ることを確かめる（アプリは常に ON。RESTRICT に触れないか）
  db.exec("PRAGMA foreign_keys = ON");

  // migrations.ts の v24 と同じ手順。
  // 順序が重要: user.selected_npc_id が退去する住人（旧2人目）を指していると、
  // FK（ON DELETE RESTRICT）でシードの DELETE が失敗する。先に列を落とす。
  db.exec("ALTER TABLE npc ADD COLUMN town_id INTEGER");
  db.exec("ALTER TABLE user DROP COLUMN selected_npc_id");
  db.exec(npcSeed);

  check(
    "v24後: user から selected_npc_id が消えている",
    !cols(db, "user").includes("selected_npc_id"),
  );
  check("v24後: npc に town_id がある", cols(db, "npc").includes("town_id"));
  check(
    "v24後: 退去した住人（旧2人目）が消えている",
    db.prepare("SELECT count(*) c FROM npc WHERE id=2").get().c === 0,
  );
  check(
    "v24後: 退去した住人を指していた計測中セッションは NULL になる（既定の住人が代弁）",
    db.prepare("SELECT npc_id FROM active_session WHERE user_id=1").get().npc_id === null,
  );
  check("v24後: 夜の街の住人を引ける", npcOfTown(db, "nightTown")?.id === 1);
  check("v24後: 星見の丘の住人を引ける", npcOfTown(db, "starHill")?.id === 3);
  check(
    "v24後: 新しい住人（茶屋の女将・ストーブ番の若者）が追加されている",
    npcOfTown(db, "castleTown")?.id === 4 && npcOfTown(db, "snowTown")?.id === 5,
  );
  check(
    "v24後: 文面は最新（旧マスターのメッセージは残っていない）",
    db.prepare("SELECT count(*) c FROM npc_message WHERE message='旧マスターの一言'").get().c === 0,
  );

  db.close();
}

console.log(failed === 0 ? "\n全チェック OK" : `\n失敗 ${failed} 件`);
process.exit(failed === 0 ? 0 : 1);
