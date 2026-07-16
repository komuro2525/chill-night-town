import {
  createContext,
  ReactNode,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

import { getDatabase } from "@/db/database";
import { settingsRepo, userRepo } from "@/db/repositories";
import type { AudioSetting, NotificationSetting, User } from "@/db/types";

// Phase 0: DBからユーザー・設定を読み込んで配布する骨組み。
// 各設定の変更メソッド（10章）は該当Phaseで追加する。
type SettingsState = {
  /** DB初期化＋初回読み込みが完了したか */
  ready: boolean;
  /** 未作成（初期設定前）は null */
  user: User | null;
  audioSetting: AudioSetting | null;
  notificationSetting: NotificationSetting | null;
};

type SettingsContextValue = SettingsState & {
  /** DBから設定を再読み込みする（初期設定完了後・各設定変更後に呼ぶ想定） */
  reload: () => Promise<void>;
};

const SettingsContext = createContext<SettingsContextValue | null>(null);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<SettingsState>({
    ready: false,
    user: null,
    audioSetting: null,
    notificationSetting: null,
  });

  const reload = useMemo(
    () => async () => {
      await getDatabase(); // 初期化を保証（冪等）
      const [user, audioSetting, notificationSetting] = await Promise.all([
        userRepo.getUser(),
        settingsRepo.getAudioSetting(),
        settingsRepo.getNotificationSetting(),
      ]);
      setState({ ready: true, user, audioSetting, notificationSetting });
    },
    [],
  );

  useEffect(() => {
    reload().catch((e) => {
      console.error("設定の読み込みに失敗しました", e);
      setState((prev) => ({ ...prev, ready: true }));
    });
  }, [reload]);

  const value = useMemo<SettingsContextValue>(
    () => ({ ...state, reload }),
    [state, reload],
  );

  return (
    <SettingsContext.Provider value={value}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error("useSettings は SettingsProvider の内側で使うこと");
  return ctx;
}
