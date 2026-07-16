import { useEffect, useState } from "react";

/** 一定間隔で現在時刻を更新して返す（時計・日付表示の更新に使う） */
export function useNow(intervalMs = 10000): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}
