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
  HOURS: { MIN: 1, MAX: 500, DEFAULT: 10 },
  /** スキーマ CHECK: 60〜30000（分） */
  MINUTES: { MIN: 60, MAX: 30000 },
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
} as const;

/** 疑似オンライン人数の生成範囲（起動ごとに固定）。要件11章 */
export const PSEUDO_ONLINE = {
  MIN: 3,
  MAX: 27,
} as const;
