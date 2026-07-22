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
import {
  getAmbientSource,
  getBgmSource,
  getSfxSource,
  type SfxKey,
} from "@/constants/audioAssets";
import { masterRepo, settingsRepo } from "@/db/repositories";
import type { AmbientSound } from "@/db/types";
import { selectAmbientCode } from "@/lib/ambient-select";
import {
  duckedVolume,
  isMuted,
  nextTrackIndex,
  shuffle,
  toPlayerVolume,
} from "@/lib/audio";

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

  // --- BGM（要件9 / UC 9.2）。ミニプレイヤーが参照・操作する ---
  /** 再生中のBGM（曲名・クレジット表示用。プール無し・BGM音量0のときは null） */
  bgmTrack: AmbientSound | null;
  /** BGMが鳴っているか（一時停止・BGM音量0なら false）。再生/一時停止アイコンの出し分けに使う */
  bgmPlaying: boolean;
  /** BGMの一時停止／再開（対象はBGMのみ。環境音・効果音・鐘は対象外） */
  toggleBgm: () => void;
  /** 次の曲へ進む */
  skipBgm: () => void;
  /** 再生中の曲の頭に戻す（前の曲へは戻らない） */
  restartBgm: () => void;

  // --- 環境音（要件9 / UC 9.1） ---
  /**
   * その夜の天気に応じた環境音へ切り替える（要件9）。
   * 天気コード（未選択は null）を渡すと、対応する環境音をループ再生する。
   * 対応する音が無い・環境音の音量が0のときは停止する（ニュートラルな夜）。
   */
  setAmbientForWeather: (weatherCode: string | null) => void;
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
  // ミニプレイヤーの表示用（要件9）。再生中の曲と、鳴っているかどうか
  const [bgmTrack, setBgmTrack] = useState<AmbientSound | null>(null);
  const [bgmPlaying, setBgmPlaying] = useState(false);

  // 使い捨ての効果音プレイヤー。鳴らすたびに作ると重いため、用途ごとに使い回す
  const sfxPlayers = useRef(new Map<SfxKey, AudioPlayer>());
  // ダッキング中に元の音量へ戻すためのタイマー
  const duckTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // BGM・環境音のプレイヤー（環境音は 7-4 で設定する）。ダッキングの対象
  const bgmPlayer = useRef<AudioPlayer | null>(null);
  const ambientPlayer = useRef<AudioPlayer | null>(null);
  // 最新の音量を同期的に参照する（コールバック内で古い値を掴まないため）
  const volumesRef = useRef<Volumes>(DEFAULT_VOLUMES);
  volumesRef.current = volumes;

  // BGMプール（シャッフル済み）と現在の位置（要件9: シャッフル再生・曲送り）
  const bgmPoolRef = useRef<AmbientSound[]>([]);
  const bgmIndexRef = useRef(0);
  // ユーザーが明示的に一時停止したか。音量0による停止と区別し、
  // 音量が戻ったときに勝手に再開しない（ユーザーの意図を尊重する）
  const bgmUserPausedRef = useRef(false);
  // 進行中のフェードを止めるためのタイマー
  const fadeTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  // 環境音（要件9）。天気が「鳴らしたい」環境音コードと、いま実際に鳴っているコード。
  // 音量0で止めても desired は保持し、音量が戻ったら同じ環境音を鳴らし直せるようにする
  const desiredAmbientCodeRef = useRef<string | null>(null);
  const playingAmbientCodeRef = useRef<string | null>(null);

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

  // プレイヤーは画面を離れても使い回すが、アプリ終了時には解放する。
  // bgm/ambient は命令的に生成する音源（Reactが描画するノードではない）で、
  // アンマウント時点で存在するプレイヤーを解放したい。ref.current を cleanup で
  // 読むのは意図どおりのため、当該の hooks 警告は抑制する。
  useEffect(() => {
    const players = sfxPlayers.current;
    return () => {
      if (duckTimer.current) clearTimeout(duckTimer.current);
      if (fadeTimer.current) clearInterval(fadeTimer.current);
      players.forEach((p) => p.remove());
      players.clear();
      bgmPlayer.current?.remove();
      ambientPlayer.current?.remove();
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

  // --- BGM（要件9 / UC 9.2） ---

  // プレイヤーの音量を target へ durationMs かけて動かす（フェード）。
  // 「急に鳴らさない」（要件9）を満たすための時間駆動処理のため純関数にはしない。
  const fadeTo = useCallback(
    (player: AudioPlayer, target: number, durationMs: number) => {
      if (fadeTimer.current) clearInterval(fadeTimer.current);
      const steps = Math.max(1, Math.round(durationMs / AUDIO.FADE_STEP_MS));
      const start = player.volume;
      let i = 0;
      fadeTimer.current = setInterval(() => {
        i += 1;
        try {
          player.volume = start + (target - start) * (i / steps);
        } catch {
          // 途中でプレイヤーが解放された場合は黙って止める
          if (fadeTimer.current) clearInterval(fadeTimer.current);
          fadeTimer.current = null;
          return;
        }
        if (i >= steps) {
          if (fadeTimer.current) clearInterval(fadeTimer.current);
          fadeTimer.current = null;
        }
      }, AUDIO.FADE_STEP_MS);
    },
    [],
  );

  // 曲終了時に次の曲へ進む処理。playTrackAt と相互参照になるため ref 越しに呼ぶ
  const advanceRef = useRef<() => void>(() => {});

  /**
   * シャッフル済みプールの index の曲を再生する。
   * 初回自動再生のみ fade=true（フェードイン）。曲送り・スキップは fade=false。
   */
  const playTrackAt = useCallback(
    (index: number, fade: boolean) => {
      const pool = bgmPoolRef.current;
      if (pool.length === 0) return;
      const track = pool[index];
      const source = getBgmSource(track.code);
      if (!source) return; // プールは登録済みの音源だけで作るため通常ここは通らない

      bgmIndexRef.current = index;
      const target = toPlayerVolume(volumesRef.current.bgm);

      let player = bgmPlayer.current;
      if (!player) {
        player = createAudioPlayer(source);
        bgmPlayer.current = player;
        // 曲が最後まで再生されたら自動で次の曲へ（要件9）
        player.addListener("playbackStatusUpdate", (status) => {
          if (status.didJustFinish) advanceRef.current();
        });
      } else {
        player.replace(source);
      }
      player.volume = fade ? 0 : target;
      player.play();
      setBgmTrack(track);
      setBgmPlaying(true);
      if (fade) fadeTo(player, target, AUDIO.FADE_IN_MS);
    },
    [fadeTo],
  );

  advanceRef.current = () => {
    const pool = bgmPoolRef.current;
    if (pool.length === 0) return;
    playTrackAt(nextTrackIndex(bgmIndexRef.current, pool.length), false);
  };

  /** BGMを（まだ始まっていなければ）フェードインで自動再生する（要件9） */
  const startBgm = useCallback(() => {
    if (bgmPlayer.current) return; // 既に開始済み
    if (isMuted(volumesRef.current.bgm)) return; // 音量0は再生処理自体を行わない
    if (bgmPoolRef.current.length === 0) return;
    bgmUserPausedRef.current = false;
    playTrackAt(0, true); // シャッフル済みプールの先頭から
  }, [playTrackAt]);

  const toggleBgm = useCallback(() => {
    const player = bgmPlayer.current;
    if (!player) {
      startBgm(); // 起動時に音量0で未開始だった場合はここで開始
      return;
    }
    if (player.playing) {
      bgmUserPausedRef.current = true;
      player.pause();
      setBgmPlaying(false);
    } else {
      bgmUserPausedRef.current = false;
      player.volume = toPlayerVolume(volumesRef.current.bgm);
      player.play();
      setBgmPlaying(true);
    }
  }, [startBgm]);

  const skipBgm = useCallback(() => {
    if (bgmPoolRef.current.length === 0) return;
    if (!bgmPlayer.current) {
      startBgm();
      return;
    }
    bgmUserPausedRef.current = false;
    playTrackAt(
      nextTrackIndex(bgmIndexRef.current, bgmPoolRef.current.length),
      false,
    );
  }, [playTrackAt, startBgm]);

  const restartBgm = useCallback(() => {
    bgmPlayer.current
      ?.seekTo(0)
      .catch((e) => console.error("BGMの頭出しに失敗しました", e));
  }, []);

  // --- 環境音（要件9 / UC 9.1） ---

  // 「鳴らしたい環境音」と現在の音量から、実際の再生を合わせる。
  // 環境音は天気演出の一部としてループし続ける（一時停止のUIは持たない。要件9）。
  const applyAmbient = useCallback(() => {
    const code = desiredAmbientCodeRef.current;
    const source = code ? getAmbientSource(code) : undefined;
    const volume = volumesRef.current.ambient;

    // 対応する音が無い・音量0のときは鳴らさない（要件9: 未対応はニュートラルな夜）
    if (!source || isMuted(volume)) {
      if (ambientPlayer.current) ambientPlayer.current.pause();
      playingAmbientCodeRef.current = null;
      return;
    }

    // 既に同じ環境音が鳴っているなら音量だけ合わせる（鳴らし直さない）
    if (playingAmbientCodeRef.current === code && ambientPlayer.current) {
      ambientPlayer.current.volume = toPlayerVolume(volume);
      if (!ambientPlayer.current.playing) ambientPlayer.current.play();
      return;
    }

    let player = ambientPlayer.current;
    if (!player) {
      player = createAudioPlayer(source);
      ambientPlayer.current = player;
    } else {
      player.replace(source);
    }
    player.loop = true;
    player.volume = toPlayerVolume(volume);
    player.play();
    playingAmbientCodeRef.current = code;
  }, []);

  const setAmbientForWeather = useCallback(
    (weatherCode: string | null) => {
      desiredAmbientCodeRef.current = selectAmbientCode(weatherCode);
      applyAmbient();
    },
    [applyAmbient],
  );

  // BGMプールを読み込み、フェードインで自動再生する（要件9: 初回表示と同時に）。
  // 音源が登録されている曲だけをプールに入れる（未登録はスキップ対象にしない）
  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    (async () => {
      try {
        const tracks = await masterRepo.getBgmTracks();
        const playable = tracks.filter((t) => getBgmSource(t.code));
        if (cancelled) return;
        bgmPoolRef.current = shuffle(playable);
        bgmIndexRef.current = 0;
        startBgm();
      } catch (e) {
        console.error("BGMプールの読み込みに失敗しました", e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [ready, startBgm]);

  const setVolume = useCallback(
    async (category: SoundCategory, value: number) => {
      const next = { ...volumesRef.current, [category]: value };
      // 先に画面へ反映してから保存する（つまみの追従を優先）
      volumesRef.current = next;
      setVolumes(next);

      // 再生中の音へ即座に反映する
      if (category === "bgm") {
        if (bgmPlayer.current) bgmPlayer.current.volume = toPlayerVolume(value);
        if (isMuted(value)) {
          // 音量0は再生処理自体を行わない（要件9）。一時停止してミニプレイヤーも消す
          if (bgmPlayer.current) bgmPlayer.current.pause();
          setBgmPlaying(false);
        } else if (!bgmUserPausedRef.current) {
          // 0から戻した: ユーザーが自分で止めていなければ再生を復帰（未開始なら開始）
          if (bgmPlayer.current) {
            bgmPlayer.current.play();
            setBgmPlaying(true);
          } else {
            startBgm();
          }
        }
      }
      if (category === "ambient") {
        // 0への変更で停止、0から戻すと同じ環境音を鳴らし直す（要件9）。
        // desired（天気で決まる鳴らしたい音）は保持したまま再生だけ合わせる
        applyAmbient();
      }

      try {
        await settingsRepo.updateAudioVolumes(next);
      } catch (e) {
        console.error("音量設定の保存に失敗しました", e);
      }
    },
    [startBgm, applyAmbient],
  );

  const value = useMemo<AudioContextValue>(
    () => ({
      ready,
      volumes,
      setVolume,
      playPreview,
      playSfx,
      playBell,
      bgmTrack,
      bgmPlaying,
      toggleBgm,
      skipBgm,
      restartBgm,
      setAmbientForWeather,
    }),
    [
      ready,
      volumes,
      setVolume,
      playPreview,
      playSfx,
      playBell,
      bgmTrack,
      bgmPlaying,
      toggleBgm,
      skipBgm,
      restartBgm,
      setAmbientForWeather,
    ],
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
