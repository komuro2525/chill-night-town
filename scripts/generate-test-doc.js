// docs/テスト仕様書.md を生成する。
//
// なぜ生成するのか:
//   手書きの仕様書は必ず腐る。テストを1件足すたびに人が表を直す運用は続かず、
//   「ドキュメントには87件と書いてあるが実際は92件」という状態になる。
//   卒業研究の成果物として、検証したと書いてあるのに実態と違うのが最も避けたい。
//   そこで仕様書は jest の実行結果そのものから作り、ズレが起きない構造にする。
//
// 何を書くか:
//   - 自動: ケース一覧（観点・期待する挙動・結果）、件数、実行日時、実行環境
//   - 人間: 目的・対象範囲・モジュールごとの検証理由（下の定数として保持する）
//
// 使い方: npm run test:doc
// テストが失敗していても生成する（✗を立て、サマリに明記する）。
// 都合の悪い結果を隠さないため。ただし終了コードは非0にして気づけるようにする。

const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "..");
const OUTPUT_PATH = path.join(ROOT, "docs", "テスト仕様書.md");

// ---------------------------------------------------------------------
// 人が書く部分: モジュールごとの「何を・なぜ検証するのか」
// テストファイルを追加したらここにも追記する（未登録でも表には出るが説明が付かない）
// ---------------------------------------------------------------------
const MODULE_DOCS = {
  "study-day.test.ts": {
    title: "学習日の帰属・夜間帯の判定",
    target: "src/lib/study-day.ts",
    requirements: "要件0章（用語定義）／要件2.3（学習開始）",
    why: "「学習日 = 18:00〜翌5:00のサイクル、セッションの開始時刻が属するサイクルの開始日に帰属する」という規則は、このアプリで最も間違えやすい。カレンダー表示・目標達成判定・経験値付与がすべてこの結果に乗るため、日付・月・年をまたぐケースを固定する。",
  },
  "timer.test.ts": {
    title: "タイマー計測（時刻差分方式）",
    target: "src/lib/timer.ts",
    requirements: "要件3.1（タイマー設定）／要件3.2（タイマー計測）",
    why: "経過時間をカウンター変数ではなく時刻の差分で算出する方式のため、「一時停止」「5:00到達」「端末時計の変更」の組み合わせで壊れやすい。実績学習時間は成長・目標達成の判定に直結し、画面を見ても正しさが分からない。",
  },
  "break-suggestion.test.ts": {
    title: "休憩提案の判定（頑張りすぎ防止）",
    target: "src/lib/break-suggestion.ts",
    requirements: "要件5.1（休憩提案）／要件5.2（延長宣言）",
    why: "出しすぎればうるさく、出なければ機能しない。判定は「保存済みの学習記録の合計＋進行中セッションの実績」と基準値の比較で決まり、基準値は「継続する」「延長宣言」で動く。画面を見ても正しさが分からず、ポモドーロの作業中に割り込まない条件も絡むため、境界を固定する。",
  },
  "growth.test.ts": {
    title: "街の成長の判定（経験値・レベル）",
    target: "src/lib/growth.ts",
    requirements: "要件6.1（成長処理の共通ルール）／要件6.2（成長方式）",
    why: "取り消せないルールが集まる箇所。「レベルは一度上がったら下がらない」「経験値は1学習日1回で、付与後は目標時間を変えても取り消さない」は、壊れるとユーザーが積み上げたものが失われ、しかも画面を見ても間違いに気づけない。プロジェクト型の閾値は Lv5 だけ意図的に長い配分のため、要件・テーブル定義書の例と一致することを固定する。",
  },
  "calendar.test.ts": {
    title: "カレンダー表示（グリッド・最頻の算出）",
    target: "src/lib/calendar.ts",
    requirements: "要件4.1（日別記録閲覧）／要件4.2（月次サマリー）",
    why: "月グリッドの生成は月初の曜日やうるう年でずれやすく、画面を見ても正しさが分からない。最頻（最も多かった感情・天気）の算出は、同数時の tie-break で挙動が変わる。どちらも壊れると表示が静かに狂うため、境界を固定する。",
  },
  "validation.test.ts": {
    title: "入力値の検証",
    target: "src/lib/validation.ts",
    requirements: "要件1.2／3.1／3.4／5.2／6.2／12章",
    why: "値域はドキュメント（要件定義書）とスキーマのCHECK制約が正。境界値（ちょうど・1つ外側）を固定し、実装がドキュメントからずれたことを検出する。",
  },
};

const PURPOSE = `本書は Chill Night Town の自動テストの内容と実行結果をまとめたものである。

テストの対象は **画面を見ても正しさが判断できず、壊れると学習記録・街の成長判定に直接影響する処理** に絞っている。
具体的には学習日の帰属、タイマーの計測、休憩提案の判定、街の成長の判定、カレンダー表示、入力値の検証の6つである。
これらは「動いているように見えて実は間違っている」ことが起こり得るため、実行して確認できる形で検証手段を残す。`;

const SCOPE = `| 区分 | 対象 | 検証方法 |
| :---- | :---- | :---- |
| テストを書く | 学習日の帰属（\`src/lib/study-day.ts\`） | 本書のテストケース |
| テストを書く | タイマー計測（\`src/lib/timer.ts\`） | 本書のテストケース |
| テストを書く | 休憩提案の判定（\`src/lib/break-suggestion.ts\`） | 本書のテストケース |
| テストを書く | 街の成長の判定（\`src/lib/growth.ts\`） | 本書のテストケース |
| テストを書く | カレンダー表示（\`src/lib/calendar.ts\`） | 本書のテストケース |
| テストを書く | 入力値の検証（\`src/lib/validation.ts\`） | 本書のテストケース |
| テストを書かない | 画面（UI）・レイアウト・操作感 | 実機での目視確認 |
| テストを書かない | DBアクセス（リポジトリ層）・SQLの制約 | sqlite3 で実際にDBを作成して手動検証 |
| テストを書かない | Context（状態管理） | 実機での目視確認 |

画面・DBアクセス・Contextを自動テストの対象外としたのは、MVPの工数配分としてUIテストの整備が見合わないと判断したためである。
これらは実機確認とsqlite3による手動検証で担保する。`;

const CONSTRAINTS = `- **UIの自動テストは持たない。** 画面の表示・レイアウト・操作感は実機での目視確認による
- **DBアクセスの自動テストは持たない。** スキーマのCHECK制約やSQLの挙動は、sqlite3で実際にDBを作成して都度検証している（マイグレーション・一時停止の累積・マイタグの重複と復活など）
- テストは端末のローカルタイムゾーンを前提とする（学習日の判定がローカル基準のため）`;

// ---------------------------------------------------------------------
// ここから下は自動生成
// ---------------------------------------------------------------------

/**
 * jest を JSON 形式で実行して結果を得る。テストが失敗しても結果は取り出す。
 *
 * npx 経由ではなく jest の実体を node で直接起動する。
 * Windows では execFileSync から .cmd を起動できず（Node のセキュリティ修正による EINVAL）、
 * shell: true で回避するとパスのクォートに気を使う必要があるため。
 */
function runJest() {
  // jest は package.json の exports で ./bin/jest.js を公開していないため、
  // require.resolve では解決できない。パッケージの場所から bin のパスを組み立てる
  const jestPkg = require.resolve("jest/package.json", { paths: [ROOT] });
  const jestBin = path.join(path.dirname(jestPkg), require(jestPkg).bin);
  try {
    const stdout = execFileSync(process.execPath, [jestBin, "--json"], {
      cwd: ROOT,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      maxBuffer: 32 * 1024 * 1024,
    });
    return JSON.parse(stdout);
  } catch (e) {
    // テストが1件でも失敗すると jest は終了コード1で終わるが、JSON は stdout に出ている
    if (e.stdout) return JSON.parse(e.stdout);
    throw e;
  }
}

const STATUS_MARK = { passed: "✓", failed: "✗", pending: "―", skipped: "―", todo: "―" };

/** ファイル名（拡張子つき）を取り出す */
function basenameOf(filePath) {
  return filePath.split(/[\\/]/).pop();
}

/** 実行日時を「2026/07/17 01:02」形式にする */
function formatDateTime(ms) {
  const d = new Date(ms);
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}/${p(d.getMonth() + 1)}/${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** テスト結果を describe（観点）ごとにまとめる */
function groupByDescribe(assertionResults) {
  const groups = new Map();
  for (const a of assertionResults) {
    // ancestorTitles が describe の入れ子。空の場合は「その他」に寄せる
    const key = a.ancestorTitles.join(" › ") || "その他";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(a);
  }
  return groups;
}

function buildMarkdown(result) {
  const pkg = require(path.join(ROOT, "package.json"));
  const lines = [];
  const failed = result.numFailedTests;

  lines.push("# テスト仕様書");
  lines.push("");
  lines.push(
    "> **このファイルは `npm run test:doc` で自動生成される。手で編集しても次回の生成で失われる。**",
  );
  lines.push("> 内容を変えたい場合は、テストコード（`src/lib/__tests__/`）か生成スクリプト（`scripts/generate-test-doc.js`）を編集すること。");
  lines.push("");

  lines.push("## 1. 目的");
  lines.push("");
  lines.push(PURPOSE);
  lines.push("");

  lines.push("## 2. 対象範囲");
  lines.push("");
  lines.push(SCOPE);
  lines.push("");

  lines.push("## 3. 実行方法と環境");
  lines.push("");
  lines.push("```");
  lines.push("npm test          # テストを実行する");
  lines.push("npm run test:doc  # テストを実行し、本書を再生成する");
  lines.push("```");
  lines.push("");
  lines.push("| 項目 | 値 |");
  lines.push("| :---- | :---- |");
  lines.push(`| 実行日時 | ${formatDateTime(result.startTime)} |`);
  lines.push(`| テストフレームワーク | jest ${pkg.devDependencies.jest} / jest-expo ${pkg.devDependencies["jest-expo"]} |`);
  lines.push(`| Node.js | ${process.version} |`);
  lines.push(`| 実行環境 | ${process.platform} |`);
  lines.push("");

  lines.push("## 4. テストケース一覧");
  lines.push("");
  lines.push("「検証観点」はテストコードの `describe`、「期待する挙動」は `it` に対応する。");
  lines.push("");

  // ファイル名で安定した順に並べる（実行順は毎回変わるため）
  const files = [...result.testResults].sort((a, b) =>
    basenameOf(a.name).localeCompare(basenameOf(b.name)),
  );

  let sectionNo = 0;
  for (const file of files) {
    const name = basenameOf(file.name);
    const meta = MODULE_DOCS[name];
    sectionNo += 1;

    lines.push(`### 4.${sectionNo} ${meta ? meta.title : name}`);
    lines.push("");
    if (meta) {
      lines.push(`- **対象**: \`${meta.target}\``);
      lines.push(`- **関連する仕様**: ${meta.requirements}`);
      lines.push(`- **テストファイル**: \`${path.relative(ROOT, file.name).replace(/\\/g, "/")}\``);
      lines.push("");
      lines.push(`**なぜ検証するのか**: ${meta.why}`);
    } else {
      lines.push(`- **テストファイル**: \`${path.relative(ROOT, file.name).replace(/\\/g, "/")}\``);
      lines.push("");
      lines.push(
        "> このファイルの説明が `scripts/generate-test-doc.js` の `MODULE_DOCS` に未登録。追記すること。",
      );
    }
    lines.push("");

    let caseNo = 0;
    for (const [describeTitle, cases] of groupByDescribe(file.assertionResults)) {
      lines.push(`#### ${describeTitle}`);
      lines.push("");
      lines.push("| No | 期待する挙動 | 結果 |");
      lines.push("| :---- | :---- | :---- |");
      for (const c of cases) {
        caseNo += 1;
        const mark = STATUS_MARK[c.status] ?? c.status;
        // 表を壊さないよう、テスト名中の | をエスケープする
        const title = c.title.replace(/\|/g, "\\|");
        lines.push(`| ${caseNo} | ${title} | ${mark} |`);
      }
      lines.push("");
    }

    const fileFailed = file.assertionResults.filter((a) => a.status === "failed").length;
    lines.push(
      `**小計**: ${file.assertionResults.length}件（成功 ${file.assertionResults.length - fileFailed} / 失敗 ${fileFailed}）`,
    );
    lines.push("");
  }

  lines.push("## 5. 実行結果サマリ");
  lines.push("");
  lines.push("| 項目 | 件数 |");
  lines.push("| :---- | :---- |");
  lines.push(`| テストケース合計 | ${result.numTotalTests} |`);
  lines.push(`| 成功 | ${result.numPassedTests} |`);
  lines.push(`| 失敗 | ${result.numFailedTests} |`);
  lines.push("");
  lines.push(
    failed === 0
      ? "**すべてのテストに成功している。**"
      : `**${failed}件のテストが失敗している。** 上表で ✗ が付いたケースを参照すること。`,
  );
  lines.push("");

  lines.push("## 6. 制約");
  lines.push("");
  lines.push(CONSTRAINTS);
  lines.push("");

  return lines.join("\n");
}

function main() {
  const result = runJest();
  fs.writeFileSync(OUTPUT_PATH, buildMarkdown(result), "utf8");

  const rel = path.relative(ROOT, OUTPUT_PATH).replace(/\\/g, "/");
  console.log(
    `${rel} を生成しました（${result.numTotalTests}件: 成功 ${result.numPassedTests} / 失敗 ${result.numFailedTests}）`,
  );

  // 失敗があれば気づけるように非0で終わる（仕様書自体は生成済み）
  if (result.numFailedTests > 0) process.exitCode = 1;
}

main();
