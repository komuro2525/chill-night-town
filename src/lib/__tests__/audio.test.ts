import { AUDIO } from "@/constants/domain";
import {
  avoidImmediateRepeat,
  buildBgmQueue,
  duckedVolume,
  isMuted,
  nextTrackIndex,
  shuffle,
  toPlayerVolume,
} from "../audio";

// 音量の換算・ミュート判定・ダッキング・シャッフルの検証（要件9 / 3.3）。
//
// 音量は「設定値0〜100」と「プレイヤー0.0〜1.0」の2つの世界があり、変換のズレは
// 画面を見ても分からない（耳で微妙な差に気づけない）。境界を固定しておく。
// とくに「音量0は再生処理自体を行わない」は要件の明示ルールで、0と1の境目が要。

describe("toPlayerVolume（設定値0〜100 → プレイヤー0.0〜1.0）", () => {
  test("0 は 0.0（無音）", () => {
    expect(toPlayerVolume(0)).toBe(0);
  });

  test("100 は 1.0（最大）", () => {
    expect(toPlayerVolume(100)).toBe(1);
  });

  test("既定値50 は 0.5", () => {
    expect(toPlayerVolume(AUDIO.VOLUME_DEFAULT)).toBe(0.5);
  });

  test("最小の有音である1は、0より大きい微小値になる", () => {
    expect(toPlayerVolume(1)).toBeGreaterThan(0);
    expect(toPlayerVolume(1)).toBeCloseTo(0.01);
  });

  test("値域外は 0〜1 に丸める（負値は0、100超は1）", () => {
    expect(toPlayerVolume(-10)).toBe(0);
    expect(toPlayerVolume(120)).toBe(1);
  });

  test("数値でない場合は0（無音）として扱う", () => {
    expect(toPlayerVolume(Number.NaN)).toBe(0);
  });
});

describe("isMuted（音量0は再生処理自体を行わない。要件9）", () => {
  test("0 は消音", () => {
    expect(isMuted(0)).toBe(true);
  });

  test("1 は消音ではない（境界。1以上は鳴らす）", () => {
    expect(isMuted(1)).toBe(false);
  });

  test("100 は消音ではない", () => {
    expect(isMuted(100)).toBe(false);
  });
});

describe("duckedVolume（鐘の再生中にBGM・環境音を下げる。要件3.3）", () => {
  test("既定の比率で元の音量より小さくなる", () => {
    const normal = toPlayerVolume(100);
    expect(duckedVolume(100)).toBeLessThan(normal);
    expect(duckedVolume(100)).toBeCloseTo(AUDIO.DUCKING_RATIO);
  });

  test("元の音量が0なら下げても0のまま（鳴らさない）", () => {
    expect(duckedVolume(0)).toBe(0);
  });

  test("比率1なら元の音量と等しい（下げない）", () => {
    expect(duckedVolume(80, 1)).toBe(toPlayerVolume(80));
  });

  test("比率0なら完全に無音まで下げる", () => {
    expect(duckedVolume(80, 0)).toBe(0);
  });
});

describe("shuffle（BGMプールのシャッフル再生。要件9）", () => {
  test("全曲がちょうど1回ずつ現れる（曲を落とさない・重複させない）", () => {
    const items = [1, 2, 3, 4, 5];
    const result = shuffle(items, makeSequenceRandom([0.9, 0.1, 0.5, 0.3]));
    expect([...result].sort()).toEqual(items);
  });

  test("元の配列を変更しない", () => {
    const items = [1, 2, 3];
    const copy = [...items];
    shuffle(items, makeSequenceRandom([0.5, 0.5]));
    expect(items).toEqual(copy);
  });

  test("空・1件でも壊れない", () => {
    expect(shuffle([])).toEqual([]);
    expect(shuffle(["a"])).toEqual(["a"]);
  });

  test("乱数が同じなら並びも同じ（結果が再現できる）", () => {
    const items = [1, 2, 3, 4, 5];
    const a = shuffle(items, makeSequenceRandom([0.2, 0.7, 0.4, 0.9]));
    const b = shuffle(items, makeSequenceRandom([0.2, 0.7, 0.4, 0.9]));
    expect(a).toEqual(b);
  });
});

describe("nextTrackIndex（曲が終わったら次の曲へ。要件9）", () => {
  test("次の位置へ進む", () => {
    expect(nextTrackIndex(0, 3)).toBe(1);
    expect(nextTrackIndex(1, 3)).toBe(2);
  });

  test("末尾まで来たら先頭へ戻る（プールを繰り返す）", () => {
    expect(nextTrackIndex(2, 3)).toBe(0);
  });

  test("1曲だけなら同じ曲を指し続ける", () => {
    expect(nextTrackIndex(0, 1)).toBe(0);
  });

  test("空のプールでは0を返す（呼び出し側は再生しない）", () => {
    expect(nextTrackIndex(0, 0)).toBe(0);
  });
});

describe("buildBgmQueue（再生ソース×シャッフルでキューを組む・要件9）", () => {
  const tracks = [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }];

  test("all: 登録曲全部を tracks の順で返す（シャッフルOFF）", () => {
    const q = buildBgmQueue({
      tracks,
      favoriteIds: [],
      playlistOrderedIds: [],
      source: "all",
      shuffle: false,
    });
    expect(q.map((t) => t.id)).toEqual([1, 2, 3, 4]);
  });

  test("favorites: ★の曲だけを tracks の順（安定順）で返す", () => {
    const q = buildBgmQueue({
      tracks,
      favoriteIds: [3, 1],
      playlistOrderedIds: [],
      source: "favorites",
      shuffle: false,
    });
    expect(q.map((t) => t.id)).toEqual([1, 3]);
  });

  test("playlist: playlistOrderedIds の順で返す（tracks に無いidは除く）", () => {
    const q = buildBgmQueue({
      tracks,
      favoriteIds: [],
      playlistOrderedIds: [4, 2, 99],
      source: "playlist",
      shuffle: false,
    });
    expect(q.map((t) => t.id)).toEqual([4, 2]);
  });

  test("playlist: 同じidが複数あればその回数ぶん並ぶ（重複可・要件9）", () => {
    const q = buildBgmQueue({
      tracks,
      favoriteIds: [],
      playlistOrderedIds: [4, 2, 4],
      source: "playlist",
      shuffle: false,
    });
    expect(q.map((t) => t.id)).toEqual([4, 2, 4]);
  });

  test("シャッフルONでも対象は全曲ちょうど1回ずつ（落とさない・重複しない）", () => {
    const q = buildBgmQueue({
      tracks,
      favoriteIds: [],
      playlistOrderedIds: [],
      source: "all",
      shuffle: true,
      random: makeSequenceRandom([0.9, 0.1, 0.5]),
    });
    expect(q.map((t) => t.id).sort()).toEqual([1, 2, 3, 4]);
  });

  test("お気に入り0件なら空（呼び出し側は再生しない）", () => {
    const q = buildBgmQueue({
      tracks,
      favoriteIds: [],
      playlistOrderedIds: [],
      source: "favorites",
      shuffle: false,
    });
    expect(q).toEqual([]);
  });

  test("元の tracks 配列は変更しない", () => {
    const copy = tracks.map((t) => ({ ...t }));
    buildBgmQueue({ tracks, favoriteIds: [2], playlistOrderedIds: [1], source: "all", shuffle: true });
    expect(tracks).toEqual(copy);
  });
});

describe("avoidImmediateRepeat（一巡後の再シャッフルで直前の曲を先頭に置かない・要件9）", () => {
  test("新キューの先頭が直前の曲なら後ろへ送る", () => {
    const q = [{ id: 3 }, { id: 1 }, { id: 2 }];
    expect(avoidImmediateRepeat(q, 3).map((t) => t.id)).toEqual([1, 2, 3]);
  });

  test("先頭が直前の曲でなければそのまま", () => {
    const q = [{ id: 1 }, { id: 2 }, { id: 3 }];
    expect(avoidImmediateRepeat(q, 3).map((t) => t.id)).toEqual([1, 2, 3]);
  });

  test("1曲・空・直前なしはそのまま返す（回避のしようがない）", () => {
    expect(avoidImmediateRepeat([{ id: 1 }], 1).map((t) => t.id)).toEqual([1]);
    expect(avoidImmediateRepeat([], 1)).toEqual([]);
    expect(avoidImmediateRepeat([{ id: 1 }, { id: 2 }], null).map((t) => t.id)).toEqual([1, 2]);
  });
});

/** 決まった順で値を返す乱数。使い切ったら0.5を返す（テストで並びを固定するため） */
function makeSequenceRandom(values: number[]): () => number {
  let i = 0;
  return () => values[i++] ?? 0.5;
}
