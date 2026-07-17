// =====================================================================
// タイマー計測ロジック（純関数）
//
// 要件3.2「計測方式」: 経過時間はカウンター変数ではなく、
//   現在時刻 − 開始時刻 − 一時停止累積 の**時刻差分**で算出する。
//   これによりアプリを離れて戻っても経過時間が正しく引き継がれる。
//
// 本モジュールは active_session（DBの計測状態）と現在時刻だけを入力に取り、
// 副作用を持たない。DBもReactも触らないため、境界値を単体で検証できる。
// 状態の正は常に active_session であり、ここでは何も保持しない。
// =====================================================================

import { STUDY_DAY } from "@/constants/domain";
import type { ActiveSession } from "@/db/types";
import { clampNonNegativeSeconds, getStudyDate } from "./study-day";

/** ポモドーロの現在フェーズ */
export type PomodoroPhase = {
  /** 'work' = 作業フェーズ（実績に含める） / 'break' = 休憩フェーズ（含めない） */
  kind: "work" | "break";
  /** 何ループ目か（1始まり。表示用） */
  loop: number;
  /** 現在フェーズの残り秒 */
  remainingSeconds: number;
  /** 全ループ完了済みか（要件3.2: 完了で自動的に終了演出へ） */
  completed: boolean;
};

/**
 * 計測の経過秒（＝一時停止を除いた「動いていた時間」）。
 *
 * 一時停止中は pause_started_at からの分も差し引くため、停止中は値が進まない。
 * 端末時計の変更等で負値になった場合は0に丸める（要件3.2）。
 */
export function getElapsedSeconds(session: ActiveSession, atMs: number): number {
  const startMs = Date.parse(session.start_time);
  // 一時停止中は、今回の停止分をさらに差し引く（停止開始より前の時刻を渡された場合は0扱い）
  const currentPauseSec = session.pause_started_at
    ? clampNonNegativeSeconds((atMs - Date.parse(session.pause_started_at)) / 1000)
    : 0;

  const seconds =
    (atMs - startMs) / 1000 - session.paused_accumulated_seconds - currentPauseSec;
  return Math.floor(clampNonNegativeSeconds(seconds));
}

/**
 * 5:00 自動終了の時刻（ミリ秒）。
 * 開始時刻が属する学習日サイクルの終わり（翌5:00）を返す（要件3.2 / 0章）。
 * 例: 1/10 23:30 開始 → 1/11 5:00 ／ 1/11 1:30 開始（学習日は1/10）→ 1/11 5:00
 */
export function getAutoEndMs(session: ActiveSession): number {
  const studyDate = getStudyDate(new Date(Date.parse(session.start_time)));
  const [y, m, d] = studyDate.split("-").map(Number);
  // 学習日の翌日 5:00（Date は月末・年末を自動で繰り上げる）
  return new Date(y, m - 1, d + 1, STUDY_DAY.END_HOUR, 0, 0, 0).getTime();
}

/** 5:00 に到達したか（到達していれば自動終了へ移行する） */
export function isAutoEndReached(session: ActiveSession, atMs: number): boolean {
  return atMs >= getAutoEndMs(session);
}

/**
 * 実績の集計に使う時刻。5:00 を過ぎていても実績は5:00までとするため、
 * 5:00 で頭打ちにする（要件3.2 / 中断復元時も同じ扱い）。
 */
export function getCappedMs(session: ActiveSession, atMs: number): number {
  return Math.min(atMs, getAutoEndMs(session));
}

/**
 * ポモドーロの構成（要件3.1・修正履歴30）:
 *   作業 →（休憩 → 作業）× (n−1)
 * 休憩は**作業と作業の間にのみ**挟み、最後の作業の後に休憩は行わない。
 * n=1 のときは休憩が一切発生しない。
 */
type PomodoroLayout = {
  workSec: number;
  breakSec: number;
  loops: number;
  /** 作業＋休憩。最後のループを除く各ループの長さ */
  cycleSec: number;
  /** 全体の長さ = 作業×n ＋ 休憩×(n−1) */
  totalSec: number;
  /** 最後の作業フェーズが始まる位置 = (作業＋休憩)×(n−1) */
  lastWorkStartSec: number;
};

function getLayout(session: ActiveSession): PomodoroLayout {
  const workSec = (session.pomodoro_work_minutes ?? 0) * 60;
  const breakSec = (session.pomodoro_break_minutes ?? 0) * 60;
  const loops = session.pomodoro_loop_count ?? 0;
  const cycleSec = workSec + breakSec;
  return {
    workSec,
    breakSec,
    loops,
    cycleSec,
    totalSec: workSec * loops + breakSec * Math.max(0, loops - 1),
    lastWorkStartSec: cycleSec * Math.max(0, loops - 1),
  };
}

/**
 * ポモドーロの現在フェーズを経過秒から算出する。
 * フェーズはDBに保存せず、経過秒と設定値から毎回導く（テーブル定義書の方針）。
 * 最後の作業フェーズの完了をもって全ループ完了とする（要件3.1）。
 */
export function getPomodoroPhase(
  session: ActiveSession,
  elapsedSeconds: number,
): PomodoroPhase {
  const { workSec, loops, cycleSec, totalSec, lastWorkStartSec } =
    getLayout(session);

  if (elapsedSeconds >= totalSec) {
    // 最後の作業フェーズを終えた時点で完了
    return { kind: "work", loop: loops, remainingSeconds: 0, completed: true };
  }

  // 最後の作業フェーズ（この後に休憩は続かない）
  if (elapsedSeconds >= lastWorkStartSec) {
    return {
      kind: "work",
      loop: loops,
      remainingSeconds: totalSec - elapsedSeconds,
      completed: false,
    };
  }

  // 途中のループ（作業 → 休憩）
  const loopIndex = Math.floor(elapsedSeconds / cycleSec); // 0始まり
  const within = elapsedSeconds % cycleSec;
  const isWork = within < workSec;

  return {
    kind: isWork ? "work" : "break",
    loop: loopIndex + 1,
    remainingSeconds: isWork ? workSec - within : cycleSec - within,
    completed: false,
  };
}

/**
 * 実績学習時間（秒）。要件0章の「実績学習時間」の定義に一致させる:
 *   一時停止中・ポモドーロの休憩フェーズを除いた**作業時間の合計**。
 * 成長・目標達成の判定はすべてこの値を使う。
 *
 * 5:00 を過ぎた分は含めない（実績は5:00まで）。
 */
export function getActualStudySeconds(
  session: ActiveSession,
  atMs: number,
): number {
  const elapsed = getElapsedSeconds(session, getCappedMs(session, atMs));

  // 黙々モードは一時停止を除いた経過がそのまま実績（予定を超えても計測は続く）
  if (session.timer_mode === "simple") return elapsed;

  // ポモドーロは休憩フェーズを除く
  const { workSec, loops, cycleSec, lastWorkStartSec } = getLayout(session);

  // 最後の作業フェーズ以降（この後に休憩はない）
  if (elapsed >= lastWorkStartSec) {
    const lastWork = Math.min(elapsed - lastWorkStartSec, workSec);
    return Math.max(0, loops - 1) * workSec + lastWork;
  }

  // 途中のループ: 完了したループ数×作業 ＋ 現在ループの作業した分
  const completedLoops = Math.floor(elapsed / cycleSec);
  const within = elapsed % cycleSec;
  return completedLoops * workSec + Math.min(within, workSec);
}

/** 実績学習時間（分・切り捨て）。保存・表示はこの単位で行う */
export function getActualStudyMinutes(
  session: ActiveSession,
  atMs: number,
): number {
  return Math.floor(getActualStudySeconds(session, atMs) / 60);
}

/**
 * 予定学習時間（分）。黙々モードは設定値、ポモドーロは作業時間×繰り返し回数（要件3.2）。
 * study_session.planned_minutes は CHECK (> 0) のため、常に1以上になる想定。
 */
export function getPlannedMinutes(session: ActiveSession): number {
  if (session.timer_mode === "simple") return session.planned_minutes ?? 0;
  return (session.pomodoro_work_minutes ?? 0) * (session.pomodoro_loop_count ?? 0);
}

/**
 * 予定どおりに進んだ場合の終了時刻（ミリ秒）。ホーム画面の時計に「終わりの位置」として示す。
 *
 * 一時停止した分だけ後ろへずれる（止めれば終わりも遅くなる、という正直な表示にする）。
 * 5:00 を過ぎる予定なら 5:00 を返す（そこが本当の終わりのため。要件3.2）。
 *
 * 黙々モードは予定を超えても計測が続くため、この時刻は「上限」ではなく「目安」。
 */
export function getPlannedEndMs(session: ActiveSession, atMs: number): number {
  const plannedSec =
    session.timer_mode === "simple"
      ? (session.planned_minutes ?? 0) * 60
      : getLayout(session).totalSec;

  // これまでに止めていた時間（一時停止中は今回の分も含む）
  const pausedSec =
    session.paused_accumulated_seconds +
    (session.pause_started_at
      ? clampNonNegativeSeconds((atMs - Date.parse(session.pause_started_at)) / 1000)
      : 0);

  const end = Date.parse(session.start_time) + (plannedSec + pausedSec) * 1000;
  return Math.min(end, getAutoEndMs(session));
}

/**
 * セッションを終了すべきか（自動終了の判定）。
 * - 5:00 到達（一時停止中も含む）
 * - ポモドーロの全ループ完了
 */
export function shouldAutoFinish(session: ActiveSession, atMs: number): boolean {
  if (isAutoEndReached(session, atMs)) return true;
  if (session.timer_mode !== "pomodoro") return false;
  return getPomodoroPhase(session, getElapsedSeconds(session, atMs)).completed;
}

/**
 * 終了時刻として記録する時刻（ミリ秒）。
 * 5:00 到達時は5:00、ポモドーロ全ループ完了時は完了時刻、それ以外は終了操作時刻。
 */
export function getEndMs(session: ActiveSession, atMs: number): number {
  const capped = getCappedMs(session, atMs);
  if (session.timer_mode !== "pomodoro") return capped;

  const { totalSec } = getLayout(session);
  if (getElapsedSeconds(session, capped) < totalSec) return capped;

  // 全ループ完了後に終了した場合、完了した瞬間を終了時刻とする
  // （完了時刻 = 開始 + 全ループ + それまでの一時停止の合計）
  const pausedMs =
    (session.paused_accumulated_seconds +
      (session.pause_started_at
        ? clampNonNegativeSeconds(
            (capped - Date.parse(session.pause_started_at)) / 1000,
          )
        : 0)) *
    1000;
  return Math.min(Date.parse(session.start_time) + totalSec * 1000 + pausedMs, capped);
}
