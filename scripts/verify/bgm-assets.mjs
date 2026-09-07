// BGM曲目録（要件9）の検証。再実行可能な手動検証。
//
// 目的: BGMは「DBの行（曲名・アーティスト）」と「アプリの静的 require（実際に鳴る音）」の
//   二か所に分かれて存在する。片方だけに足すと、一覧に出るのに鳴らない／鳴らせるのに
//   一覧に出ない、という食い違いが起きる。ここでは次を確かめる。
//   1. db/seed_bgm.sql が新規初期化（スキーマ＋本体シード）の上で流れ、79曲入る
//   2. seed_bgm.sql の冪等性（何度流しても増えない・上書きで内容が揃う）
//   3. seed_bgm.sql・src/constants/audioAssets.ts・実ファイルの三者が過不足なく一致する
//   4. v34 相当: 旧2曲だけのDBへ流すと、差分の78曲が入り、ループあり版へ差し替えた
//      「ローファイ少女は今日も寝不足」の file_path が更新される（code は変えない）
//
// 実行: node scripts/verify/bgm-assets.mjs

import { DatabaseSync } from "node:sqlite";
import { existsSync, readFileSync, readdirSync } from "node:fs";
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
  "SELECT code, name, artist, file_path FROM ambient_sound WHERE sound_type='bgm' ORDER BY id",
);
check("BGMが79曲入る", tracks.length === 79);
check(
  "曲名・アーティスト・パスがすべて埋まっている",
  tracks.every((t) => t.name && t.artist && t.file_path),
);

// ---------------------------------------------------------------------
console.log("B. seed_bgm.sql の冪等性");
db.exec("UPDATE ambient_sound SET name = 'ずれた曲名' WHERE code = 'bgm_223am'");
db.exec(bgmSeed);
check(
  "流し直しても曲数は増えない",
  one("SELECT COUNT(*) AS n FROM ambient_sound WHERE sound_type='bgm'").n === 79,
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

check("audioAssets.ts のBGMも79曲", assetEntries.length === 79);
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
console.log("D. マイグレーション v34（旧2曲のDBへ流す）");
const old = new DatabaseSync(":memory:");
old.exec(schema);
old.exec(seed);
// v33 までのDBが持っていた2曲（ローファイ少女はルート直下の旧ファイル）
old.exec(`
  INSERT INTO ambient_sound (code, sound_type, name, artist, file_path) VALUES
    ('bgm_223am', 'bgm', '2:23 AM', 'しゃろう', 'assets/audio/bgm/2_23_AM.mp3'),
    ('bgm_lofigirl', 'bgm', 'ローファイ少女は今日も寝不足', 'しゃろう', 'assets/audio/bgm/ローファイ少女は今日も寝不足.mp3');
`);
const lofiIdBefore = old.prepare("SELECT id FROM ambient_sound WHERE code='bgm_lofigirl'").get().id;

// ユーザーのお気に入りが、差し替えをまたいで残ることも見る
old.exec("INSERT INTO user (nickname, daily_goal_minutes) VALUES ('夜子', 60)");
const userId = old.prepare("SELECT id FROM user LIMIT 1").get().id;
old
  .prepare("INSERT INTO user_sound_preference (user_id, ambient_sound_id, is_favorite) VALUES (?, ?, 1)")
  .run(userId, lofiIdBefore);

old.exec(bgmSeed);

const after = old.prepare("SELECT COUNT(*) AS n FROM ambient_sound WHERE sound_type='bgm'").get();
check("2曲のDBが79曲になる（差分の78曲が入る）", after.n === 79);

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
