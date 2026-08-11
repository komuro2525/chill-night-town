import {
  createContext,
  ReactNode,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

import { getDatabase } from "@/db/database";
import {
  masterRepo,
  settingsRepo,
  townProgressRepo,
  userRepo,
} from "@/db/repositories";
import type { SelectedTown } from "@/db/repositories/townProgressRepo";
import type { AudioSetting, Npc, NotificationSetting, User } from "@/db/types";

// Phase 0: DBからユーザー・設定を読み込んで配布する骨組み。
// 各設定の変更メソッド（10章）は該当Phaseで追加する。
type SettingsState = {
  /** DB初期化＋初回読み込みが完了したか */
  ready: boolean;
  /** 未作成（初期設定前）は null */
  user: User | null;
  audioSetting: AudioSetting | null;
  notificationSetting: NotificationSetting | null;
  /** 選択中の街と育成進捗。街選択画面（S9）での変更もここを通して各画面へ配る */
  selectedTown: SelectedTown | null;
  /** 選択中の街に住んでいる住人の一覧（要件7.1）。先頭がその街の既定。設定10.12で選ぶ */
  townNpcs: Npc[];
  /** そのうち実際に語る住人（選択があればその人、無ければ既定）。未登録の街は null */
  townNpc: Npc | null;
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
    selectedTown: null,
    townNpcs: [],
    townNpc: null,
  });

  const reload = useMemo(
    () => async () => {
      await getDatabase(); // 初期化を保証（冪等）
      const [user, audioSetting, notificationSetting, selectedTown] =
        await Promise.all([
          userRepo.getUser(),
          settingsRepo.getAudioSetting(),
          settingsRepo.getNotificationSetting(),
          townProgressRepo.getSelectedTown(),
        ]);
      // 住人は街に紐づくため、街が決まってから引く（要件7.1）。
      // 語り手はその街での選択（town_progress.selected_npc_id）で決まり、無ければ既定＝先頭
      const townNpcs = selectedTown
        ? await masterRepo.getNpcsByTown(selectedTown.town.id)
        : [];
      const townNpc = masterRepo.resolveTownNpc(
        townNpcs,
        selectedTown?.progress.selected_npc_id ?? null,
      );
      setState({
        ready: true,
        user,
        audioSetting,
        notificationSetting,
        selectedTown,
        townNpcs,
        townNpc,
      });
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
