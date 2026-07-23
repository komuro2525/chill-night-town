// 音楽プレイリスト（要件9）のデータ層の検証。再実行可能な手動検証。
//
// 目的: playlistRepo / settingsRepo（プレイリスト分）と同じSQLを node:sqlite で発行し、
//   DBのルール（お気に入り・プレイリストの並び/重複・再生設定の既定と CHECK・マイグレーション）
//   を確かめる。プレイリストは playlist_entry（1行=1曲・重複可）で持つ。
//
// 実行: node scripts/verify/playlist.mjs

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

// ユーザー＋audio_setting（setupRepo 相当）
run("INSERT INTO user (nickname, daily_goal_minutes) VALUES ('夜子', 60)");
const userId = one("SELECT id FROM user LIMIT 1").id;
run("INSERT INTO audio_setting (user_id) VALUES (?)", userId);

console.log("A. 再生設定（bgm_source / bgm_shuffle / bgm_repeat_one / playlist_name）");
const s0 = one("SELECT bgm_source, bgm_shuffle, bgm_repeat_one, playlist_name FROM audio_setting");
check("既定は all / シャッフルOFF / リピートOFF", s0.bgm_source === "all" && s0.bgm_shuffle === 0 && s0.bgm_repeat_one === 0);
check("プレイリスト名の既定は『マイプレイリスト』", s0.playlist_name === "マイプレイリスト");
run("UPDATE audio_setting SET bgm_source = 'playlist', bgm_shuffle = 1, bgm_repeat_one = 1, playlist_name = '夜の作業用'");
const s1 = one("SELECT bgm_source, bgm_shuffle, bgm_repeat_one, playlist_name FROM audio_setting");
check(
  "ソース・シャッフル・リピート・名前を保存できる",
  s1.bgm_source === "playlist" && s1.bgm_shuffle === 1 && s1.bgm_repeat_one === 1 && s1.playlist_name === "夜の作業用",
);
let sourceCheck = false;
try { run("UPDATE audio_setting SET bgm_source = 'bad'"); } catch { sourceCheck = true; }
check("bgm_source の CHECK で不正値を弾く", sourceCheck);

console.log("B. お気に入り（user_sound_preference）とプレイリスト（playlist_entry・重複可）");
// BGM曲を3曲用意（シードは2曲。1曲足す）
run("INSERT INTO ambient_sound (code, sound_type, name) VALUES ('bgm_x', 'bgm', 'X')");
const bgm = all("SELECT id FROM ambient_sound WHERE sound_type='bgm' ORDER BY id").map((r) => r.id);
check("BGM曲が3曲ある", bgm.length === 3);

// お気に入り（setFavorite 相当）
run(
  "INSERT INTO user_sound_preference (user_id, ambient_sound_id) VALUES (?, ?) ON CONFLICT (user_id, ambient_sound_id) DO NOTHING",
  userId, bgm[0],
);
run("UPDATE user_sound_preference SET is_favorite = 1 WHERE user_id=? AND ambient_sound_id=?", userId, bgm[0]);
const favIds = all("SELECT ambient_sound_id FROM user_sound_preference WHERE user_id=? AND is_favorite=1", userId).map((r) => r.ambient_sound_id);
check("お気に入りを設定できる", favIds.length === 1 && favIds[0] === bgm[0]);

// プレイリストへ追加（addToPlaylist 相当）。bgm[2] → bgm[1] → bgm[2]（重複）
const addEntry = (sid) =>
  run(
    "INSERT INTO playlist_entry (user_id, ambient_sound_id, position) VALUES (?, ?, (SELECT COALESCE(MAX(position),0)+1 FROM playlist_entry WHERE user_id=?))",
    userId, sid, userId,
  );
addEntry(bgm[2]);
addEntry(bgm[1]);
addEntry(bgm[2]); // 同じ曲をもう一度（重複）
const ordered1 = all("SELECT ambient_sound_id FROM playlist_entry WHERE user_id=? ORDER BY position, id", userId).map((r) => r.ambient_sound_id);
check("重複を含めて追加順に並ぶ", JSON.stringify(ordered1) === JSON.stringify([bgm[2], bgm[1], bgm[2]]));
check("同じ曲を複数入れられる（重複可）", ordered1.filter((x) => x === bgm[2]).length === 2);

// 並び替え（reorderPlaylist 相当）: エントリID順を逆にする
const entries = all("SELECT id FROM playlist_entry WHERE user_id=? ORDER BY position, id", userId).map((r) => r.id);
const reversed = [...entries].reverse();
let pos = 1;
for (const eid of reversed) run("UPDATE playlist_entry SET position=? WHERE user_id=? AND id=?", pos++, userId, eid);
const ordered2 = all("SELECT ambient_sound_id FROM playlist_entry WHERE user_id=? ORDER BY position, id", userId).map((r) => r.ambient_sound_id);
check("エントリ単位で並び替えできる", JSON.stringify(ordered2) === JSON.stringify([bgm[2], bgm[1], bgm[2]].reverse()));

// エントリ削除（removeEntries 相当）: 先頭エントリだけ消す（同じ曲の別エントリは残る）
const firstEntry = one("SELECT id, ambient_sound_id FROM playlist_entry WHERE user_id=? ORDER BY position, id LIMIT 1", userId);
run(`DELETE FROM playlist_entry WHERE user_id=? AND id IN (${firstEntry.id})`, userId);
const remain = all("SELECT ambient_sound_id FROM playlist_entry WHERE user_id=? ORDER BY position, id", userId).map((r) => r.ambient_sound_id);
check("エントリ単位で削除でき、同じ曲の別エントリは残る", remain.length === 2 && remain.includes(firstEntry.ambient_sound_id));
check("削除してもお気に入り・曲自体は残る", one("SELECT is_favorite FROM user_sound_preference WHERE user_id=? AND ambient_sound_id=?", userId, bgm[0]).is_favorite === 1);

console.log("C. マイグレーション v15（playlist_entry へ移行・playlist_position を撤去）");
// v14 時点（user_sound_preference が playlist_position を持つ）を再現して v15 を適用する
const mdb = new DatabaseSync(":memory:");
mdb.exec(`
  CREATE TABLE user (id INTEGER PRIMARY KEY);
  INSERT INTO user (id) VALUES (1);
  CREATE TABLE ambient_sound (id INTEGER PRIMARY KEY);
  INSERT INTO ambient_sound (id) VALUES (10), (11);
  CREATE TABLE user_sound_preference (
    user_id INTEGER NOT NULL,
    ambient_sound_id INTEGER NOT NULL,
    is_enabled INTEGER NOT NULL DEFAULT 1,
    is_favorite INTEGER NOT NULL DEFAULT 0,
    playlist_position INTEGER,
    PRIMARY KEY (user_id, ambient_sound_id)
  );
  INSERT INTO user_sound_preference (user_id, ambient_sound_id, is_favorite, playlist_position) VALUES
    (1, 10, 1, 2),   -- お気に入り＋プレイリスト2番目
    (1, 11, 0, 1);   -- プレイリスト1番目
`);
// v15 の up() と同じSQL
mdb.exec(`
  CREATE TABLE playlist_entry (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      ambient_sound_id INTEGER NOT NULL,
      position INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX idx_playlist_entry_user_pos ON playlist_entry(user_id, position);
  INSERT INTO playlist_entry (user_id, ambient_sound_id, position)
  SELECT user_id, ambient_sound_id, playlist_position FROM user_sound_preference WHERE playlist_position IS NOT NULL;
`);
mdb.exec(`
  CREATE TABLE user_sound_preference_new (
      user_id INTEGER NOT NULL,
      ambient_sound_id INTEGER NOT NULL,
      is_enabled INTEGER NOT NULL DEFAULT 1,
      is_favorite INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (user_id, ambient_sound_id)
  );
  INSERT INTO user_sound_preference_new (user_id, ambient_sound_id, is_enabled, is_favorite)
  SELECT user_id, ambient_sound_id, is_enabled, is_favorite FROM user_sound_preference;
  DROP TABLE user_sound_preference;
  ALTER TABLE user_sound_preference_new RENAME TO user_sound_preference;
`);
const migrated = mdb.prepare("SELECT ambient_sound_id FROM playlist_entry ORDER BY position").all().map((r) => r.ambient_sound_id);
check("既存の所属が並び順どおり playlist_entry へ移る", JSON.stringify(migrated) === JSON.stringify([11, 10]));
check("お気に入りは user_sound_preference に残る", mdb.prepare("SELECT is_favorite FROM user_sound_preference WHERE ambient_sound_id=10").get().is_favorite === 1);
let dropped = false;
try { mdb.prepare("SELECT playlist_position FROM user_sound_preference LIMIT 1").get(); } catch { dropped = true; }
check("user_sound_preference から playlist_position が消える", dropped);
mdb.close();

db.close();
console.log(failures === 0 ? "\n全チェック成功" : `\n${failures} 件 失敗`);
process.exit(failures === 0 ? 0 : 1);
