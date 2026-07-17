// =====================================================================
// DB行の型定義
// 対応: db/chill_night_town_スキーマ_v2.sql / テーブル定義書 v2
// 方針:
//   ・SQLite の真偽値カラムは INTEGER(0/1)。ここでは Bool(0|1) として保持し、
//     bool への変換は利用側（リポジトリ）で行う。
//   ・日時は TEXT(ISO8601)、日付のみは TEXT('YYYY-MM-DD')。型上は string。
//   ・NULL 可カラムは `| null` で表現する。
// =====================================================================

/** SQLite の真偽値表現（0=false / 1=true） */
export type Bool = 0 | 1;

// --- 列挙的なコード値 ---
export type GrowthMethod = "habit" | "project";
export type TimerMode = "simple" | "pomodoro";
export type SoundType = "bgm" | "ambient";
export type EmotionCategory = "positive" | "neutral" | "negative";
/** NPCメッセージの表示タイミング（将来拡張のため TEXT 管理。既知の値をユニオンで補助） */
export type NpcTriggerType =
  | "study_start"
  | "study_end"
  | "goal_achieved"
  | "goodnight";

// =====================================================================
// Ⅰ. 基幹
// =====================================================================
export type User = {
  id: number;
  nickname: string;
  daily_goal_minutes: number;
  emotion_record_enabled: Bool;
  overwork_prevention_enabled: Bool;
  growth_method: GrowthMethod;
  timer_mode: TimerMode;
  pomodoro_work_minutes: number;
  pomodoro_break_minutes: number;
  pomodoro_loop_count: number;
  /** 初回ホームの成長方式お知らせを表示済みか（1=表示済み） */
  growth_hint_dismissed: Bool;
  created_at: string;
  updated_at: string;
};

// =====================================================================
// Ⅱ. マスタ
// =====================================================================
export type Town = {
  id: number;
  code: string;
  name: string;
  description: string | null;
  thumbnail_path: string | null;
  background_image_path: string | null;
  display_order: number;
  is_active: Bool;
  created_at: string;
};

export type NightWeather = {
  id: number;
  code: string;
  emoji: string | null;
  name: string;
  display_order: number;
};

export type Emotion = {
  id: number;
  code: string;
  emoji: string | null;
  name: string;
  category: EmotionCategory;
  display_order: number;
};

export type StudyTag = {
  id: number;
  /** NULL = 標準タグ / 数値 = マイタグの所有ユーザー */
  user_id: number | null;
  name: string;
  is_custom: Bool;
  is_active: Bool;
  display_order: number;
  created_at: string;
};

export type Npc = {
  id: number;
  name: string;
  description: string | null;
  image_path: string | null;
  is_active: Bool;
  created_at: string;
};

export type NpcMessage = {
  id: number;
  npc_id: number;
  trigger_type: NpcTriggerType;
  message: string;
  is_active: Bool;
  created_at: string;
};

export type AmbientSound = {
  id: number;
  code: string;
  sound_type: SoundType;
  name: string;
  artist: string | null;
  file_path: string | null;
  is_active: Bool;
};

export type GrowthLevelThreshold = {
  id: number;
  method: GrowthMethod;
  level: number;
  required_value: number;
};

// =====================================================================
// Ⅲ. 学習セッション関連
// =====================================================================
export type StudySession = {
  id: number;
  user_id: number;
  town_id: number;
  emotion_id: number | null;
  timer_mode: TimerMode;
  /** 学習日（'YYYY-MM-DD'、要件0章の定義） */
  study_date: string;
  start_time: string;
  end_time: string;
  planned_minutes: number;
  duration_minutes: number;
  memo: string | null;
  created_at: string;
  updated_at: string;
};

export type SessionTag = {
  study_session_id: number;
  study_tag_id: number;
};

export type ActiveSession = {
  user_id: number;
  town_id: number;
  timer_mode: TimerMode;
  /** simple時は必須、pomodoro時は null */
  planned_minutes: number | null;
  /** pomodoro時は必須、simple時は null */
  pomodoro_work_minutes: number | null;
  pomodoro_break_minutes: number | null;
  pomodoro_loop_count: number | null;
  start_time: string;
  paused_accumulated_seconds: number;
  /** 一時停止中のみ値を持つ。計測中は null */
  pause_started_at: string | null;
  break_suggest_threshold_minutes: number | null;
  updated_at: string;
};

export type AdditionalStudyTime = {
  id: number;
  user_id: number;
  /** 対象の学習日（'YYYY-MM-DD'） */
  target_date: string;
  added_minutes: number;
  created_at: string;
};

// =====================================================================
// Ⅳ. 街の成長関連
// =====================================================================
export type TownProgress = {
  id: number;
  user_id: number;
  town_id: number;
  current_level: number;
  cumulative_study_minutes: number;
  experience_points: number;
  subtitle: string | null;
  project_target_minutes: number | null;
  is_selected: Bool;
  created_at: string;
  updated_at: string;
};

export type DailyGoalAchievement = {
  user_id: number;
  study_date: string;
  achieved_at: string;
};

/**
 * 学習日ごとに選択された夜の天気（要件2.5 / 8章）。
 * ホーム画面の背景演出・環境音はこの値を参照する。行が無い学習日は「天気未選択」。
 * 1晩＝1天気。その学習日のあいだ何度でも選び直せ、最後の選択が残る。
 * study_session / active_session は天気を持たない（二重管理を避けるため）。
 */
export type DailyNightWeather = {
  user_id: number;
  study_date: string;
  night_weather_id: number;
  updated_at: string;
};

// =====================================================================
// Ⅴ. 設定（ユーザー単位 1:1）
// =====================================================================
export type NotificationSetting = {
  user_id: number;
  is_enabled: Bool;
  /** 'HH:MM' 形式 */
  scheduled_time: string | null;
  updated_at: string;
};

export type AudioSetting = {
  user_id: number;
  bgm_volume: number;
  ambient_volume: number;
  sfx_volume: number;
  bell_volume: number;
  updated_at: string;
};

export type UserSoundPreference = {
  user_id: number;
  ambient_sound_id: number;
  is_enabled: Bool;
};
