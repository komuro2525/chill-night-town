import { useEffect } from "react";

import type { ActiveSession } from "@/db/types";
import { shouldSuggestBreak } from "@/lib/break-suggestion";
import { useAppNow } from "@/lib/clock";

// 休憩提案の見張り（要件5.1）。
//
// 計測中のみマウントする。判定は src/lib/break-suggestion.ts の純関数に委ね、
// ここは「時刻の変化を見て呼ぶ」ことだけを担う。
//
// 一度出したかどうかの状態は持たない。表示するかどうかは
// active_session.break_suggest_threshold_minutes（次に提案する基準）だけで決まり、
// 「継続する」「延長宣言」で基準を引き上げれば自然に出なくなるため。
//
// 描画を持たないのは、1秒ごとの更新をこの部品に閉じ込め、
// ホーム画面全体を毎秒再描画させないため。

export function BreakSuggestionWatcher({
  session,
  savedMinutes,
  enabled,
  suppressed,
  onSuggest,
}: {
  session: ActiveSession;
  /** その学習日の保存済み実績合計（分） */
  savedMinutes: number;
  /** 頑張りすぎ防止の設定（10.6）。OFFなら動作しない */
  enabled: boolean;
  /** 既に提案を表示中などで、重ねて出したくないとき */
  suppressed: boolean;
  onSuggest: () => void;
}) {
  const now = useAppNow(1000);

  useEffect(() => {
    if (suppressed) return;
    if (!shouldSuggestBreak(session, savedMinutes, now.getTime(), enabled)) return;
    onSuggest();
  }, [session, savedMinutes, enabled, suppressed, now, onSuggest]);

  return null;
}
