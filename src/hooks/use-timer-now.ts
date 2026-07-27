import { useEffect, useState } from "react";

import type { ActiveSession } from "@/db/types";
import { nowMs } from "@/lib/clock";
import { msUntilNextElapsedTick } from "@/lib/timer";

/**
 * 計測表示（経過・実績学習時間）用の現在時刻フック。
 *
 * useAppNow(1000) の固定間隔だと tick の位相が経過の秒境界とズレ、「数字が切り替わる瞬間に
 * 一時停止すると1秒進む／再開で1秒戻る」表示ズレが起きる。ここでは次の秒境界に合わせて
 * 更新することで、表示が常に正確な経過秒と一致する。
 *
 * さらに session が変わった瞬間（一時停止/再開の楽観更新）には即座に now を採り直すため、
 * 押した値がそのまま表示に出る（tick 待ちで古い値が残らない）。
 */
export function useTimerNow(session: ActiveSession | null): number {
  const [now, setNow] = useState(() => nowMs());

  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    let id: ReturnType<typeof setTimeout>;
    const step = () => {
      if (cancelled) return;
      const t = nowMs();
      setNow(t);
      id = setTimeout(step, msUntilNextElapsedTick(session, t));
    };
    step(); // session 変化時に即再サンプル＋次の境界へ再スケジュール
    return () => {
      cancelled = true;
      clearTimeout(id);
    };
  }, [session]);

  return now;
}
