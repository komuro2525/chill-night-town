// db/seed_npc.sql を docs/NPCセリフ集.md から生成する。
//
// なぜ生成するのか:
//   住人（NPC）の文面は「並べて読み比べて整える」作業であり、SQLの中では推敲しづらい。
//   一方で、SQLとドキュメントの両方に同じ文面を置けば必ずズレる。
//   そこで文面の正をドキュメント（docs/NPCセリフ集.md）に一本化し、SQLはそこから作る。
//   仕様の正をドキュメントに置くという本プロジェクトの方針（CLAUDE.md）とも揃う。
//
// 生成されるSQLの性質:
//   ・冒頭で npc_message を全消しして入れ直すため、**何度流しても同じ結果になる（冪等）**
//   ・セリフ集に載っていない住人はDBから削除する（住人の入れ替えもここで完結する）
//   ・新規初期化（initializeFreshDatabase）と既存DBのマイグレーションの両方から流される
//   ・BEGIN/COMMIT は書かない（呼び出し側のトランザクション内で流すため）
//
// 使い方: npm run npc:seed

const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "..");
const SOURCE_PATH = path.join(ROOT, "docs", "NPCセリフ集.md");
const OUTPUT_PATH = path.join(ROOT, "db", "seed_npc.sql");

/** SQLの文字列リテラルにする（シングルクォートを重ねてエスケープ） */
const quote = (s) => `'${s.replace(/'/g, "''")}'`;

/**
 * セリフ集（Markdown）を住人の配列へ変換する。
 *
 * 期待する構造（詳細はセリフ集の「書き方のルール」を参照）:
 *   ## 名前
 *   - **id**: 1
 *   - **街**: `nightTown`（夜の街）
 *   > 紹介文（複数行可）
 *   ### 見出し — `trigger_type`
 *   | 感情 | メッセージ |
 *   | 疲れた（tired） | 文面 |      ← 感情が「—」の行は emotion_id NULL
 */
function parse(markdown) {
  const lines = markdown.split(/\r?\n/);
  const npcs = [];
  let npc = null;
  let trigger = null;

  for (const line of lines) {
    // 「## 書き方のルール」等、住人以外の見出しは id を持たないため後で捨てる
    const npcHead = line.match(/^##\s+(?!#)(.+?)\s*$/);
    if (npcHead) {
      npc = { name: npcHead[1], id: null, townCode: null, description: [], messages: [] };
      npcs.push(npc);
      trigger = null;
      continue;
    }
    if (!npc) continue;

    const id = line.match(/^-\s+\*\*id\*\*:\s*(\d+)/);
    if (id) {
      npc.id = Number(id[1]);
      continue;
    }
    const town = line.match(/^-\s+\*\*街\*\*:\s*`([A-Za-z0-9_]+)`/);
    if (town) {
      npc.townCode = town[1];
      continue;
    }
    const desc = line.match(/^>\s?(.*)$/);
    if (desc) {
      npc.description.push(desc[1]);
      continue;
    }
    const triggerHead = line.match(/^###\s+.*`([a-z_]+)`/);
    if (triggerHead) {
      trigger = triggerHead[1];
      continue;
    }
    // 表の行。ヘッダ（感情/メッセージ）と区切り（---）は読み飛ばす
    if (trigger && line.startsWith("|")) {
      const cells = line.split("|").slice(1, -1).map((c) => c.trim());
      if (cells.length < 2) continue;
      if (cells[0] === "感情" || /^:?-{2,}/.test(cells[0])) continue;
      const emotion = cells[0].match(/[（(]([a-z_]+)[)）]/);
      npc.messages.push({
        trigger,
        emotionCode: emotion ? emotion[1] : null,
        message: cells[1],
      });
    }
  }

  return npcs.filter((n) => n.id !== null);
}

/** 住人の配列からシードSQLを組み立てる */
function build(npcs) {
  const ids = npcs.map((n) => n.id);
  const out = [];

  out.push("-- =====================================================================");
  out.push("-- 住人（NPC）の街・名前・紹介文・メッセージ（要件7.1）");
  out.push("--");
  out.push("-- ★このファイルは自動生成です。直接編集しないこと。");
  out.push("--   文面の正: docs/NPCセリフ集.md  /  生成: npm run npc:seed");
  out.push("--");
  out.push("-- 新規初期化（initializeFreshDatabase）と既存DBのマイグレーションの両方から");
  out.push("-- 流される、住人データの単一の出所。冒頭で npc_message を全消しするため、");
  out.push("-- **何度流しても同じ結果になる（冪等）**。");
  out.push("--   ・前提: town / emotion マスタと npc(1) の行が既にあること（本体シードで用意）");
  out.push("--   ・BEGIN/COMMIT は書かない（呼び出し側のトランザクション内で流す）");
  out.push("--");
  out.push("-- 住人は街ごとに1人。全員「責めない・急かさない・声を張らない」基調は共通で、");
  out.push("-- 違うのは声色と比喩の引き出しだけ。");
  for (const n of npcs) {
    out.push(`--   ${n.id}: ${n.name}（${n.townCode}）… ${n.messages.length}本`);
  }
  out.push("-- =====================================================================");
  out.push("");
  out.push("-- 既存のメッセージを一旦すべて消してから入れ直す（冪等・文面の刷新用）");
  out.push("DELETE FROM npc_message;");
  out.push("");
  out.push("-- 住人のマスタ行。1人目は本体シードで作成済みのため OR IGNORE で足りる");
  out.push("INSERT OR IGNORE INTO npc (id, name) VALUES");
  out.push(npcs.map((n) => `    (${n.id}, ${quote(n.name)})`).join(",\n") + ";");
  out.push("");
  out.push("-- 街・名前・紹介文を確定する（旧バージョンの名前・紹介文も上書きする）");
  for (const n of npcs) {
    out.push(`UPDATE npc SET`);
    out.push(`    name = ${quote(n.name)},`);
    out.push(`    town_id = (SELECT id FROM town WHERE code = ${quote(n.townCode)}),`);
    out.push(`    description = ${quote(n.description.join("\n").trim())}`);
    out.push(`WHERE id = ${n.id};`);
    out.push("");
  }
  out.push("-- セリフ集に載っていない住人は退去させる（住人の入れ替えもこのファイルで完結する）。");
  out.push("-- active_session.npc_id は ON DELETE RESTRICT のため、先に参照を外す。");
  out.push("-- NULL になったセッションは既定の住人（npc(1)）が代わりに話す。");
  out.push(`UPDATE active_session SET npc_id = NULL WHERE npc_id NOT IN (${ids.join(", ")});`);
  out.push(`DELETE FROM npc WHERE id NOT IN (${ids.join(", ")});`);

  for (const n of npcs) {
    out.push("");
    out.push("-- =====================================================================");
    out.push(`-- NPC ${n.id}: ${n.name}（${n.townCode}）`);
    out.push("-- =====================================================================");
    if (n.messages.length === 0) {
      out.push("-- 文面は未整備。整うまでは既定の住人（npc(1)）が代わりに話す");
      continue;
    }
    // タイミングごとに、感情なし → 感情ありの順でまとめる（セリフ集の並び順を保つ）
    const triggers = [...new Set(n.messages.map((m) => m.trigger))];
    for (const trigger of triggers) {
      const rows = n.messages.filter((m) => m.trigger === trigger);
      const plain = rows.filter((m) => m.emotionCode === null);
      const byEmotion = rows.filter((m) => m.emotionCode !== null);
      if (plain.length > 0) {
        out.push("");
        out.push(`-- ${trigger}（感情を問わない候補）`);
        out.push("INSERT INTO npc_message (npc_id, trigger_type, message) VALUES");
        out.push(
          plain
            .map((m) => `    (${n.id}, ${quote(m.trigger)}, ${quote(m.message)})`)
            .join(",\n") + ";",
        );
      }
      if (byEmotion.length > 0) {
        out.push("");
        out.push(`-- ${trigger}（感情ごとの出し分け）`);
        out.push("INSERT INTO npc_message (npc_id, trigger_type, emotion_id, message) VALUES");
        out.push(
          byEmotion
            .map(
              (m) =>
                `    (${n.id}, ${quote(m.trigger)}, ` +
                `(SELECT id FROM emotion WHERE code = ${quote(m.emotionCode)}), ${quote(m.message)})`,
            )
            .join(",\n") + ";",
        );
      }
    }
  }

  out.push("");
  return out.join("\n");
}

const npcs = parse(fs.readFileSync(SOURCE_PATH, "utf8"));

// 生成前の検算。ここで落としておかないと、壊れたシードが端末まで届いてしまう
let error = 0;
const fail = (msg) => {
  console.error(`NG ${msg}`);
  error++;
};
if (npcs.length === 0) fail("セリフ集から住人を1人も読み取れませんでした");
const seenIds = new Set();
const seenTowns = new Set();
for (const n of npcs) {
  if (!n.townCode) fail(`${n.name}: 街（town.code）が読み取れません`);
  if (n.description.length === 0) fail(`${n.name}: 紹介文（> の引用）がありません`);
  if (seenIds.has(n.id)) fail(`id=${n.id} が重複しています（idは再利用しない）`);
  seenIds.add(n.id);
  if (n.townCode && seenTowns.has(n.townCode)) {
    // 将来ひとつの街に複数の住人を置けるようにする予定のため、これは警告にとどめる
    console.warn(`※ ${n.townCode} に複数の住人がいます（id の小さい方が既定の住人になります）`);
  }
  seenTowns.add(n.townCode);
  // 感情を問わない候補が無いタイミングは、その感情の候補が無いときに何も話せなくなる
  const triggers = [...new Set(n.messages.map((m) => m.trigger))];
  for (const t of triggers) {
    const plain = n.messages.filter((m) => m.trigger === t && m.emotionCode === null);
    if (plain.length === 0) fail(`${n.name} の ${t} に、感情を問わない候補がありません`);
  }
}
if (error > 0) {
  console.error(`\n生成を中止しました（${error} 件）。docs/NPCセリフ集.md を直してください。`);
  process.exit(1);
}

fs.writeFileSync(OUTPUT_PATH, build(npcs), "utf8");
console.log(`生成しました: db/seed_npc.sql`);
for (const n of npcs) {
  const label = n.messages.length === 0 ? "文面は未整備（既定の住人が代弁）" : `${n.messages.length}本`;
  console.log(`  ${n.id}: ${n.name}（${n.townCode}） … ${label}`);
}
