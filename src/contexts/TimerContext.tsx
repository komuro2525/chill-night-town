import { createContext, ReactNode, useContext, useMemo, useState } from "react";

// Phase 0: 状態の「形」だけを確定させる骨組み。
// 実際の計測ロジック（開始・一時停止・再開・終了、時刻差分算出、
// ポモドーロのフェーズ進行、5:00自動終了、中断復元）は Phase 3 で実装する。
// 計測状態は active_session（DB）を正とし、ここではその読み出し状態を保持する想定。
export type TimerStatus = "idle" | "running" | "paused";

type TimerState = {
  status: TimerStatus;
  // Phase 3 で追加: 経過秒・現在フェーズ・予定/実績・休憩提案基準 など
};

type TimerContextValue = {
  state: TimerState;
  // Phase 3 で追加: start / pause / resume / finish / collapse などのメソッド
};

const TimerContext = createContext<TimerContextValue | null>(null);

export function TimerProvider({ children }: { children: ReactNode }) {
  // setState は Phase 3 で使用する。骨組み段階では lint 警告を避けるため受け取らない
  const [state] = useState<TimerState>({ status: "idle" });

  const value = useMemo<TimerContextValue>(() => ({ state }), [state]);

  return (
    <TimerContext.Provider value={value}>{children}</TimerContext.Provider>
  );
}

export function useTimer() {
  const ctx = useContext(TimerContext);
  if (!ctx) throw new Error("useTimer は TimerProvider の内側で使うこと");
  return ctx;
}
