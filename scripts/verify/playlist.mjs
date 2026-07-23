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

console.log("A. 再生設定（audio_setting の bgm_source / bgm_shuffle）");
const s0 = one("SELECT bgm_source, bgm_shuffle FROM audio_setting");
check("既定は all / シャッフルON", s0.bgm_source === "all" && s0.bgm_shuffle === 1);
run("UPDATE audio_setting SET bgm_source = 'playlist', bgm_shuffle = 0");
const s1 = one("SELECT bgm_source, bgm_shuffle FROM audio_setting");
check("ソース・シャッフルを保存できる", s1.bgm_source === "playlist" && s1.bgm_shuffle === 0);
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

db.close();
console.log(failures === 0 ? "\n全チェック成功" : `\n${failures} 件 失敗`);
process.exit(failures === 0 ? 0 : 1);
