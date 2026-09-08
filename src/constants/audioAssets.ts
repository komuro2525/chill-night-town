// 音源ファイルの静的登録（要件9）。
//
// React Native の require() は静的パスのみ解決可能なため、DBの file_path 文字列から
// 実ファイルを動的に読むことはできない。街の背景（townArt.ts）と同じ理由・同じ方式で、
// **コードをキーに静的に対応づける**。DBの file_path は記録・確認用と位置づける。
//
// 分類の持たせ方（Phase 7 で決めた方針）:
//   ・BGM / 環境音 … ambient_sound マスタの code をキーに引く。曲名・クレジットの表示や
//     将来の個別選択（user_sound_preference）はマスタ側が担うため、マスタに載せる
//   ・効果音 / 鐘   … マスタに載せず、ここで用途名をキーに持つ。単一固定ファイルで
//     曲名表示もシャッフルも個別選択もなく、マスタの利点が効かないため
//     （sound_type の CHECK は 'bgm' / 'ambient' のまま拡張しない）
//
// 未登録のコードは undefined を返し、呼び出し側は「その音は鳴らさない」で通す。
// 素材が揃っていない天気の環境音などは、ここへ足すだけで有効になる。

import type { AudioSource } from "expo-audio";

/**
 * BGM。キーは ambient_sound.code（sound_type = 'bgm'）。
 *
 * 素材は配布元の区分に合わせて assets/audio/bgm/ループあり|ループなし/<アーティスト>/ に置く。
 * この区分は素材整理のためのもので、アプリの再生挙動は変えない（どちらも同じプールに入り、
 * 曲が終われば次へ進む。繰り返したいときはユーザーが1曲リピートを使う）。
 */
const BGM: Record<string, AudioSource> = {
  bgm_223am: require("@/assets/audio/bgm/2_23_AM.mp3"),
  bgm_khaim_01: require("@/assets/audio/bgm/ループあり/Khaim/ootd.mp3"),
  bgm_khaim_02: require("@/assets/audio/bgm/ループあり/Khaim/sometimes.mp3"),
  bgm_mfp_01: require("@/assets/audio/bgm/ループあり/MFP/Paper_Cup_Coffee_3.mp3"),
  bgm_sakuttipanda_01: require("@/assets/audio/bgm/ループあり/Sakuttipanda/すやすやタイム.mp3"),
  bgm_modus_01: require("@/assets/audio/bgm/ループあり/modus/Melty Night_.mp3"),
  bgm_shimtone_01: require("@/assets/audio/bgm/ループあり/shimtone/瑠璃の鳴る夜に.mp3"),
  bgm_shimtone_02: require("@/assets/audio/bgm/ループあり/shimtone/白くほのかに.mp3"),
  bgm_shimtone_03: require("@/assets/audio/bgm/ループあり/shimtone/花降る宵空.mp3"),
  bgm_shimtone_04: require("@/assets/audio/bgm/ループあり/shimtone/雨の庭.mp3"),
  bgm_shimtone_05: require("@/assets/audio/bgm/ループあり/shimtone/雨の路地裏.mp3"),
  bgm_yuheikomatsu_01: require("@/assets/audio/bgm/ループあり/yuhei komatsu/City_Lights.mp3"),
  bgm_yuheikomatsu_02: require("@/assets/audio/bgm/ループあり/yuhei komatsu/cigarette.mp3"),
  bgm_ethnickawahiro_01: require("@/assets/audio/bgm/ループあり/えすにっく・かわひろ/Oxide_2.mp3"),
  bgm_kureppu_01: require("@/assets/audio/bgm/ループあり/くれっぷ/夜風の火花.mp3"),
  bgm_kureppu_02: require("@/assets/audio/bgm/ループあり/くれっぷ/白息.mp3"),
  bgm_sharou_01: require("@/assets/audio/bgm/ループあり/しゃろう/さみしいおばけと東京の月_2.mp3"),
  bgm_lofigirl: require("@/assets/audio/bgm/ループあり/しゃろう/ローファイ少女は今日も寝不足_2.mp3"),
  bgm_shinsanworks_01: require("@/assets/audio/bgm/ループあり/しんさんわーくす/ナイトシフト.mp3"),
  bgm_noru_01: require("@/assets/audio/bgm/ループあり/のる/Code.241_2.mp3"),
  bgm_nekoto_01: require("@/assets/audio/bgm/ループあり/ネコト/寝台特急ローファイ瀬戸.mp3"),
  bgm_matsuurayosuke_01: require("@/assets/audio/bgm/ループあり/松浦洋介/A_Quiet_Place_Among_Strangers.mp3"),
  bgm_kouyatakashi_01: require("@/assets/audio/bgm/ループあり/稿屋　隆/Cat’s_cradle.mp3"),
  bgm_kamabokosachiko_01: require("@/assets/audio/bgm/ループあり/蒲鉾さちこ/Dark blue night.mp3"),
  bgm_kamabokosachiko_02: require("@/assets/audio/bgm/ループあり/蒲鉾さちこ/Lazy_Midnight(深夜にまったり).mp3"),
  bgm_kamabokosachiko_03: require("@/assets/audio/bgm/ループあり/蒲鉾さちこ/Lazy_night(気だるい夜).mp3"),
  bgm_kamabokosachiko_04: require("@/assets/audio/bgm/ループあり/蒲鉾さちこ/The_maze_of_aqua.mp3"),
  bgm_kai_01: require("@/assets/audio/bgm/ループあり/香居/寂れた村.mp3"),
  bgm_anonyment_01: require("@/assets/audio/bgm/ループなし/Anonyment/Treatise_Seven.mp3"),
  bgm_flashbeat_01: require("@/assets/audio/bgm/ループなし/FLASH☆BEAT/Rain_In_The_City.mp3"),
  bgm_flehmann_01: require("@/assets/audio/bgm/ループなし/Flehmann/Flowers_at_night.mp3"),
  bgm_hstar_01: require("@/assets/audio/bgm/ループなし/H★/Rain_in_the_shade_of_a_tree_.mp3"),
  bgm_hstar_02: require("@/assets/audio/bgm/ループなし/H★/rainy_night_city.mp3"),
  bgm_khaim_03: require("@/assets/audio/bgm/ループなし/Khaim/Mad_Trick_(Prod._Khaim).mp3"),
  bgm_mfp_02: require("@/assets/audio/bgm/ループなし/MFP/Sine_of_Fall.mp3"),
  bgm_makeafiledmusic_01: require("@/assets/audio/bgm/ループなし/Make a filed Music/泡沫の夢.mp3"),
  bgm_masuo_01: require("@/assets/audio/bgm/ループなし/Masuo/午後のカメレオンは星の波動を数えてうたた寝をする.mp3"),
  bgm_nekozou_01: require("@/assets/audio/bgm/ループなし/NEKOZOU/Chill_time.mp3"),
  bgm_nekozou_02: require("@/assets/audio/bgm/ループなし/NEKOZOU/stardust_cream_soda.mp3"),
  bgm_nekozou_03: require("@/assets/audio/bgm/ループなし/NEKOZOU/東京ローファイポップ.mp3"),
  bgm_sakurabeatz_01: require("@/assets/audio/bgm/ループなし/SAKURA BEATZ.JP/私のチープな25時。.mp3"),
  bgm_soundofincense_01: require("@/assets/audio/bgm/ループなし/Sound Of Incense/BGM_-_151_-_Rainy_Sky.mp3"),
  bgm_modus_02: require("@/assets/audio/bgm/ループなし/modus/ヒトリジメ_-_宵と静けさと_-.mp3"),
  bgm_roku_01: require("@/assets/audio/bgm/ループなし/roku/線路花.mp3"),
  bgm_t12ya_01: require("@/assets/audio/bgm/ループなし/t12ya/SilkyLatte.mp3"),
  bgm_t12ya_02: require("@/assets/audio/bgm/ループなし/t12ya/the_way_home.mp3"),
  bgm_t12ya_03: require("@/assets/audio/bgm/ループなし/t12ya/夕暮れのポラロイド.mp3"),
  bgm_t12ya_04: require("@/assets/audio/bgm/ループなし/t12ya/雨が止むまで.mp3"),
  bgm_yuheikomatsu_03: require("@/assets/audio/bgm/ループなし/yuhei komatsu/Remind.mp3"),
  bgm_koudatsuno_01: require("@/assets/audio/bgm/ループなし/こうだつの/polar_star.mp3"),
  bgm_natsucollage_01: require("@/assets/audio/bgm/ループなし/なつこらーじゅ/垣間見える狂気〜Hip-hopに乗せて〜.mp3"),
  bgm_noru_02: require("@/assets/audio/bgm/ループなし/のる/Brush_Up!.mp3"),
  bgm_noru_03: require("@/assets/audio/bgm/ループなし/のる/draw_in_the_night.mp3"),
  bgm_noru_04: require("@/assets/audio/bgm/ループなし/のる/夜をさがして.mp3"),
  bgm_noru_05: require("@/assets/audio/bgm/ループなし/のる/夜明けを待つ星.mp3"),
  bgm_noru_06: require("@/assets/audio/bgm/ループなし/のる/小さな旅.mp3"),
  bgm_noru_07: require("@/assets/audio/bgm/ループなし/のる/後片付けをしよう～第二幕.mp3"),
  bgm_noru_08: require("@/assets/audio/bgm/ループなし/のる/我儘な夜のハーブティ.mp3"),
  bgm_noru_09: require("@/assets/audio/bgm/ループなし/のる/星に逢う夜.mp3"),
  bgm_oohiraseiji_01: require("@/assets/audio/bgm/ループなし/オオヒラセイジ/Shibuya_Nightscape .mp3"),
  bgm_oohiraseiji_02: require("@/assets/audio/bgm/ループなし/オオヒラセイジ/止まない雨はない.mp3"),
  bgm_oohiraseiji_03: require("@/assets/audio/bgm/ループなし/オオヒラセイジ/雨のち小夜時雨.mp3"),
  bgm_hayashiyuu_01: require("@/assets/audio/bgm/ループなし/ハヤシユウ/Coffee_Beat.mp3"),
  bgm_hayashiyuu_02: require("@/assets/audio/bgm/ループなし/ハヤシユウ/星降る夜のホットココア.mp3"),
  bgm_sadoharahayato_01: require("@/assets/audio/bgm/ループなし/佐土原隼人/レイニーナイト.mp3"),
  bgm_kitamihitsuji_01: require("@/assets/audio/bgm/ループなし/北見ヒツジ/猫と私.mp3"),
  bgm_yamamotoryoma_01: require("@/assets/audio/bgm/ループなし/山本リョーマ/midnight_coffee.mp3"),
  bgm_matsuurayosuke_02: require("@/assets/audio/bgm/ループなし/松浦洋介/Midnight_Chill_Coffee.mp3"),
  bgm_matsuurayosuke_03: require("@/assets/audio/bgm/ループなし/松浦洋介/Rain_Knows_Where_I’m_Broken.mp3"),
  bgm_matsuurayosuke_04: require("@/assets/audio/bgm/ループなし/松浦洋介/The_Last_Firefly_of_Summer.mp3"),
  bgm_matsuurayosuke_05: require("@/assets/audio/bgm/ループなし/松浦洋介/Until_Shadows_Fade.mp3"),
  bgm_kouyatakashi_02: require("@/assets/audio/bgm/ループなし/稿屋　隆/機械仕掛けの街.mp3"),
  bgm_kouyatakashi_03: require("@/assets/audio/bgm/ループなし/稿屋　隆/薬指の標本.mp3"),
  bgm_kamabokosachiko_05: require("@/assets/audio/bgm/ループなし/蒲鉾さちこ/Melancholy_autumn_rainy_day.mp3"),
  bgm_kamabokosachiko_06: require("@/assets/audio/bgm/ループなし/蒲鉾さちこ/Peaceful_rest.mp3"),
  bgm_kamabokosachiko_07: require("@/assets/audio/bgm/ループなし/蒲鉾さちこ/White_snow_chill_days.mp3"),
  bgm_kamabokosachiko_08: require("@/assets/audio/bgm/ループなし/蒲鉾さちこ/年を刻んで.mp3"),
  bgm_kamabokosachiko_09: require("@/assets/audio/bgm/ループなし/蒲鉾さちこ/荒れ地に咲く花.mp3"),
  bgm_kazehito_01: require("@/assets/audio/bgm/ループなし/風人/ぱいかじ日和.mp3"),
};

/**
 * 環境音。キーは ambient_sound.code（sound_type = 'ambient'）。
 * どの天気でどれが鳴るかは lib/ambient-select.ts が決める。
 *
 * 単一プレイヤーでループし続けるため（AudioContext の applyAmbient）、素材は
 * 流し続けられる長さのものを選んでいる（1〜3分）。ここに無い天気は無音。
 */
const AMBIENT: Record<string, AudioSource> = {
  // 小さめの雨（1:37）。以前「弱い雨」を当てていたが、実際に聴くと音が強く
  // 「雨音の夜」の静けさに合わなかったため、Phase 7-1 まで使っていたこちらへ戻した
  // （2026-09-08 ユーザー判断）。強いほうは assets/未使用/環境音/弱い雨.mp3 へ退避
  amb_rain: require("@/assets/audio/ambient/amb_rain.mp3"),
  amb_thunder_rain: require("@/assets/audio/ambient/amb_thunder_rain.mp3"), // 雷入りの雨（1:02）
  amb_wind: require("@/assets/audio/ambient/amb_wind.mp3"), // 夜風（3:04）
  amb_insect: require("@/assets/audio/ambient/amb_insect.mp3"), // 虫の音（2:07）
};

/** 効果音・鐘の用途 */
export type SfxKey =
  /** 学習終了演出の鐘（要件3.3）。再生中はBGM・環境音をダッキングする */
  | "bell"
  /** 休憩提案が表示されたことを柔らかく知らせる通知音（要件5.1）。鐘とは別・急かさない音 */
  | "break_notice"
  /** ポモドーロの作業⇄休憩の切り替わり（要件3.1）。控えめな音 */
  | "pomodoro_phase"
  /** UI操作音（要件9） */
  | "ui_tap";

/**
 * 効果音・鐘。未制作のものは登録せず、呼び出し側では無音になる。
 * TODO(素材): pomodoro_phase / ui_tap は未制作。break_notice は仮素材
 *   （test_目標達成.mp3 を流用中）。最終的に「それとなく柔らかい休憩の通知音」へ差し替える。
 *   差し替え時は docs/必要素材一覧.md の該当行も更新する。
 */
const SFX: Partial<Record<SfxKey, AudioSource>> = {
  bell: require("@/assets/audio/ambient/The sound of the bell.mp3"),
  break_notice: require("@/assets/audio/ambient/test_目標達成.mp3"),
};

/** BGMの音源（未登録なら undefined） */
export function getBgmSource(code: string): AudioSource | undefined {
  return BGM[code];
}

/** 環境音の音源（未登録なら undefined＝その天気では鳴らさない） */
export function getAmbientSource(code: string): AudioSource | undefined {
  return AMBIENT[code];
}

/** 効果音・鐘の音源（未制作なら undefined＝鳴らさない） */
export function getSfxSource(key: SfxKey): AudioSource | undefined {
  return SFX[key];
}

/**
 * 街ごとの終了演出の鐘（要件3.3）。街コードをキーに音色を変える。
 * 背景アート（townArt.ts）と同じ「街コード→アセット」方式。素材は街ごとに
 * assets/audio/bell/<townCode>/ へ置く（命名・音づくりの規約は同フォルダの README）。
 *
 * **1街につき複数テイクを持てる。** 鳴らすたびに1本を無作為に選ぶ。
 * 実際の鐘は一打ごとに響きが違うため、同じサンプルが毎回鳴ると機械的に聞こえる——
 * 変えるのは**同じ鐘の別テイクだけ**で、音色（どの鐘か）は街ごとに固定する。
 * 音程や長さの違うテイクを混ぜると「夜ごとに鐘が変わった」ように聞こえるため、
 * 響きの似たものを2〜4本選んで並べること。
 *
 * 未登録の街は既定の鐘（SFX.bell）へフォールバックする（背景が night に落ちるのと同じ）。
 * これにより素材が無い街でも終了演出は必ず鳴る。素材が届いた街から下に1行足すだけで有効になる。
 *
 * **TODO(素材): いまは wav 原本を直接参照している（暫定）。**
 * 規約は mp3（assets/audio/bell/<townCode>/<townCode>_bell_<NN>.mp3）だが、
 * 変換前でも鳴らせるようにするため、当面 鐘/ の wav をそのまま指している。
 * mp3 化したら各街のフォルダへ移し、下の require を差し替えること
 * （wav 合計 約14MB → mp3 なら約1/10になる）。
 *
 * **どのテイクを選んだか**: 聴かずに選べるよう、各 wav の長さ・音量（RMS）と
 * 打点直後のゼロ交差から求めた支配周波数を測り、**音程の揃ったものだけ**を採った。
 * 同じ音色系統でも音程が2群に分かれる素材があり、混ぜると「夜ごとに鐘が変わった」
 * ように聞こえるためである（梵鐘=330/337Hz群と383/400Hz群、
 * ハンドベル=4kHz台と6kHz台）。**耳で確かめて合わなければ差し替えてよい。**
 */
const TOWN_BELL: Record<string, AudioSource[]> = {
  // 港町=時計台のベル。3本とも 836〜855Hz とよく揃っている（尾の長さだけ違う）
  nightTown: [
    require("@/assets/audio/bell/鐘/bell_town_clocktower/bell_town_clocktower_01.wav"),
    require("@/assets/audio/bell/鐘/bell_town_clocktower/bell_town_clocktower_02.wav"),
  ],
  // 城下町=梵鐘。低い群（330Hz・337Hz）を採る。02・04 は383/400Hzで別の音になる
  castleTown: [
    require("@/assets/audio/bell/鐘/bell_town_bonshou/bell_town_bonshou_01.wav"),
    require("@/assets/audio/bell/鐘/bell_town_bonshou/bell_town_bonshou_03.wav"),
  ],
  // 雪国=ハンドベル。4kHz台の群から、とくに近い3本（4090〜4266Hz）を採る。
  // 07〜12 は6kHz台で明らかに高く、混ぜない
  snowTown: [
    require("@/assets/audio/bell/鐘/bell_town_handbell/bell_town_handbell_01.wav"),
    require("@/assets/audio/bell/鐘/bell_town_handbell/bell_town_handbell_04.wav"),
    require("@/assets/audio/bell/鐘/bell_town_handbell/bell_town_handbell_06.wav"),
  ],
  // 星見の丘=クリスタル。2721Hz・2757Hz の対を採る。03〜05 はばらつくため使わない
  starHill: [
    require("@/assets/audio/bell/鐘/bell_town_crystal/bell_town_crystal_01.wav"),
    require("@/assets/audio/bell/鐘/bell_town_crystal/bell_town_crystal_02.wav"),
  ],
};

/**
 * 選択中の街の終了演出の鐘を返す。街ごとの鐘が登録されていれば**その中から無作為に1本**を、
 * 無ければ既定の鐘（SFX.bell）を返す。既定も未制作なら undefined（＝鳴らさない）。
 *
 * 呼ぶたびに結果が変わりうる。呼び出し側（AudioContext の getBellPlayer）は
 * 戻り値をキーにプレイヤーを使い回すため、テイクを増やしてもプレイヤーは1本ずつで済む。
 */
export function getTownBell(
  townCode: string | null | undefined,
): AudioSource | undefined {
  const takes = townCode ? TOWN_BELL[townCode] : undefined;
  if (takes && takes.length > 0) {
    return takes[Math.floor(Math.random() * takes.length)];
  }
  return SFX.bell;
}
