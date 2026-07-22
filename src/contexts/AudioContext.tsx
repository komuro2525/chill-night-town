import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from "expo-audio";
import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { AUDIO } from "@/constants/domain";
import { getSfxSource, type SfxKey } from "@/constants/audioAssets";
import { settingsRepo } from "@/db/repositories";
import { duckedVolume, isMuted, toPlayerVolume } from "@/lib/audio";

// アプリの音を一手に引き受けるContext（要件9）。
//
// 音は4分類（BGM・環境音・効果音・鐘の音）で、それぞれ0〜100の音量を持つ（要件9 / 10.4）。
// 音量の正はDB（audio_setting）で、本Contextはそれを読み出して再生へ反映する。
//
// 本Contextが守る要件上のルール:
//   ・**音量0の分類は再生処理自体を行わない**（要件9）。volume=0 で鳴らし続けるのではなく、
//     そもそも再生しない。判定は src/lib/audio.ts の isMuted() 1か所に寄せる
//   ・鐘の再生中はBGM・環境音を下げる（ダッキング。要件3.3）
//   ・BGMは急に鳴らさず、フェードインで静かに始める（要件9）
//
// 再生そのものは expo-audio の命令的API（createAudioPlayer）で行う。プレイヤーは
// 使い回すため ref で保持し、Reactの再描画とは切り離す（音は描画に従属しない）。
// BGMのプール管理・曲送りは 7-2 で本Contextへ追加する。

/** 音の4分類（要件9）。audio_setting の各列に対応する */
export type SoundCategory = "bgm" | "ambient" | "sfx" | "bell";

/** 4分類の音量（各0〜100） */
export type Volumes = Record<SoundCategory, number>;

const DEFAULT_VOLUMES: Volumes = {
  bgm: AUDIO.VOLUME_DEFAULT,
  ambient: AUDIO.VOLUME_DEFAULT,
  sfx: AUDIO.VOLUME_DEFAULT,
  bell: AUDIO.VOLUME_DEFAULT,
};

type AudioContextValue = {
  /** DBからの初回読み込みが完了したか */
  ready: boolean;
  /** 4分類の音量（0〜100） */
  volumes: Volumes;
  /** 音量を保存して即座に再生へ反映する（10.4） */
  setVolume: (category: SoundCategory, value: number) => Promise<void>;
  /** その分類の音を1回鳴らす（音量プレビュー用。10.4 ステップ2） */
  playPreview: (category: SoundCategory) => void;
  /** 効果音を1回鳴らす（音量0なら何もしない） */
  playSfx: (key: SfxKey) => void;
  /**
   * 終了演出の鐘を鳴らす（要件3.3）。再生中はBGM・環境音を下げ、終了後に戻す。
   * 鐘の音量が0のときは何もしない（演出表示のみ進める）。
   */
  playBell: () => void;
};

const AudioContext = createContext<AudioContextValue | null>(null);

/**
 * プレビューに使う音（要件10.4: 変更した音量が分かるように鳴らす）。
 *
 * BGM・環境音は素材が長尺で頭出しでは分かりにくいため、短い音で代用する。
 * TODO(素材): UI操作音（ui_tap）が用意できたら、鐘以外はそちらへ差し替える。
 *   いまは仮素材の goal_reached を短い代表音として使っている。
 */
const PREVIEW_SFX: Record<SoundCategory, SfxKey> = {
  bgm: "goal_reached",
  ambient: "goal_reached",
  sfx: "goal_reached",
  bell: "bell",
};

export function AudioProvider({ children }: { children: ReactNode }) {
  const [volumes, setVolumes] = useState<Volumes>(DEFAULT_VOLUMES);
  const [ready, setReady] = useState(false);

  // 使い捨ての効果音プレイヤー。鳴らすたびに作ると重いため、用途ごとに使い回す
  const sfxPlayers = useRef(new Map<SfxKey, AudioPlayer>());
  // ダッキング中に元の音量へ戻すためのタイマー
  const duckTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // BGM・環境音のプレイヤー（7-2 / 7-4 で設定する）。ダッキングの対象
  const bgmPlayer = useRef<AudioPlayer | null>(null);
  const ambientPlayer = useRef<AudioPlayer | null>(null);
  // 最新の音量を同期的に参照する（コールバック内で古い値を掴まないため）
  const volumesRef = useRef<Volumes>(DEFAULT_VOLUMES);
  volumesRef.current = volumes;

  // 無音モードでも音が出るようにし、他アプリの音を止めない設定にする
  useEffect(() => {
    setAudioModeAsync({
      playsInSilentMode: true,
      shouldPlayInBackground: false,
      interruptionMode: "mixWithOthers",
    }).catch((e) => console.error("オーディオモードの設定に失敗しました", e));
  }, []);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const setting = await settingsRepo.getAudioSetting();
        if (!mounted) return;
        if (setting) {
          setVolumes({
            bgm: setting.bgm_volume,
            ambient: setting.ambient_volume,
            sfx: setting.sfx_volume,
            bell: setting.bell_volume,
          });
        }
      } catch (e) {
        console.error("音量設定の読み込みに失敗しました", e);
      } finally {
        if (mounted) setReady(true);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  // プレイヤーは画面を離れても使い回すが、アプリ終了時には解放する
  useEffect(() => {
    const players = sfxPlayers.current;
    return () => {
      if (duckTimer.current) clearTimeout(duckTimer.current);
      players.forEach((p) => p.remove());
      players.clear();
    };
  }, []);

  /** 用途ごとのプレイヤーを用意する（未制作の音源なら null） */
  const getSfxPlayer = useCallback((key: SfxKey): AudioPlayer | null => {
    const existing = sfxPlayers.current.get(key);
    if (existing) return existing;

    const source = getSfxSource(key);
    // 素材が未制作の音は登録されていない。その場合は鳴らさない
    if (!source) return null;

    const player = createAudioPlayer(source);
    sfxPlayers.current.set(key, player);
    return player;
  }, []);

  /** 指定音量で1回鳴らす。音量0なら再生処理自体を行わない（要件9） */
  const playOnce = useCallback(
    (key: SfxKey, settingVolume: number) => {
      if (isMuted(settingVolume)) return;
      const player = getSfxPlayer(key);
      if (!player) return;
      player.volume = toPlayerVolume(settingVolume);
      // 前回の再生位置が末尾のままだと鳴らないため、毎回頭へ戻してから再生する
      player
        .seekTo(0)
        .then(() => player.play())
        .catch((e) => console.error("効果音の再生に失敗しました", e));
    },
    [getSfxPlayer],
  );

  const playSfx = useCallback(
    (key: SfxKey) => playOnce(key, volumesRef.current.sfx),
    [playOnce],
  );

  /** BGM・環境音の音量を、いまの設定値に対する比率で一時的に変える（ダッキング） */
  const applyDucking = useCallback((ducking: boolean) => {
    const { bgm, ambient } = volumesRef.current;
    if (bgmPlayer.current) {
      bgmPlayer.current.volume = ducking
        ? duckedVolume(bgm)
        : toPlayerVolume(bgm);
    }
    if (ambientPlayer.current) {
      ambientPlayer.current.volume = ducking
        ? duckedVolume(ambient)
        : toPlayerVolume(ambient);
    }
  }, []);

  const playBell = useCallback(() => {
    const bellVolume = volumesRef.current.bell;
    // 鐘の音量が0なら演出表示のみ（音の処理は一切行わない。UC 3.3 備考）
    if (isMuted(bellVolume)) return;

    const player = getSfxPlayer("bell");
    if (!player) return;

    applyDucking(true);
    playOnce("bell", bellVolume);

    // 鐘の長さぶん下げてから戻す。duration が取れない場合に備えて既定値を用意する
    const durationMs =
      player.duration > 0 ? player.duration * 1000 : AUDIO.FADE_IN_MS;
    if (duckTimer.current) clearTimeout(duckTimer.current);
    duckTimer.current = setTimeout(() => applyDucking(false), durationMs);
  }, [applyDucking, getSfxPlayer, playOnce]);

  const playPreview = useCallback(
    (category: SoundCategory) => {
      playOnce(PREVIEW_SFX[category], volumesRef.current[category]);
    },
    [playOnce],
  );

  const setVolume = useCallback(
    async (category: SoundCategory, value: number) => {
      const next = { ...volumesRef.current, [category]: value };
      // 先に画面へ反映してから保存する（つまみの追従を優先）
      volumesRef.current = next;
      setVolumes(next);

      // 再生中の音へ即座に反映する
      if (category === "bgm" && bgmPlayer.current) {
        bgmPlayer.current.volume = toPlayerVolume(value);
      }
      if (category === "ambient" && ambientPlayer.current) {
        ambientPlayer.current.volume = toPlayerVolume(value);
      }

      try {
        await settingsRepo.updateAudioVolumes(next);
      } catch (e) {
        console.error("音量設定の保存に失敗しました", e);
      }
    },
    [],
  );

  const value = useMemo<AudioContextValue>(
    () => ({ ready, volumes, setVolume, playPreview, playSfx, playBell }),
    [ready, volumes, setVolume, playPreview, playSfx, playBell],
  );

  return (
    <AudioContext.Provider value={value}>{children}</AudioContext.Provider>
  );
}

export function useAudio() {
  const ctx = useContext(AudioContext);
  if (!ctx) throw new Error("useAudio は AudioProvider の内側で使うこと");
  return ctx;
}
