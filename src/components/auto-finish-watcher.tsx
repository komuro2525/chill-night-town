import { useEffect, useRef } from "react";

import type { ActiveSession } from "@/db/types";
import { useAppNow } from "@/lib/clock";
import { shouldAutoFinish } from "@/lib/timer";

// 自動終了の見張り（要件3.2）。
//
// 次の2つを検知して終了処理へ移す:
//   - 翌5:00 への到達（一時停止中も含む）。実績は5:00までとする
//   - ポモドーロの全ループ完了（最後の作業フェーズの完了）
//
// 計測中のみマウントする。判定は src/lib/timer.ts の純関数に委ね、
// ここは「時刻の変化を見て一度だけ呼ぶ」ことだけを担う。
//
// 描画を持たないコンポーネントにしているのは、useAppNow() の1秒ごとの更新を
// この小さな部品に閉じ込め、ホーム画面全体を毎秒再描画させないため。

export function AutoFinishWatcher({
  session,
  onAutoFinish,
}: {
  session: ActiveSession;
  onAutoFinish: () => void;
}) {
  const now = useAppNow(1000);
  // 終了処理は非同期のため、完了するまでに次の tick が来る。二重に呼ばない
  const firedRef = useRef(false);

  useEffect(() => {
    if (firedRef.current) return;
    if (!shouldAutoFinish(session, now.getTime())) return;
    firedRef.current = true;
    onAutoFinish();
  }, [session, now, onAutoFinish]);

  return null;
}
