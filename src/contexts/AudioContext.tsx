import {
  createAudioPlayer,
  setAudioModeAsync,
  type AudioPlayer,
  type AudioStatus,
} from "expo-audio";
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
import { masterRepo, playlistRepo, settingsRepo, userRepo } from "@/db/repositories";
import type { AmbientSound, BgmSource } from "@/db/types";
import { selectAmbientCode } from "@/lib/ambient-select";
import {
  avoidImmediateRepeat,
  buildBgmQueue,
  duckedVolume,
  isMuted,
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
  /** 再生位置の進捗（0〜1）。ミニプレイヤーの再生バーに使う */
  bgmProgress: number;
  /** 再生位置（秒）。プレイリスト画面のシークバーの時間表示に使う */
  bgmPositionSec: number;
  /** 曲の長さ（秒）。0は未取得。プレイリスト画面のシークバーに使う */
  bgmDurationSec: number;
  /** アプリにBGMが1曲でもあるか。選択中ソースが空でもミニプレイヤー（＝入口）を残す判定に使う */
  bgmHasTracks: boolean;
  /** BGMの一時停止／再開（対象はBGMのみ。環境音・効果音・鐘は対象外） */
  toggleBgm: () => void;
  /** 次の曲へ進む */
  skipBgm: () => void;
  /** 再生中の曲の頭に戻す（前の曲へは戻らない） */
  restartBgm: () => void;
  /** 再生位置を秒で指定して移動する（シークバーのドラッグ確定時） */
  seekBgm: (sec: number) => void;
  /**
   * 現在の再生ソースを再生する（プレイリスト画面の再生ボタン）。
   * シャッフルONのときは並べ直してランダムな曲から始める。
   */
  startBgm: () => void;
  /** 一覧で選んだ曲を再生する（要件9: 曲をタップでその曲を流す） */
  playTrack: (trackId: number) => void;

  // --- プレイリスト（要件9・音楽プレイリスト）。プレイリスト画面が参照・操作する ---
  /** 再生ソース（all=登録曲全部 / favorites=お気に入り / playlist=マイプレイリスト） */
  bgmSource: BgmSource;
  /** シャッフル再生ON/OFF（全ソース共通。一巡するまで同じ曲は再生しない） */
  bgmShuffle: boolean;
  /** 1曲リピートON/OFF（ONで再生中の曲を繰り返す） */
  bgmRepeatOne: boolean;
  /** 再生ソースを切り替えて保存し、キューを組み直す */
  setBgmSource: (source: BgmSource) => Promise<void>;
  /** シャッフルON/OFFを切り替えて保存し、キューを組み直す */
  setBgmShuffle: (on: boolean) => Promise<void>;
  /** 1曲リピートON/OFFを切り替えて保存し、再生中プレイヤーへ即反映する */
  setBgmRepeatOne: (on: boolean) => Promise<void>;
  /** お気に入り・プレイリストの編集後にキューを組み直す（再生中の曲は可能なら維持） */
  refreshBgm: () => Promise<void>;

  // --- 環境音（要件9 / UC 9.1） ---
  /**
   * その夜の天気に応じた環境音へ切り替える（要件9）。
   * 天気コード（未選択は null）を渡すと、対応する環境音をループ再生する。
   * 対応する音が無い・環境音の音量が0のときは停止する（ニュートラルな夜）。
   */
  setAmbientForWeather: (weatherCode: string | null) => void;

  // --- おやすみ（要件13 / UC 13.1） ---
  /**
   * おやすみ状態を切り替える。true でBGM・環境音をフェードアウトして停止する。
   * false（復帰）では環境音だけフェードインで戻し、BGMは停止のままにする
   * （デフォルト停止に合わせ、再生はユーザーの操作による）。
   */
  setGoodnight: (sleeping: boolean) => void;
};

const AudioContext = createContext<AudioContextValue | null>(null);

/**
 * 音量プレビューに使う音（要件10.4: 変更した音量が分かるように鳴らす）。
 *
 * プレビュー音を出すのは**効果音（sfx）と鐘（bell）だけ**。BGM・環境音は連続再生される
 * 音で、音量の変更は再生中に即反映されて耳で分かるため、別途のプレビュー音は出さない。
 * TODO(素材): 効果音のプレビューは UI操作音（ui_tap）が用意できたら差し替える
 *   （いまは仮素材の break_notice を代表音として使っている）。
 */
const PREVIEW_SFX: Partial<Record<SoundCategory, SfxKey>> = {
  sfx: "break_notice",
  bell: "bell",
};

export function AudioProvider({ children }: { children: ReactNode }) {
  const [volumes, setVolumes] = useState<Volumes>(DEFAULT_VOLUMES);
  const [ready, setReady] = useState(false);
  // ミニプレイヤーの表示用（要件9）。再生中の曲・鳴っているか・再生位置の進捗
  const [bgmTrack, setBgmTrack] = useState<AmbientSound | null>(null);
  const [bgmPlaying, setBgmPlaying] = useState(false);
  const [bgmProgress, setBgmProgress] = useState(0);
  // シークバーの時間表示用（要件9）。再生位置と曲の長さ（秒）
  const [bgmPositionSec, setBgmPositionSec] = useState(0);
  const [bgmDurationSec, setBgmDurationSec] = useState(0);
  // アプリにBGMが1曲でもあるか（選択中ソースが空でもミニプレイヤー＝プレイリスト入口を残すため）
  const [bgmHasTracks, setBgmHasTracks] = useState(false);
  // プレイリスト（要件9）: 再生ソースとシャッフル・1曲リピート。正はDB（audio_setting）。既定OFF
  const [bgmSource, setBgmSourceState] = useState<BgmSource>("all");
  const [bgmShuffle, setBgmShuffleState] = useState(false);
  const [bgmRepeatOne, setBgmRepeatOneState] = useState(false);

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

  // BGM再生キュー（現在の再生ソース＋シャッフルで組んだ並び）と現在の位置（要件9）
  const bgmPoolRef = useRef<AmbientSound[]>([]);
  const bgmIndexRef = useRef(0);
  // 現在表示/再生中の曲ID。キュー組み直し時に「同じ曲を維持できるか」の判定に使う
  const currentTrackIdRef = useRef<number | null>(null);
  // コールバックから最新のソース・シャッフルを同期的に参照する
  const bgmSourceRef = useRef<BgmSource>("all");
  bgmSourceRef.current = bgmSource;
  const bgmShuffleRef = useRef(false);
  bgmShuffleRef.current = bgmShuffle;
  const bgmRepeatOneRef = useRef(false);
  bgmRepeatOneRef.current = bgmRepeatOne;
  // シーク直後は古い再生位置が一瞬返るため、目標に追いつくまで位置更新を無視するロック
  const seekLockRef = useRef<{ target: number; until: number } | null>(null);
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
      // プレビュー音を出すのは効果音・鐘だけ（BGM・環境音は再生中に即反映されるため出さない）
      const key = PREVIEW_SFX[category];
      if (key) playOnce(key, volumesRef.current[category]);
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

  // 曲終了時に次の曲へ進む処理。相互参照になるため ref 越しに呼ぶ
  const advanceRef = useRef<() => void>(() => {});

  // BGMプレイヤーの状態更新（要件9）。曲の終了で次の曲へ、それ以外は再生位置を進捗へ反映する。
  // updateInterval ごとに呼ばれるため、ミニプレイヤーの再生バーがなめらかに動く
  const handleBgmStatus = useCallback((status: AudioStatus) => {
    if (status.didJustFinish) {
      advanceRef.current();
      return;
    }
    const duration = status.duration || 0;
    const position = status.currentTime || 0;
    // シーク直後は古い位置が一瞬返る。目標付近へ追いつくか一定時間経つまで位置更新を無視して、
    // シークバーが変更前の時間へ戻る「ちらつき」を防ぐ（seekBgm が目標位置をセット済み）
    const lock = seekLockRef.current;
    if (lock) {
      if (Date.now() > lock.until || Math.abs(position - lock.target) < 0.75) {
        seekLockRef.current = null;
      } else {
        setBgmDurationSec(duration);
        return;
      }
    }
    setBgmProgress(duration > 0 ? Math.min(1, position / duration) : 0);
    setBgmPositionSec(position);
    setBgmDurationSec(duration);
  }, []);

  /**
   * プールの index の曲をプレイヤーへ読み込む（再生はしない・曲名表示と進捗も更新する）。
   * プレイヤー未生成なら作る。曲送り・スキップ・自動送りで呼ぶ。
   */
  const loadBgmTrack = useCallback(
    (index: number): AudioPlayer | null => {
      const pool = bgmPoolRef.current;
      if (pool.length === 0) return null;
      const track = pool[index];
      const source = getBgmSource(track.code);
      if (!source) return null; // プールは登録済みの音源だけで作るため通常ここは通らない

      bgmIndexRef.current = index;
      let player = bgmPlayer.current;
      if (!player) {
        // updateInterval を指定して再生位置の更新を受け取る（進捗バー用）
        player = createAudioPlayer(source, { updateInterval: 500 });
        bgmPlayer.current = player;
        player.addListener("playbackStatusUpdate", handleBgmStatus);
      } else {
        player.replace(source);
      }
      // 1曲リピートON時はプレイヤー自身でループさせる（曲終了イベントを待たず途切れない）
      player.loop = bgmRepeatOneRef.current;
      setBgmTrack(track);
      currentTrackIdRef.current = track.id;
      setBgmProgress(0);
      setBgmPositionSec(0);
      setBgmDurationSec(0);
      return player;
    },
    [handleBgmStatus],
  );

  /** 現在の曲を再生する。fade=true でフェードイン（急に鳴らさない）。音量0なら鳴らさない */
  const playBgm = useCallback(
    (fade: boolean) => {
      if (isMuted(volumesRef.current.bgm)) return;
      if (bgmPoolRef.current.length === 0) return;
      const player = bgmPlayer.current ?? loadBgmTrack(bgmIndexRef.current);
      if (!player) return;
      const target = toPlayerVolume(volumesRef.current.bgm);
      player.volume = fade ? 0 : target;
      player.play();
      setBgmPlaying(true);
      if (fade) fadeTo(player, target, AUDIO.FADE_IN_MS);
    },
    [fadeTo, loadBgmTrack],
  );

  const pauseBgm = useCallback(() => {
    bgmPlayer.current?.pause();
    setBgmPlaying(false);
  }, []);

  // 次の曲へキューを進める（再生はしない）。末尾まで来たら:
  //   ・シャッフルON → 新しく並べ替えて先頭へ（直前の曲がすぐ来ないよう回避）＝一巡非重複
  //   ・シャッフルOFF → 先頭へ戻る（同じ並びを繰り返す）
  const goToNext = useCallback(() => {
    const pool = bgmPoolRef.current;
    if (pool.length === 0) return;
    if (bgmIndexRef.current >= pool.length - 1) {
      if (bgmShuffleRef.current && pool.length > 1) {
        const lastId = pool[bgmIndexRef.current]?.id ?? null;
        bgmPoolRef.current = avoidImmediateRepeat(shuffle(pool), lastId);
      }
      loadBgmTrack(0);
    } else {
      loadBgmTrack(bgmIndexRef.current + 1);
    }
  }, [loadBgmTrack]);

  // 曲が最後まで再生されたら自動で次の曲へ（要件9）。handleBgmStatus から ref 越しに呼ばれる
  advanceRef.current = () => {
    if (bgmPoolRef.current.length === 0) return;
    goToNext();
    playBgm(false);
  };

  const toggleBgm = useCallback(() => {
    if (bgmPlayer.current?.playing) pauseBgm();
    else playBgm(true);
  }, [pauseBgm, playBgm]);

  const skipBgm = useCallback(() => {
    if (bgmPoolRef.current.length === 0) return;
    // 停止中はスキップで曲を切り替えるだけ（再生はしない）。再生中は次の曲を続けて鳴らす
    const wasPlaying = !!bgmPlayer.current?.playing;
    goToNext();
    if (wasPlaying) playBgm(false);
  }, [goToNext, playBgm]);

  const restartBgm = useCallback(() => {
    setBgmProgress(0);
    setBgmPositionSec(0);
    bgmPlayer.current
      ?.seekTo(0)
      .catch((e) => console.error("BGMの頭出しに失敗しました", e));
  }, []);

  // 再生位置を秒で移動する（シークバーのドラッグ確定時）。負や尺超えは丸める
  const seekBgm = useCallback((sec: number) => {
    const player = bgmPlayer.current;
    if (!player) return;
    const duration = player.duration || 0;
    const target = Math.max(0, duration > 0 ? Math.min(sec, duration) : sec);
    setBgmPositionSec(target);
    if (duration > 0) setBgmProgress(Math.min(1, target / duration));
    // 目標に追いつくまで（最大1.2秒）ステータス由来の位置更新を無視する（ちらつき防止）
    seekLockRef.current = { target, until: Date.now() + 1200 };
    player.seekTo(target).catch((e) => console.error("BGMのシークに失敗しました", e));
  }, []);

  // 現在の再生ソースを再生する（プレイリスト画面の再生ボタン）。
  // シャッフルONのときは並べ直してランダムな曲から始める（要件9）。
  const startBgm = useCallback(() => {
    if (bgmShuffleRef.current && bgmPoolRef.current.length > 1) {
      bgmPoolRef.current = shuffle(bgmPoolRef.current);
      loadBgmTrack(0);
    }
    playBgm(true);
  }, [loadBgmTrack, playBgm]);

  // 一覧で選んだ曲を再生する（要件9: 曲をタップでその曲を流す）。
  // 現在のキュー内で該当曲へ位置を合わせ、フェードインで鳴らす
  const playTrack = useCallback(
    (trackId: number) => {
      const idx = bgmPoolRef.current.findIndex((t) => t.id === trackId);
      if (idx < 0) return;
      loadBgmTrack(idx);
      playBgm(true);
    },
    [loadBgmTrack, playBgm],
  );

  // --- プレイリスト（要件9・音楽プレイリスト） ---

  // 新しく組んだキューを反映する。再生中/表示中の曲がキューに残っていれば位置だけ合わせて
  // 維持し、無ければ先頭へ（再生中なら先頭曲へ切替、停止中なら表示だけ更新）。
  const applyQueue = useCallback(
    (queue: AmbientSound[], playFromTop = false) => {
      bgmPoolRef.current = queue;
      if (queue.length === 0) {
        bgmPlayer.current?.pause();
        bgmIndexRef.current = 0;
        currentTrackIdRef.current = null;
        setBgmTrack(null);
        setBgmPlaying(false);
        setBgmProgress(0);
        setBgmPositionSec(0);
        setBgmDurationSec(0);
        return;
      }
      // タブ切替時: そのソースの先頭曲から再生する（要件9）。音量0なら再生はしない（表示のみ）
      if (playFromTop) {
        bgmIndexRef.current = 0;
        loadBgmTrack(0);
        playBgm(true);
        return;
      }
      const curId = currentTrackIdRef.current;
      const idx = curId != null ? queue.findIndex((t) => t.id === curId) : -1;
      if (idx >= 0) {
        // 現在の曲がキューに残っている → 位置だけ合わせて維持（再生/停止はそのまま）
        bgmIndexRef.current = idx;
        return;
      }
      // 現在の曲が無い → 先頭へ
      bgmIndexRef.current = 0;
      if (bgmPlayer.current) {
        const wasPlaying = bgmPlayer.current.playing;
        loadBgmTrack(0);
        if (wasPlaying) playBgm(false);
      } else {
        // プレイヤー未生成（起動直後・停止中）は表示だけ更新する
        currentTrackIdRef.current = queue[0].id;
        setBgmTrack(queue[0]);
        setBgmProgress(0);
      }
    },
    [loadBgmTrack, playBgm],
  );

  // DBの再生設定＋お気に入り/プレイリストを読み、キューを組み直す（要件9）。
  // ソース・シャッフルの状態もここでDB値に合わせる（DBが正）。
  const refreshBgmQueue = useCallback(async (opts?: { playFromTop?: boolean }) => {
    try {
      const user = await userRepo.getUser();
      const [tracks, settings, favoriteIds, playlistIds] = await Promise.all([
        masterRepo.getBgmTracks(),
        settingsRepo.getPlaybackSettings(),
        user ? playlistRepo.getFavoriteIds(user.id) : Promise.resolve<number[]>([]),
        user
          ? playlistRepo.getPlaylistOrderedIds(user.id)
          : Promise.resolve<number[]>([]),
      ]);
      // 音源が登録されている曲だけを対象にする
      const playable = tracks.filter((t) => getBgmSource(t.code));
      setBgmHasTracks(playable.length > 0);
      setBgmSourceState(settings.source);
      setBgmShuffleState(settings.shuffle);
      setBgmRepeatOneState(settings.repeatOne);
      bgmSourceRef.current = settings.source;
      bgmShuffleRef.current = settings.shuffle;
      bgmRepeatOneRef.current = settings.repeatOne;
      // 既存プレイヤーがあればリピート設定を即反映する
      if (bgmPlayer.current) bgmPlayer.current.loop = settings.repeatOne;
      applyQueue(
        buildBgmQueue({
          tracks: playable,
          favoriteIds,
          playlistOrderedIds: playlistIds,
          source: settings.source,
          shuffle: settings.shuffle,
        }),
        opts?.playFromTop ?? false,
      );
    } catch (e) {
      console.error("BGMキューの再構築に失敗しました", e);
    }
  }, [applyQueue]);

  const setBgmSource = useCallback(
    async (source: BgmSource) => {
      await settingsRepo.updateBgmSource(source);
      // タブ切替はそのソースの先頭曲から流す（要件9）
      await refreshBgmQueue({ playFromTop: true });
    },
    [refreshBgmQueue],
  );

  const setBgmShuffle = useCallback(
    async (on: boolean) => {
      await settingsRepo.updateBgmShuffle(on);
      await refreshBgmQueue();
    },
    [refreshBgmQueue],
  );

  // 1曲リピートの切り替え。キューは変えず、再生中プレイヤーの loop を即反映する
  const setBgmRepeatOne = useCallback(async (on: boolean) => {
    setBgmRepeatOneState(on);
    bgmRepeatOneRef.current = on;
    if (bgmPlayer.current) bgmPlayer.current.loop = on;
    try {
      await settingsRepo.updateBgmRepeatOne(on);
    } catch (e) {
      console.error("リピート設定の保存に失敗しました", e);
    }
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

  // --- おやすみ（要件13 / UC 13.1） ---

  // BGM・環境音を一括でフェードして、終わりに任意の処理を行う。
  // 対象を一度に動かすため fadeTo（単一プレイヤー用）ではなくここで両方まとめて扱う。
  const fadeBgmAndAmbient = useCallback(
    (
      targets: { bgm: number; ambient: number },
      durationMs: number,
      onDone?: () => void,
    ) => {
      if (fadeTimer.current) clearInterval(fadeTimer.current);
      const bgm = bgmPlayer.current;
      const amb = ambientPlayer.current;
      const bgmStart = bgm?.volume ?? 0;
      const ambStart = amb?.volume ?? 0;
      const steps = Math.max(1, Math.round(durationMs / AUDIO.FADE_STEP_MS));
      let i = 0;
      fadeTimer.current = setInterval(() => {
        i += 1;
        const t = i / steps;
        try {
          if (bgm) bgm.volume = bgmStart + (targets.bgm - bgmStart) * t;
          if (amb) amb.volume = ambStart + (targets.ambient - ambStart) * t;
        } catch {
          if (fadeTimer.current) clearInterval(fadeTimer.current);
          fadeTimer.current = null;
          return;
        }
        if (i >= steps) {
          if (fadeTimer.current) clearInterval(fadeTimer.current);
          fadeTimer.current = null;
          onDone?.();
        }
      }, AUDIO.FADE_STEP_MS);
    },
    [],
  );

  const setGoodnight = useCallback(
    (sleeping: boolean) => {
      if (sleeping) {
        // BGM・環境音をフェードアウトして止める（暗転中は音を止める。要件13）
        fadeBgmAndAmbient({ bgm: 0, ambient: 0 }, AUDIO.FADE_OUT_MS, () => {
          try {
            bgmPlayer.current?.pause();
            ambientPlayer.current?.pause();
          } catch {
            // 解放済みなら何もしない
          }
          setBgmPlaying(false);
        });
      } else {
        // 復帰時: BGMは鳴らさない（デフォルト停止に合わせ、ユーザーが再生ボタンで始める）。
        // 環境音（天気の雰囲気として自動で流れる音）だけをフェードインで戻す（要件13改訂）
        const ambTarget = toPlayerVolume(volumesRef.current.ambient);
        if (
          ambientPlayer.current &&
          playingAmbientCodeRef.current &&
          !isMuted(volumesRef.current.ambient)
        ) {
          ambientPlayer.current.volume = 0;
          ambientPlayer.current.play();
        }
        // BGMは停止のままにしたいので target=0（一時停止中のため無音。次の再生操作で戻る）
        fadeBgmAndAmbient({ bgm: 0, ambient: ambTarget }, AUDIO.FADE_IN_MS);
      }
    },
    [fadeBgmAndAmbient],
  );

  // 起動時にBGMキューを組む（要件9・改訂）。再生ソース・シャッフルはDBから読む。
  // デフォルトは停止で、先頭曲を表示しておく（再生はミニプレイヤー/プレイリストの再生ボタンから）。
  useEffect(() => {
    if (!ready) return;
    void refreshBgmQueue();
  }, [ready, refreshBgmQueue]);

  const setVolume = useCallback(
    async (category: SoundCategory, value: number) => {
      const next = { ...volumesRef.current, [category]: value };
      // 先に画面へ反映してから保存する（つまみの追従を優先）
      volumesRef.current = next;
      setVolumes(next);

      // 再生中の音へ即座に反映する
      if (category === "bgm") {
        if (bgmPlayer.current) bgmPlayer.current.volume = toPlayerVolume(value);
        // 音量0は再生処理自体を行わない（要件9）。停止してミニプレイヤーも隠す。
        // 0から戻しても自動再生はしない（デフォルト停止。再生はユーザーの操作による）
        if (isMuted(value)) {
          bgmPlayer.current?.pause();
          setBgmPlaying(false);
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
    [applyAmbient],
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
      bgmProgress,
      bgmPositionSec,
      bgmDurationSec,
      bgmHasTracks,
      toggleBgm,
      skipBgm,
      restartBgm,
      seekBgm,
      startBgm,
      playTrack,
      bgmSource,
      bgmShuffle,
      bgmRepeatOne,
      setBgmSource,
      setBgmShuffle,
      setBgmRepeatOne,
      refreshBgm: refreshBgmQueue,
      setAmbientForWeather,
      setGoodnight,
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
      bgmProgress,
      bgmPositionSec,
      bgmDurationSec,
      bgmHasTracks,
      toggleBgm,
      skipBgm,
      restartBgm,
      seekBgm,
      startBgm,
      playTrack,
      bgmSource,
      bgmShuffle,
      bgmRepeatOne,
      setBgmSource,
      setBgmShuffle,
      setBgmRepeatOne,
      refreshBgmQueue,
      setAmbientForWeather,
      setGoodnight,
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
