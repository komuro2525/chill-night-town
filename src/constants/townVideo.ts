import type { TimeOfDay } from "@/lib/background-schedule";

// 街コード → 時間帯 → レベル別の背景ループ動画（要件2.2 / docs/背景_季節×時間帯スケジュール.md）。
//
// 静止画（townArt.ts）と同じ枠の「素材違い」として扱う。ここに登録がある組み合わせだけが
// 動画になり、無ければ静止画を表示する。
//
// townArt.ts と違い、時間帯のフォールバックはしない（night の動画を昼へ流用しない）。
// 空の色と時刻が食い違うと世界観が壊れるため。静止画側のフォールバックは従来どおり。
//
// 動画は assets/videos/home/<town>/<timeOfDay>/<town>_<timeOfDay>_lv<N>.mp4 に置く。
// 素材の規格（無音・尺・ループの継ぎ目など）は docs/必要素材一覧.md「動画素材の規格」を参照。
export type TownVideo = {
  /** require() した MP4（RN の require は静的パスのみ解決できる） */
  source: number;
  /**
   * 動画の幅・高さ（px）。静止画は Image.resolveAssetSource で実寸を取れるが、
   * 動画は取れないため手で登録する。スワイプ探索（要件2.2）の可動域計算に使うため、
   * **対応する静止画と同じ値**にすること（ずれるとパンの動く範囲が静止画と変わる）。
   */
  width: number;
  height: number;
};

type LevelVideo = Record<number, TownVideo>;
type TownVideoSet = Partial<Record<TimeOfDay, LevelVideo>>;

const TOWN_VIDEO: Record<string, TownVideoSet> = {
  nightTown: {
    night: {
      // 動作確認用の暫定素材。静止画（1672×941）と同じ16:9のため可動域は一致する。
      // 本素材ができたら同じパスへ差し替え、解像度が変わればここも直す
      5: {
        source: require("@/assets/videos/home/nightTown/night/nightTown_night_lv5.mp4"),
        width: 1280,
        height: 720,
      },
    },
  },
};

/**
 * 指定した街コード・レベル・時間帯の背景動画を返す（未登録なら undefined）。
 * 時間帯のフォールバックは行わない。undefined のときは呼び出し側が静止画を使う。
 */
export function getTownVideo(
  code: string,
  level: number,
  timeOfDay: TimeOfDay,
): TownVideo | undefined {
  return TOWN_VIDEO[code]?.[timeOfDay]?.[level];
}
