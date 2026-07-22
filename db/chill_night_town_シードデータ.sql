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
    ('bgm_lofigirl', 'bgm', 'ローファイ少女は今日も寝不足', NULL,       'assets/audio/bgm/ローファイ少女は今日も寝不足.mp3');

-- 環境音の追加用雛形（ファイル調達後にコメントを外して更新する）
-- INSERT INTO ambient_sound (code, sound_type, name, artist, file_path) VALUES
--     ('amb_rain',   'ambient', '雨音', NULL, 'assets/audio/ambient/rain.mp3'),
--     ('amb_wind',   'ambient', '夜風', NULL, 'assets/audio/ambient/wind.mp3'),
--     ('amb_waves',  'ambient', '波音', NULL, 'assets/audio/ambient/waves.mp3'),
--     ('amb_forest', 'ambient', '森の音', NULL, 'assets/audio/ambient/forest.mp3');

-- =====================================================================
-- npc : NPCマスタ（MVPは1体。名前・画像は素材制作時に確定）
--   人格: 夜の街に住む、知的で落ち着いた大人。です・ます基調で、
--         責めない・急かさない・声を張らない
-- =====================================================================
INSERT INTO npc (name, description) VALUES
    ('夜の街の住人（仮）', '知的で落ち着いた、夜の街の住人。深夜の書店の店主・喫茶店のマスター・天文台の管理人のような佇まい。名前・立ち絵は素材制作時に確定する');

-- =====================================================================
-- npc_message : NPCメッセージ（計52本）
--   trigger_type: study_start(9) / study_end(9+11) / goal_achieved(6+11) / goodnight(6)
--   ・emotion_id が NULL の行は「感情を問わない」候補。感情未選択・感情記録OFFの受け皿
--   ・emotion_id を持つ行は、その感情が選ばれたときの候補（要件7.1）。
--     現状は感情ごと1件だが、行を追加すれば候補を増やせる（ランダムに1件選ぶ）
-- =====================================================================

-- 学習開始（study_start）
INSERT INTO npc_message (npc_id, trigger_type, message) VALUES
    (1, 'study_start', 'いらっしゃい。今夜も、静かにいい時間にしましょう。'),
    (1, 'study_start', '夜は思索に向いています。ゆっくり始めましょう。'),
    (1, 'study_start', '急ぐ必要はありません。夜は長いのですから。'),
    (1, 'study_start', '今夜の一歩が、明日の景色を少し変えますよ。'),
    (1, 'study_start', 'お茶でも淹れるつもりで、肩の力を抜いて。'),
    (1, 'study_start', '良い夜です。学ぶには、ちょうどいい静けさだ。'),
    (1, 'study_start', '机に向かうあなたを、この街は歓迎していますよ。'),
    (1, 'study_start', '準備はいりません。座った時点で、もう始まっています。'),
    (1, 'study_start', '始めましょうか。街の灯りが、あなたの手元を照らします。');

-- 学習終了（study_end）
INSERT INTO npc_message (npc_id, trigger_type, message) VALUES
    (1, 'study_end', 'お疲れさまでした。良い時間でしたね。'),
    (1, 'study_end', '今夜の分は、確かに街に刻まれました。'),
    (1, 'study_end', '一歩ずつ。それが、いちばん遠くへ行く方法です。'),
    (1, 'study_end', '学んだことは、眠っている間に根を張りますよ。'),
    (1, 'study_end', '今日はここまでにしましょう。続きは、また夜が運んでくれます。'),
    (1, 'study_end', 'あなたの灯りで、今夜の街は少し明るかった。'),
    (1, 'study_end', '温かいものでも飲んで、ゆっくりなさい。'),
    (1, 'study_end', '焦らずとも大丈夫。積み重ねは裏切りません。'),
    (1, 'study_end', '今日の努力に、静かに拍手を。');

-- 目標達成（goal_achieved）
INSERT INTO npc_message (npc_id, trigger_type, message) VALUES
    (1, 'goal_achieved', '目標達成です。お見事でした。'),
    (1, 'goal_achieved', '今夜のあなたは、自分との約束を果たしましたね。'),
    (1, 'goal_achieved', '街の住人たちも、そっと喜んでいますよ。'),
    (1, 'goal_achieved', '達成おめでとうございます。ただし、休むのも仕事のうちです。'),
    (1, 'goal_achieved', '継続は、静かな才能です。あなたにはそれがある。'),
    (1, 'goal_achieved', 'この積み重ねが、街を育てていくのです。');

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

-- おやすみ（goodnight）
INSERT INTO npc_message (npc_id, trigger_type, message) VALUES
    (1, 'goodnight', 'おやすみなさい。良い夢を。'),
    (1, 'goodnight', '灯りを落としましょう。今夜も、良い夜でした。'),
    (1, 'goodnight', 'また明晩、この街でお会いしましょう。'),
    (1, 'goodnight', '今日のあなたの頑張りは、私が覚えておきます。'),
    (1, 'goodnight', '夜は逃げません。どうぞ、ゆっくりお休みを。'),
    (1, 'goodnight', 'それでは、また。静かな眠りを。');

COMMIT;
