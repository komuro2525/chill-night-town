// 音楽プレイリスト（要件9）のデータ層の検証。再実行可能な手動検証。
//
// 目的: playlistRepo / settingsRepo（プレイリスト分）と同じSQLを node:sqlite で発行し、
//   DBのルール（お気に入り・プレイリスト所属/並び順・再生設定の既定と CHECK）を確かめる。
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

console.log("B. お気に入り・プレイリスト（user_sound_preference）");
// BGM曲を3曲用意（シードは2曲。1曲足す）
run("INSERT INTO ambient_sound (code, sound_type, name) VALUES ('bgm_x', 'bgm', 'X')");
const bgm = all("SELECT id FROM ambient_sound WHERE sound_type='bgm' ORDER BY id").map((r) => r.id);
check("BGM曲が3曲ある", bgm.length === 3);

const ensure = (sid) =>
  run(
    "INSERT INTO user_sound_preference (user_id, ambient_sound_id) VALUES (?, ?) ON CONFLICT (user_id, ambient_sound_id) DO NOTHING",
    userId, sid,
  );

// お気に入りON
ensure(bgm[0]);
run("UPDATE user_sound_preference SET is_favorite = 1 WHERE user_id=? AND ambient_sound_id=?", userId, bgm[0]);
const favIds = all("SELECT ambient_sound_id FROM user_sound_preference WHERE user_id=? AND is_favorite=1 ORDER BY ambient_sound_id", userId).map((r) => r.ambient_sound_id);
check("お気に入りを設定できる", favIds.length === 1 && favIds[0] === bgm[0]);

// プレイリスト追加（末尾position）: bgm[2] → bgm[1] の順で入れる
for (const sid of [bgm[2], bgm[1]]) {
  ensure(sid);
  const max = one("SELECT MAX(playlist_position) AS m FROM user_sound_preference WHERE user_id=?", userId).m;
  run("UPDATE user_sound_preference SET playlist_position=? WHERE user_id=? AND ambient_sound_id=?", (max ?? 0) + 1, userId, sid);
}
const order1 = all("SELECT ambient_sound_id FROM user_sound_preference WHERE user_id=? AND playlist_position IS NOT NULL ORDER BY playlist_position", userId).map((r) => r.ambient_sound_id);
check("追加順（末尾position）で並ぶ", JSON.stringify(order1) === JSON.stringify([bgm[2], bgm[1]]));

// 並び替え（reorderPlaylist 相当）: [bgm[1], bgm[2]] へ
let pos = 1;
for (const sid of [bgm[1], bgm[2]]) {
  run("UPDATE user_sound_preference SET playlist_position=? WHERE user_id=? AND ambient_sound_id=?", pos++, userId, sid);
}
const order2 = all("SELECT ambient_sound_id FROM user_sound_preference WHERE user_id=? AND playlist_position IS NOT NULL ORDER BY playlist_position", userId).map((r) => r.ambient_sound_id);
check("並び替えが反映される", JSON.stringify(order2) === JSON.stringify([bgm[1], bgm[2]]));

// プレイリストから削除（position=NULL）
run("UPDATE user_sound_preference SET playlist_position=NULL WHERE user_id=? AND ambient_sound_id=?", userId, bgm[1]);
const order3 = all("SELECT ambient_sound_id FROM user_sound_preference WHERE user_id=? AND playlist_position IS NOT NULL ORDER BY playlist_position", userId).map((r) => r.ambient_sound_id);
check("削除するとプレイリストから外れる（お気に入りは別軸で残る）", JSON.stringify(order3) === JSON.stringify([bgm[2]]));
check("削除しても行・お気に入りは残る", one("SELECT is_favorite FROM user_sound_preference WHERE user_id=? AND ambient_sound_id=?", userId, bgm[0]).is_favorite === 1);

// 複数まとめて外す（removeManyFromPlaylist 相当）: bgm[0], bgm[2] を IN で NULL に
run("UPDATE user_sound_preference SET playlist_position = (SELECT MAX(playlist_position)+1 FROM user_sound_preference WHERE user_id=?) WHERE user_id=? AND ambient_sound_id=?", userId, userId, bgm[0]);
run(`UPDATE user_sound_preference SET playlist_position = NULL WHERE user_id=? AND ambient_sound_id IN (${bgm[0]}, ${bgm[2]})`, userId);
const order4 = all("SELECT ambient_sound_id FROM user_sound_preference WHERE user_id=? AND playlist_position IS NOT NULL", userId);
check("複数まとめて外せる（IN で position=NULL）", order4.length === 0);

console.log("C. v13 マイグレーション（audio_setting 作り直し）");
// v12 時点の audio_setting（bgm_shuffle DEFAULT 1・playlist_name 無し）を再現して v13 を適用する
const mdb = new DatabaseSync(":memory:");
mdb.exec(`
  CREATE TABLE user (id INTEGER PRIMARY KEY);
  INSERT INTO user (id) VALUES (1);
  CREATE TABLE audio_setting (
    user_id INTEGER PRIMARY KEY REFERENCES user(id) ON DELETE CASCADE,
    bgm_volume INTEGER NOT NULL DEFAULT 50,
    ambient_volume INTEGER NOT NULL DEFAULT 50,
    sfx_volume INTEGER NOT NULL DEFAULT 50,
    bell_volume INTEGER NOT NULL DEFAULT 50,
    bgm_source TEXT NOT NULL DEFAULT 'all',
    bgm_shuffle INTEGER NOT NULL DEFAULT 1,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  INSERT INTO audio_setting (user_id, bgm_volume) VALUES (1, 70);
`);
// v13 の up() と同じ作り直しSQL
mdb.exec(`
  CREATE TABLE audio_setting_new (
    user_id INTEGER PRIMARY KEY REFERENCES user(id) ON DELETE CASCADE,
    bgm_volume INTEGER NOT NULL DEFAULT 50 CHECK (bgm_volume BETWEEN 0 AND 100),
    ambient_volume INTEGER NOT NULL DEFAULT 50 CHECK (ambient_volume BETWEEN 0 AND 100),
    sfx_volume INTEGER NOT NULL DEFAULT 50 CHECK (sfx_volume BETWEEN 0 AND 100),
    bell_volume INTEGER NOT NULL DEFAULT 50 CHECK (bell_volume BETWEEN 0 AND 100),
    bgm_source TEXT NOT NULL DEFAULT 'all' CHECK (bgm_source IN ('all','favorites','playlist')),
    bgm_shuffle INTEGER NOT NULL DEFAULT 0 CHECK (bgm_shuffle IN (0,1)),
    playlist_name TEXT NOT NULL DEFAULT 'マイプレイリスト',
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  INSERT INTO audio_setting_new (user_id, bgm_volume, ambient_volume, sfx_volume, bell_volume, bgm_source, bgm_shuffle, playlist_name, updated_at)
    SELECT user_id, bgm_volume, ambient_volume, sfx_volume, bell_volume, bgm_source, 0, 'マイプレイリスト', updated_at FROM audio_setting;
  DROP TABLE audio_setting;
  ALTER TABLE audio_setting_new RENAME TO audio_setting;
`);
const m = mdb.prepare("SELECT bgm_volume, bgm_shuffle, playlist_name FROM audio_setting").get();
check("既存の音量を保ちつつ列を追加できる", m.bgm_volume === 70);
check("シャッフルは既定OFF(0)へそろえる", m.bgm_shuffle === 0);
check("playlist_name の既定が入る", m.playlist_name === "マイプレイリスト");
// v14: 1曲リピート列を ADD COLUMN で追加（作り直し不要）
mdb.exec("ALTER TABLE audio_setting ADD COLUMN bgm_repeat_one INTEGER NOT NULL DEFAULT 0 CHECK (bgm_repeat_one IN (0, 1))");
const m2 = mdb.prepare("SELECT bgm_repeat_one FROM audio_setting").get();
check("v14: bgm_repeat_one を既定0で追加できる", m2.bgm_repeat_one === 0);
mdb.close();

db.close();
console.log(failures === 0 ? "\n全チェック成功" : `\n${failures} 件 失敗`);
process.exit(failures === 0 ? 0 : 1);
