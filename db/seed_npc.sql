-- =====================================================================
-- 住人（NPC）の街・名前・紹介文・メッセージ（要件7.1）
--
-- ★このファイルは自動生成です。直接編集しないこと。
--   文面の正: docs/NPCセリフ集.md  /  生成: npm run npc:seed
--
-- 新規初期化（initializeFreshDatabase）と既存DBのマイグレーションの両方から
-- 流される、住人データの単一の出所。冒頭で npc_message を全消しするため、
-- **何度流しても同じ結果になる（冪等）**。
--   ・前提: town / emotion マスタと npc(1) の行が既にあること（本体シードで用意）
--   ・BEGIN/COMMIT は書かない（呼び出し側のトランザクション内で流す）
--
-- 住人は街ごとに1人。全員「責めない・急かさない・声を張らない」基調は共通で、
-- 違うのは声色と比喩の引き出しだけ。
--   1: 書店の店主（nightTown）… 55本
--   3: 天文台の管理人（starHill）… 55本
--   4: 茶屋の女将（castleTown）… 55本
--   5: ストーブ番の若者（snowTown）… 55本
--   6: 夜更かし仲間（nightTown）… 0本
--   7: 焚火番の子（starHill）… 0本
--   8: 桜守の老人（castleTown）… 0本
--   9: 宿の番頭（snowTown）… 0本
-- =====================================================================

-- 既存のメッセージを一旦すべて消してから入れ直す（冪等・文面の刷新用）
DELETE FROM npc_message;

-- 住人のマスタ行。1人目は本体シードで作成済みのため OR IGNORE で足りる
INSERT OR IGNORE INTO npc (id, name) VALUES
    (1, '書店の店主'),
    (3, '天文台の管理人'),
    (4, '茶屋の女将'),
    (5, 'ストーブ番の若者'),
    (6, '夜更かし仲間'),
    (7, '焚火番の子'),
    (8, '桜守の老人'),
    (9, '宿の番頭');

-- 街・名前・紹介文を確定する（旧バージョンの名前・紹介文も上書きする）
UPDATE npc SET
    name = '書店の店主',
    town_id = (SELECT id FROM town WHERE code = 'nightTown'),
    description = '深夜まで灯りの絶えない、古書店の店主。
物静かで思索的だが、押しつけがましさはない。
本の背表紙を撫でるように言葉を選び、あなたの夜にそっと一冊を差し出す。
急かさず、責めず、ただ隣で頁をめくっているような住人。'
WHERE id = 1;

UPDATE npc SET
    name = '天文台の管理人',
    town_id = (SELECT id FROM town WHERE code = 'starHill'),
    description = '丘の上の古い天文台を守る、管理人。
言葉は少なく、詩のように短い。
星や夜空になぞらえて、そっと一言を置いていく。
多くは語らないが、あなたの夜をいつも遠くから見守る住人。'
WHERE id = 3;

UPDATE npc SET
    name = '茶屋の女将',
    town_id = (SELECT id FROM town WHERE code = 'castleTown'),
    description = '夜桜の通りでのれんを下げる、茶屋の女将。
世話焼きだが、決して引き止めはしない。
湯呑みをひとつ置くように、通りがかりのあなたへ一言かける。
帰り道の途中で、少しだけ休んでいける場所のような住人。'
WHERE id = 4;

UPDATE npc SET
    name = 'ストーブ番の若者',
    town_id = (SELECT id FROM town WHERE code = 'snowTown'),
    description = '窓辺のこちら側で、夜通しストーブの火を守っている若者。
気負いがなく、言葉も飾らない。
外の雪より、こちら側があたたかいかどうかを気にしている。
同じ部屋で、そっと薪をくべ足しているような住人。'
WHERE id = 5;

UPDATE npc SET
    name = '夜更かし仲間',
    town_id = (SELECT id FROM town WHERE code = 'nightTown'),
    description = '同じテラスに、毎晩のように現れる相手。
何かをしてくれるわけではなく、ただ隣に座っている。
眠ければ寝るし、話したくなければ黙っている。
一緒に夜更かしをするためだけに、そこにいる住人。'
WHERE id = 6;

UPDATE npc SET
    name = '焚火番の子',
    town_id = (SELECT id FROM town WHERE code = 'starHill'),
    description = '焚火のそばにいる子ども。
空よりも、来た人の顔をよく見ている。
眠ければ眠いと言い、へんだと思えばへんだと言う。
夜更かしを、特別なことだと思っていない住人。'
WHERE id = 7;

UPDATE npc SET
    name = '桜守の老人',
    town_id = (SELECT id FROM town WHERE code = 'castleTown'),
    description = '通りの夜桜を、何十年も世話してきた人。
花の咲かない年も、枝が伸びない年も見てきた。
急かすことがないのは、木がそういうものだと知っているから。
一晩の遅れを、遅れとは呼ばない住人。'
WHERE id = 8;

UPDATE npc SET
    name = '宿の番頭',
    town_id = (SELECT id FROM town WHERE code = 'snowTown'),
    description = 'この宿の帳場を預かる人。
湯を沸かし、戸締まりを確かめ、宿帳をつけて夜を閉じる。
あなたが来た夜も、静かに帳面へ控えている。
折り目正しいが、冷たくはない住人。'
WHERE id = 9;

-- セリフ集に載っていない住人は退去させる（住人の入れ替えもこのファイルで完結する）。
-- active_session.npc_id は ON DELETE RESTRICT のため、先に参照を外す。
-- NULL になったセッションは既定の住人（npc(1)）が代わりに話す。
UPDATE active_session SET npc_id = NULL WHERE npc_id NOT IN (1, 3, 4, 5, 6, 7, 8, 9);
DELETE FROM npc WHERE id NOT IN (1, 3, 4, 5, 6, 7, 8, 9);

-- =====================================================================
-- NPC 1: 書店の店主（nightTown）
-- =====================================================================

-- study_start（感情を問わない候補）
INSERT INTO npc_message (npc_id, trigger_type, message) VALUES
    (1, 'study_start', 'いらっしゃい。今夜も、静かな一頁を書き足していきましょう。'),
    (1, 'study_start', '夜は、読むにも書くにも向いています。ゆっくり栞をひらいて。'),
    (1, 'study_start', '急ぐことはありません。物語の続きは、逃げませんから。'),
    (1, 'study_start', '今夜の一行が、明日のあなたの章を少し進めます。'),
    (1, 'study_start', '一杯のお茶をいれるくらいの気持ちで、肩の力を抜いて。'),
    (1, 'study_start', '良い夜です。頁をめくる音さえ聞こえそうな静けさだ。'),
    (1, 'study_start', '机に向かうあなたを、この古書店は歓迎しますよ。'),
    (1, 'study_start', '準備はいりません。栞をはさんだところから、また始めましょう。'),
    (1, 'study_start', '始めましょうか。街の灯りが、あなたの手元の頁を照らします。');

-- study_end（感情を問わない候補）
INSERT INTO npc_message (npc_id, trigger_type, message) VALUES
    (1, 'study_end', 'お疲れさまでした。今夜も、いい一頁でしたね。'),
    (1, 'study_end', '今夜の分は、確かにあなたの物語へ綴じられました。'),
    (1, 'study_end', '一行ずつ。それが、いちばん遠くまで読み進める方法です。'),
    (1, 'study_end', '学んだことは、眠っている間に、静かに行間へ染みていきますよ。'),
    (1, 'study_end', '今日はここまで栞をはさみましょう。続きは、また明日の頁で。'),
    (1, 'study_end', 'あなたの灯りで、今夜の書棚は少し暖かかった。'),
    (1, 'study_end', '温かいお茶でもいれて、あとはゆっくりなさい。'),
    (1, 'study_end', '焦らずとも大丈夫。積み重ねた頁は、決して消えません。'),
    (1, 'study_end', '今日の一章に、静かに拍手を。');

-- study_end（感情ごとの出し分け）
INSERT INTO npc_message (npc_id, trigger_type, emotion_id, message) VALUES
    (1, 'study_end', (SELECT id FROM emotion WHERE code = 'achievement'), 'やり切りましたね。読み終えた本のような、その満ち足りた重みを、しばらく味わって。'),
    (1, 'study_end', (SELECT id FROM emotion WHERE code = 'focused'), '深く一冊に潜れた夜でしたね。そういう読書は、そう何度もありません。'),
    (1, 'study_end', (SELECT id FROM emotion WHERE code = 'persevered'), 'よく踏ん張って頁をめくりましたね。頑張れた夜は、自分でそっと栞をはさんでおくものです。'),
    (1, 'study_end', (SELECT id FROM emotion WHERE code = 'enjoyed'), '楽しめたのなら何より。面白い本のように、それがいちばん長く続きます。'),
    (1, 'study_end', (SELECT id FROM emotion WHERE code = 'calm'), '穏やかに頁をめくれた夜は、それだけで上等な一冊です。'),
    (1, 'study_end', (SELECT id FROM emotion WHERE code = 'as_usual'), 'いつも通り。同じ物語を毎晩読み継げること、それがいちばん難しいのですよ。'),
    (1, 'study_end', (SELECT id FROM emotion WHERE code = 'sleepy'), '眠い中、よく書棚まで来ましたね。今夜はもう、本を閉じてお休みなさい。'),
    (1, 'study_end', (SELECT id FROM emotion WHERE code = 'tired'), 'お疲れさまでした。今夜はもう、栞をはさんで、何もしなくていい夜です。'),
    (1, 'study_end', (SELECT id FROM emotion WHERE code = 'down'), 'そういう頁もあります。この物語は、明日も同じ場所で続きを待っていますよ。'),
    (1, 'study_end', (SELECT id FROM emotion WHERE code = 'anxious'), '不安を抱えたまま頁をひらけたなら、それは静かな勇気です。'),
    (1, 'study_end', (SELECT id FROM emotion WHERE code = 'stuck'), '進まない夜は、白紙の頁と同じ。そこにこそ、次の一行が書かれるのです。');

-- goal_achieved（感情を問わない候補）
INSERT INTO npc_message (npc_id, trigger_type, message) VALUES
    (1, 'goal_achieved', '目標達成です。見事な一章を書き上げましたね。'),
    (1, 'goal_achieved', '今夜のあなたは、自分との約束という頁を、きちんと綴じました。'),
    (1, 'goal_achieved', '書棚の向こうで、街の住人たちもそっと頷いていますよ。'),
    (1, 'goal_achieved', '達成、おめでとうございます。本を閉じて休むのも、読書のうちです。'),
    (1, 'goal_achieved', '継続とは、静かな筆致のようなもの。あなたにはそれがある。'),
    (1, 'goal_achieved', 'こうして一頁ずつ、あなたという物語は厚みを増していくのです。');

-- goal_achieved（感情ごとの出し分け）
INSERT INTO npc_message (npc_id, trigger_type, emotion_id, message) VALUES
    (1, 'goal_achieved', (SELECT id FROM emotion WHERE code = 'achievement'), '目標に届き、手応えもある。今夜は、非の打ちどころのない一章でしたね。'),
    (1, 'goal_achieved', (SELECT id FROM emotion WHERE code = 'focused'), '集中したまま、最後の頁まで。理想的な読了です。'),
    (1, 'goal_achieved', (SELECT id FROM emotion WHERE code = 'persevered'), '踏ん張った分だけ、きちんと物語は結ばれましたね。'),
    (1, 'goal_achieved', (SELECT id FROM emotion WHERE code = 'enjoyed'), '楽しみながら、最後の頁へ。それがいちばん美しい読み方です。'),
    (1, 'goal_achieved', (SELECT id FROM emotion WHERE code = 'calm'), '力まず、静かに読み終えた。いちばん品のある達成です。'),
    (1, 'goal_achieved', (SELECT id FROM emotion WHERE code = 'as_usual'), 'いつも通り頁をめくっていたら、もう結末に届いていた。それが実力です。'),
    (1, 'goal_achieved', (SELECT id FROM emotion WHERE code = 'sleepy'), '眠いのに、最後まで読み切りましたか。今夜はもう、迷わずお休みを。'),
    (1, 'goal_achieved', (SELECT id FROM emotion WHERE code = 'tired'), '目標という頁に、届きました。疲れて当然です。今夜はここで本を閉じましょう。'),
    (1, 'goal_achieved', (SELECT id FROM emotion WHERE code = 'down'), '気持ちは晴れなくとも、頁は確かに最後まで進んだ。それは動かせない事実です。'),
    (1, 'goal_achieved', (SELECT id FROM emotion WHERE code = 'anxious'), '不安を抱えたまま、結末まで読み通しましたね。それは、立派なことです。'),
    (1, 'goal_achieved', (SELECT id FROM emotion WHERE code = 'stuck'), '手応えがなくとも、頁の厚みは確かに増しました。ちゃんと、届いていますよ。');

-- town_completed（感情を問わない候補）
INSERT INTO npc_message (npc_id, trigger_type, message) VALUES
    (1, 'town_completed', '街に、すべての灯りがともりました。長い一冊を、あなたは読み終えたのです。'),
    (1, 'town_completed', 'ここまで来ましたか。最後の頁まで、よく綴じられました。'),
    (1, 'town_completed', '完成、おめでとうございます。読み終えた本は、消えたりしませんよ。');

-- goodnight（感情を問わない候補）
INSERT INTO npc_message (npc_id, trigger_type, message) VALUES
    (1, 'goodnight', 'おやすみなさい。どうか、良い夢という物語を。'),
    (1, 'goodnight', '灯りを落として、今夜の本を閉じましょう。良い夜でした。'),
    (1, 'goodnight', 'また明晩、この書棚の前でお会いしましょう。'),
    (1, 'goodnight', '今日のあなたの一頁は、私が栞をはさんで覚えておきます。'),
    (1, 'goodnight', '物語は逃げません。どうぞ、ゆっくりお休みを。'),
    (1, 'goodnight', 'それでは、また。静かな眠りの頁を。');

-- =====================================================================
-- NPC 3: 天文台の管理人（starHill）
-- =====================================================================

-- study_start（感情を問わない候補）
INSERT INTO npc_message (npc_id, trigger_type, message) VALUES
    (3, 'study_start', '来たか。今夜も、よく晴れている。'),
    (3, 'study_start', '焦るな。星は、ゆっくり巡っている。'),
    (3, 'study_start', '望遠鏡は空へ向けておいた。好きなだけ、見ていくといい。'),
    (3, 'study_start', '今夜の一歩は、明日の空に残る光になる。'),
    (3, 'study_start', '灯りをひとつ。それだけで、この丘の夜は動きだす。'),
    (3, 'study_start', '見ている。あなたの軌道で、進めばいい。'),
    (3, 'study_start', '静かな夜だ。観測にも、学びにも向いている。'),
    (3, 'study_start', '座ったな。もう、始まっている。'),
    (3, 'study_start', '遠い星を、急いで追わなくていい。今夜の分の光でいい。');

-- study_end（感情を問わない候補）
INSERT INTO npc_message (npc_id, trigger_type, message) VALUES
    (3, 'study_end', 'おつかれ。今夜の分は、確かに空へ刻まれた。'),
    (3, 'study_end', '一歩でいい。その光が、いちばん遠くまで届く。'),
    (3, 'study_end', '学んだことは、眠る間に、星のように根を張る。'),
    (3, 'study_end', '今夜はここまで。続きは、また夜が巡らせる。'),
    (3, 'study_end', 'あなたの灯りで、今夜の空は少し近かった。'),
    (3, 'study_end', '積み重ねは、星の巡りのように裏切らない。'),
    (3, 'study_end', 'よくやった。あとは、休め。'),
    (3, 'study_end', '焦るな。空は、毎晩めぐってくる。'),
    (3, 'study_end', '今夜のことは、こちらで記録しておく。');

-- study_end（感情ごとの出し分け）
INSERT INTO npc_message (npc_id, trigger_type, emotion_id, message) VALUES
    (3, 'study_end', (SELECT id FROM emotion WHERE code = 'achievement'), 'やり切ったな。その光は、しばらく空に残る。'),
    (3, 'study_end', (SELECT id FROM emotion WHERE code = 'focused'), '深く潜れた夜だ。そういう空は、めったに晴れない。'),
    (3, 'study_end', (SELECT id FROM emotion WHERE code = 'persevered'), 'よく踏ん張った。その光は、自分で覚えておけ。'),
    (3, 'study_end', (SELECT id FROM emotion WHERE code = 'enjoyed'), '楽しめたか。ならば、いちばん長く輝く。'),
    (3, 'study_end', (SELECT id FROM emotion WHERE code = 'calm'), '穏やかな夜だ。それだけで、もう満天だ。'),
    (3, 'study_end', (SELECT id FROM emotion WHERE code = 'as_usual'), 'いつも通り。毎晩めぐらせること、それがいちばん難しい。'),
    (3, 'study_end', (SELECT id FROM emotion WHERE code = 'sleepy'), '眠いな。今夜はもう、星に任せて休め。'),
    (3, 'study_end', (SELECT id FROM emotion WHERE code = 'tired'), 'おつかれ。今夜はもう、何もしなくていい。'),
    (3, 'study_end', (SELECT id FROM emotion WHERE code = 'down'), 'そういう夜もある。空は、明日も同じ場所にある。'),
    (3, 'study_end', (SELECT id FROM emotion WHERE code = 'anxious'), '不安なまま、丘まで登ってきた。それは、強い光だ。'),
    (3, 'study_end', (SELECT id FROM emotion WHERE code = 'stuck'), '進まぬ夜も、巡る軌道のうちだ。焦るな。');

-- goal_achieved（感情を問わない候補）
INSERT INTO npc_message (npc_id, trigger_type, message) VALUES
    (3, 'goal_achieved', '目標へ、届いたな。見事だ。'),
    (3, 'goal_achieved', '自分との約束を果たした夜。空に、ひとつ星が増えた。'),
    (3, 'goal_achieved', '静かな達成だ。いちばん美しい光の形をしている。'),
    (3, 'goal_achieved', '届いた。だが、休むのも夜の仕事だ。'),
    (3, 'goal_achieved', '続けること。それは、静かに巡る才能だ。'),
    (3, 'goal_achieved', 'この一夜が、あなたの空をひとつ広げた。');

-- goal_achieved（感情ごとの出し分け）
INSERT INTO npc_message (npc_id, trigger_type, emotion_id, message) VALUES
    (3, 'goal_achieved', (SELECT id FROM emotion WHERE code = 'achievement'), '目標に届き、手応えもある。今夜は、満天だ。'),
    (3, 'goal_achieved', (SELECT id FROM emotion WHERE code = 'focused'), '集中したまま、目標へ。理想的な観測だった。'),
    (3, 'goal_achieved', (SELECT id FROM emotion WHERE code = 'persevered'), '踏ん張ったぶん、光はきちんと届いた。'),
    (3, 'goal_achieved', (SELECT id FROM emotion WHERE code = 'enjoyed'), '楽しみながら、目標へ。いちばん強い軌道だ。'),
    (3, 'goal_achieved', (SELECT id FROM emotion WHERE code = 'calm'), '力まず、目標へ。美しい達成だ。'),
    (3, 'goal_achieved', (SELECT id FROM emotion WHERE code = 'as_usual'), 'いつも通りにしていたら、もう届いていた。それが実力だ。'),
    (3, 'goal_achieved', (SELECT id FROM emotion WHERE code = 'sleepy'), '眠いのに、ここまで来たか。あとは、迷わず休め。'),
    (3, 'goal_achieved', (SELECT id FROM emotion WHERE code = 'tired'), '届いた。疲れて当然だ。今夜はここまで。'),
    (3, 'goal_achieved', (SELECT id FROM emotion WHERE code = 'down'), '気は晴れずとも、光は最後まで進んだ。それは事実だ。'),
    (3, 'goal_achieved', (SELECT id FROM emotion WHERE code = 'anxious'), '不安を抱えたまま、目標へ。立派な光だ。'),
    (3, 'goal_achieved', (SELECT id FROM emotion WHERE code = 'stuck'), '手応えはなくとも、光は積もった。ちゃんと、届いている。');

-- town_completed（感情を問わない候補）
INSERT INTO npc_message (npc_id, trigger_type, message) VALUES
    (3, 'town_completed', '空が、満ちた。ここまで通った夜が、そのまま光になっている。'),
    (3, 'town_completed', '見上げてみろ。あなたが積み上げた夜だ。'),
    (3, 'town_completed', '完成だ。だが、星は明日も巡る。また見に来ればいい。');

-- goodnight（感情を問わない候補）
INSERT INTO npc_message (npc_id, trigger_type, message) VALUES
    (3, 'goodnight', 'おやすみ。良い夢を。'),
    (3, 'goodnight', '灯りを落とす。今夜も、良い夜だった。'),
    (3, 'goodnight', 'また見に来るといい。空は、ここにある。'),
    (3, 'goodnight', '今日のあなたを、星が覚えている。'),
    (3, 'goodnight', '夜は逃げない。ゆっくり、休め。'),
    (3, 'goodnight', 'それでは、また。静かな眠りを。');

-- =====================================================================
-- NPC 4: 茶屋の女将（castleTown）
-- =====================================================================

-- study_start（感情を問わない候補）
INSERT INTO npc_message (npc_id, trigger_type, message) VALUES
    (4, 'study_start', 'あら、いらっしゃい。お茶を置いておきますね。'),
    (4, 'study_start', '今夜もようこそ。急がなくていいですよ、通りはまだ長いですから。'),
    (4, 'study_start', 'のれんは出しておきます。休みたくなったら、いつでもどうぞ。'),
    (4, 'study_start', '一服してから、ゆっくり始めましょうか。'),
    (4, 'study_start', '提灯に灯を入れました。手元、見えますか。'),
    (4, 'study_start', '気張らずに。今夜のぶんだけで、十分ですよ。'),
    (4, 'study_start', '桜がよく咲いています。ときどき顔を上げてくださいね。'),
    (4, 'study_start', 'おかえりなさい。席はいつでも空けてありますよ。'),
    (4, 'study_start', 'さ、始めましょうか。私はここにおりますので。');

-- study_end（感情を問わない候補）
INSERT INTO npc_message (npc_id, trigger_type, message) VALUES
    (4, 'study_end', 'お疲れさま。よくやりましたね。'),
    (4, 'study_end', '一服してから帰りましょう。今夜はもう十分ですよ。'),
    (4, 'study_end', '通りの灯りが、ひとつ増えたようですね。'),
    (4, 'study_end', '今夜のぶんは、ちゃんと残りますよ。'),
    (4, 'study_end', '少しずつでいいんですよ。それがいちばん長続きします。'),
    (4, 'study_end', '温かいものでも飲んで、ゆっくりお休みなさいな。'),
    (4, 'study_end', 'よく続けていらっしゃる。それが何より難しいことです。'),
    (4, 'study_end', '無理はなさらないで。この通りは逃げませんから。'),
    (4, 'study_end', 'お茶が入りました。今夜はこのへんで。');

-- study_end（感情ごとの出し分け）
INSERT INTO npc_message (npc_id, trigger_type, emotion_id, message) VALUES
    (4, 'study_end', (SELECT id FROM emotion WHERE code = 'achievement'), 'やり切りましたね。その心持ちのまま、ゆっくり一服なさいな。'),
    (4, 'study_end', (SELECT id FROM emotion WHERE code = 'focused'), 'よく身が入っていましたね。そういう夜は、そう何度もありません。'),
    (4, 'study_end', (SELECT id FROM emotion WHERE code = 'persevered'), 'よく踏ん張りました。頑張れた夜は、自分で褒めておくものですよ。'),
    (4, 'study_end', (SELECT id FROM emotion WHERE code = 'enjoyed'), '楽しめたのなら何より。おいしいものと同じで、それがいちばん長続きします。'),
    (4, 'study_end', (SELECT id FROM emotion WHERE code = 'calm'), '穏やかに過ごせた夜は、それだけで上等ですよ。'),
    (4, 'study_end', (SELECT id FROM emotion WHERE code = 'as_usual'), 'いつも通り。同じ味を毎日出すのが、いちばん難しいんですよ。'),
    (4, 'study_end', (SELECT id FROM emotion WHERE code = 'sleepy'), '眠い中、よくいらっしゃいました。今夜はもう、あたたかくして休んで。'),
    (4, 'study_end', (SELECT id FROM emotion WHERE code = 'tired'), 'お疲れさま。今夜はもう、何もしなくていい夜ですよ。'),
    (4, 'study_end', (SELECT id FROM emotion WHERE code = 'down'), 'そういう夜もあります。のれんは明日も出しておきますからね。'),
    (4, 'study_end', (SELECT id FROM emotion WHERE code = 'anxious'), '不安を抱えたまま、よく通りまで出てきましたね。それは強いことですよ。'),
    (4, 'study_end', (SELECT id FROM emotion WHERE code = 'stuck'), '進まない夜もありますよ。お湯が沸くのを待つようなものです。');

-- goal_achieved（感情を問わない候補）
INSERT INTO npc_message (npc_id, trigger_type, message) VALUES
    (4, 'goal_achieved', '目標達成ですね。おめでとうございます。'),
    (4, 'goal_achieved', '自分との約束、ちゃんと守られましたね。立派です。'),
    (4, 'goal_achieved', '今夜は特別に、いいお茶をお出ししましょうか。'),
    (4, 'goal_achieved', '届きましたね。あとは湯呑みを置いて、休むお仕事が残っています。'),
    (4, 'goal_achieved', '続けてこられたのは、あなたの力ですよ。'),
    (4, 'goal_achieved', 'こうして一夜ずつ、この通りの灯りは増えていくんですね。');

-- goal_achieved（感情ごとの出し分け）
INSERT INTO npc_message (npc_id, trigger_type, emotion_id, message) VALUES
    (4, 'goal_achieved', (SELECT id FROM emotion WHERE code = 'achievement'), '目標に届いて、手応えもある。今夜は言うことなしですね。'),
    (4, 'goal_achieved', (SELECT id FROM emotion WHERE code = 'focused'), '身が入ったまま、目標まで。気持ちのいい夜でしたね。'),
    (4, 'goal_achieved', (SELECT id FROM emotion WHERE code = 'persevered'), '踏ん張ったぶん、ちゃんと届きましたね。'),
    (4, 'goal_achieved', (SELECT id FROM emotion WHERE code = 'enjoyed'), '楽しみながら、目標まで。いちばん美しい進み方ですよ。'),
    (4, 'goal_achieved', (SELECT id FROM emotion WHERE code = 'calm'), '力まずに、するりと目標へ。上等な夜です。'),
    (4, 'goal_achieved', (SELECT id FROM emotion WHERE code = 'as_usual'), 'いつも通りにしていたら届いていた。それが腕というものですよ。'),
    (4, 'goal_achieved', (SELECT id FROM emotion WHERE code = 'sleepy'), '眠いのに、ここまで。よく頑張りましたね。あとはお休みなさい。'),
    (4, 'goal_achieved', (SELECT id FROM emotion WHERE code = 'tired'), '目標達成です。疲れて当たり前ですよ。今夜はここまでに。'),
    (4, 'goal_achieved', (SELECT id FROM emotion WHERE code = 'down'), '気持ちは晴れなくても、やることはやりました。それは確かなことです。'),
    (4, 'goal_achieved', (SELECT id FROM emotion WHERE code = 'anxious'), '不安なまま、目標まで来られましたね。立派ですよ。'),
    (4, 'goal_achieved', (SELECT id FROM emotion WHERE code = 'stuck'), '手応えがなくても、時間はちゃんと積もっています。届いていますよ。');

-- town_completed（感情を問わない候補）
INSERT INTO npc_message (npc_id, trigger_type, message) VALUES
    (4, 'town_completed', '通りじゅうに灯りがともりましたね。あなたが一夜ずつ、ともしたものですよ。'),
    (4, 'town_completed', '桜も満開です。ここまでよく通ってくださいました。'),
    (4, 'town_completed', '完成ですね。のれんは、これからも出しておきますから。');

-- goodnight（感情を問わない候補）
INSERT INTO npc_message (npc_id, trigger_type, message) VALUES
    (4, 'goodnight', 'おやすみなさい。良い夢を。'),
    (4, 'goodnight', '灯りを落として、のれんをしまいますね。'),
    (4, 'goodnight', 'また明日の夜、この通りでお待ちしています。'),
    (4, 'goodnight', '今日のあなたのことは、覚えておきますよ。'),
    (4, 'goodnight', '夜は逃げません。あたたかくして、お休みなさい。'),
    (4, 'goodnight', 'それでは、また。おやすみなさいませ。');

-- =====================================================================
-- NPC 5: ストーブ番の若者（snowTown）
-- =====================================================================

-- study_start（感情を問わない候補）
INSERT INTO npc_message (npc_id, trigger_type, message) VALUES
    (5, 'study_start', 'お、来た。ストーブはもう温まってるよ。'),
    (5, 'study_start', '焦らなくていいよ。外は寒いけど、こっちは平気だから。'),
    (5, 'study_start', '薪はくべておいた。好きなだけいていいよ。'),
    (5, 'study_start', '今夜のぶんだけでいい。それで十分だって。'),
    (5, 'study_start', '窓、冷えてない。近すぎたら言ってね。'),
    (5, 'study_start', '始めよっか。おれはここで火を見てるから。'),
    (5, 'study_start', '雪、降ってきたね。今夜は静かだ。'),
    (5, 'study_start', 'おかえり。席、あっためといたよ。'),
    (5, 'study_start', '座ったなら、もう始まってる。気楽にね。');

-- study_end（感情を問わない候補）
INSERT INTO npc_message (npc_id, trigger_type, message) VALUES
    (5, 'study_end', 'おつかれ。よくやったね。'),
    (5, 'study_end', '今夜のぶんは、ちゃんと残るよ。'),
    (5, 'study_end', '少しずつでいいんだよ。火と同じで、絶やさないのが大事。'),
    (5, 'study_end', 'あったかいもの飲んで、あとはゆっくりして。'),
    (5, 'study_end', '今日はここまで。続きはまた明日の夜に。'),
    (5, 'study_end', 'きみがいると、この部屋も少しあったかい。'),
    (5, 'study_end', '無理してない。しなくていいからね。'),
    (5, 'study_end', 'よく続けてるよね。それがいちばんすごいと思う。'),
    (5, 'study_end', '手、冷たくない。ストーブのそば、来なよ。');

-- study_end（感情ごとの出し分け）
INSERT INTO npc_message (npc_id, trigger_type, emotion_id, message) VALUES
    (5, 'study_end', (SELECT id FROM emotion WHERE code = 'achievement'), 'やり切ったね。その感じ、しばらく持っていていいよ。'),
    (5, 'study_end', (SELECT id FROM emotion WHERE code = 'focused'), '今夜はすごく集中してた。火が静かに燃えてるみたいだった。'),
    (5, 'study_end', (SELECT id FROM emotion WHERE code = 'persevered'), 'よく踏ん張ったね。頑張れた夜は、自分で褒めていいんだよ。'),
    (5, 'study_end', (SELECT id FROM emotion WHERE code = 'enjoyed'), '楽しかったならよかった。それがいちばん長く続くよ。'),
    (5, 'study_end', (SELECT id FROM emotion WHERE code = 'calm'), '穏やかに過ごせた夜は、それだけで満点だよ。'),
    (5, 'study_end', (SELECT id FROM emotion WHERE code = 'as_usual'), 'いつも通り、か。それを毎日やれるのが、いちばんすごいんだよ。'),
    (5, 'study_end', (SELECT id FROM emotion WHERE code = 'sleepy'), '眠いね。今夜はもう、あったかくして寝なよ。'),
    (5, 'study_end', (SELECT id FROM emotion WHERE code = 'tired'), 'おつかれ。今夜はもう、何もしなくていいよ。'),
    (5, 'study_end', (SELECT id FROM emotion WHERE code = 'down'), 'そういう夜もあるよ。ここは明日もあっためておくから。'),
    (5, 'study_end', (SELECT id FROM emotion WHERE code = 'anxious'), '不安なまま、それでも座ったんだ。それって、けっこう強いよ。'),
    (5, 'study_end', (SELECT id FROM emotion WHERE code = 'stuck'), '進まない夜もあるって。薪が湿ってるときみたいなもんだよ。');

-- goal_achieved（感情を問わない候補）
INSERT INTO npc_message (npc_id, trigger_type, message) VALUES
    (5, 'goal_achieved', '目標達成だ。おめでとう。'),
    (5, 'goal_achieved', '自分で決めたこと、ちゃんとやったね。すごいよ。'),
    (5, 'goal_achieved', '今夜は薪をもう一本くべよう。お祝いってことで。'),
    (5, 'goal_achieved', '届いたね。あとは、休むのも仕事だよ。'),
    (5, 'goal_achieved', 'ここまで続けてこられたのは、きみの力だよ。'),
    (5, 'goal_achieved', 'こうやって一晩ずつ、窓の外も明るくなってくんだね。');

-- goal_achieved（感情ごとの出し分け）
INSERT INTO npc_message (npc_id, trigger_type, emotion_id, message) VALUES
    (5, 'goal_achieved', (SELECT id FROM emotion WHERE code = 'achievement'), '目標まで届いて、手応えもある。今夜は言うことなしだね。'),
    (5, 'goal_achieved', (SELECT id FROM emotion WHERE code = 'focused'), '集中したまま目標まで。気持ちよかっただろうね。'),
    (5, 'goal_achieved', (SELECT id FROM emotion WHERE code = 'persevered'), '踏ん張ったぶん、ちゃんと届いたね。'),
    (5, 'goal_achieved', (SELECT id FROM emotion WHERE code = 'enjoyed'), '楽しみながら目標まで。それがいちばん強いよ。'),
    (5, 'goal_achieved', (SELECT id FROM emotion WHERE code = 'calm'), '力まずに目標まで来たね。いいと思う、そういうの。'),
    (5, 'goal_achieved', (SELECT id FROM emotion WHERE code = 'as_usual'), 'いつも通りにしてたら届いてた。それが、きみの力だよ。'),
    (5, 'goal_achieved', (SELECT id FROM emotion WHERE code = 'sleepy'), '眠いのに、ここまで来たんだ。えらいよ。あとは寝て。'),
    (5, 'goal_achieved', (SELECT id FROM emotion WHERE code = 'tired'), '目標達成。疲れて当たり前だよ。今夜はここまでね。'),
    (5, 'goal_achieved', (SELECT id FROM emotion WHERE code = 'down'), '気持ちは晴れなくても、やったことは残る。それは本当だよ。'),
    (5, 'goal_achieved', (SELECT id FROM emotion WHERE code = 'anxious'), '不安なまま、目標まで来たんだ。うん、立派だよ。'),
    (5, 'goal_achieved', (SELECT id FROM emotion WHERE code = 'stuck'), '手応えなくても、時間はちゃんと積もってる。届いてるよ。');

-- town_completed（感情を問わない候補）
INSERT INTO npc_message (npc_id, trigger_type, message) VALUES
    (5, 'town_completed', '見て、窓の外。あんなに明るくなった。全部きみが灯したんだよ。'),
    (5, 'town_completed', '空にオーロラが出てる。ここまで来た夜へのごほうびだって。'),
    (5, 'town_completed', '完成だね。でも火は消さないよ。また来ればいいから。');

-- goodnight（感情を問わない候補）
INSERT INTO npc_message (npc_id, trigger_type, message) VALUES
    (5, 'goodnight', 'おやすみ。いい夢を。'),
    (5, 'goodnight', '灯り落とすね。今夜も、いい夜だった。'),
    (5, 'goodnight', 'また明日の夜、ここであっためて待ってるよ。'),
    (5, 'goodnight', '今日のきみのこと、おれは覚えてる。'),
    (5, 'goodnight', '夜は逃げないよ。あったかくして寝て。'),
    (5, 'goodnight', 'それじゃ、また。おやすみ。');

-- =====================================================================
-- NPC 6: 夜更かし仲間（nightTown）
-- =====================================================================
-- 文面は未整備。整うまでは既定の住人（npc(1)）が代わりに話す

-- =====================================================================
-- NPC 7: 焚火番の子（starHill）
-- =====================================================================
-- 文面は未整備。整うまでは既定の住人（npc(1)）が代わりに話す

-- =====================================================================
-- NPC 8: 桜守の老人（castleTown）
-- =====================================================================
-- 文面は未整備。整うまでは既定の住人（npc(1)）が代わりに話す

-- =====================================================================
-- NPC 9: 宿の番頭（snowTown）
-- =====================================================================
-- 文面は未整備。整うまでは既定の住人（npc(1)）が代わりに話す
