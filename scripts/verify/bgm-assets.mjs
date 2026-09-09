// BGM曲目録（要件9）の検証。再実行可能な手動検証。
//
// 目的: BGMは「DBの行（曲名・アーティスト）」と「アプリの静的 require（実際に鳴る音）」の
//   二か所に分かれて存在する。片方だけに足すと、一覧に出るのに鳴らない／鳴らせるのに
//   一覧に出ない、という食い違いが起きる。ここでは次を確かめる。
//   1. db/seed_bgm.sql が新規初期化（スキーマ＋本体シード）の上で流れ、79曲入る
//   2. seed_bgm.sql の冪等性（何度流しても増えない・上書きで内容が揃う）
//   3. seed_bgm.sql・src/constants/audioAssets.ts・実ファイルの三者が過不足なく一致する
//   4. 全曲にジャンルが入っていること（要件9・改訂55）。ジャンル未設定の曲は
//      既定の「しずかな夜」で鳴らないまま一覧にだけ出るため、取りこぼしを検出する
//   5. v35 相当: 旧79曲のDBへ流すと109曲になり、同じ音源だった modus「Melty Night」が消え、
//      ループあり版へ差し替えた「ローファイ少女は今日も寝不足」の file_path が更新される
//      （code は変えないので、お気に入り・プレイリストは外れない）
//
// 実行: node scripts/verify/bgm-assets.mjs

import { DatabaseSync } from "node:sqlite";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p) => readFileSync(join(ROOT, p), "utf8");
const schema = read("db/chill_night_town_スキーマ_v2.sql");
const seed = read("db/chill_night_town_シードデータ.sql");
const bgmSeed = read("db/seed_bgm.sql");

let failures = 0;
const check = (name, cond) => {
  console.log(`  ${cond ? "✓" : "✗"} ${name}`);
  if (!cond) failures++;
};

// ---------------------------------------------------------------------
console.log("A. 新規初期化（スキーマ＋本体シード＋seed_bgm）");
const db = new DatabaseSync(":memory:");
db.exec(schema);
db.exec(seed);
db.exec(bgmSeed);

const all = (sql, ...a) => db.prepare(sql).all(...a);
const one = (sql, ...a) => db.prepare(sql).get(...a);

const tracks = all(
  "SELECT code, name, artist, genre, file_path FROM ambient_sound WHERE sound_type='bgm' ORDER BY id",
);
check("BGMが109曲入る", tracks.length === 109);
check(
  "曲名・アーティスト・パスがすべて埋まっている",
  tracks.every((t) => t.name && t.artist && t.file_path),
);

const noGenre = tracks.filter((t) => !t.genre);
check(
  `全曲にジャンルが入っている${noGenre.length ? `（未設定: ${noGenre.map((t) => t.code)}）` : ""}`,
  noGenre.length === 0,
);
const byGenre = tracks.reduce((a, t) => ((a[t.genre] = (a[t.genre] ?? 0) + 1), a), {});
console.log(
  `    内訳: しずかな夜 ${byGenre.calm ?? 0} / 夜の街 ${byGenre.city ?? 0} / クラシック ${byGenre.classic ?? 0}`,
);
check(
  "3ジャンルとも1曲以上ある（どのタブも空にならない）",
  (byGenre.calm ?? 0) > 0 && (byGenre.city ?? 0) > 0 && (byGenre.classic ?? 0) > 0,
);
check(
  "既定のジャンル（しずかな夜）が最も多い＝既定で十分な曲数が鳴る",
  (byGenre.calm ?? 0) >= (byGenre.city ?? 0) && (byGenre.calm ?? 0) >= (byGenre.classic ?? 0),
);

// 同じ音源が別の曲として二重に入っていないか（配布元から別名で保存された取り違えの検出）
const byHash = new Map();
for (const t of tracks) {
  const h = createHash("md5").update(readFileSync(join(ROOT, t.file_path))).digest("hex");
  if (!byHash.has(h)) byHash.set(h, []);
  byHash.get(h).push(t.code);
}
const sameAudio = [...byHash.values()].filter((v) => v.length > 1);
check(
  `中身が同じ音源が2曲として入っていない${sameAudio.length ? `（${JSON.stringify(sameAudio)}）` : ""}`,
  sameAudio.length === 0,
);

// ---------------------------------------------------------------------
console.log("B. seed_bgm.sql の冪等性");
db.exec("UPDATE ambient_sound SET name = 'ずれた曲名' WHERE code = 'bgm_223am'");
db.exec(bgmSeed);
check(
  "流し直しても曲数は増えない",
  one("SELECT COUNT(*) AS n FROM ambient_sound WHERE sound_type='bgm'").n === 109,
);
check(
  "流し直すと曲名が正へ戻る（code で上書き）",
  one("SELECT name FROM ambient_sound WHERE code='bgm_223am'").name === "2:23 AM",
);

// ---------------------------------------------------------------------
console.log("C. DBの行・静的require・実ファイルの一致");
const assets = read("src/constants/audioAssets.ts");
const bgmBlock = assets
  .split("const BGM: Record<string, AudioSource> = {")[1]
  .split("};")[0];
const assetEntries = [
  ...bgmBlock.matchAll(/^\s*(\w+): require\("@\/(.+?)"\),$/gm),
].map((m) => ({ code: m[1], file: m[2] }));

check("audioAssets.ts のBGMも109曲", assetEntries.length === 109);
check(
  "キーの重複が無い",
  new Set(assetEntries.map((e) => e.code)).size === assetEntries.length,
);

const assetMap = new Map(assetEntries.map((e) => [e.code, e.file]));
const missingInCode = tracks.filter((t) => !assetMap.has(t.code)).map((t) => t.code);
check(`全曲が audioAssets.ts に登録されている${missingInCode.length ? `（不足: ${missingInCode}）` : ""}`,
  missingInCode.length === 0);

const pathMismatch = tracks.filter(
  (t) => assetMap.has(t.code) && assetMap.get(t.code) !== t.file_path,
);
check(
  `file_path と require のパスが一致する${pathMismatch.length ? `（ずれ: ${pathMismatch.map((t) => t.code)}）` : ""}`,
  pathMismatch.length === 0,
);

const dbCodes = new Set(tracks.map((t) => t.code));
const orphanCode = assetEntries.filter((e) => !dbCodes.has(e.code)).map((e) => e.code);
check(`DBに無いキーが audioAssets.ts に残っていない${orphanCode.length ? `（余分: ${orphanCode}）` : ""}`,
  orphanCode.length === 0);

const missingFile = tracks.filter((t) => !existsSync(join(ROOT, t.file_path)));
check(
  `実ファイルがすべて存在する${missingFile.length ? `（不足: ${missingFile.map((t) => t.file_path)}）` : ""}`,
  missingFile.length === 0,
);

const walk = (dir) =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)],
  );
const onDisk = walk(join(ROOT, "assets/audio/bgm"))
  .filter((f) => f.toLowerCase().endsWith(".mp3"))
  .map((f) => f.slice(ROOT.length + 1).replaceAll("\\", "/"));
const dbPaths = new Set(tracks.map((t) => t.file_path));
const unregistered = onDisk.filter((f) => !dbPaths.has(f));
check(`置いてあるのに未登録のファイルが無い${unregistered.length ? `（未登録: ${unregistered}）` : ""}`,
  unregistered.length === 0);

// ---------------------------------------------------------------------
console.log("D. マイグレーション v35（旧79曲・ジャンル無しのDBへ流す）");
const old = new DatabaseSync(":memory:");
old.exec(schema);
old.exec(seed);
// v34 のDBの形（genre 列がまだ無い）に戻してから、v35 の中身を流す
old.exec("ALTER TABLE ambient_sound DROP COLUMN genre");
old.exec("ALTER TABLE audio_setting DROP COLUMN bgm_genre");
old.exec(`
  INSERT INTO ambient_sound (code, sound_type, name, artist, file_path) VALUES
    ('bgm_223am', 'bgm', '2:23 AM', 'しゃろう', 'assets/audio/bgm/2_23_AM.mp3'),
    ('bgm_lofigirl', 'bgm', 'ローファイ少女は今日も寝不足', 'しゃろう', 'assets/audio/bgm/ローファイ少女は今日も寝不足.mp3'),
    ('bgm_modus_01', 'bgm', 'Melty Night', 'modus', 'assets/audio/bgm/ループあり/modus/Melty Night_.mp3');
`);
const lofiIdBefore = old.prepare("SELECT id FROM ambient_sound WHERE code='bgm_lofigirl'").get().id;

// ユーザーのお気に入りが、差し替えをまたいで残ることも見る
old.exec("INSERT INTO user (nickname, daily_goal_minutes) VALUES ('夜子', 60)");
const userId = old.prepare("SELECT id FROM user LIMIT 1").get().id;
old.prepare("INSERT INTO audio_setting (user_id) VALUES (?)").run(userId);
old
  .prepare("INSERT INTO user_sound_preference (user_id, ambient_sound_id, is_favorite) VALUES (?, ?, 1)")
  .run(userId, lofiIdBefore);

// v35 の中身（列追加 → 重複曲の削除 → 曲目録の流し直し）
old.exec(
  "ALTER TABLE ambient_sound ADD COLUMN genre TEXT CHECK (genre IS NULL OR genre IN ('calm', 'city', 'classic'))",
);
old.exec(
  "ALTER TABLE audio_setting ADD COLUMN bgm_genre TEXT NOT NULL DEFAULT 'calm' CHECK (bgm_genre IN ('all', 'calm', 'city', 'classic'))",
);
old.prepare("DELETE FROM ambient_sound WHERE code = ?").run("bgm_modus_01");
old.exec(bgmSeed);

const after = old.prepare("SELECT COUNT(*) AS n FROM ambient_sound WHERE sound_type='bgm'").get();
check("109曲になる", after.n === 109);
check(
  "同じ音源だった modus「Melty Night」が消え、ナイトシフトが残る",
  !old.prepare("SELECT 1 FROM ambient_sound WHERE code='bgm_modus_01'").get() &&
    !!old.prepare("SELECT 1 FROM ambient_sound WHERE code='bgm_shinsanworks_01'").get(),
);
check(
  "既存曲にもジャンルが入る（流し直しで上書きされる）",
  old.prepare("SELECT genre FROM ambient_sound WHERE code='bgm_lofigirl'").get().genre === "city",
);
check(
  "audio_setting の既定は 'calm'（しずかな夜だけが鳴る）",
  old.prepare("SELECT bgm_genre FROM audio_setting").get().bgm_genre === "calm",
);

const lofi = old.prepare("SELECT id, file_path FROM ambient_sound WHERE code='bgm_lofigirl'").get();
check("ローファイ少女は同じ行のまま（id が変わらない＝お気に入り・プレイリストが外れない）",
  lofi.id === lofiIdBefore);
check(
  "file_path がループあり版へ更新される",
  lofi.file_path === "assets/audio/bgm/ループあり/しゃろう/ローファイ少女は今日も寝不足_2.mp3",
);
check(
  "お気に入りが残る",
  old
    .prepare("SELECT is_favorite FROM user_sound_preference WHERE user_id=? AND ambient_sound_id=?")
    .get(userId, lofiIdBefore).is_favorite === 1,
);

console.log(failures === 0 ? "\n全チェック成功" : `\n${failures}件 失敗`);
process.exit(failures === 0 ? 0 : 1);
