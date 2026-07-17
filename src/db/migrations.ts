import type { SQLiteDatabase } from "expo-sqlite";

import { loadSqlAsset } from "./sql-loader";

// db/*.sql を「正」としてバンドル読み込みする（metro.config.js で assetExts に sql を追加済み）
// 非ASCIIファイル名でも metro のリテラル require であれば解決できる
//
// import は使えない: metro はビルド時に「リテラルの require()」を走査してアセットを同梱する。
// import に置き換えるとSQLがバンドルされず、DBを初期化できずアプリが起動しなくなる。
// eslint-disable-next-line @typescript-eslint/no-require-imports -- metro のアセット同梱にはリテラル require が必須
const SCHEMA_SQL_MODULE = require("../../db/chill_night_town_スキーマ_v2.sql") as number;
// eslint-disable-next-line @typescript-eslint/no-require-imports -- 同上
const SEED_SQL_MODULE = require("../../db/chill_night_town_シードデータ.sql") as number;

/**
 * シードSQLはファイル自身が `BEGIN TRANSACTION; ... COMMIT;` で囲まれている。
 * マイグレーションは withTransactionAsync で1トランザクションにまとめるため、
 * ネストを避けて外側のトランザクション文だけを除去する。
 * （トリガー定義内の `BEGIN ... END;` は行頭が `BEGIN TRANSACTION` ではないため影響しない）
 */
function stripOuterTransaction(sql: string): string {
  return sql
    .replace(/^[ \t]*BEGIN[ \t]+TRANSACTION[ \t]*;[ \t]*$/gim, "")
    .replace(/^[ \t]*COMMIT[ \t]*;[ \t]*$/gim, "");
}

type Migration = {
  version: number;
  up: (db: SQLiteDatabase) => Promise<void>;
};

// 現在のスキーマバージョン（db/*.sql が表す「最新」の版）。
// スキーマを変更したら、スキーマSQLを更新しつつ本値を+1し、DELTA_MIGRATIONS に差分を追加する。
const SCHEMA_VERSION = 8;

// 既存DB（過去バージョン）向けの差分マイグレーション（version >= 2）。
// 新規インストールはスキーマSQL（=最新）を適用して一気に SCHEMA_VERSION まで上がるため、
// ここには「既存DBを最新へ追いつかせる ALTER 等」だけを列挙する（新規では実行しない）。
// スキーマSQL側にも同じ変更を必ず反映すること（新規と既存で最終形を一致させる）。
const DELTA_MIGRATIONS: Migration[] = [
  {
    version: 2,
    up: async (db) => {
      // 初回ホームの成長方式お知らせ表示済みフラグ
      await db.execAsync(
        "ALTER TABLE user ADD COLUMN growth_hint_dismissed INTEGER NOT NULL DEFAULT 0 CHECK (growth_hint_dismissed IN (0, 1))",
      );
    },
  },
  {
    version: 3,
    up: async (db) => {
      // BGM音源マスタの修正: file_path を実ファイル名に合わせ、登録漏れの1曲を追加する
      await db.runAsync(
        "UPDATE ambient_sound SET file_path = ? WHERE code = ?",
        "assets/audio/bgm/2_23_AM.mp3",
        "bgm_223am",
      );
      await db.runAsync(
        `INSERT OR IGNORE INTO ambient_sound (code, sound_type, name, artist, file_path)
         VALUES (?, 'bgm', ?, NULL, ?)`,
        "bgm_lofigirl",
        "ローファイ少女は今日も寝不足",
        "assets/audio/bgm/ローファイ少女は今日も寝不足.mp3",
      );
    },
  },
  {
    version: 4,
    up: async (db) => {
      // 学習日ごとに選択された夜の天気（要件2.5）。
      // 旧版は演出用の天気を当学習日の study_session / active_session から導出しており、
      // 学習を開始しない限り天気を選べなかった。セッションから独立した保存先を設ける
      await db.execAsync(`
        CREATE TABLE daily_night_weather (
            user_id             INTEGER NOT NULL REFERENCES user(id)          ON DELETE CASCADE,
            study_date          TEXT    NOT NULL,
            night_weather_id    INTEGER NOT NULL REFERENCES night_weather(id) ON DELETE RESTRICT,
            updated_at          TEXT    NOT NULL DEFAULT (datetime('now')),
            PRIMARY KEY (user_id, study_date)
        );
        CREATE INDEX idx_daily_night_weather_weather ON daily_night_weather(night_weather_id);
      `);

      // 既存の計測中セッション・学習記録から、当学習日の天気を引き継ぐ
      // （移行前に選ばれていた天気が失われないようにする）
      await db.execAsync(`
        INSERT OR IGNORE INTO daily_night_weather (user_id, study_date, night_weather_id)
        SELECT user_id, study_date, night_weather_id
          FROM study_session
         WHERE id IN (SELECT MAX(id) FROM study_session GROUP BY user_id, study_date)
      `);
    },
  },
  {
    version: 5,
    up: async (db) => {
      // 夜の天気を「1晩＝1天気」に確定したことに伴い、セッション側の天気の列を削除する
      // （daily_night_weather と二重に持つと片方だけ更新される事故が起き得るため。要件2.5）。
      // SQLite は DROP COLUMN が使えるが、外部キーを含む列の削除は
      // テーブル再作成のほうが確実なため、作り直して入れ替える。
      await db.execAsync(`
        CREATE TABLE study_session_new (
            id                  INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id             INTEGER NOT NULL REFERENCES user(id)    ON DELETE CASCADE,
            town_id             INTEGER NOT NULL REFERENCES town(id)    ON DELETE RESTRICT,
            emotion_id          INTEGER          REFERENCES emotion(id) ON DELETE RESTRICT,
            timer_mode          TEXT    NOT NULL CHECK (timer_mode IN ('simple', 'pomodoro')),
            study_date          TEXT    NOT NULL,
            start_time          TEXT    NOT NULL,
            end_time            TEXT    NOT NULL,
            planned_minutes     INTEGER NOT NULL CHECK (planned_minutes > 0),
            duration_minutes    INTEGER NOT NULL CHECK (duration_minutes >= 0),
            memo                TEXT,
            created_at          TEXT    NOT NULL DEFAULT (datetime('now')),
            updated_at          TEXT    NOT NULL DEFAULT (datetime('now'))
        );
        INSERT INTO study_session_new
            (id, user_id, town_id, emotion_id, timer_mode, study_date,
             start_time, end_time, planned_minutes, duration_minutes, memo, created_at, updated_at)
        SELECT id, user_id, town_id, emotion_id, timer_mode, study_date,
               start_time, end_time, planned_minutes, duration_minutes, memo, created_at, updated_at
          FROM study_session;
        DROP TABLE study_session;
        ALTER TABLE study_session_new RENAME TO study_session;
        CREATE INDEX idx_study_session_user_date ON study_session(user_id, study_date);
        CREATE INDEX idx_study_session_town      ON study_session(town_id);
        CREATE INDEX idx_study_session_emotion   ON study_session(emotion_id);
      `);

      // 計測中セッションも同様に天気を持たない。作り直す前に、その天気を
      // daily_night_weather へ移す。計測中＝その夜で最後に選ばれた天気のため、
      // 同じ学習日に既に行があっても**上書きする**（要件2.5「最後の選択が残る」）。
      // 学習日の算出は要件0章に合わせる（5時より前は前日へ）
      // WHERE true は必須。SELECT からの UPSERT では、SQLite が ON CONFLICT の
      // 「ON」を JOIN の ON と区別できずパースエラーになるため（SQLite の仕様）
      await db.execAsync(`
        INSERT INTO daily_night_weather (user_id, study_date, night_weather_id)
        SELECT user_id, date(start_time, CASE WHEN CAST(strftime('%H', start_time) AS INTEGER) < 5
                                              THEN '-1 day' ELSE '+0 day' END),
               night_weather_id
          FROM active_session
         WHERE true
        ON CONFLICT (user_id, study_date)
        DO UPDATE SET night_weather_id = excluded.night_weather_id,
                      updated_at = datetime('now');
      `);
      await db.execAsync(`
        CREATE TABLE active_session_new (
            user_id                         INTEGER PRIMARY KEY REFERENCES user(id) ON DELETE CASCADE,
            town_id                         INTEGER NOT NULL REFERENCES town(id)    ON DELETE RESTRICT,
            timer_mode                      TEXT    NOT NULL CHECK (timer_mode IN ('simple', 'pomodoro')),
            planned_minutes                 INTEGER CHECK (planned_minutes IS NULL OR planned_minutes > 0),
            pomodoro_work_minutes           INTEGER CHECK (pomodoro_work_minutes  IS NULL OR pomodoro_work_minutes  BETWEEN 5 AND 120),
            pomodoro_break_minutes          INTEGER CHECK (pomodoro_break_minutes IS NULL OR pomodoro_break_minutes BETWEEN 1 AND 30),
            pomodoro_loop_count             INTEGER CHECK (pomodoro_loop_count    IS NULL OR pomodoro_loop_count    BETWEEN 1 AND 10),
            start_time                      TEXT    NOT NULL,
            paused_accumulated_seconds      INTEGER NOT NULL DEFAULT 0 CHECK (paused_accumulated_seconds >= 0),
            pause_started_at                TEXT,
            break_suggest_threshold_minutes INTEGER CHECK (break_suggest_threshold_minutes IS NULL OR break_suggest_threshold_minutes > 0),
            updated_at                      TEXT    NOT NULL DEFAULT (datetime('now')),
            CHECK (
                (timer_mode = 'simple'
                    AND planned_minutes IS NOT NULL
                    AND pomodoro_work_minutes IS NULL
                    AND pomodoro_break_minutes IS NULL
                    AND pomodoro_loop_count IS NULL)
                OR
                (timer_mode = 'pomodoro'
                    AND planned_minutes IS NULL
                    AND pomodoro_work_minutes IS NOT NULL
                    AND pomodoro_break_minutes IS NOT NULL
                    AND pomodoro_loop_count IS NOT NULL)
            )
        );
        INSERT INTO active_session_new
            (user_id, town_id, timer_mode, planned_minutes, pomodoro_work_minutes,
             pomodoro_break_minutes, pomodoro_loop_count, start_time,
             paused_accumulated_seconds, pause_started_at, break_suggest_threshold_minutes, updated_at)
        SELECT user_id, town_id, timer_mode, planned_minutes, pomodoro_work_minutes,
               pomodoro_break_minutes, pomodoro_loop_count, start_time,
               paused_accumulated_seconds, pause_started_at, break_suggest_threshold_minutes, updated_at
          FROM active_session;
        DROP TABLE active_session;
        ALTER TABLE active_session_new RENAME TO active_session;
      `);
    },
  },
  {
    version: 6,
    up: async (db) => {
      // 黙々モードの予定学習時間の前回値（要件3.1）。
      // ポモドーロの3値は前回値を保持していたが、黙々モードだけ保存先が無く
      // 毎回既定値へ戻っていた
      await db.execAsync(
        "ALTER TABLE user ADD COLUMN planned_minutes INTEGER NOT NULL DEFAULT 60 CHECK (planned_minutes BETWEEN 10 AND 660)",
      );
    },
  },
  {
    version: 7,
    up: async (db) => {
      // 標準タグから「その他」を外す（要件3.4）。
      // タグは任意項目で何も選ばずに保存できるため、「その他」と無選択の情報量が同じで
      // 振り返りの役に立たない。分類しきれない内容はマイタグで具体的に名付けられる。
      //
      // 過去の記録から参照されている場合、study_tag は ON DELETE RESTRICT のため
      // 削除できない。その場合は非表示（is_active = 0）にして、選択肢から消しつつ
      // 過去の記録の表示は壊さない。
      await db.execAsync(`
        UPDATE study_tag
           SET is_active = 0
         WHERE user_id IS NULL AND name = 'その他'
           AND EXISTS (SELECT 1 FROM session_tag WHERE study_tag_id = study_tag.id);

        DELETE FROM study_tag
         WHERE user_id IS NULL AND name = 'その他'
           AND NOT EXISTS (SELECT 1 FROM session_tag WHERE study_tag_id = study_tag.id);
      `);
    },
  },
  {
    version: 8,
    up: async (db) => {
      // 学習終了・目標達成のメッセージを感情に応じて出し分ける（要件7.1）。
      // NULL は「感情を問わない」候補で、感情未選択・感情記録OFFのときの受け皿。
      // 既存の study_end(9) / goal_achieved(6) はそのまま NULL として残る
      await db.execAsync(
        "ALTER TABLE npc_message ADD COLUMN emotion_id INTEGER REFERENCES emotion(id) ON DELETE RESTRICT",
      );
      await db.execAsync(`
        DROP INDEX IF EXISTS idx_npc_message_trigger;
        CREATE INDEX idx_npc_message_trigger ON npc_message(npc_id, trigger_type, emotion_id);
      `);

      // 感情ごとのメッセージ22本を投入する（新規インストールはシードで入る）
      await db.execAsync(`
        -- 学習終了・感情ごと（study_end × emotion）
        --   目標に届かなかった夜。感情に寄り添い、責めない・励ましすぎない
        INSERT INTO npc_message (npc_id, trigger_type, emotion_id, message) VALUES
            (1, 'study_end', (SELECT id FROM emotion WHERE code = 'achievement'), 'やり切りましたね。その手応えは、しばらく残ります。'),
            (1, 'study_end', (SELECT id FROM emotion WHERE code = 'focused'), '深く潜れた夜でしたね。そういう夜は、そう多くありません。'),
            (1, 'study_end', (SELECT id FROM emotion WHERE code = 'persevered'), 'よく踏ん張りましたね。頑張れた夜は、自分で覚えておくものです。'),
            (1, 'study_end', (SELECT id FROM emotion WHERE code = 'enjoyed'), '楽しめたのなら、それがいちばん長続きします。'),
            (1, 'study_end', (SELECT id FROM emotion WHERE code = 'calm'), '穏やかにいられた夜は、それだけで上出来です。'),
            (1, 'study_end', (SELECT id FROM emotion WHERE code = 'as_usual'), 'いつも通り。それを続けられることが、いちばん難しいのですよ。'),
            (1, 'study_end', (SELECT id FROM emotion WHERE code = 'sleepy'), '眠い中、よく来ましたね。今夜はもう休んでください。'),
            (1, 'study_end', (SELECT id FROM emotion WHERE code = 'tired'), 'お疲れさまでした。今夜はもう、何もしなくていい夜です。'),
            (1, 'study_end', (SELECT id FROM emotion WHERE code = 'down'), 'そういう夜もあります。街は、明日も同じ場所にありますよ。'),
            (1, 'study_end', (SELECT id FROM emotion WHERE code = 'anxious'), '不安なまま机に向かえたなら、それは強さです。'),
            (1, 'study_end', (SELECT id FROM emotion WHERE code = 'stuck'), '進まない夜も、進んだ夜と同じだけ必要なものです。');
        
        -- 目標達成・感情ごと（goal_achieved × emotion）
        --   目標に届いた夜。ただし手応えが無いこともあるため、達成だけを祝わない
        INSERT INTO npc_message (npc_id, trigger_type, emotion_id, message) VALUES
            (1, 'goal_achieved', (SELECT id FROM emotion WHERE code = 'achievement'), '目標に届いて、手応えもある。今夜は言うことなしですね。'),
            (1, 'goal_achieved', (SELECT id FROM emotion WHERE code = 'focused'), '集中したまま目標まで。理想的な夜でした。'),
            (1, 'goal_achieved', (SELECT id FROM emotion WHERE code = 'persevered'), '頑張った分だけ、きちんと目標に届きましたね。'),
            (1, 'goal_achieved', (SELECT id FROM emotion WHERE code = 'enjoyed'), '楽しみながら目標まで。それがいちばん強いやり方です。'),
            (1, 'goal_achieved', (SELECT id FROM emotion WHERE code = 'calm'), '力まずに目標へ。いちばん美しい達成の仕方です。'),
            (1, 'goal_achieved', (SELECT id FROM emotion WHERE code = 'as_usual'), 'いつも通りにしていたら、目標に届いていた。それが実力です。'),
            (1, 'goal_achieved', (SELECT id FROM emotion WHERE code = 'sleepy'), '眠いのに目標まで来ましたか。今夜はもう、迷わず休んでください。'),
            (1, 'goal_achieved', (SELECT id FROM emotion WHERE code = 'tired'), '目標に届きました。疲れて当然です。今夜はここまでに。'),
            (1, 'goal_achieved', (SELECT id FROM emotion WHERE code = 'down'), '気持ちは晴れなくとも、やるべきことはやりました。それは事実です。'),
            (1, 'goal_achieved', (SELECT id FROM emotion WHERE code = 'anxious'), '不安を抱えたまま、目標まで来ましたね。それは立派なことです。'),
            (1, 'goal_achieved', (SELECT id FROM emotion WHERE code = 'stuck'), '手応えがなくとも、時間は確かに積み上がりました。届いていますよ。');
      `);
    },
  },
];

/** 現在の DB バージョンを取得する（未設定なら0） */
async function getUserVersion(db: SQLiteDatabase): Promise<number> {
  const row = await db.getFirstAsync<{ user_version: number }>(
    "PRAGMA user_version",
  );
  return row?.user_version ?? 0;
}

/** 新規DBへ最新スキーマ＋シードを適用し、SCHEMA_VERSION まで一気に上げる */
async function initializeFreshDatabase(db: SQLiteDatabase): Promise<void> {
  const [schemaSql, seedSql] = await Promise.all([
    loadSqlAsset(SCHEMA_SQL_MODULE),
    loadSqlAsset(SEED_SQL_MODULE),
  ]);
  await db.withTransactionAsync(async () => {
    // スキーマ（DDL・トリガー）→ シード（マスタ投入）の順に適用する
    await db.execAsync(schemaSql);
    await db.execAsync(stripOuterTransaction(seedSql));
    // PRAGMA はプレースホルダを使えないため整数リテラルを埋め込む（内部定義値で安全）
    await db.execAsync(`PRAGMA user_version = ${SCHEMA_VERSION}`);
  });
}

/**
 * DBを最新スキーマへ整える。
 * - 新規（user_version=0）: 最新スキーマSQL＋シードを適用（差分マイグレーションは実行しない）
 * - 既存（user_version>=1）: 不足分の差分マイグレーションを順に適用
 * 各処理はトランザクションで囲み、成功時にのみ user_version を更新する（原子性を担保）。
 */
export async function runMigrations(db: SQLiteDatabase): Promise<void> {
  const current = await getUserVersion(db);

  if (current === 0) {
    await initializeFreshDatabase(db);
    return;
  }

  const pending = DELTA_MIGRATIONS.filter((m) => m.version > current).sort(
    (a, b) => a.version - b.version,
  );
  for (const migration of pending) {
    await db.withTransactionAsync(async () => {
      await migration.up(db);
      await db.execAsync(`PRAGMA user_version = ${migration.version}`);
    });
  }
}
