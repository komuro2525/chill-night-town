// 学習中のお知らせ（バックグラウンド通知）の予約内容（要件12章 / UC 12.2）。純関数。
//
// アプリを離れているあいだに起きる学習中の出来事を、OSへ先回りして予約する。
// 対象は4種類:
//   ・ポモドーロの作業⇄休憩の切り替わり
//   ・ポモドーロの全ループ完了（バックグラウンドでは終了演出が走らないため）
//   ・目標到達（その学習日の実績合計が一日の学習目標時間に達した時刻）
//   ・5:00自動終了（学習日の終わり）
//
// 予約し直す契機は、タイマーの開始・再開・一時停止・終了。
// 一時停止中は予約を持たない（停止中は時間が進まず、予約済みの時刻が実際とずれるため）。
//
// 発火するのは何十分も後で、画面を見ても正しさが分からない。時刻を取り違えると
// 「休憩が終わっても知らせが来ない」「終わったのに気づけない」形で壊れるため、
// ここに集約してテストで固定する。

import type { ActiveSession } from "@/db/types";
import { getAutoEndMs } from "./timer";

/** 予約するローカル通知1件ぶん */
export type StudyNotice = {
  /** 発火時刻 */
  fireAt: Date;
  title: string;
  body: string;
};

type Content = { title: string; body: string };

/** 作業→休憩の切り替わりの文面。責めない・急かさない（要件12章） */
function toBreakContent(breakMinutes: number): Content {
  return {
    title: "休憩の時間です",
    body: `${breakMinutes}分間、少し離れてみませんか。`,
  };
}

/** 休憩→作業の切り替わりの文面 */
function toWorkContent(): Content {
  return {
    title: "休憩が終わりました",
    body: "準備ができたら、また続きを。",
  };
}

/**
 * 全ループ完了（最後の作業フェーズの終わり）の文面。
 * 終了を告げるだけにとどめ、記録を促して急かさない（要件12章）。
 * 終了演出（3.3）・成果記録（3.4）はアプリへ戻った時点で行う
 */
function completedContent(): Content {
  return {
    title: "今夜の学習が終わりました",
    body: "おつかれさまでした。街に戻ると、この夜を記録できます。",
  };
}

/**
 * 目標到達（一日の学習目標時間に届いた）の文面。
 * 「まだ続けられる」場面のため、終わらせにも続行にも寄せない（要件5.1の方針）
 */
function goalReachedContent(): Content {
  return {
    title: "今夜の目標に届きました",
    body: "ここで休むのも、続けるのも、決めるのはあなたです。",
  };
}

/** 5:00自動終了の文面。夜が終わったことを伝える（要件3.2） */
function autoEndContent(): Content {
  return {
    title: "夜が明けました",
    body: "今夜の学習はここまでです。街に戻ると、この夜を記録できます。",
  };
}

/** ポモドーロの構成（timer.ts と同じ考え方。ここでは秒で扱う） */
type Layout = {
  workSec: number;
  cycleSec: number;
  loops: number;
  /** 全体の長さ = 作業×n ＋ 休憩×(n−1) */
  totalSec: number;
};

function getLayout(session: ActiveSession): Layout {
  const workSec = (session.pomodoro_work_minutes ?? 0) * 60;
  const breakSec = (session.pomodoro_break_minutes ?? 0) * 60;
  const loops = session.pomodoro_loop_count ?? 0;
  return {
    workSec,
    cycleSec: workSec + breakSec,
    loops,
    totalSec: workSec * loops + breakSec * Math.max(0, loops - 1),
  };
}

/**
 * 「実績がこの秒数に達する」のが経過何秒の時点かを返す（ポモドーロ用）。
 * 実績には休憩フェーズが入らないため、休憩の分だけ後ろへずれる。
 * セッション中に到達しない場合は null。
 */
function elapsedAtActual(layout: Layout, actualSec: number): number | null {
  const { workSec, cycleSec, loops } = layout;
  if (actualSec <= 0) return 0;
  if (actualSec > workSec * loops) return null; // 全ループぶん働いても届かない

  const full = Math.floor(actualSec / workSec);
  const rem = actualSec % workSec;
  // 作業時間ちょうどで割り切れるときは、そのループの作業の終わり（休憩へ入る直前）
  if (rem === 0) return (full - 1) * cycleSec + workSec;
  return full * cycleSec + rem;
}

/**
 * 以後に訪れる学習中の出来事の通知を、発火が早い順に返す（要件12章 / UC 12.2）。
 *
 * 一時停止中は空を返す（フェーズも実績も進まず、時刻が決まらないため）。
 * 既に過ぎた出来事と、5:00（自動終了。要件3.2）より後に当たる出来事は含めない。
 *
 * @param session  計測中のセッション
 * @param atMs     現在時刻（ミリ秒）
 * @param savedMinutes その学習日の**保存済み**実績合計（分）。目標到達の判定に使う
 * @param goalMinutes 一日の学習目標時間（user.daily_goal_minutes）
 */
export function buildStudyNotices({
  session,
  atMs,
  savedMinutes,
  goalMinutes,
}: {
  session: ActiveSession;
  atMs: number;
  savedMinutes: number;
  goalMinutes: number;
}): StudyNotice[] {
  // 一時停止中は、いつ再開されるか分からない＝出来事の時刻が決まらない
  if (session.pause_started_at) return [];

  const isPomodoro = session.timer_mode === "pomodoro";
  const layout = getLayout(session);
  // 経過秒 → 実時刻。一時停止中でないため、今後は経過と実時間が同じ速さで進む
  // （さらに一時停止されたら、その時点で予約を解除して再開時に取り直す）
  const baseMs = Date.parse(session.start_time) + session.paused_accumulated_ms;
  const autoEndMs = getAutoEndMs(session);

  const notices: StudyNotice[] = [];
  const pushAt = (fireMs: number, content: Content) => {
    // 既に過ぎた出来事は予約しない（過去の時刻を渡すと即時に鳴る実装があるため）
    if (fireMs <= atMs) return;
    notices.push({ fireAt: new Date(fireMs), ...content });
  };
  /** 経過秒で指定する。5:00 より後は訪れないため予約しない */
  const pushAtElapsed = (elapsedSec: number, content: Content) => {
    const fireMs = baseMs + elapsedSec * 1000;
    if (fireMs >= autoEndMs) return;
    pushAt(fireMs, content);
  };

  if (isPomodoro && layout.workSec > 0 && layout.loops >= 1) {
    // 構成は「作業 →（休憩 → 作業）× (n−1)」。境界は各ループの作業終わり（→休憩）と
    // 休憩終わり（→作業）の2つで、最後の作業の後に休憩は無い（要件3.1）
    const breakMinutes = session.pomodoro_break_minutes ?? 0;
    if (breakMinutes > 0) {
      for (let k = 0; k < layout.loops - 1; k++) {
        pushAtElapsed(k * layout.cycleSec + layout.workSec, toBreakContent(breakMinutes));
        pushAtElapsed((k + 1) * layout.cycleSec, toWorkContent());
      }
    }
    // 最後の作業フェーズの終わり ＝ 全ループ完了
    pushAtElapsed(layout.totalSec, completedContent());
  }

  // --- 目標到達（一日の学習目標時間に届いた時刻） ---
  //
  // 休憩提案の基準（break_suggest_threshold_minutes）は使わない（要件12章）。
  // 同基準は「今回の予定学習時間を終えるまで割り込まない」設計のためポモドーロでは
  // セッション中にほぼ到達せず、継続・延長で動くため目標とも呼べない値になる。
  // 目標達成の判定・経験値の付与（6.2）と同じ基準に揃える。
  if (goalMinutes > 0) {
    // 目標は「その学習日の実績合計」に対するもの。保存済みぶんを差し引いた残りを、
    // 進行中のセッションで積む必要がある。実績は分（切り捨て）で判定される
    const neededSec = Math.max(0, goalMinutes - savedMinutes) * 60;
    const elapsedAtGoal = isPomodoro
      ? elapsedAtActual(layout, neededSec)
      : neededSec; // 黙々モードは実績＝経過
    if (elapsedAtGoal !== null) {
      pushAtElapsed(elapsedAtGoal, goalReachedContent());
    }
  }

  // --- 5:00自動終了（要件3.2） ---
  // ポモドーロの全ループ完了が先に来るなら、5:00 は訪れない
  const endsBefore5 =
    isPomodoro && layout.loops >= 1 && baseMs + layout.totalSec * 1000 <= autoEndMs;
  if (!endsBefore5) pushAt(autoEndMs, autoEndContent());

  return notices.sort((a, b) => a.fireAt.getTime() - b.fireAt.getTime());
}
