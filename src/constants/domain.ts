// =====================================================================
// ドメイン定数の一元管理
// 出典: 要件定義書 v2 / ユースケース設計書 v2 / スキーマの CHECK 制約
// 方針: マジックナンバーを避ける。値域・既定値はすべてここに集約する。
// =====================================================================

/** 学習日サイクル（18:00〜翌5:00）。要件0章 */
export const STUDY_DAY = {
  /** サイクル開始時刻（時） */
  START_HOUR: 18,
  /** サイクル終了時刻（時）。この時刻に到達でタイマー自動終了（要件3.2） */
  END_HOUR: 5,
} as const;

/** 一日の学習目標時間（分）。要件1.2 / 10.2 */
export const DAILY_GOAL_MINUTES = {
  MIN: 10,
  MAX: 720,
  DEFAULT: 60,
} as const;

/** シンプルモードの予定学習時間（分）。UC 3.1 */
export const SIMPLE_PLANNED_MINUTES = {
  MIN: 10,
  MAX: 660,
} as const;

/** ポモドーロ設定。要件3.1 / UC 3.1 */
export const POMODORO = {
  WORK_MINUTES: { MIN: 5, MAX: 120, DEFAULT: 25 },
  BREAK_MINUTES: { MIN: 1, MAX: 30, DEFAULT: 5 },
  LOOP_COUNT: { MIN: 1, MAX: 10, DEFAULT: 1 },
} as const;

/** 延長宣言（分）。要件5.2 */
export const EXTENSION_MINUTES = {
  MIN: 5,
  MAX: 120,
} as const;

/** 休憩提案の再表示間隔（分）。超過60分ごと。要件5.1 */
export const BREAK_REPROMPT_INTERVAL_MINUTES = 60;

/** 街の成長。要件6章 */
export const GROWTH = {
  /** 最大レベル（MVPは5段階） */
  MAX_LEVEL: 5,
  /** 習慣型: レベルアップに必要な経験値（1レベルあたり一律5） */
  EXP_PER_LEVEL: 5,
  /**
   * 習慣型の累計必要経験値（growth_level_threshold と一致）。
   * Lv2:5 / Lv3:10 / Lv4:15 / Lv5:20
   */
  HABIT_CUMULATIVE_EXP: { 2: 5, 3: 10, 4: 15, 5: 20 } as const,
} as const;

/** プロジェクト型の街ごと目標学習時間。UC 6.2 / 6.3（入力は時間単位、格納は分） */
export const PROJECT_TARGET = {
  HOURS: { MIN: 1, MAX: 744, DEFAULT: 10 },
  /** スキーマ CHECK: 60〜44640（分）＝1〜744時間 */
  MINUTES: { MIN: 60, MAX: 44640 },
} as const;

/** 実績学習時間がこの値未満のセッションは保存せず破棄する（分）。要件3.2 */
export const MIN_SAVE_MINUTES = 1;

/** 音量（各種、0〜100）。要件9章 / 10.4 */
export const AUDIO_VOLUME = {
  MIN: 0,
  MAX: 100,
  DEFAULT: 50,
} as const;

/** マイタグ・入力文字数の上限。要件3.4 */
export const LIMITS = {
  /** マイタグの登録上限（論理削除分は含めない） */
  MYTAG_MAX: 20,
  /** タグ名の文字数上限 */
  TAG_NAME_MAX: 20,
  /** 振り返りメモの文字数上限 */
  MEMO_MAX: 500,
  /** ニックネームの文字数上限 */
  NICKNAME_MAX: 20,
  /** 街のサブタイトルの文字数上限 */
  SUBTITLE_MAX: 20,
  /** マイプレイリスト名の文字数上限 */
  PLAYLIST_NAME_MAX: 20,
} as const;

/** 疑似オンライン人数の生成範囲（起動ごとに固定）。要件11章 */
export const PSEUDO_ONLINE = {
  MIN: 3,
  MAX: 27,
} as const;

/**
 * 音の設定・演出に関する値。要件9 / 3.3。
 * 音量は4分類（BGM・環境音・効果音・鐘の音）それぞれ0〜100で、既定値は50。
 * DBの audio_setting の CHECK 制約（BETWEEN 0 AND 100）と一致させること。
 */
export const AUDIO = {
  /** 音量設定の最大値。プレイヤーの音量（0.0〜1.0）への換算にも使う */
  VOLUME_MAX: 100,
  /** 音量設定の既定値（スキーマの DEFAULT と一致） */
  VOLUME_DEFAULT: 50,
  /** 鐘の再生中に BGM・環境音へ掛ける比率（要件3.3 のダッキング） */
  DUCKING_RATIO: 0.25,
  /** BGMの自動再生・おやすみ復帰時のフェードイン時間（ミリ秒）。急に鳴らさない（要件9） */
  FADE_IN_MS: 2500,
  /** おやすみ・ダッキング時のフェードアウト時間（ミリ秒） */
  FADE_OUT_MS: 1200,
  /** フェードの更新間隔（ミリ秒）。細かすぎると負荷、粗すぎると段が見える */
  FADE_STEP_MS: 50,
  /**
   * 曲タップ（プレイリストの曲選択）の連打を束ねる時間（ミリ秒）。
   * 表示は即時に切り替え、実際の音源差し替え＋再生は最後のタップだけ本値ぶん待って行う。
   * ネイティブの差し替えを連打ぶん実行して取りこぼす・競合するのを防ぐ（要件9）。
   */
  TAP_COALESCE_MS: 120,
} as const;

/**
 * 通知時刻の許容範囲。要件12章（改訂）。
 * タイマー起動可能な夜間帯（18:00〜翌5:00）を基準に、開始前の準備を促せるよう
 * 前側を17:30まで広げ、5:00到達で自動終了する仕様に配慮して後側を4:30までとする。
 * 許容: 17:30〜23:59 および 00:00〜04:30。
 * 18:00より前（17:30〜17:59）の通知は「夜が目覚めるまであと◯分」の
 * カウントダウンメッセージとする（◯分＝18:00−通知時刻。Phase 7で実装）。
 */
export const NOTIFICATION_WINDOW = {
  /** 17:30 = 1050分 */
  START_MINUTES: 17 * 60 + 30,
  /** 04:30 = 270分 */
  END_MINUTES: 4 * 60 + 30,
  START_LABEL: "17:30",
  END_LABEL: "4:30",
  /** 夜が目覚める時刻（分）。18:00。カウントダウンの基準に使う */
  NIGHT_WAKE_MINUTES: 18 * 60,
} as const;
