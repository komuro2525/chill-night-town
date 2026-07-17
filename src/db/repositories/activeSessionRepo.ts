// 計測中セッション（active_session）リポジトリ
// 計測中のみ1件存在する。行の有無が「未終了セッションあり」の判定になる（要件1.1 / 3.2）。
//
// 計測状態の正は常にこのテーブル。開始・一時停止・再開のたびに即座に書き込むことで、
// アプリの強制終了・クラッシュ・端末再起動があっても直前の状態から復元できる（要件3.2）。
// 経過時間はここには保存せず、保存済みの時刻から都度算出する（src/lib/timer.ts）。

import { getDatabase } from "../database";
import type { ActiveSession, TimerMode } from "../types";

/** 未終了（計測中）セッションが存在するか */
export async function hasActiveSession(): Promise<boolean> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ count: number }>(
    "SELECT COUNT(*) AS count FROM active_session",
  );
  return (row?.count ?? 0) > 0;
}

/** 計測中セッションを取得する（なければ null） */
export async function getActiveSession(): Promise<ActiveSession | null> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<ActiveSession>(
    "SELECT * FROM active_session LIMIT 1",
  );
  return row ?? null;
}

export type CreateActiveSessionInput = {
  userId: number;
  townId: number;
  timerMode: TimerMode;
  /** 黙々モードのみ */
  plannedMinutes?: number | null;
  /** 以下3つはポモドーロモードのみ */
  pomodoroWorkMinutes?: number | null;
  pomodoroBreakMinutes?: number | null;
  pomodoroLoopCount?: number | null;
  /** 開始時刻（ISO8601）。呼び出し側が clock.now() から渡す */
  startTime: string;
  /** 次に休憩提案を出す基準（その学習日の実績合計・分）。要件5.1 */
  breakSuggestThresholdMinutes: number | null;
};

/**
 * 計測を開始する（active_session を1件作る）。
 * 夜の天気はここでは扱わない。開始時に weatherRepo.setWeather() で
 * その学習日の天気として確定する（1晩＝1天気。要件2.5）。
 * モードと設定値の整合はスキーマの CHECK 制約でも担保されている
 * （simple なら planned_minutes のみ / pomodoro なら pomodoro_* のみ）。
 */
export async function create(input: CreateActiveSessionInput): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    `INSERT INTO active_session
       (user_id, town_id, timer_mode,
        planned_minutes, pomodoro_work_minutes, pomodoro_break_minutes, pomodoro_loop_count,
        start_time, paused_accumulated_seconds, pause_started_at,
        break_suggest_threshold_minutes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, NULL, ?)`,
    input.userId,
    input.townId,
    input.timerMode,
    input.plannedMinutes ?? null,
    input.pomodoroWorkMinutes ?? null,
    input.pomodoroBreakMinutes ?? null,
    input.pomodoroLoopCount ?? null,
    input.startTime,
    input.breakSuggestThresholdMinutes,
  );
}

/** 一時停止する。停止開始時刻を記録し、以降は経過時間が進まなくなる */
export async function pause(pausedAt: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    `UPDATE active_session
        SET pause_started_at = ?, updated_at = datetime('now')
      WHERE pause_started_at IS NULL`,
    pausedAt,
  );
}

/**
 * 再開する。今回の停止時間を累積へ加算し、停止開始時刻を消す。
 * 加算は SQL 内で行い、読み出し→計算→書き戻しの競合を避ける。
 * 端末時計の変更で負値になる場合に備え、0未満は加算しない（要件3.2）。
 */
export async function resume(resumedAt: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    `UPDATE active_session
        SET paused_accumulated_seconds =
              paused_accumulated_seconds
              + MAX(0, CAST(strftime('%s', ?) AS INTEGER)
                       - CAST(strftime('%s', pause_started_at) AS INTEGER)),
            pause_started_at = NULL,
            updated_at = datetime('now')
      WHERE pause_started_at IS NOT NULL`,
    resumedAt,
  );
}

/** 次回の休憩提案の基準を更新する（「継続する」で+60分、延長宣言で再計算）。要件5.1 / 5.2 */
export async function updateBreakThreshold(minutes: number): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    `UPDATE active_session
        SET break_suggest_threshold_minutes = ?, updated_at = datetime('now')`,
    minutes,
  );
}

/**
 * 計測状態を削除する。
 * 学習記録として保存する場合は study_session へ変換したうえで削除し、
 * 実績1分未満で破棄する場合は保存せずに削除する（要件3.2）。
 */
export async function remove(): Promise<void> {
  const db = await getDatabase();
  await db.runAsync("DELETE FROM active_session");
}
