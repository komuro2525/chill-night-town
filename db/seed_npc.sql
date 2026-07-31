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
--   1: 書店の店主（nightTown）… 52本
--   3: 天文台の管理人（starHill）… 52本
--   4: 茶屋の女将（castleTown）… 0本
--   5: ストーブ番の若者（snowTown）… 0本
-- =====================================================================

-- 既存のメッセージを一旦すべて消してから入れ直す（冪等・文面の刷新用）
DELETE FROM npc_message;

-- 住人のマスタ行。1人目は本体シードで作成済みのため OR IGNORE で足りる
INSERT OR IGNORE INTO npc (id, name) VALUES
    (1, '書店の店主'),
    (3, '天文台の管理人'),
    (4, '茶屋の女将'),
    (5, 'ストーブ番の若者');

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

-- セリフ集に載っていない住人は退去させる（住人の入れ替えもこのファイルで完結する）。
-- active_session.npc_id は ON DELETE RESTRICT のため、先に参照を外す。
-- NULL になったセッションは既定の住人（npc(1)）が代わりに話す。
UPDATE active_session SET npc_id = NULL WHERE npc_id NOT IN (1, 3, 4, 5);
DELETE FROM npc WHERE id NOT IN (1, 3, 4, 5);

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
-- 文面は未整備。整うまでは既定の住人（npc(1)）が代わりに話す

-- =====================================================================
-- NPC 5: ストーブ番の若者（snowTown）
-- =====================================================================
-- 文面は未整備。整うまでは既定の住人（npc(1)）が代わりに話す
