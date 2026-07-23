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
const SCHEMA_VERSION = 14;

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
  {
    version: 9,
    up: async (db) => {
      // プロジェクト型の目標学習時間の上限を 500時間(30000分) → 744時間(44640分) へ広げる。
      // SQLite は列の CHECK 制約を ALTER で変更できないため、town_progress を作り直す。
      // town_progress を参照する外部キーは無いため、DROP による連鎖削除は起きない。
      // 索引は本テーブルに idx_town_progress_selected（部分ユニーク）のみ。作り直して張り直す。
      await db.execAsync(`
        CREATE TABLE town_progress_new (
            id                          INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id                     INTEGER NOT NULL REFERENCES user(id)  ON DELETE CASCADE,
            town_id                     INTEGER NOT NULL REFERENCES town(id)  ON DELETE RESTRICT,
            current_level               INTEGER NOT NULL DEFAULT 1 CHECK (current_level BETWEEN 1 AND 5),
            cumulative_study_minutes    INTEGER NOT NULL DEFAULT 0 CHECK (cumulative_study_minutes >= 0),
            experience_points           INTEGER NOT NULL DEFAULT 0 CHECK (experience_points >= 0),
            subtitle                    TEXT,
            project_target_minutes      INTEGER CHECK (project_target_minutes IS NULL OR project_target_minutes BETWEEN 60 AND 44640),
            is_selected                 INTEGER NOT NULL DEFAULT 0 CHECK (is_selected IN (0, 1)),
            created_at                  TEXT    NOT NULL DEFAULT (datetime('now')),
            updated_at                  TEXT    NOT NULL DEFAULT (datetime('now')),
            UNIQUE (user_id, town_id)
        );
        INSERT INTO town_progress_new
            (id, user_id, town_id, current_level, cumulative_study_minutes, experience_points,
             subtitle, project_target_minutes, is_selected, created_at, updated_at)
        SELECT id, user_id, town_id, current_level, cumulative_study_minutes, experience_points,
               subtitle, project_target_minutes, is_selected, created_at, updated_at
          FROM town_progress;
        DROP TABLE town_progress;
        ALTER TABLE town_progress_new RENAME TO town_progress;
        CREATE UNIQUE INDEX idx_town_progress_selected
            ON town_progress(user_id)
            WHERE is_selected = 1;
      `);
    },
  },
  {
    version: 10,
    up: async (db) => {
      // 街をフォルダ名ベースの4街へ更新する（背景画像フォルダ assets/images/home/<code>/ に合わせる）。
      // 既存の town_01 / town_02 を nightTown / castleTown へ改称し、snowTown / starHill を追加する。
      // town_progress は town_id（=id）で紐づくため、改称しても既存の育成進捗は保持される。
      // 追加した街の育成進捗行は、既存ユーザーぶんをここで作る（新規ユーザーは setup で作成）。
      await db.execAsync(`
        UPDATE town SET code = 'nightTown',  name = 'nightTown'  WHERE code = 'town_01';
        UPDATE town SET code = 'castleTown', name = 'castleTown' WHERE code = 'town_02';
        INSERT INTO town (code, name, description, display_order) VALUES
            ('snowTown', 'snowTown', 'テーマ未定。素材制作時に名称・説明を更新する', 3),
            ('starHill', 'starHill', 'テーマ未定。素材制作時に名称・説明を更新する', 4);
        INSERT INTO town_progress (user_id, town_id)
        SELECT u.id, t.id
          FROM user u
          CROSS JOIN town t
         WHERE t.code IN ('snowTown', 'starHill')
           AND NOT EXISTS (
             SELECT 1 FROM town_progress tp
              WHERE tp.user_id = u.id AND tp.town_id = t.id
           );
      `);
    },
  },
  {
    version: 11,
    up: async (db) => {
      // タグの上限を「マイタグ(custom)のみ1ユーザー20件」から
      // 「有効タグ全体(標準＋マイタグ)20件」へ変更する（要件3.4改訂）。
      // 標準タグも編集・削除でき、20の枠を消費する。旧トリガーを新トリガーへ差し替える。
      // 既存ユーザーが旧ルールで20件超のタグを持っていても行は削除しない（新規追加/復活のみ
      // 20件未満まで抑止する。既存は grandfather として使い続けられる）。
      await db.execAsync(`
        DROP TRIGGER IF EXISTS trg_study_tag_mytag_limit;
        DROP TRIGGER IF EXISTS trg_study_tag_mytag_limit_revive;
        CREATE TRIGGER trg_study_tag_limit
        BEFORE INSERT ON study_tag
        WHEN NEW.is_active = 1
         AND (SELECT COUNT(*) FROM study_tag WHERE is_active = 1) >= 20
        BEGIN
            SELECT RAISE(FAIL, 'タグは最大20件までです');
        END;
        CREATE TRIGGER trg_study_tag_limit_revive
        BEFORE UPDATE OF is_active ON study_tag
        WHEN OLD.is_active = 0 AND NEW.is_active = 1
         AND (SELECT COUNT(*) FROM study_tag WHERE is_active = 1) >= 20
        BEGIN
            SELECT RAISE(FAIL, 'タグは最大20件までです');
        END;
      `);
    },
  },
  {
    version: 12,
    up: async (db) => {
      // 音楽プレイリスト機能（要件9）用のカラムを追加する。
      // audio_setting に BGM の再生ソース・シャッフル設定、user_sound_preference に
      // お気に入り・マイプレイリストの並び順を足す。既存行は DEFAULT が入る。
      await db.execAsync(`
        ALTER TABLE audio_setting ADD COLUMN
          bgm_source TEXT NOT NULL DEFAULT 'all' CHECK (bgm_source IN ('all', 'favorites', 'playlist'));
        ALTER TABLE audio_setting ADD COLUMN
          bgm_shuffle INTEGER NOT NULL DEFAULT 1 CHECK (bgm_shuffle IN (0, 1));
        ALTER TABLE user_sound_preference ADD COLUMN
          is_favorite INTEGER NOT NULL DEFAULT 0 CHECK (is_favorite IN (0, 1));
        ALTER TABLE user_sound_preference ADD COLUMN
          playlist_position INTEGER;
      `);
    },
  },
  {
    version: 13,
    up: async (db) => {
      // 音楽プレイリストの追補（要件9改訂）:
      //   ・シャッフルの既定を ON→OFF（v12で DEFAULT 1 にしたが、既定は並び順が自然なため OFF に直す）
      //   ・マイプレイリストの表示名 playlist_name を追加（ユーザーが編集できる）
      // 列の CHECK/DEFAULT は ALTER で変更できないため audio_setting を作り直す。
      // audio_setting を参照する外部キーは無いため DROP による連鎖削除は起きない。
      // シャッフル設定は v12 で導入したばかり（未リリース）で保持すべきユーザー選択が無いため、
      // 既存行は既定の 0（OFF）へそろえる。
      await db.execAsync(`
        CREATE TABLE audio_setting_new (
            user_id         INTEGER PRIMARY KEY REFERENCES user(id) ON DELETE CASCADE,
            bgm_volume      INTEGER NOT NULL DEFAULT 50 CHECK (bgm_volume     BETWEEN 0 AND 100),
            ambient_volume  INTEGER NOT NULL DEFAULT 50 CHECK (ambient_volume BETWEEN 0 AND 100),
            sfx_volume      INTEGER NOT NULL DEFAULT 50 CHECK (sfx_volume     BETWEEN 0 AND 100),
            bell_volume     INTEGER NOT NULL DEFAULT 50 CHECK (bell_volume    BETWEEN 0 AND 100),
            bgm_source      TEXT    NOT NULL DEFAULT 'all' CHECK (bgm_source IN ('all', 'favorites', 'playlist')),
            bgm_shuffle     INTEGER NOT NULL DEFAULT 0 CHECK (bgm_shuffle IN (0, 1)),
            playlist_name   TEXT    NOT NULL DEFAULT 'マイプレイリスト',
            updated_at      TEXT    NOT NULL DEFAULT (datetime('now'))
        );
        INSERT INTO audio_setting_new
            (user_id, bgm_volume, ambient_volume, sfx_volume, bell_volume, bgm_source, bgm_shuffle, playlist_name, updated_at)
        SELECT user_id, bgm_volume, ambient_volume, sfx_volume, bell_volume, bgm_source, 0, 'マイプレイリスト', updated_at
          FROM audio_setting;
        DROP TABLE audio_setting;
        ALTER TABLE audio_setting_new RENAME TO audio_setting;
      `);
    },
  },
  {
    version: 14,
    up: async (db) => {
      // 1曲リピート（要件9・音楽プレイリスト）。ONで再生中の曲を繰り返す。
      // 既定OFF。既存行には DEFAULT 0 が入る（ADD COLUMN で足りる）。
      await db.execAsync(
        "ALTER TABLE audio_setting ADD COLUMN bgm_repeat_one INTEGER NOT NULL DEFAULT 0 CHECK (bgm_repeat_one IN (0, 1))",
      );
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
