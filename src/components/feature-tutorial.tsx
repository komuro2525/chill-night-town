import { useState } from "react";

import { getTutorialPage } from "@/constants/tutorial";
import { useSettings } from "@/contexts/SettingsContext";
import { userRepo } from "@/db/repositories";
import { TutorialOverlay } from "./tutorial-overlay";

// 機能ごとの初回説明。初めてその画面/操作に触れたとき一度だけ、その機能の1ページを出す。
// 例: 初めてカレンダー画面に入ったら「カレンダーでふりかえる」を表示 → 閉じたら既読にする。
// 対象の画面に <FeatureTutorial featureKey="calendar" /> を置くだけで機能する。
export function FeatureTutorial({ featureKey }: { featureKey: string }) {
  const { ready, user, reload } = useSettings();
  const [closed, setClosed] = useState(false);

  const page = getTutorialPage(featureKey);
  const seen = (user?.tutorial_seen_features ?? "").split(",").filter(Boolean);
  const visible =
    ready &&
    user !== null &&
    page !== undefined &&
    !seen.includes(featureKey) &&
    !closed;

  async function handleClose() {
    setClosed(true);
    try {
      await userRepo.markFeatureTutorialSeen(featureKey);
      await reload();
    } catch (e) {
      // 失敗しても次回また出るだけなので、ユーザーを妨げない
      console.error("機能説明の既読記録に失敗しました", e);
    }
  }

  if (!page) return null;
  return (
    <TutorialOverlay visible={visible} pages={[page]} onClose={handleClose} />
  );
}
