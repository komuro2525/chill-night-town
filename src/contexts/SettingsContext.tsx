import { createContext, ReactNode, useContext, useState } from "react";

type SettingsState = {
  // 後で: 目標時間、成長方式などの設定項目
};

type SettingsContextValue = {
  state: SettingsState;
  // 後で: 設定変更用のメソッド
};

const SettingsContext = createContext<SettingsContextValue | null>(null);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [state] = useState<SettingsState>({});
  return (
    <SettingsContext.Provider value={{ state }}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error("useSettings は SettingsProvider の内側で使うこと");
  return ctx;
}
