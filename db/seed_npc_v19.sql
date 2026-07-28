-- =====================================================================
-- 全NPC（1・2・3人目）の名前・紹介文・メッセージ（マイグレーション v19 / v20・要件7.1）
--
-- このファイルは「新規初期化（initializeFreshDatabase）」と「既存DBのデルタ（v19/v20）」の
-- 両方から exec される、NPCメッセージの単一の出所。声色を1ファイルで見比べ・調整でき、
-- 既存DBにも同じ文面を届けられる。冒頭で npc_message を全消しするため、**何度流しても
-- 同じ結果になる（冪等）**。
--   ・前提: emotion マスタと npc(1) のマスタ行が既に存在すること（本体シードで用意）
--   ・BEGIN/COMMIT は書かない（呼び出し側のトランザクション内で流す）
--
-- 3人とも「責めない・急かさない・声を張らない」基調は共通。**違うのは声色（キャラ）だけ**。
--   1: 書店の店主   … です/ます・知的で静か。本／頁／物語の比喩
--   2: 喫茶店のマスター … くだけて温かい・労い上手。珈琲／一杯／カウンターの比喩
--   3: 天文台の管理人 … 寡黙で詩的・常体で短い。星／夜空／軌道の比喩
-- =====================================================================

-- 既存のNPCメッセージを一旦すべて消してから入れ直す（冪等・文面の刷新用）
DELETE FROM npc_message;

-- 2・3人目のマスタ（1人目は本体シードで作成済み）。再実行に備え OR IGNORE
INSERT OR IGNORE INTO npc (id, name) VALUES
    (2, '喫茶店のマスター'),
    (3, '天文台の管理人');

-- 名前・紹介文を確定（既存DBの旧名「夜の街の住人（仮）」も上書き）。紹介文は改行入りで読みやすく
UPDATE npc SET name = '書店の店主', description =
'深夜まで灯りの絶えない、古書店の店主。
物静かで思索的だが、押しつけがましさはない。
本の背表紙を撫でるように言葉を選び、あなたの夜にそっと一冊を差し出す。
急かさず、責めず、ただ隣で頁をめくっているような住人。'
WHERE id = 1;

UPDATE npc SET name = '喫茶店のマスター', description =
'路地裏で夜通し灯る、喫茶店のマスター。
あたたかく、少しくだけた口ぶりで、来た人をまず労う。
おいしい珈琲を淹れるように、あなたの緊張をそっとほどく。
頑張りを見つけるのが得意で、決して無理はさせない住人。'
WHERE id = 2;

UPDATE npc SET name = '天文台の管理人', description =
'丘の上の古い天文台を守る、管理人。
言葉は少なく、詩のように短い。
星や夜空になぞらえて、そっと一言を置いていく。
多くは語らないが、あなたの夜をいつも遠くから見守る住人。'
WHERE id = 3;

-- =====================================================================
-- NPC 1: 書店の店主（です/ます・本／頁／物語の比喩）
-- =====================================================================

-- 学習開始（study_start）
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

-- 学習終了（study_end・感情なし）
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

-- 目標達成（goal_achieved・感情なし）
INSERT INTO npc_message (npc_id, trigger_type, message) VALUES
    (1, 'goal_achieved', '目標達成です。見事な一章を書き上げましたね。'),
    (1, 'goal_achieved', '今夜のあなたは、自分との約束という頁を、きちんと綴じました。'),
    (1, 'goal_achieved', '書棚の向こうで、街の住人たちもそっと頷いていますよ。'),
    (1, 'goal_achieved', '達成、おめでとうございます。本を閉じて休むのも、読書のうちです。'),
    (1, 'goal_achieved', '継続とは、静かな筆致のようなもの。あなたにはそれがある。'),
    (1, 'goal_achieved', 'こうして一頁ずつ、あなたという物語は厚みを増していくのです。');

-- 学習終了・感情ごと（study_end × emotion）
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

-- 目標達成・感情ごと（goal_achieved × emotion）
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

-- おやすみ（goodnight）
INSERT INTO npc_message (npc_id, trigger_type, message) VALUES
    (1, 'goodnight', 'おやすみなさい。どうか、良い夢という物語を。'),
    (1, 'goodnight', '灯りを落として、今夜の本を閉じましょう。良い夜でした。'),
    (1, 'goodnight', 'また明晩、この書棚の前でお会いしましょう。'),
    (1, 'goodnight', '今日のあなたの一頁は、私が栞をはさんで覚えておきます。'),
    (1, 'goodnight', '物語は逃げません。どうぞ、ゆっくりお休みを。'),
    (1, 'goodnight', 'それでは、また。静かな眠りの頁を。');

-- =====================================================================
-- NPC 2: 喫茶店のマスター（くだけて温かい・珈琲／一杯／カウンターの比喩）
-- =====================================================================

-- 学習開始（study_start）
INSERT INTO npc_message (npc_id, trigger_type, message) VALUES
    (2, 'study_start', 'おかえり。今夜も一杯淹れて待ってたよ。ゆっくりやろう。'),
    (2, 'study_start', 'まずは一息。珈琲が冷めないくらいの気楽さで、始めようか。'),
    (2, 'study_start', '焦らなくていいよ。豆を挽くみたいに、ゆっくりでいい。'),
    (2, 'study_start', 'カウンターはいつでも空けてある。さあ、始めようか。'),
    (2, 'study_start', '今日はよく顔を出したね。それだけでもう、いい夜の始まりだ。'),
    (2, 'study_start', '肩の力を抜いて。ここは、あなたのためのカウンター席だよ。'),
    (2, 'study_start', '湯気の向こうから見てるよ。あなたのペースでどうぞ。'),
    (2, 'study_start', '一杯淹れるくらいの気持ちで、気楽にね。'),
    (2, 'study_start', '準備はいらないよ。席についたなら、もう始まってる。');

-- 学習終了（study_end・感情なし）
INSERT INTO npc_message (npc_id, trigger_type, message) VALUES
    (2, 'study_end', 'おつかれさま。よく頑張ったね。一杯どう？'),
    (2, 'study_end', '今夜のぶんは、ちゃんとカウンターに残ってるよ。上出来だ。'),
    (2, 'study_end', 'ゆっくりでいい。おかわりするみたいに、少しずつがいちばん続く。'),
    (2, 'study_end', '温かいものでも飲んで、あとはゆっくりおやすみ。'),
    (2, 'study_end', '今日はここまで。続きはまた、明日の夜にでも淹れよう。'),
    (2, 'study_end', 'あなたが来てくれると、この店の夜も少し暖かくなる。'),
    (2, 'study_end', 'よくやったね。自分を、ちゃんと労ってあげて。'),
    (2, 'study_end', '頑張りすぎてないかい。無理は、しなくていいんだよ。'),
    (2, 'study_end', '今日のぶんは今日のぶん。それで十分、花丸だ。');

-- 目標達成（goal_achieved・感情なし）
INSERT INTO npc_message (npc_id, trigger_type, message) VALUES
    (2, 'goal_achieved', '目標達成、おめでとう。とっておきの一杯を淹れたいところだね。'),
    (2, 'goal_achieved', '自分との約束、ちゃんと守ったね。立派だよ。'),
    (2, 'goal_achieved', '今夜のあなたに、こっそり乾杯といこうか。'),
    (2, 'goal_achieved', '達成できたね。でも、カップを置いて休むのも大事な仕事だよ。'),
    (2, 'goal_achieved', '続けてこられたのは、あなたの力だ。胸を張っていい。'),
    (2, 'goal_achieved', 'こうやって一杯ずつ、街も、あなたも育っていくんだ。');

-- 学習終了・感情ごと（study_end × emotion）
INSERT INTO npc_message (npc_id, trigger_type, emotion_id, message) VALUES
    (2, 'study_end', (SELECT id FROM emotion WHERE code = 'achievement'), 'やり切ったね。淹れたての一杯みたいなその手応え、しばらく味わって。'),
    (2, 'study_end', (SELECT id FROM emotion WHERE code = 'focused'), '今夜はよく集中してたね。豆の香りに包まれるみたいな、いい時間だった。'),
    (2, 'study_end', (SELECT id FROM emotion WHERE code = 'persevered'), 'よく踏ん張った。頑張れた夜は、自分でちゃんと褒めてやっていい。'),
    (2, 'study_end', (SELECT id FROM emotion WHERE code = 'enjoyed'), '楽しめたなら何より。おいしい珈琲みたいに、それがいちばん長続きする。'),
    (2, 'study_end', (SELECT id FROM emotion WHERE code = 'calm'), '穏やかにいられた夜は、それだけで満点。上等な一杯だよ。'),
    (2, 'study_end', (SELECT id FROM emotion WHERE code = 'as_usual'), 'いつも通り、か。同じ味を毎日出せるのが、いちばん難しいんだよ。'),
    (2, 'study_end', (SELECT id FROM emotion WHERE code = 'sleepy'), '眠い中よく来たね。今夜はもう、温かくして休んで。'),
    (2, 'study_end', (SELECT id FROM emotion WHERE code = 'tired'), 'おつかれさま。今夜はもう、カップを置いて、何もしなくていい夜だよ。'),
    (2, 'study_end', (SELECT id FROM emotion WHERE code = 'down'), 'そういう夜もあるさ。ここは逃げないし、明日もちゃんと店を開けてる。'),
    (2, 'study_end', (SELECT id FROM emotion WHERE code = 'anxious'), '不安なまま、それでも席についたね。それはもう、立派な強さだよ。'),
    (2, 'study_end', (SELECT id FROM emotion WHERE code = 'stuck'), '進まない夜も、豆を寝かせる時間みたいなもの。焦らなくていい。');

-- 目標達成・感情ごと（goal_achieved × emotion）
INSERT INTO npc_message (npc_id, trigger_type, emotion_id, message) VALUES
    (2, 'goal_achieved', (SELECT id FROM emotion WHERE code = 'achievement'), '目標に届いて、手応えもある。今夜は言うことなし。最高の一杯だ。'),
    (2, 'goal_achieved', (SELECT id FROM emotion WHERE code = 'focused'), '集中したまま目標まで。香りまで気持ちのいい夜だったね。'),
    (2, 'goal_achieved', (SELECT id FROM emotion WHERE code = 'persevered'), '頑張ったぶん、ちゃんと届いた。よくやったね。'),
    (2, 'goal_achieved', (SELECT id FROM emotion WHERE code = 'enjoyed'), '楽しみながら目標まで。それがいちばん強い淹れ方だよ。'),
    (2, 'goal_achieved', (SELECT id FROM emotion WHERE code = 'calm'), '力まずに目標へ。いいね、そういうのがいちばん美味い。'),
    (2, 'goal_achieved', (SELECT id FROM emotion WHERE code = 'as_usual'), 'いつも通りにしてたら届いてた。それが、あなたの腕だよ。'),
    (2, 'goal_achieved', (SELECT id FROM emotion WHERE code = 'sleepy'), '眠いのに目標まで来たのか。えらいね。あとは迷わず休んで。'),
    (2, 'goal_achieved', (SELECT id FROM emotion WHERE code = 'tired'), '目標達成。疲れて当たり前だ。今夜はここでカップを置こう。'),
    (2, 'goal_achieved', (SELECT id FROM emotion WHERE code = 'down'), '気持ちは晴れなくても、やることはやった。それは確かな事実だよ。'),
    (2, 'goal_achieved', (SELECT id FROM emotion WHERE code = 'anxious'), '不安を抱えたまま、目標まで来たね。うん、立派だ。'),
    (2, 'goal_achieved', (SELECT id FROM emotion WHERE code = 'stuck'), '手応えがなくても、時間はちゃんとカウンターに積み上がってる。届いてるよ。');

-- おやすみ（goodnight）
INSERT INTO npc_message (npc_id, trigger_type, message) VALUES
    (2, 'goodnight', 'おやすみ。いい夢を見てね。'),
    (2, 'goodnight', '灯りを落として、店じまいだ。今夜も、いい夜だった。'),
    (2, 'goodnight', 'また明日の夜、ここで一杯淹れて待ってるよ。'),
    (2, 'goodnight', '今日のあなたの頑張りは、私が覚えておくからね。'),
    (2, 'goodnight', '夜は逃げないよ。どうか、あたたかくして休んで。'),
    (2, 'goodnight', 'それじゃ、また。おやすみ。');

-- =====================================================================
-- NPC 3: 天文台の管理人（常体で短く・星／夜空／軌道の比喩）
-- =====================================================================

-- 学習開始（study_start）
INSERT INTO npc_message (npc_id, trigger_type, message) VALUES
    (3, 'study_start', '来たか。今夜も、星がよく見える。'),
    (3, 'study_start', '焦るな。夜空は、ゆっくり巡っている。'),
    (3, 'study_start', '星を待つように、始めればいい。'),
    (3, 'study_start', '今夜の一歩。それは、明日の空に残る光だ。'),
    (3, 'study_start', '灯りをひとつ。小さな星のように、それで夜が動く。'),
    (3, 'study_start', '見ている。あなたの軌道で、進めばいい。'),
    (3, 'study_start', '静かな夜。観測にも、学びにも向いている。'),
    (3, 'study_start', '席についた。もう、始まっている。'),
    (3, 'study_start', '遠くの星を焦って追うな。今夜の分の光でいい。');

-- 学習終了（study_end・感情なし）
INSERT INTO npc_message (npc_id, trigger_type, message) VALUES
    (3, 'study_end', 'おつかれ。今夜の分は、確かに空に刻まれた。'),
    (3, 'study_end', '一歩。その光が、いちばん遠くまで届く。'),
    (3, 'study_end', '学びは、眠る間に、星のように根を張る。'),
    (3, 'study_end', '今夜はここまで。続きは、また夜がめぐらせる。'),
    (3, 'study_end', 'あなたの灯りで、今夜の空は少し近かった。'),
    (3, 'study_end', '積み重ねは、星の巡りのように裏切らない。'),
    (3, 'study_end', 'よくやった。あとは、休め。'),
    (3, 'study_end', '焦るな。星は、毎晩めぐってくる。'),
    (3, 'study_end', '今夜のことは、記録しておく。');

-- 目標達成（goal_achieved・感情なし）
INSERT INTO npc_message (npc_id, trigger_type, message) VALUES
    (3, 'goal_achieved', '目標へ、届いたな。見事だ。'),
    (3, 'goal_achieved', '自分との約束を果たした夜。ひとつ、星が増えた。'),
    (3, 'goal_achieved', '静かな達成。いちばん美しい光の形だ。'),
    (3, 'goal_achieved', '届いた。だが、休むのも夜の仕事だ。'),
    (3, 'goal_achieved', '続けること。それは、静かに巡る才能だ。'),
    (3, 'goal_achieved', 'この一夜が、あなたの空をひとつ広げた。');

-- 学習終了・感情ごと（study_end × emotion）
INSERT INTO npc_message (npc_id, trigger_type, emotion_id, message) VALUES
    (3, 'study_end', (SELECT id FROM emotion WHERE code = 'achievement'), 'やり切ったな。その光は、しばらく空に残る。'),
    (3, 'study_end', (SELECT id FROM emotion WHERE code = 'focused'), '深く潜れた夜。そういう夜空は、めったに晴れない。'),
    (3, 'study_end', (SELECT id FROM emotion WHERE code = 'persevered'), 'よく踏ん張った。その光は、自分で覚えておけ。'),
    (3, 'study_end', (SELECT id FROM emotion WHERE code = 'enjoyed'), '楽しめたか。ならば、いちばん長く輝く。'),
    (3, 'study_end', (SELECT id FROM emotion WHERE code = 'calm'), '穏やかな夜。それだけで、もう満天だ。'),
    (3, 'study_end', (SELECT id FROM emotion WHERE code = 'as_usual'), 'いつも通り。毎晩めぐらせること、それがいちばん難しい。'),
    (3, 'study_end', (SELECT id FROM emotion WHERE code = 'sleepy'), '眠いな。今夜はもう、星に任せて休め。'),
    (3, 'study_end', (SELECT id FROM emotion WHERE code = 'tired'), 'おつかれ。今夜はもう、何もしなくていい。'),
    (3, 'study_end', (SELECT id FROM emotion WHERE code = 'down'), 'そういう夜もある。空は、明日も同じ場所にある。'),
    (3, 'study_end', (SELECT id FROM emotion WHERE code = 'anxious'), '不安なまま、机に向かえた。それは、強い光だ。'),
    (3, 'study_end', (SELECT id FROM emotion WHERE code = 'stuck'), '進まぬ夜も、巡る軌道のうち。焦るな。');

-- 目標達成・感情ごと（goal_achieved × emotion）
INSERT INTO npc_message (npc_id, trigger_type, emotion_id, message) VALUES
    (3, 'goal_achieved', (SELECT id FROM emotion WHERE code = 'achievement'), '目標に届き、手応えもある。今夜は、満天だ。'),
    (3, 'goal_achieved', (SELECT id FROM emotion WHERE code = 'focused'), '集中したまま、目標へ。理想的な観測だった。'),
    (3, 'goal_achieved', (SELECT id FROM emotion WHERE code = 'persevered'), '踏ん張ったぶん、光はきちんと届いた。'),
    (3, 'goal_achieved', (SELECT id FROM emotion WHERE code = 'enjoyed'), '楽しみながら、目標へ。いちばん強い軌道だ。'),
    (3, 'goal_achieved', (SELECT id FROM emotion WHERE code = 'calm'), '力まず、目標へ。美しい達成だ。'),
    (3, 'goal_achieved', (SELECT id FROM emotion WHERE code = 'as_usual'), 'いつも通りで、届いていた。それが実力だ。'),
    (3, 'goal_achieved', (SELECT id FROM emotion WHERE code = 'sleepy'), '眠いのに、ここまで来たか。あとは、迷わず休め。'),
    (3, 'goal_achieved', (SELECT id FROM emotion WHERE code = 'tired'), '届いた。疲れて当然だ。今夜はここまで。'),
    (3, 'goal_achieved', (SELECT id FROM emotion WHERE code = 'down'), '気は晴れずとも、光は最後まで進んだ。それは事実だ。'),
    (3, 'goal_achieved', (SELECT id FROM emotion WHERE code = 'anxious'), '不安を抱えたまま、目標へ。立派な光だ。'),
    (3, 'goal_achieved', (SELECT id FROM emotion WHERE code = 'stuck'), '手応えはなくとも、光は積もった。ちゃんと、届いている。');

-- おやすみ（goodnight）
INSERT INTO npc_message (npc_id, trigger_type, message) VALUES
    (3, 'goodnight', 'おやすみ。良い夢を。'),
    (3, 'goodnight', '灯りを落とす。今夜も、良い夜だった。'),
    (3, 'goodnight', 'また明晩、この空の下で。'),
    (3, 'goodnight', '今日のあなたを、星が覚えている。'),
    (3, 'goodnight', '夜は逃げない。ゆっくり、休め。'),
    (3, 'goodnight', 'それでは、また。静かな眠りを。');
