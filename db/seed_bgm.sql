-- =====================================================================
-- BGM音源マスタ（要件9）
--
-- 新規初期化（initializeFreshDatabase）と既存DBのマイグレーションの両方から
-- 流される、BGMの単一の出所。code で衝突したら曲名・アーティスト・ジャンル・パスを
-- 上書きするため、**何度流しても同じ結果になる（冪等）**。
--   ・前提: ambient_sound テーブルがあること（スキーマSQLで作られる）
--   ・BEGIN/COMMIT は書かない（呼び出し側のトランザクション内で流す）
--   ・is_active は触らない（ユーザーが曲を無効にしていても、流し直しで戻さない）
--
-- ジャンル（要件9・改訂55）: calm=しずかな夜 / city=夜の街 / classic=クラシック。
--   既定の絞り込みは calm で、city は「賑やかなほうを聴きたいとき」に選ぶ。
--   **フォルダ構造とは対応しない**（同じジャンルの曲がループの有無で別フォルダに入るため）。
--
-- 実ファイルは配布元の区分どおり
--   assets/audio/bgm/ループあり|ループなし/<アーティスト>/<曲名>.mp3
-- に置く。ループの有無は素材整理のための区分であって、アプリの再生挙動は変えない
-- （どちらも同じプールに入り、曲が終われば次へ進む。繰り返しはユーザーの1曲リピート操作）。
-- 2:23 AM だけは区分が分かれる前から入っている曲のため bgm/ 直下にある。
--
-- ※file_path は実ファイル名と完全に一致させること（大文字小文字・全角空白を含む）。
--   実際の再生に使うのは src/constants/audioAssets.ts の静的 require で、
--   file_path は記録・確認用。**曲を足すときは両方に足す**（片方だけだと
--   一覧に出るのに鳴らない／鳴らせるのに一覧に出ない、のどちらかになる）
-- ※アプリ組み込み配布の可否は、配布元（DOVA-SYNDROME等）および
--   アーティスト個別のライセンス規約をリリース前に必ず原文で確認すること。
--   クラシック13曲は配布元が異なる（1曲のID3タグに「クラシック名曲サウンドライブラリー」
--   の表記あり）。**クレジット表記の宛先が作曲家でよいか、リリース前に確認すること**
-- =====================================================================
INSERT INTO ambient_sound (code, sound_type, name, artist, genre, file_path) VALUES
    ('bgm_223am', 'bgm', '2:23 AM', 'しゃろう', 'city', 'assets/audio/bgm/2_23_AM.mp3'),
    ('bgm_khaim_01', 'bgm', 'ootd', 'Khaim', 'calm', 'assets/audio/bgm/ループあり/Khaim/ootd.mp3'),
    ('bgm_khaim_02', 'bgm', 'sometimes', 'Khaim', 'calm', 'assets/audio/bgm/ループあり/Khaim/sometimes.mp3'),
    ('bgm_mfp_01', 'bgm', 'Paper Cup Coffee', 'MFP', 'city', 'assets/audio/bgm/ループあり/MFP/Paper_Cup_Coffee_3.mp3'),
    ('bgm_sakuttipanda_01', 'bgm', 'すやすやタイム', 'Sakuttipanda', 'calm', 'assets/audio/bgm/ループあり/Sakuttipanda/すやすやタイム.mp3'),
    ('bgm_shimtone_01', 'bgm', '瑠璃の鳴る夜に', 'shimtone', 'calm', 'assets/audio/bgm/ループあり/shimtone/瑠璃の鳴る夜に.mp3'),
    ('bgm_shimtone_02', 'bgm', '白くほのかに', 'shimtone', 'calm', 'assets/audio/bgm/ループあり/shimtone/白くほのかに.mp3'),
    ('bgm_shimtone_03', 'bgm', '花降る宵空', 'shimtone', 'calm', 'assets/audio/bgm/ループあり/shimtone/花降る宵空.mp3'),
    ('bgm_shimtone_04', 'bgm', '雨の庭', 'shimtone', 'calm', 'assets/audio/bgm/ループあり/shimtone/雨の庭.mp3'),
    ('bgm_shimtone_05', 'bgm', '雨の路地裏', 'shimtone', 'calm', 'assets/audio/bgm/ループあり/shimtone/雨の路地裏.mp3'),
    ('bgm_yuheikomatsu_01', 'bgm', 'City Lights', 'yuhei komatsu', 'city', 'assets/audio/bgm/ループあり/yuhei komatsu/City_Lights.mp3'),
    ('bgm_yuheikomatsu_02', 'bgm', 'cigarette', 'yuhei komatsu', 'city', 'assets/audio/bgm/ループあり/yuhei komatsu/cigarette.mp3'),
    ('bgm_ethnickawahiro_01', 'bgm', 'Oxide', 'えすにっく・かわひろ', 'calm', 'assets/audio/bgm/ループあり/えすにっく・かわひろ/Oxide_2.mp3'),
    ('bgm_kureppu_01', 'bgm', '夜風の火花', 'くれっぷ', 'calm', 'assets/audio/bgm/ループあり/くれっぷ/夜風の火花.mp3'),
    ('bgm_kureppu_02', 'bgm', '白息', 'くれっぷ', 'calm', 'assets/audio/bgm/ループあり/くれっぷ/白息.mp3'),
    ('bgm_sharou_01', 'bgm', 'さみしいおばけと東京の月', 'しゃろう', 'city', 'assets/audio/bgm/ループあり/しゃろう/さみしいおばけと東京の月_2.mp3'),
    ('bgm_lofigirl', 'bgm', 'ローファイ少女は今日も寝不足', 'しゃろう', 'city', 'assets/audio/bgm/ループあり/しゃろう/ローファイ少女は今日も寝不足_2.mp3'),
    ('bgm_shinsanworks_01', 'bgm', 'ナイトシフト', 'しんさんわーくす', 'calm', 'assets/audio/bgm/ループあり/しんさんわーくす/ナイトシフト.mp3'),
    ('bgm_noru_01', 'bgm', 'Code.241', 'のる', 'calm', 'assets/audio/bgm/ループあり/のる/Code.241_2.mp3'),
    ('bgm_nekoto_01', 'bgm', '寝台特急ローファイ瀬戸', 'ネコト', 'calm', 'assets/audio/bgm/ループあり/ネコト/寝台特急ローファイ瀬戸.mp3'),
    ('bgm_matsuurayosuke_01', 'bgm', 'A Quiet Place Among Strangers', '松浦洋介', 'city', 'assets/audio/bgm/ループあり/松浦洋介/A_Quiet_Place_Among_Strangers.mp3'),
    ('bgm_kouyatakashi_01', 'bgm', 'Cat’s cradle', '稿屋　隆', 'calm', 'assets/audio/bgm/ループあり/稿屋　隆/Cat’s_cradle.mp3'),
    ('bgm_kamabokosachiko_01', 'bgm', 'Dark blue night', '蒲鉾さちこ', 'calm', 'assets/audio/bgm/ループあり/蒲鉾さちこ/Dark blue night.mp3'),
    ('bgm_kamabokosachiko_02', 'bgm', 'Lazy Midnight(深夜にまったり)', '蒲鉾さちこ', 'calm', 'assets/audio/bgm/ループあり/蒲鉾さちこ/Lazy_Midnight(深夜にまったり).mp3'),
    ('bgm_kamabokosachiko_03', 'bgm', 'Lazy night(気だるい夜)', '蒲鉾さちこ', 'calm', 'assets/audio/bgm/ループあり/蒲鉾さちこ/Lazy_night(気だるい夜).mp3'),
    ('bgm_kamabokosachiko_04', 'bgm', 'The maze of aqua', '蒲鉾さちこ', 'calm', 'assets/audio/bgm/ループあり/蒲鉾さちこ/The_maze_of_aqua.mp3'),
    ('bgm_kamabokosachiko_10', 'bgm', '優しい海辺', '蒲鉾さちこ', 'calm', 'assets/audio/bgm/ループあり/蒲鉾さちこ/優しい海辺.mp3'),
    ('bgm_kamabokosachiko_11', 'bgm', '優しい灯火(Tenderly glow)', '蒲鉾さちこ', 'calm', 'assets/audio/bgm/ループあり/蒲鉾さちこ/優しい灯火(Tenderly_glow).mp3'),
    ('bgm_kamabokosachiko_12', 'bgm', '波打つ鼓動', '蒲鉾さちこ', 'calm', 'assets/audio/bgm/ループあり/蒲鉾さちこ/波打つ鼓動.mp3'),
    ('bgm_kamabokosachiko_13', 'bgm', '精霊が棲まう森', '蒲鉾さちこ', 'city', 'assets/audio/bgm/ループあり/蒲鉾さちこ/精霊が棲まう森.mp3'),
    ('bgm_kai_01', 'bgm', '寂れた村', '香居', 'calm', 'assets/audio/bgm/ループあり/香居/寂れた村.mp3'),
    ('bgm_anonyment_01', 'bgm', 'Treatise Seven', 'Anonyment', 'calm', 'assets/audio/bgm/ループなし/Anonyment/Treatise_Seven.mp3'),
    ('bgm_flashbeat_01', 'bgm', 'Rain In The City', 'FLASH☆BEAT', 'calm', 'assets/audio/bgm/ループなし/FLASH☆BEAT/Rain_In_The_City.mp3'),
    ('bgm_flehmann_01', 'bgm', 'Flowers at night', 'Flehmann', 'calm', 'assets/audio/bgm/ループなし/Flehmann/Flowers_at_night.mp3'),
    ('bgm_hstar_01', 'bgm', 'Rain in the shade of a tree', 'H★', 'calm', 'assets/audio/bgm/ループなし/H★/Rain_in_the_shade_of_a_tree_.mp3'),
    ('bgm_hstar_02', 'bgm', 'rainy night city', 'H★', 'calm', 'assets/audio/bgm/ループなし/H★/rainy_night_city.mp3'),
    ('bgm_bach_01', 'bgm', 'メヌエット長調', 'J.S.バッハ', 'classic', 'assets/audio/bgm/ループなし/J.S.バッハ/メヌエット長調.mp3'),
    ('bgm_bach_02', 'bgm', '主よ、人の望みの喜びよ', 'J.S.バッハ', 'classic', 'assets/audio/bgm/ループなし/J.S.バッハ/主よ、人の望みの喜びよ.mp3'),
    ('bgm_khaim_03', 'bgm', 'Mad Trick (Prod. Khaim)', 'Khaim', 'calm', 'assets/audio/bgm/ループなし/Khaim/Mad_Trick_(Prod._Khaim).mp3'),
    ('bgm_mfp_02', 'bgm', 'Sine of Fall', 'MFP', 'calm', 'assets/audio/bgm/ループなし/MFP/Sine_of_Fall.mp3'),
    ('bgm_makeafiledmusic_01', 'bgm', '泡沫の夢', 'Make a filed Music', 'calm', 'assets/audio/bgm/ループなし/Make a filed Music/泡沫の夢.mp3'),
    ('bgm_masuo_01', 'bgm', '午後のカメレオンは星の波動を数えてうたた寝をする', 'Masuo', 'calm', 'assets/audio/bgm/ループなし/Masuo/午後のカメレオンは星の波動を数えてうたた寝をする.mp3'),
    ('bgm_nekozou_01', 'bgm', 'Chill time', 'NEKOZOU', 'calm', 'assets/audio/bgm/ループなし/NEKOZOU/Chill_time.mp3'),
    ('bgm_nekozou_02', 'bgm', 'stardust cream soda', 'NEKOZOU', 'calm', 'assets/audio/bgm/ループなし/NEKOZOU/stardust_cream_soda.mp3'),
    ('bgm_nekozou_03', 'bgm', '東京ローファイポップ', 'NEKOZOU', 'city', 'assets/audio/bgm/ループなし/NEKOZOU/東京ローファイポップ.mp3'),
    ('bgm_sakurabeatz_01', 'bgm', '私のチープな25時。', 'SAKURA BEATZ.JP', 'city', 'assets/audio/bgm/ループなし/SAKURA BEATZ.JP/私のチープな25時。.mp3'),
    ('bgm_soundofincense_01', 'bgm', 'BGM - 151 - Rainy Sky', 'Sound Of Incense', 'calm', 'assets/audio/bgm/ループなし/Sound Of Incense/BGM_-_151_-_Rainy_Sky.mp3'),
    ('bgm_modus_02', 'bgm', 'ヒトリジメ - 宵と静けさと', 'modus', 'calm', 'assets/audio/bgm/ループなし/modus/ヒトリジメ_-_宵と静けさと_-.mp3'),
    ('bgm_roku_01', 'bgm', '線路花', 'roku', 'calm', 'assets/audio/bgm/ループなし/roku/線路花.mp3'),
    ('bgm_t12ya_01', 'bgm', 'SilkyLatte', 't12ya', 'city', 'assets/audio/bgm/ループなし/t12ya/SilkyLatte.mp3'),
    ('bgm_t12ya_02', 'bgm', 'the way home', 't12ya', 'calm', 'assets/audio/bgm/ループなし/t12ya/the_way_home.mp3'),
    ('bgm_t12ya_03', 'bgm', '夕暮れのポラロイド', 't12ya', 'calm', 'assets/audio/bgm/ループなし/t12ya/夕暮れのポラロイド.mp3'),
    ('bgm_t12ya_04', 'bgm', '雨が止むまで', 't12ya', 'calm', 'assets/audio/bgm/ループなし/t12ya/雨が止むまで.mp3'),
    ('bgm_yuheikomatsu_03', 'bgm', 'Remind', 'yuhei komatsu', 'city', 'assets/audio/bgm/ループなし/yuhei komatsu/Remind.mp3'),
    ('bgm_koudatsuno_01', 'bgm', 'polar star', 'こうだつの', 'calm', 'assets/audio/bgm/ループなし/こうだつの/polar_star.mp3'),
    ('bgm_natsucollage_01', 'bgm', '垣間見える狂気〜Hip-hopに乗せて〜', 'なつこらーじゅ', 'city', 'assets/audio/bgm/ループなし/なつこらーじゅ/垣間見える狂気〜Hip-hopに乗せて〜.mp3'),
    ('bgm_noru_02', 'bgm', 'Brush Up!', 'のる', 'city', 'assets/audio/bgm/ループなし/のる/Brush_Up!.mp3'),
    ('bgm_noru_03', 'bgm', 'draw in the night', 'のる', 'calm', 'assets/audio/bgm/ループなし/のる/draw_in_the_night.mp3'),
    ('bgm_noru_04', 'bgm', '夜をさがして', 'のる', 'calm', 'assets/audio/bgm/ループなし/のる/夜をさがして.mp3'),
    ('bgm_noru_05', 'bgm', '夜明けを待つ星', 'のる', 'calm', 'assets/audio/bgm/ループなし/のる/夜明けを待つ星.mp3'),
    ('bgm_noru_06', 'bgm', '小さな旅', 'のる', 'calm', 'assets/audio/bgm/ループなし/のる/小さな旅.mp3'),
    ('bgm_noru_07', 'bgm', '後片付けをしよう～第二幕', 'のる', 'calm', 'assets/audio/bgm/ループなし/のる/後片付けをしよう～第二幕.mp3'),
    ('bgm_noru_08', 'bgm', '我儘な夜のハーブティ', 'のる', 'calm', 'assets/audio/bgm/ループなし/のる/我儘な夜のハーブティ.mp3'),
    ('bgm_noru_09', 'bgm', '星に逢う夜', 'のる', 'calm', 'assets/audio/bgm/ループなし/のる/星に逢う夜.mp3'),
    ('bgm_elgar_01', 'bgm', '愛のあいさつ', 'エルガー', 'classic', 'assets/audio/bgm/ループなし/エルガー/愛のあいさつ.mp3'),
    ('bgm_oohiraseiji_01', 'bgm', 'Shibuya Nightscape', 'オオヒラセイジ', 'city', 'assets/audio/bgm/ループなし/オオヒラセイジ/Shibuya_Nightscape .mp3'),
    ('bgm_oohiraseiji_02', 'bgm', '止まない雨はない', 'オオヒラセイジ', 'calm', 'assets/audio/bgm/ループなし/オオヒラセイジ/止まない雨はない.mp3'),
    ('bgm_oohiraseiji_03', 'bgm', '雨のち小夜時雨', 'オオヒラセイジ', 'calm', 'assets/audio/bgm/ループなし/オオヒラセイジ/雨のち小夜時雨.mp3'),
    ('bgm_satie_01', 'bgm', 'ジムノペディ(ピアノ)', 'サティ', 'classic', 'assets/audio/bgm/ループなし/サティ/ジムノペディ(ピアノ).mp3'),
    ('bgm_schumann_01', 'bgm', '《子供の情景》第7曲『トロイメライ』', 'シューマン', 'classic', 'assets/audio/bgm/ループなし/シューマン/《子供の情景》第7曲『トロイメライ』.mp3'),
    ('bgm_chopin_01', 'bgm', '前奏曲 第15番 変ニ長調 雨だれ', 'ショパン', 'classic', 'assets/audio/bgm/ループなし/ショパン/前奏曲_第15番_変ニ長調_雨だれ.mp3'),
    ('bgm_chopin_02', 'bgm', '前奏曲 第7番 イ長調', 'ショパン', 'classic', 'assets/audio/bgm/ループなし/ショパン/前奏曲_第7番_イ長調.mp3'),
    ('bgm_debussy_01', 'bgm', '《ベルガマスク組曲》より 3. 月の光', 'ドビュッシー', 'classic', 'assets/audio/bgm/ループなし/ドビュッシー/《ベルガマスク組曲》より 3. 月の光.mp3'),
    ('bgm_hayashiyuu_01', 'bgm', 'Coffee Beat', 'ハヤシユウ', 'city', 'assets/audio/bgm/ループなし/ハヤシユウ/Coffee_Beat.mp3'),
    ('bgm_hayashiyuu_02', 'bgm', '星降る夜のホットココア', 'ハヤシユウ', 'calm', 'assets/audio/bgm/ループなし/ハヤシユウ/星降る夜のホットココア.mp3'),
    ('bgm_pachelbel_01', 'bgm', 'カノン ニ長調', 'パッヘルベル', 'classic', 'assets/audio/bgm/ループなし/パッヘルベル/カノン ニ長調.mp3'),
    ('bgm_beethoven_01', 'bgm', '悲愴 第二楽章', 'ベートーヴェン', 'classic', 'assets/audio/bgm/ループなし/ベートーヴェン/悲愴_第二楽章.mp3'),
    ('bgm_beethoven_02', 'bgm', '月光第一楽章', 'ベートーヴェン', 'classic', 'assets/audio/bgm/ループなし/ベートーヴェン/月光第一楽章.mp3'),
    ('bgm_massenet_01', 'bgm', '瞑想曲', 'マスネ', 'classic', 'assets/audio/bgm/ループなし/マスネ/瞑想曲.mp3'),
    ('bgm_liszt_01', 'bgm', '愛の夢 第3番 変イ長調 「おお、愛しうる限り愛せ」(ピアノ)', 'リスト', 'classic', 'assets/audio/bgm/ループなし/リスト/愛の夢_第3番_変イ長調_「おお、愛しうる限り愛せ」(ピアノ).mp3'),
    ('bgm_sadoharahayato_01', 'bgm', 'レイニーナイト', '佐土原隼人', 'calm', 'assets/audio/bgm/ループなし/佐土原隼人/レイニーナイト.mp3'),
    ('bgm_kitamihitsuji_01', 'bgm', '猫と私', '北見ヒツジ', 'calm', 'assets/audio/bgm/ループなし/北見ヒツジ/猫と私.mp3'),
    ('bgm_yamamotoryoma_01', 'bgm', 'midnight coffee', '山本リョーマ', 'calm', 'assets/audio/bgm/ループなし/山本リョーマ/midnight_coffee.mp3'),
    ('bgm_matsuurayosuke_02', 'bgm', 'Midnight Chill Coffee', '松浦洋介', 'city', 'assets/audio/bgm/ループなし/松浦洋介/Midnight_Chill_Coffee.mp3'),
    ('bgm_matsuurayosuke_03', 'bgm', 'Rain Knows Where I’m Broken', '松浦洋介', 'calm', 'assets/audio/bgm/ループなし/松浦洋介/Rain_Knows_Where_I’m_Broken.mp3'),
    ('bgm_matsuurayosuke_04', 'bgm', 'The Last Firefly of Summer', '松浦洋介', 'calm', 'assets/audio/bgm/ループなし/松浦洋介/The_Last_Firefly_of_Summer.mp3'),
    ('bgm_matsuurayosuke_05', 'bgm', 'Until Shadows Fade', '松浦洋介', 'calm', 'assets/audio/bgm/ループなし/松浦洋介/Until_Shadows_Fade.mp3'),
    ('bgm_kouyatakashi_04', 'bgm', 'ガリレオの脳ミソ', '稿屋　隆', 'calm', 'assets/audio/bgm/ループなし/稿屋　隆/ガリレオの脳ミソ.mp3'),
    ('bgm_kouyatakashi_02', 'bgm', '機械仕掛けの街', '稿屋　隆', 'city', 'assets/audio/bgm/ループなし/稿屋　隆/機械仕掛けの街.mp3'),
    ('bgm_kouyatakashi_03', 'bgm', '薬指の標本', '稿屋　隆', 'calm', 'assets/audio/bgm/ループなし/稿屋　隆/薬指の標本.mp3'),
    ('bgm_kamabokosachiko_14', 'bgm', 'Luminous time', '蒲鉾さちこ', 'calm', 'assets/audio/bgm/ループなし/蒲鉾さちこ/Luminous_time.mp3'),
    ('bgm_kamabokosachiko_05', 'bgm', 'Melancholy autumn rainy day', '蒲鉾さちこ', 'calm', 'assets/audio/bgm/ループなし/蒲鉾さちこ/Melancholy_autumn_rainy_day.mp3'),
    ('bgm_kamabokosachiko_06', 'bgm', 'Peaceful rest', '蒲鉾さちこ', 'calm', 'assets/audio/bgm/ループなし/蒲鉾さちこ/Peaceful_rest.mp3'),
    ('bgm_kamabokosachiko_15', 'bgm', 'Unbelievable dream', '蒲鉾さちこ', 'calm', 'assets/audio/bgm/ループなし/蒲鉾さちこ/Unbelievable_dream.mp3'),
    ('bgm_kamabokosachiko_07', 'bgm', 'White snow chill days', '蒲鉾さちこ', 'calm', 'assets/audio/bgm/ループなし/蒲鉾さちこ/White_snow_chill_days.mp3'),
    ('bgm_kamabokosachiko_16', 'bgm', '優しい憂雨に', '蒲鉾さちこ', 'calm', 'assets/audio/bgm/ループなし/蒲鉾さちこ/優しい憂雨に.mp3'),
    ('bgm_kamabokosachiko_17', 'bgm', '優しい日だまりと、静寂', '蒲鉾さちこ', 'calm', 'assets/audio/bgm/ループなし/蒲鉾さちこ/優しい日だまりと、静寂.mp3'),
    ('bgm_kamabokosachiko_18', 'bgm', '優しい窓辺', '蒲鉾さちこ', 'calm', 'assets/audio/bgm/ループなし/蒲鉾さちこ/優しい窓辺.mp3'),
    ('bgm_kamabokosachiko_19', 'bgm', '冬の訪れ', '蒲鉾さちこ', 'calm', 'assets/audio/bgm/ループなし/蒲鉾さちこ/冬の訪れ.mp3'),
    ('bgm_kamabokosachiko_20', 'bgm', '初夏の風を感じて…', '蒲鉾さちこ', 'calm', 'assets/audio/bgm/ループなし/蒲鉾さちこ/初夏の風を感じて….mp3'),
    ('bgm_kamabokosachiko_21', 'bgm', '夜と静寂(The night and quiet)', '蒲鉾さちこ', 'calm', 'assets/audio/bgm/ループなし/蒲鉾さちこ/夜と静寂(The_night_and_quiet).mp3'),
    ('bgm_kamabokosachiko_22', 'bgm', '夜闇に、風に紛れて', '蒲鉾さちこ', 'calm', 'assets/audio/bgm/ループなし/蒲鉾さちこ/夜闇に、風に紛れて.mp3'),
    ('bgm_kamabokosachiko_08', 'bgm', '年を刻んで', '蒲鉾さちこ', 'calm', 'assets/audio/bgm/ループなし/蒲鉾さちこ/年を刻んで.mp3'),
    ('bgm_kamabokosachiko_23', 'bgm', '木漏れ日と温もり', '蒲鉾さちこ', 'calm', 'assets/audio/bgm/ループなし/蒲鉾さちこ/木漏れ日と温もり.mp3'),
    ('bgm_kamabokosachiko_24', 'bgm', '柔らかな温もり', '蒲鉾さちこ', 'calm', 'assets/audio/bgm/ループなし/蒲鉾さちこ/柔らかな温もり.mp3'),
    ('bgm_kamabokosachiko_25', 'bgm', '秋、深まりて', '蒲鉾さちこ', 'calm', 'assets/audio/bgm/ループなし/蒲鉾さちこ/秋、深まりて.mp3'),
    ('bgm_kamabokosachiko_26', 'bgm', '秋を眺めて', '蒲鉾さちこ', 'calm', 'assets/audio/bgm/ループなし/蒲鉾さちこ/秋を眺めて.mp3'),
    ('bgm_kamabokosachiko_09', 'bgm', '荒れ地に咲く花', '蒲鉾さちこ', 'calm', 'assets/audio/bgm/ループなし/蒲鉾さちこ/荒れ地に咲く花.mp3'),
    ('bgm_kazehito_01', 'bgm', 'ぱいかじ日和', '風人', 'city', 'assets/audio/bgm/ループなし/風人/ぱいかじ日和.mp3')
ON CONFLICT(code) DO UPDATE SET
    name      = excluded.name,
    artist    = excluded.artist,
    genre     = excluded.genre,
    file_path = excluded.file_path;
