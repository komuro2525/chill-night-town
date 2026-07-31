-- =====================================================================
-- Chill Night Town - シードデータ（マスタ投入）v1
-- 対応スキーマ: chill_night_town_スキーマ_v2.sql
-- 実行前提: スキーマ適用済みの空DBに対して1回だけ実行する
-- 備考:
--   ・user / 各設定テーブル(1:1) / town_progress はアプリの初期設定時に
--     作成するためシード対象外
--   ・街の名称・NPCの名前と画像は素材制作時に確定後、本ファイルを更新する
--     （「（仮）」付きのレコードが対象）
-- =====================================================================

PRAGMA foreign_keys = ON;
BEGIN TRANSACTION;

-- =====================================================================
-- town : 街マスタ（4件）。code / name は背景画像フォルダ名に合わせる
--   （assets/images/home/<code>/）。名称・テーマは素材制作時に日本語へ更新する。
--   背景画像の登録は src/constants/townArt.ts（code をキーに静的登録）。
--   画像未制作の街（snowTown / starHill）は townArt 未登録＝「準備中」表示。
-- =====================================================================
INSERT INTO town (code, name, description, display_order) VALUES
    ('nightTown',  'nightTown',  'テーマ未定。素材制作時に名称・説明を更新する', 1),
    ('castleTown', 'castleTown', 'テーマ未定。素材制作時に名称・説明を更新する', 2),
    ('snowTown',   'snowTown',   'テーマ未定。素材制作時に名称・説明を更新する', 3),
    ('starHill',   'starHill',   'テーマ未定。素材制作時に名称・説明を更新する', 4);

-- =====================================================================
-- night_weather : 夜の天気マスタ（11種）
-- =====================================================================
INSERT INTO night_weather (code, emoji, name, display_order) VALUES
    ('starry_night',    '✨',  '星空の夜',   1),
    ('moonlight_night', '🌙',  '月灯りの夜', 2),
    ('full_moon_night', '🌕',  '満月の夜',   3),
    ('dark_night',      '🌑',  '闇夜',       4),
    ('cloudy_night',    '☁️', '雲間の夜',   5),
    ('rainy_night',     '🌧️', '雨音の夜',   6),
    ('stormy_night',    '⛈️', '嵐の夜',     7),
    ('snowy_night',     '❄️', '雪明かりの夜', 8),
    ('silent_night',    '🌃',  '静寂の夜',   9),
    ('foggy_night',     '🌫',  '霧の夜',     10),
    ('fireworks_night', '🎆',  '花火の夜',   11);

-- =====================================================================
-- emotion : 感情マスタ（11種・3カテゴリ）
-- =====================================================================
INSERT INTO emotion (code, emoji, name, category, display_order) VALUES
    ('achievement', '😊', '達成感',               'positive', 1),
    ('focused',     '🔥', '集中できた',           'positive', 2),
    ('persevered',  '💪', '頑張れた',             'positive', 3),
    ('enjoyed',     '😄', '楽しかった',           'positive', 4),
    ('calm',        '😌', '穏やかだった',         'neutral',  5),
    ('as_usual',    '😶', 'いつも通り',           'neutral',  6),
    ('sleepy',      '😴', '眠かった',             'neutral',  7),
    ('tired',       '😔', '疲れた',               'negative', 8),
    ('down',        '😞', '少し落ち込んだ',       'negative', 9),
    ('anxious',     '😥', '不安だった',           'negative', 10),
    ('stuck',       '😣', '思うように進まなかった', 'negative', 11);

-- =====================================================================
-- study_tag : 標準タグ（5種。user_id=NULL / is_custom=0）
--   「その他」は置かない。タグは任意項目で何も選ばずに保存できるため、
--   「その他」と無選択の情報量が同じで振り返りの役に立たない（要件3.4）。
--   分類しきれない内容はマイタグとして具体的な名前で登録できる
-- =====================================================================
INSERT INTO study_tag (user_id, name, is_custom, display_order) VALUES
    (NULL, '資格勉強',       0, 1),
    (NULL, 'レポート・課題', 0, 2),
    (NULL, '暗記・復習',     0, 3),
    (NULL, 'プログラミング', 0, 4),
    (NULL, '読書',           0, 5);

-- =====================================================================
-- growth_level_threshold : レベルアップ閾値（習慣型・必要累計経験値）
--   一律5/レベル → 累計 5/10/15/20。バランス調整は本マスタの更新で行う
--   プロジェクト型は動的算出のため投入不要
-- =====================================================================
INSERT INTO growth_level_threshold (method, level, required_value) VALUES
    ('habit', 2, 5),
    ('habit', 3, 10),
    ('habit', 4, 15),
    ('habit', 5, 20);

-- =====================================================================
-- ambient_sound : 音源マスタ
--   BGM: テスト用2曲
--   ※file_path は実ファイル名と完全に一致させること（大文字小文字を含む）
--   ※アプリ組み込み配布の可否は、配布元（DOVA-SYNDROME等）および
--     アーティスト個別のライセンス規約をリリース前に必ず原文で確認すること
--   環境音: 音源調達後に追加する（下のコメントを雛形として使用）
-- =====================================================================
INSERT INTO ambient_sound (code, sound_type, name, artist, file_path) VALUES
    ('bgm_223am',    'bgm', '2:23 AM',                'しゃろう', 'assets/audio/bgm/2_23_AM.mp3'),
    ('bgm_lofigirl', 'bgm', 'ローファイ少女は今日も寝不足', 'しゃろう', 'assets/audio/bgm/ローファイ少女は今日も寝不足.mp3');

-- 環境音の追加用雛形（ファイル調達後にコメントを外して更新する）
-- INSERT INTO ambient_sound (code, sound_type, name, artist, file_path) VALUES
--     ('amb_rain',   'ambient', '雨音', NULL, 'assets/audio/ambient/rain.mp3'),
--     ('amb_wind',   'ambient', '夜風', NULL, 'assets/audio/ambient/wind.mp3'),
--     ('amb_waves',  'ambient', '波音', NULL, 'assets/audio/ambient/waves.mp3'),
--     ('amb_forest', 'ambient', '森の音', NULL, 'assets/audio/ambient/forest.mp3');

-- =====================================================================
-- npc : NPCマスタ（街ごとに1人の住人。画像は素材制作時に確定）
--   人格: 夜の街に住む、知的で落ち着いた大人。です・ます基調で、
--         責めない・急かさない・声を張らない
-- =====================================================================
-- NPC(1)＝書店の店主（既定の住人・夜の街）。ここではフォールバック先となる
-- マスタ行だけ先に用意する。全住人の街・名前・紹介文・メッセージの最終形は
-- db/seed_npc.sql が投入する（新規/既存の両方へ流す単一の出所。docs/NPCセリフ集.md から
-- npm run npc:seed で生成される）。
INSERT INTO npc (name, town_id, description) VALUES
    ('書店の店主', (SELECT id FROM town WHERE code = 'nightTown'), '（紹介文は db/seed_npc.sql で設定）');

COMMIT;
