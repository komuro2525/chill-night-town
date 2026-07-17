import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

import { activeSessionRepo, sessionRepo } from "@/db/repositories";
import type { ActiveSession } from "@/db/types";
import { MIN_SAVE_MINUTES } from "@/constants/domain";
import { nowMs } from "@/lib/clock";
import { getActualStudyMinutes } from "@/lib/timer";

// 学習タイマーの状態と操作（要件3.2）。
//
// 計測状態の正は常に active_session（DB）。本Contextはその読み出しと操作を配るだけで、
// 経過時間を自前で数えることはしない（時刻差分方式。カウンター変数は持たない）。
// 開始・一時停止・再開のたびに即座にDBへ書くため、アプリが強制終了しても
// 直前の状態から復元できる。
//
// 表示の更新は各画面が useAppNow() で行い、経過時間は src/lib/timer.ts の
// 純関数で都度算出する。ここでは時間を保持しない。

export type TimerStatus = "idle" | "running" | "paused";

/** 終了操作の結果 */
export type FinishResult =
  /** 学習記録として保存した（実績1分以上） */
  | { kind: "saved"; sessionId: number; minutes: number }
  /** 実績1分未満のため保存せず破棄した（要件3.2） */
  | { kind: "discarded" };

type TimerContextValue = {
  /** DBからの初回読み込みが完了したか */
  ready: boolean;
  /** 計測中セッション（非計測時は null） */
  session: ActiveSession | null;
  status: TimerStatus;
  /** DBから計測状態を読み直す（開始直後・復元時に呼ぶ） */
  reload: () => Promise<void>;
  pause: () => Promise<void>;
  resume: () => Promise<void>;
  /** 終了する。実績1分未満なら保存せず破棄する */
  finish: () => Promise<FinishResult>;
};

const TimerContext = createContext<TimerContextValue | null>(null);

export function TimerProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<ActiveSession | null>(null);
  const [ready, setReady] = useState(false);

  const reload = useCallback(async () => {
    const s = await activeSessionRepo.getActiveSession();
    setSession(s);
    setReady(true);
  }, []);

  useEffect(() => {
    reload().catch((e) => {
      console.error("計測状態の読み込みに失敗しました", e);
      setReady(true);
    });
  }, [reload]);

  const pause = useCallback(async () => {
    await activeSessionRepo.pause(new Date(nowMs()).toISOString());
    await reload();
  }, [reload]);

  const resume = useCallback(async () => {
    await activeSessionRepo.resume(new Date(nowMs()).toISOString());
    await reload();
  }, [reload]);

  const finish = useCallback(async (): Promise<FinishResult> => {
    const current = await activeSessionRepo.getActiveSession();
    if (!current) return { kind: "discarded" };

    const at = nowMs();
    const minutes = getActualStudyMinutes(current, at);

    // 実績1分未満は保存せずに破棄する（要件3.2）。
    // 誤って開始してしまった場合、すぐ終了すれば記録が残らない
    if (minutes < MIN_SAVE_MINUTES) {
      await activeSessionRepo.remove();
      await reload();
      return { kind: "discarded" };
    }

    const sessionId = await sessionRepo.createFromActive(current, at);
    await reload();
    return { kind: "saved", sessionId, minutes };
  }, [reload]);

  const status: TimerStatus = !session
    ? "idle"
    : session.pause_started_at
      ? "paused"
      : "running";

  const value = useMemo<TimerContextValue>(
    () => ({ ready, session, status, reload, pause, resume, finish }),
    [ready, session, status, reload, pause, resume, finish],
  );

  return (
    <TimerContext.Provider value={value}>{children}</TimerContext.Provider>
  );
}

export function useTimer() {
  const ctx = useContext(TimerContext);
  if (!ctx) throw new Error("useTimer は TimerProvider の内側で使うこと");
  return ctx;
}
