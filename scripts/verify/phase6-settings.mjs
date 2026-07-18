// Phase 6（設定・街選択）のデータ層のDBルール検証。再実行可能な手動検証。
//
// 目的: リポジトリ層（src/db/repositories/*）は jest 対象外（CLAUDE.md: DBは sqlite3 で手動検証）。
//   本スクリプトは実スキーマ＋シードを node:sqlite に読み込み、Phase 6 で追加した
//   各メソッドと同一のSQLを発行して、DB側のルールが崩れていないことを確かめる。
//
// 実行: node scripts/verify/phase6-settings.mjs
//   （expo-sqlite はNodeで動かないため、同等APIの node:sqlite で SQL のみ検証する。
//     レベル算出の純ロジックは src/lib/__tests__/growth.test.ts が別途固定している。
//     ここでは recomputeTownLevel の「下がらない／閾値到達で上がる」というDB結果を確かめる）

import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const schema = readFileSync(
  join(ROOT, "db", "chill_night_town_スキーマ_v2.sql"),
  "utf8",
);
const seed = readFileSync(
  join(ROOT, "db", "chill_night_town_シードデータ.sql"),
  "utf8",
);

const db = new DatabaseSync(":memory:");
db.exec(schema);
db.exec(seed);

let failures = 0;
function check(name, cond) {
  if (cond) {
    console.log(`  ✓ ${name}`);
  } else {
    failures++;
    console.log(`  ✗ ${name}`);
  }
}
function throws(name, fn) {
  try {
    fn();
    failures++;
    console.log(`  ✗ ${name}（例外が出るべきだが出なかった）`);
  } catch {
    console.log(`  ✓ ${name}`);
  }
}
const one = (sql, ...a) => db.prepare(sql).get(...a);
const run = (sql, ...a) => db.prepare(sql).run(...a);

// --- 初期設定相当のデータを用意（setupRepo と同じ形） ---
run("INSERT INTO user (nickname, daily_goal_minutes) VALUES (?, ?)", "夜子", 60);
const userId = one("SELECT id FROM user LIMIT 1").id;
run("INSERT INTO audio_setting (user_id) VALUES (?)", userId);
run("INSERT INTO notification_setting (user_id) VALUES (?)", userId);
const towns = db.prepare("SELECT id FROM town WHERE is_active = 1 ORDER BY display_order").all();
for (const t of towns) {
  run(
    "INSERT INTO town_progress (user_id, town_id, is_selected) VALUES (?, ?, ?)",
    userId, t.id, t.id === towns[0].id ? 1 : 0,
  );
}
const townA = towns[0].id;
const townB = towns[1].id;

// ポート: src/lib/growth.ts（jest済み）。recompute の期待値算出だけに使う
const MAX_LEVEL = 5;
const projThresholds = (m) => ({ 2: Math.ceil(m / 5), 3: Math.ceil((m / 5) * 2), 4: Math.ceil((m / 5) * 3), 5: m });
function levelFromValue(v, th) {
  let lv = 1;
  for (let n = 2; n <= MAX_LEVEL; n++) { if (th[n] === undefined || v < th[n]) break; lv = n; }
  return lv;
}
const resolveNext = (cur, comp) => Math.min(MAX_LEVEL, Math.max(cur, comp));

console.log("A. userRepo（設定変更）");
run("UPDATE user SET nickname = ?, updated_at = datetime('now')", "  灯  "); // trim検証は呼び出し側なのでここは素通り
check("nickname を更新できる", one("SELECT nickname FROM user").nickname === "  灯  ");
run("UPDATE user SET daily_goal_minutes = ? , updated_at = datetime('now')", 120);
check("daily_goal_minutes を更新できる", one("SELECT daily_goal_minutes FROM user").daily_goal_minutes === 120);
run("UPDATE user SET growth_method = ?, updated_at = datetime('now')", "project");
check("growth_method を project に変更できる", one("SELECT growth_method FROM user").growth_method === "project");
run("UPDATE user SET emotion_record_enabled = ?, updated_at = datetime('now')", 0);
check("emotion_record_enabled を OFF にできる", one("SELECT emotion_record_enabled FROM user").emotion_record_enabled === 0);
run("UPDATE user SET overwork_prevention_enabled = ?, updated_at = datetime('now')", 0);
check("overwork_prevention_enabled を OFF にできる", one("SELECT overwork_prevention_enabled FROM user").overwork_prevention_enabled === 0);
// 後続のためユーザーを既定へ戻す
run("UPDATE user SET growth_method='habit', daily_goal_minutes=60");

console.log("B. townProgressRepo（街選択・サブタイトル・目標）");
// selectTown(townB): 先に全解除 → 対象を1に（部分ユニーク索引 is_selected=1 は1行のみ）
run("UPDATE town_progress SET is_selected = 0 WHERE is_selected = 1");
run("UPDATE town_progress SET is_selected = 1, updated_at = datetime('now') WHERE town_id = ?", townB);
check("街を切り替えると is_selected=1 が1行だけ", one("SELECT COUNT(*) c FROM town_progress WHERE is_selected=1").c === 1);
check("切り替え先が選択中になる", one("SELECT town_id FROM town_progress WHERE is_selected=1").town_id === townB);
// 逆順（解除せず新規に1を立てる）は部分ユニーク索引に抵触することを確認
throws("解除より先に別の街を選択中にすると索引違反", () =>
  run("UPDATE town_progress SET is_selected = 1 WHERE town_id = ?", townA),
);
run("UPDATE town_progress SET is_selected=0 WHERE is_selected=1");
run("UPDATE town_progress SET is_selected=1 WHERE town_id=?", townA); // 元に戻す

// サブタイトル: 値あり→trim保存、空→NULL
run("UPDATE town_progress SET subtitle = ?, updated_at=datetime('now') WHERE town_id=?", "静かな港", townA);
check("サブタイトルを設定できる", one("SELECT subtitle FROM town_progress WHERE town_id=?", townA).subtitle === "静かな港");
run("UPDATE town_progress SET subtitle = ?, updated_at=datetime('now') WHERE town_id=?", null, townA);
check("空サブタイトルは NULL になる", one("SELECT subtitle FROM town_progress WHERE town_id=?", townA).subtitle === null);

// プロジェクト型目標: 値域内は保存、値域外は CHECK 違反（上限 744時間=44640分）
run("UPDATE town_progress SET project_target_minutes = ? WHERE town_id=?", 600, townA);
check("目標学習時間(分)を保存できる", one("SELECT project_target_minutes FROM town_progress WHERE town_id=?", townA).project_target_minutes === 600);
run("UPDATE town_progress SET project_target_minutes = ? WHERE town_id=?", 44640, townA);
check("44640分(744時間)ちょうどは保存できる", one("SELECT project_target_minutes FROM town_progress WHERE town_id=?", townA).project_target_minutes === 44640);
throws("60分未満は CHECK 違反", () => run("UPDATE town_progress SET project_target_minutes=? WHERE town_id=?", 50, townA));
throws("44640分超は CHECK 違反", () => run("UPDATE town_progress SET project_target_minutes=? WHERE town_id=?", 44641, townA));

console.log("C. growthRepo.recomputeTownLevel（下がらない／閾値到達で上がる）");
function recompute(townId, method) {
  const p = one("SELECT * FROM town_progress WHERE user_id=? AND town_id=?", userId, townId);
  const habit = {}; // マスタから
  for (const r of db.prepare("SELECT level, required_value FROM growth_level_threshold WHERE method='habit'").all()) habit[r.level] = r.required_value;
  let computed;
  if (method === "habit") computed = levelFromValue(p.experience_points, habit);
  else if (p.project_target_minutes === null) computed = p.current_level;
  else computed = levelFromValue(p.cumulative_study_minutes, projThresholds(p.project_target_minutes));
  const toLevel = resolveNext(p.current_level, computed);
  if (toLevel !== p.current_level) run("UPDATE town_progress SET current_level=?, updated_at=datetime('now') WHERE user_id=? AND town_id=?", toLevel, userId, townId);
  return toLevel;
}
// 習慣型: 経験値20（=Lv5の閾値）で level 1 → 5
run("UPDATE town_progress SET current_level=1, experience_points=20, cumulative_study_minutes=0, project_target_minutes=NULL WHERE town_id=?", townA);
check("習慣型: 経験値20で Lv5 まで上がる", recompute(townA, "habit") === 5);
// プロジェクト型へ切替: 累計100分（Lv2未満）でも下がらず Lv5 維持
run("UPDATE town_progress SET project_target_minutes=600, cumulative_study_minutes=100 WHERE town_id=?", townA);
check("方式切替でレベルは下がらない（Lv5維持）", recompute(townA, "project") === 5);
// 別の街: 累計300分・目標600分（Lv3=240,Lv4=360）→ level 1 → 3
run("UPDATE town_progress SET current_level=1, cumulative_study_minutes=300, project_target_minutes=600 WHERE town_id=?", townB);
check("プロジェクト型: 累計300分で Lv3 に上がる（240≤300<360）", recompute(townB, "project") === 3);

console.log("D. tagRepo（マイタグ 改名・論理削除）");
run("INSERT INTO study_tag (user_id, name, is_custom, is_active, display_order) VALUES (?, '英作文', 1, 1, 1)", userId);
const tagId = one("SELECT id FROM study_tag WHERE name='英作文'").id;
run("INSERT INTO study_tag (user_id, name, is_custom, is_active, display_order) VALUES (?, '古い名', 1, 0, 2)", userId); // 論理削除済み
// rename の重複判定: 自分以外に同名（標準 or 論理削除済みマイタグ含む）があれば不可
const conflictStd = one("SELECT id FROM study_tag WHERE name=? AND id!=? LIMIT 1", "読書", tagId);
check("標準タグ名への改名は重複として弾ける", !!conflictStd);
const conflictInactive = one("SELECT id FROM study_tag WHERE name=? AND id!=? LIMIT 1", "古い名", tagId);
check("論理削除済みマイタグ名への改名も重複として弾ける", !!conflictInactive);
const conflictFree = one("SELECT id FROM study_tag WHERE name=? AND id!=? LIMIT 1", "長文読解", tagId);
check("未使用の名前は重複なし", !conflictFree);
run("UPDATE study_tag SET name=? WHERE id=? AND is_custom=1", "長文読解", tagId);
check("改名が反映される", one("SELECT name FROM study_tag WHERE id=?", tagId).name === "長文読解");

// 論理削除: is_active=0。以後の選択肢・件数から外れるが行は残る
run("UPDATE study_tag SET is_active=0 WHERE id=? AND is_custom=1", tagId);
check("論理削除後 is_active=0", one("SELECT is_active FROM study_tag WHERE id=?", tagId).is_active === 0);
check("有効なマイタグ一覧から外れる",
  db.prepare("SELECT id FROM study_tag WHERE is_custom=1 AND is_active=1").all().every((r) => r.id !== tagId));
check("上限カウント（有効マイタグ）に数えない",
  one("SELECT COUNT(*) c FROM study_tag WHERE is_custom=1 AND is_active=1").c === 0);
check("選択肢（標準＋有効マイタグ）から外れる",
  db.prepare("SELECT id FROM study_tag WHERE is_active=1").all().every((r) => r.id !== tagId));
check("行自体は残る（過去記録の表示用）", !!one("SELECT id FROM study_tag WHERE id=?", tagId));

db.close();
console.log(failures === 0 ? "\n全チェック成功" : `\n${failures} 件 失敗`);
process.exit(failures === 0 ? 0 : 1);
