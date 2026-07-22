import { useEffect, useRef } from "react";

import type { ActiveSession } from "@/db/types";
import { useAppNow } from "@/lib/clock";
import { getElapsedSeconds, getPomodoroPhase } from "@/lib/timer";

// ポモドーロのフェーズ切替の見張り（要件3.1）。
//
// 作業⇄休憩の境目を検知して、鐘とは別の控えめな効果音を1回鳴らす。
// 判定は src/lib/timer.ts の純関数に委ね、ここは「フェーズの変化を見て一度だけ呼ぶ」
// ことだけを担う。全ループ完了（終了演出＝鐘）では鳴らさない。
//
// 描画を持たないのは、useAppNow の毎秒更新をこの部品に閉じ込め、
// ホーム画面全体を毎秒再描画させないため（AutoFinishWatcher と同じ方針）。

/** フェーズの識別子。種類とループ番号が変わったら「切り替わった」とみなす */
function phaseKey(session: ActiveSession, atMs: number): string {
  const phase = getPomodoroPhase(session, getElapsedSeconds(session, atMs));
  return `${phase.kind}-${phase.loop}-${phase.completed ? "done" : "on"}`;
}

export function PomodoroPhaseWatcher({
  session,
  onPhaseChange,
}: {
  session: ActiveSession;
  /** 作業⇄休憩が切り替わった時に呼ぶ（効果音の再生に使う） */
  onPhaseChange: () => void;
}) {
  const now = useAppNow(1000);
  // 直前のフェーズ。初期値は現在フェーズにしておき、開始直後には鳴らさない
  const prevKey = useRef<string | null>(null);

  useEffect(() => {
    const key = phaseKey(session, now.getTime());
    // 初回（マウント直後）は基準を記録するだけで鳴らさない
    if (prevKey.current === null) {
      prevKey.current = key;
      return;
    }
    if (key === prevKey.current) return;

    const prev = prevKey.current;
    prevKey.current = key;

    // 全ループ完了への遷移は終了演出（鐘）に任せ、ここでは鳴らさない
    if (key.endsWith("-done")) return;
    // 念のため、完了フェーズから抜ける方向（通常は起きない）も鳴らさない
    if (prev.endsWith("-done")) return;

    onPhaseChange();
  }, [session, now, onPhaseChange]);

  return null;
}
