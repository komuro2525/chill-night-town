-- =====================================================================
-- Chill Night Town - SQLite スキーマ定義 v2
-- 対象: React Native (Expo) + TypeScript / expo-sqlite
-- 対応文書: chill_night_town_テーブル定義書_v2.md
-- 作成方針:
--   ・真偽値は INTEGER (0=false, 1=true) で統一
--   ・日時は TEXT (ISO8601, 例: '2026-07-04T22:30:00') で統一
--   ・日付のみが必要な場合は TEXT (YYYY-MM-DD) で統一
--   ・「学習日」カラム（study_date / target_date）は要件0章の定義
--     （18:00〜翌5:00サイクルの開始日）に従う。算出はアプリ側で共通関数化する
--   ・アプリ起動時に必ず `PRAGMA foreign_keys = ON;` を実行すること
--     (SQLiteはデフォルトで外部キー制約が無効なため)
-- =====================================================================

PRAGMA foreign_keys = ON;

-- =====================================================================
-- 1. user : ユーザー基本情報・全体設定（1端末=1ユーザー、常に1件のみ）
--    旧 growth_setting / focus_mode_setting の残存項目を統合した
--    ・growth_method  : 街の成長方式（アプリ全体で共通）
--                       'habit'   = 習慣型（目標達成日に経験値+1）
--                       'project' = プロジェクト型（街ごとの目標時間へ累計加算）
--    ・timer_mode 〜 pomodoro_loop_count : 前回のタイマー設定の記憶
--      （タイマー設定モーダルの初期表示に使用。開始時に最新値へ更新）
--    将来Firebase連携時に uuid カラムを追加予定（現時点では未作成）
-- =====================================================================
CREATE TABLE user (
    id                          INTEGER PRIMARY KEY AUTOINCREMENT,
    nickname                    TEXT    NOT NULL,  -- 上限20文字（長さ検証はアプリ側）
    daily_goal_minutes          INTEGER NOT NULL DEFAULT 60 CHECK (daily_goal_minutes BETWEEN 10 AND 720),
    emotion_record_enabled      INTEGER NOT NULL DEFAULT 1 CHECK (emotion_record_enabled IN (0, 1)),
    overwork_prevention_enabled INTEGER NOT NULL DEFAULT 1 CHECK (overwork_prevention_enabled IN (0, 1)),
    growth_method               TEXT    NOT NULL DEFAULT 'habit' CHECK (growth_method IN ('habit', 'project')),
    timer_mode                  TEXT    NOT NULL DEFAULT 'simple' CHECK (timer_mode IN ('simple', 'pomodoro')),
    pomodoro_work_minutes       INTEGER NOT NULL DEFAULT 25 CHECK (pomodoro_work_minutes BETWEEN 5 AND 120),
    pomodoro_break_minutes      INTEGER NOT NULL DEFAULT 5  CHECK (pomodoro_break_minutes BETWEEN 1 AND 30),
    pomodoro_loop_count         INTEGER NOT NULL DEFAULT 1  CHECK (pomodoro_loop_count BETWEEN 1 AND 10),
    -- 初回ホームの「街の育て方」お知らせ（成長方式の案内）を表示済みか。1=表示済み（以後出さない）
    growth_hint_dismissed       INTEGER NOT NULL DEFAULT 0  CHECK (growth_hint_dismissed IN (0, 1)),
    created_at                  TEXT    NOT NULL DEFAULT (datetime('now')),
    updated_at                  TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- user テーブルは常に1件のみ許可（1端末=1ユーザー方針）
CREATE TRIGGER trg_user_single_row
BEFORE INSERT ON user
WHEN (SELECT COUNT(*) FROM user) >= 1
BEGIN
    SELECT RAISE(FAIL, 'user テーブルは1件のみ登録可能です');
END;

-- =====================================================================
-- 2. town : 街マスタ（MVPは2件投入。将来の街追加はレコード追加のみで対応）
-- =====================================================================
CREATE TABLE town (
    id                      INTEGER PRIMARY KEY AUTOINCREMENT,
    code                    TEXT    NOT NULL UNIQUE,   -- 例: 'seaside_port'
    name                    TEXT    NOT NULL,          -- 例: '海辺の港町'
    description             TEXT,
    thumbnail_path          TEXT,
    background_image_path   TEXT,
    display_order           INTEGER NOT NULL DEFAULT 0,
    is_active               INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
    created_at              TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- =====================================================================
-- 3. night_weather : 夜の天気マスタ（11種類）
-- =====================================================================
CREATE TABLE night_weather (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    code            TEXT    NOT NULL UNIQUE,  -- 例: 'starry_night'
    emoji           TEXT,
    name            TEXT    NOT NULL,          -- 例: '星空の夜'
    display_order   INTEGER NOT NULL DEFAULT 0
);

-- =====================================================================
-- 4. emotion : 感情マスタ（11種類、3カテゴリ）
-- =====================================================================
CREATE TABLE emotion (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    code            TEXT    NOT NULL UNIQUE,
    emoji           TEXT,
    name            TEXT    NOT NULL,
    category        TEXT    NOT NULL CHECK (category IN ('positive', 'neutral', 'negative')),
    display_order   INTEGER NOT NULL DEFAULT 0
);

-- =====================================================================
-- 5. npc : NPCマスタ（MVPは1体のみ投入。将来の複数NPC追加に対応）
-- =====================================================================
CREATE TABLE npc (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    name            TEXT    NOT NULL,
    description     TEXT,
    image_path      TEXT,
    is_active       INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
    created_at      TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- =====================================================================
-- 6. ambient_sound : BGM・環境音マスタ
--    ・sound_type='bgm' の有効行がミニプレイヤーのBGMプール（シャッフル再生対象）
--    ・artist はミニプレイヤーのクレジット表記に使用（フリー音源の表記義務対応）
-- =====================================================================
CREATE TABLE ambient_sound (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    code            TEXT    NOT NULL UNIQUE,  -- 例: 'rain', 'wave', 'lofi_bgm'
    sound_type      TEXT    NOT NULL DEFAULT 'ambient' CHECK (sound_type IN ('bgm', 'ambient')),
    name            TEXT    NOT NULL,         -- BGMの場合は曲名としてミニプレイヤーに表示
    artist          TEXT,                     -- アーティスト名・クレジット表記（BGM用）
    file_path       TEXT,
    is_active       INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1))
);

-- =====================================================================
-- 7. town_progress : ユーザーごとの街育成進捗（街ごとに個別管理）
--    ・current_level は「過去に到達した最高レベル」を保持する。
--      値は上書きで増加するのみ（レベルは下がらない：要件6.1）
--    ・cumulative_study_minutes は成長方式に関わらず常に加算する
--    ・experience_points は習慣型選択中のみ付与する
--    ・project_target_minutes : プロジェクト型の目標学習時間（街ごと）。
--      入力は時間単位(1〜500時間)だが分で格納する（60〜30000）。
--      レベル基準は本値を5段階で均等割してアプリ側で動的算出する
-- =====================================================================
CREATE TABLE town_progress (
    id                          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id                     INTEGER NOT NULL REFERENCES user(id)  ON DELETE CASCADE,
    town_id                     INTEGER NOT NULL REFERENCES town(id)  ON DELETE RESTRICT,
    current_level               INTEGER NOT NULL DEFAULT 1 CHECK (current_level BETWEEN 1 AND 5),
    cumulative_study_minutes    INTEGER NOT NULL DEFAULT 0 CHECK (cumulative_study_minutes >= 0),
    experience_points           INTEGER NOT NULL DEFAULT 0 CHECK (experience_points >= 0),
    subtitle                    TEXT,               -- 街のサブタイトル（任意、上限20文字はアプリ側検証）
    project_target_minutes      INTEGER CHECK (project_target_minutes IS NULL OR project_target_minutes BETWEEN 60 AND 30000),
    is_selected                 INTEGER NOT NULL DEFAULT 0 CHECK (is_selected IN (0, 1)),
    created_at                  TEXT    NOT NULL DEFAULT (datetime('now')),
    updated_at                  TEXT    NOT NULL DEFAULT (datetime('now')),
    UNIQUE (user_id, town_id)
);

-- 同一ユーザーで「選択中の街」は常に1件のみ
CREATE UNIQUE INDEX idx_town_progress_selected
    ON town_progress(user_id)
    WHERE is_selected = 1;

CREATE INDEX idx_town_progress_user ON town_progress(user_id);

-- =====================================================================
-- 8. growth_level_threshold : レベルアップ閾値マスタ
--    ・method='habit'   : required_value は「必要累計経験値」。
--      レベルアップに必要な経験値は一律5のため、投入データは
--      Lv2:5 / Lv3:10 / Lv4:15 / Lv5:20（累計値）。
--      バランス調整は本マスタの更新のみで行える（要件6.2①）
--    ・method='project' : レベル基準は town_progress.project_target_minutes
--      を5等分してアプリ側で動的に算出するため、'project'行は現段階では
--      使用しない（データ投入不要）。将来的な仕様変更・拡張性を考慮し、
--      テーブル構造はそのまま維持する
--    ・レベル1は初期状態のため、閾値はレベル2〜5の到達条件を表す
--    ・現段階では5段階まで実装。将来的には10段階以上へ拡張可能な設計とする
-- =====================================================================
CREATE TABLE growth_level_threshold (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    method          TEXT    NOT NULL CHECK (method IN ('habit', 'project')),
    level           INTEGER NOT NULL CHECK (level BETWEEN 2 AND 5),
    required_value  INTEGER NOT NULL CHECK (required_value > 0),
    UNIQUE (method, level)
);

-- =====================================================================
-- 9. study_tag : 学習内容タグ（標準タグ + マイタグ）
--    ・標準タグ: user_id IS NULL / マイタグ: user_id = 所有ユーザー
--    ・標準タグの投入データは6件:
--      資格勉強 / レポート・課題 / 暗記・復習 / プログラミング / 読書 / その他
--    ・マイタグは論理削除方式（is_active = 0）。削除済みと同名が入力された
--      場合は is_active = 1 へ更新して復活させる（新規行は作らない）
--    ・名称変更は name の更新のみで過去記録の表示に反映される
--      （記録側は id で参照しているため）
-- =====================================================================
CREATE TABLE study_tag (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id         INTEGER REFERENCES user(id) ON DELETE CASCADE,  -- NULL = 標準タグ
    name            TEXT    NOT NULL,
    is_custom       INTEGER NOT NULL DEFAULT 0 CHECK (is_custom IN (0, 1)),
    is_active       INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
    display_order   INTEGER NOT NULL DEFAULT 0,
    created_at      TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- 標準タグ同士の名称重複を禁止
CREATE UNIQUE INDEX idx_study_tag_standard_name
    ON study_tag(name)
    WHERE user_id IS NULL;

-- マイタグはユーザー内で名称重複を禁止
CREATE UNIQUE INDEX idx_study_tag_custom_name
    ON study_tag(user_id, name)
    WHERE user_id IS NOT NULL;

CREATE INDEX idx_study_tag_user_active ON study_tag(user_id, is_active);

-- マイタグは1ユーザーあたり最大20件まで（有効 is_active=1 のもののみカウント。
-- 削除済みは上限に含めない：要件3.4）
CREATE TRIGGER trg_study_tag_mytag_limit
BEFORE INSERT ON study_tag
WHEN NEW.user_id IS NOT NULL
 AND (SELECT COUNT(*) FROM study_tag WHERE user_id = NEW.user_id AND is_active = 1) >= 20
BEGIN
    SELECT RAISE(FAIL, 'マイタグは最大20件までです');
END;

-- 削除済みマイタグの「復活」（is_active 0→1 更新）時も上限20件を担保する
CREATE TRIGGER trg_study_tag_mytag_limit_revive
BEFORE UPDATE OF is_active ON study_tag
WHEN NEW.user_id IS NOT NULL
 AND OLD.is_active = 0 AND NEW.is_active = 1
 AND (SELECT COUNT(*) FROM study_tag WHERE user_id = NEW.user_id AND is_active = 1) >= 20
BEGIN
    SELECT RAISE(FAIL, 'マイタグは最大20件までです');
END;

-- =====================================================================
-- 10. study_session : 学習セッション（記録の中心エンティティ）
--     ・study_date は「学習日」（要件0章: 18:00〜翌5:00サイクルの開始日）。
--       例: 1/10 23:30開始→翌1:30終了のセッションは '2026-01-10'。
--       カレンダー表示・目標達成判定はすべて本カラムを基準とする
--     ・night_weather_id はタイマー開始時に確定するため常に NOT NULL
--     ・emotion_id は感情記録OFF時・未入力時に NULL
--     ・ポモドーロは全ループで1件の記録（planned_minutes = 作業時間×回数）
--     ・成果記録画面から離脱した場合も自動保存する
--       （emotion_id・タグ・memo は空：要件3.4）
-- =====================================================================
CREATE TABLE study_session (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id             INTEGER NOT NULL REFERENCES user(id)          ON DELETE CASCADE,
    town_id             INTEGER NOT NULL REFERENCES town(id)          ON DELETE RESTRICT,
    night_weather_id    INTEGER NOT NULL REFERENCES night_weather(id) ON DELETE RESTRICT,
    emotion_id          INTEGER          REFERENCES emotion(id)       ON DELETE RESTRICT,
    timer_mode          TEXT    NOT NULL CHECK (timer_mode IN ('simple', 'pomodoro')),
    study_date          TEXT    NOT NULL,   -- 'YYYY-MM-DD'（学習日）
    start_time          TEXT    NOT NULL,   -- ISO8601
    end_time            TEXT    NOT NULL,   -- ISO8601
    planned_minutes     INTEGER NOT NULL CHECK (planned_minutes > 0),
    duration_minutes    INTEGER NOT NULL CHECK (duration_minutes >= 0), -- 実績学習時間（一時停止・休憩フェーズを除く）
    memo                TEXT,
    created_at          TEXT    NOT NULL DEFAULT (datetime('now')),
    updated_at          TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_study_session_user_date ON study_session(user_id, study_date);
CREATE INDEX idx_study_session_town      ON study_session(town_id);
CREATE INDEX idx_study_session_weather   ON study_session(night_weather_id);
CREATE INDEX idx_study_session_emotion   ON study_session(emotion_id);

-- =====================================================================
-- 11. session_tag : 学習セッションとタグの中間テーブル（多対多）
-- =====================================================================
CREATE TABLE session_tag (
    study_session_id    INTEGER NOT NULL REFERENCES study_session(id) ON DELETE CASCADE,
    study_tag_id        INTEGER NOT NULL REFERENCES study_tag(id)     ON DELETE RESTRICT,
    PRIMARY KEY (study_session_id, study_tag_id)
);

CREATE INDEX idx_session_tag_tag ON session_tag(study_tag_id);

-- =====================================================================
-- 12. npc_message : NPCメッセージマスタ（trigger_typeはTEXT型で将来拡張可能）
--     MVPでの trigger_type : 'study_start' / 'study_end' / 'goal_achieved' / 'goodnight'
--     学習終了と目標達成が同時に成立した場合は 'goal_achieved' を優先表示。
--     'goodnight'（おやすみ機能・要件13章）のメッセージは暗転画面に表示する。
--     街完成演出用のメッセージを持たせる場合は 'town_completed' 等を
--     追加すればよい（構造変更不要）
-- =====================================================================
CREATE TABLE npc_message (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    npc_id          INTEGER NOT NULL REFERENCES npc(id) ON DELETE CASCADE,
    trigger_type    TEXT    NOT NULL,
    message         TEXT    NOT NULL,
    is_active       INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
    created_at      TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_npc_message_trigger ON npc_message(npc_id, trigger_type);

-- =====================================================================
-- 13. notification_setting : 通知設定（ユーザー単位・1:1）
--     ・OSへのローカル通知のスケジュール登録・解除は設定保存時にアプリ側で行う
--     ・通知許可が拒否された場合は is_enabled = 0 へ戻す
--     ・MVPでは送信履歴を保存しない方針のため NotificationLog は作成しない
-- =====================================================================
CREATE TABLE notification_setting (
    user_id         INTEGER PRIMARY KEY REFERENCES user(id) ON DELETE CASCADE,
    is_enabled      INTEGER NOT NULL DEFAULT 0 CHECK (is_enabled IN (0, 1)),
    scheduled_time  TEXT,   -- 'HH:MM' 形式
    updated_at      TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- =====================================================================
-- 14. additional_study_time : 延長宣言ログ（UC 5.2）
--     ・休憩提案の表示制御にのみ使用し、目標達成・経験値の判定には影響しない
--     ・target_date は「学習日」。宣言は当学習日のみ有効（翌学習日へ引き継がない）
-- =====================================================================
CREATE TABLE additional_study_time (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id         INTEGER NOT NULL REFERENCES user(id) ON DELETE CASCADE,
    target_date     TEXT    NOT NULL,  -- 'YYYY-MM-DD'（学習日）
    added_minutes   INTEGER NOT NULL CHECK (added_minutes > 0),
    created_at      TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_additional_study_time_user_date ON additional_study_time(user_id, target_date);

-- =====================================================================
-- 15. audio_setting : 音量設定（ユーザー単位・1:1）
--     ・BGM / 環境音 / 効果音 / 鐘の音 の4種を各0〜100で管理（既定値50）
--     ・音量0の音は再生処理自体を行わない（要件9章）
--     ・ダッキング（鐘の再生中にBGM・環境音を下げる）はアプリ側の
--       再生制御で行い、設定値は変更しない
-- =====================================================================
CREATE TABLE audio_setting (
    user_id         INTEGER PRIMARY KEY REFERENCES user(id) ON DELETE CASCADE,
    bgm_volume      INTEGER NOT NULL DEFAULT 50 CHECK (bgm_volume     BETWEEN 0 AND 100),
    ambient_volume  INTEGER NOT NULL DEFAULT 50 CHECK (ambient_volume BETWEEN 0 AND 100),
    sfx_volume      INTEGER NOT NULL DEFAULT 50 CHECK (sfx_volume     BETWEEN 0 AND 100),
    bell_volume     INTEGER NOT NULL DEFAULT 50 CHECK (bell_volume    BETWEEN 0 AND 100),
    updated_at      TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- =====================================================================
-- 16. user_sound_preference : 個別音源のON/OFF（将来のユーザー選択機能拡張用。
--     MVPでは使用しない）
-- =====================================================================
CREATE TABLE user_sound_preference (
    user_id             INTEGER NOT NULL REFERENCES user(id)          ON DELETE CASCADE,
    ambient_sound_id    INTEGER NOT NULL REFERENCES ambient_sound(id) ON DELETE CASCADE,
    is_enabled          INTEGER NOT NULL DEFAULT 1 CHECK (is_enabled IN (0, 1)),
    PRIMARY KEY (user_id, ambient_sound_id)
);

-- =====================================================================
-- 17. active_session : 計測中セッションの状態（ユーザー単位・1:1）【新規】
--     時刻差分方式の計測（UC 3.2）と中断セッションの復元（UC 1.1）を支える。
--     ・計測中のみ1件存在する（非計測時は0件）。
--       学習終了時に study_session へ変換して本テーブルの行を削除する。
--       アプリ起動時に行が存在すれば「未終了セッションあり」と判定する
--     ・経過時間 = 現在時刻 - start_time - paused_accumulated_seconds
--       （一時停止中はさらに pause_started_at からの経過を除く）
--     ・ポモドーロの現在フェーズ（何ループ目の作業/休憩か）は
--       経過時間と設定値からアプリ側で算出する（フェーズ自体は保存不要）
--     ・一時停止・再開のたびに本テーブルを即時更新することで、
--       クラッシュ時も直前の状態から復元できる
--     ・break_suggest_threshold_minutes : 次回の休憩提案を表示する基準
--       （その学習日の実績合計・分）。初期値は一日の学習目標時間から算出し、
--       「継続」選択で+60、延長宣言で「現在の実績合計+宣言時間」へ更新する
-- =====================================================================
CREATE TABLE active_session (
    user_id                         INTEGER PRIMARY KEY REFERENCES user(id) ON DELETE CASCADE,
    town_id                         INTEGER NOT NULL REFERENCES town(id)          ON DELETE RESTRICT,
    night_weather_id                INTEGER NOT NULL REFERENCES night_weather(id) ON DELETE RESTRICT,
    timer_mode                      TEXT    NOT NULL CHECK (timer_mode IN ('simple', 'pomodoro')),
    planned_minutes                 INTEGER CHECK (planned_minutes IS NULL OR planned_minutes > 0),
    pomodoro_work_minutes           INTEGER CHECK (pomodoro_work_minutes  IS NULL OR pomodoro_work_minutes  BETWEEN 5 AND 120),
    pomodoro_break_minutes          INTEGER CHECK (pomodoro_break_minutes IS NULL OR pomodoro_break_minutes BETWEEN 1 AND 30),
    pomodoro_loop_count             INTEGER CHECK (pomodoro_loop_count    IS NULL OR pomodoro_loop_count    BETWEEN 1 AND 10),
    start_time                      TEXT    NOT NULL,  -- ISO8601
    paused_accumulated_seconds      INTEGER NOT NULL DEFAULT 0 CHECK (paused_accumulated_seconds >= 0),
    pause_started_at                TEXT,              -- 一時停止中のみ値を持つ。計測中はNULL
    break_suggest_threshold_minutes INTEGER CHECK (break_suggest_threshold_minutes IS NULL OR break_suggest_threshold_minutes > 0),
    updated_at                      TEXT    NOT NULL DEFAULT (datetime('now')),
    -- モードと設定値の整合をDBレベルで担保する
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

-- =====================================================================
-- 18. daily_goal_achievement : 学習日ごとの目標達成記録【新規】
--     「経験値は1学習日につき最大1回」「一度付与したら取り消さない」
--     （要件6.2①）をデータとして担保する。
--     ・行が存在する = その学習日は経験値付与済み、と判定する
--     ・複合主キーにより同一学習日の重複付与をDBレベルで防止する
--     ・セッションから合計を再計算する方式を採らないのは、日中に目標時間が
--       変更された場合に「当時達成していた」事実を再現できないため。
--       当学習日の途中で目標時間が引き上げられても本テーブルの行は削除しない
-- =====================================================================
CREATE TABLE daily_goal_achievement (
    user_id         INTEGER NOT NULL REFERENCES user(id) ON DELETE CASCADE,
    study_date      TEXT    NOT NULL,  -- 'YYYY-MM-DD'（学習日）
    achieved_at     TEXT    NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (user_id, study_date)
);

-- =====================================================================
-- 18. daily_night_weather : 学習日ごとに選択された夜の天気
--     ・ホーム画面の背景演出・環境音の参照先（要件8章）。
--       行が無い学習日は「天気未選択」＝ニュートラルな夜空とする
--       （前日以前の天気は引き継がない）
--     ・学習を開始せずホーム画面から天気だけ選べるようにするため、
--       セッションから独立して保持する（要件2.5）。
--       旧版は当学習日の study_session / active_session から導出していたが、
--       その方式では学習を開始しない限り天気を選べなかった
--     ・複合主キーにより1学習日1行。選び直した場合は上書きする（履歴は持たない）
--     ・study_session.night_weather_id とは役割が異なる。あちらは
--       「その学習に紐づく記録」であり、本テーブルの更新では書き換えない
--       （夜の天気アルバムは study_session を集計するため）
-- =====================================================================
CREATE TABLE daily_night_weather (
    user_id             INTEGER NOT NULL REFERENCES user(id)          ON DELETE CASCADE,
    study_date          TEXT    NOT NULL,  -- 'YYYY-MM-DD'（学習日）
    night_weather_id    INTEGER NOT NULL REFERENCES night_weather(id) ON DELETE RESTRICT,
    updated_at          TEXT    NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (user_id, study_date)
);

CREATE INDEX idx_daily_night_weather_weather ON daily_night_weather(night_weather_id);

-- =====================================================================
-- 備考:
-- ・10.8 データ削除機能: user テーブルの該当行を削除すると、上記の
--   ON DELETE CASCADE 設定により、ユーザーに紐づく全データ
--   （学習記録・進捗・設定・マイタグ・延長宣言・計測状態・達成記録等）が
--   連動削除される。マスタデータ（town / night_weather / emotion / npc /
--   npc_message / ambient_sound / growth_level_threshold）は削除されず、
--   初回起動時と同じ状態に戻る。削除完了後はアプリ側で初期設定画面へ
--   即時遷移する（要件10.10）。
-- ・夜の天気アルバムは専用テーブルを持たず、study_session と
--   night_weather を集計して動的に算出する（アプリ側ロジック）。
--   ホーム画面の演出用天気は「当学習日の study_session / active_session の
--   night_weather_id」を参照する（前日以前の天気は引き継がない：要件8章）。
-- ・疑似マルチプレイ人数・通知送信履歴は永続化しない（アプリ側メモリ管理）。
-- ・BGMミニプレイヤー（曲名・アーティスト表示、一時停止/スキップ/頭出し）の
--   再生状態は永続化しない（アプリ側メモリ管理）。BGMプールは ambient_sound の
--   sound_type='bgm' かつ is_active=1 の行から取得し、シャッフル再生する。
-- ・おやすみ機能（要件13章）は演出のみでありデータを持たない。
-- ・growth_level_threshold への初期投入データ（習慣型・累計値）:
--     INSERT INTO growth_level_threshold (method, level, required_value) VALUES
--         ('habit', 2, 5), ('habit', 3, 10), ('habit', 4, 15), ('habit', 5, 20);
--   ※'project' 行の投入は不要（レベル基準はアプリ側で動的算出）
-- =====================================================================
