import type { TimeOfDay } from "@/lib/background-schedule";
import { buildVariantSeed, pickVariantIndex } from "@/lib/video-variant";

// 街コード → 時間帯 → レベル別の背景ループ動画（要件2.2 / docs/背景_季節×時間帯スケジュール.md）。
//
// 静止画（townArt.ts）と同じ枠の「素材違い」として扱う。ここに登録がある組み合わせだけが
// 動画になり、無ければ静止画を表示する。
//
// townArt.ts と違い、時間帯のフォールバックはしない（night の動画を昼へ流用しない）。
// 空の色と時刻が食い違うと世界観が壊れるため。静止画側のフォールバックは従来どおり。
//
// 1つの枠に複数のパターン（構図は同じで、流れ星などの動きだけが違うもの）を登録できる。
// どれを流すかは学習日ごとに決まる（選び方は lib/video-variant.ts）。静止画は枠に1枚で
// 共用する（構図が同じなので、読み込み中の下敷きとしてどのパターンにも使える）。
//
// 動画は時間帯フォルダの mp4/ 配下に置く（静止画は同じ階層の png/。townArt.ts を参照）:
// assets/home/<town>/<timeOfDay>/mp4/<town>_<timeOfDay>_lv<N>.mp4
// 複数パターンある枠は末尾に連番を付ける: <town>_<timeOfDay>_lv<N>_1.mp4 / _2.mp4
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

/** 1つの枠に用意されたパターン（1本だけの枠も要素1つの配列で持つ） */
type LevelVideo = Record<number, TownVideo[]>;
type TownVideoSet = Partial<Record<TimeOfDay, LevelVideo>>;

const TOWN_VIDEO: Record<string, TownVideoSet> = {
  nightTown: {
    // いずれも 1280×720。静止画（1672×941）と同じ16:9のため可動域は一致する
    night: {
      // Lv.3 は流れ星の動きだけが違う2パターン。学習日ごとにどちらかを流す
      3: [
        {
          source: require("@/assets/home/nightTown/night/mp4/nightTown_night_lv3_1.mp4"),
          width: 1280,
          height: 720,
        },
        {
          source: require("@/assets/home/nightTown/night/mp4/nightTown_night_lv3_2.mp4"),
          width: 1280,
          height: 720,
        },
      ],
      4: [
        {
          source: require("@/assets/home/nightTown/night/mp4/nightTown_night_lv4.mp4"),
          width: 1280,
          height: 720,
        },
      ],
      // 動作確認用の暫定素材。本素材ができたら同じパスへ差し替える
      5: [
        {
          source: require("@/assets/home/nightTown/night/mp4/nightTown_night_lv5.mp4"),
          width: 1280,
          height: 720,
        },
      ],
    },
  },
};

/**
 * 指定した街コード・レベル・時間帯の背景動画を返す（未登録なら undefined）。
 * 時間帯のフォールバックは行わない。undefined のときは呼び出し側が静止画を使う。
 *
 * パターンが複数ある枠は学習日ごとに1つ選ぶ。乱数ではなく学習日をシードにした
 * 決定的な選択のため、同じ夜のあいだは何度描画し直しても同じ動画が流れる
 * （理由は lib/video-variant.ts のコメントを参照）。
 */
export function getTownVideo(
  code: string,
  level: number,
  timeOfDay: TimeOfDay,
  studyDate: string,
): TownVideo | undefined {
  const variants = TOWN_VIDEO[code]?.[timeOfDay]?.[level];
  if (!variants || variants.length === 0) return undefined;
  const seed = buildVariantSeed(studyDate, code, timeOfDay, level);
  return variants[pickVariantIndex(seed, variants.length)];
}
