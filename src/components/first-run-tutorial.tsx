import { useState } from "react";

import { FIRST_RUN_PAGES } from "@/constants/tutorial";
import { useSettings } from "@/contexts/SettingsContext";
import { userRepo } from "@/db/repositories";
import { TutorialOverlay } from "./tutorial-overlay";

// 初回チュートリアル（使い方）を初期設定の完了後に一度だけ出す。
// GrowthHintCard と同じ型で、user.tutorial_completed=0 のときだけ表示し、閉じたら永続化する。
// 設定「使い方」からの閲覧はこのフラグを立てない（TutorialOverlay を直接開く）。
export function FirstRunTutorial() {
  const { ready, user, reload } = useSettings();
  // 閉じた瞬間にDB更新の完了を待たず消すためのローカル状態
  const [closed, setClosed] = useState(false);

  const visible =
    ready && user !== null && user.tutorial_completed === 0 && !closed;

  async function handleClose() {
    setClosed(true);
    try {
      await userRepo.markTutorialCompleted();
      await reload();
    } catch (e) {
      // 失敗しても次回また表示されるだけなので、ユーザーを妨げない
      console.error("チュートリアル表示済みの記録に失敗しました", e);
    }
  }

  // 初回は「まず始めるのに要る最小限」だけ。他は各機能に初めて触れたときに出す（FeatureTutorial）
  return (
    <TutorialOverlay
      visible={visible}
      pages={FIRST_RUN_PAGES}
      onClose={handleClose}
    />
  );
}
