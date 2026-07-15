import { createContext, ReactNode, useContext, useState } from "react";

type AudioState = {
  isPlaying: boolean;
  // 後で: 現在のBGM、音量、ミュート状態など
};

type AudioContextValue = {
  state: AudioState;
  // 後で: play, pause, setVolume, duck などのメソッド
};

const AudioContext = createContext<AudioContextValue | null>(null);

export function AudioProvider({ children }: { children: ReactNode }) {
  // setStateは実装時に使用する。雛形段階ではlint警告を避けるため受け取らない
  const [state] = useState<AudioState>({ isPlaying: false });
  return (
    <AudioContext.Provider value={{ state }}>{children}</AudioContext.Provider>
  );
}

export function useAudio() {
  const ctx = useContext(AudioContext);
  if (!ctx) throw new Error("useAudio は AudioProvider の内側で使うこと");
  return ctx;
}
