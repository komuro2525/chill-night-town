import { createContext, ReactNode, useContext, useState } from "react";

type TimerState = {
  isRunning: boolean;
  // 後で: 経過時間、モード、フェーズ、一時停止時刻など
};

type TimerContextValue = {
  state: TimerState;
  // 後で: start, pause, resume, finish などのメソッド
};

const TimerContext = createContext<TimerContextValue | null>(null);

export function TimerProvider({ children }: { children: ReactNode }) {
  // setStateは実装時に使用する。雛形段階ではlint警告を避けるため受け取らない
  const [state] = useState<TimerState>({ isRunning: false });
  return (
    <TimerContext.Provider value={{ state }}>{children}</TimerContext.Provider>
  );
}

export function useTimer() {
  const ctx = useContext(TimerContext);
  if (!ctx) throw new Error("useTimer は TimerProvider の内側で使うこと");
  return ctx;
}
