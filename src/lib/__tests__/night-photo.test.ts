// その夜の写真の帰属・命名・表示の検証。要件2.6
//
// 写真がどの夜の記録になるかは画面を見ても分からない。ずれれば「昨夜の写真が
// 今夜に付く」「日をまたいだ瞬間の1枚だけ別の夜へ飛ぶ」形で記録が壊れるため、
// 5:00の境界と日跨ぎを固定する。
// あわせて、撮り直しでファイル名が変わること（同名上書きだと古い画像が
// 表示に残る）と、撮影時刻の表記も検証する。

import {
  buildPhotoFileName,
  canAttachPhoto,
  formatTakenAtLabel,
} from "../night-photo";

const at = (iso: string) => new Date(iso);

describe("canAttachPhoto（追加・撮り直しの可否）", () => {
  test("その夜のあいだは撮れる（21:00）", () => {
    expect(canAttachPhoto("2026-01-10", at("2026-01-10T21:00:00"))).toBe(true);
  });

  test("日付をまたいでも同じ夜のあいだは撮れる（翌1:30）", () => {
    expect(canAttachPhoto("2026-01-10", at("2026-01-11T01:30:00"))).toBe(true);
  });

  test("4:59はまだその夜（境界の内側）", () => {
    expect(canAttachPhoto("2026-01-10", at("2026-01-11T04:59:59"))).toBe(true);
  });

  test("5:00ちょうどで夜が終わり、前夜には足せない", () => {
    expect(canAttachPhoto("2026-01-10", at("2026-01-11T05:00:00"))).toBe(false);
  });

  test("過ぎた夜には追加できない", () => {
    expect(canAttachPhoto("2026-01-09", at("2026-01-10T21:00:00"))).toBe(false);
  });

  test("まだ来ていない夜にも追加できない", () => {
    expect(canAttachPhoto("2026-01-11", at("2026-01-10T21:00:00"))).toBe(false);
  });

  test("昼間は撮れない（これから始まる夜が対象でも、昼の空は今夜ではない）", () => {
    // 天気（心象）は夜が始まる前に選べるが、写真は実像のため夜間帯に限る
    expect(canAttachPhoto("2026-01-11", at("2026-01-11T05:00:00"))).toBe(false);
    expect(canAttachPhoto("2026-01-11", at("2026-01-11T14:00:00"))).toBe(false);
    expect(canAttachPhoto("2026-01-11", at("2026-01-11T17:59:59"))).toBe(false);
  });

  test("18:00になれば撮れる（夜間帯の始まり）", () => {
    expect(canAttachPhoto("2026-01-11", at("2026-01-11T18:00:00"))).toBe(true);
  });
});

describe("buildPhotoFileName（保存名）", () => {
  test("学習日と撮影時刻から作る", () => {
    const takenAt = at("2026-01-11T01:30:00");
    expect(buildPhotoFileName("2026-01-10", takenAt)).toBe(
      `2026-01-10-${takenAt.getTime()}.jpg`,
    );
  });

  test("同じ夜に撮り直すと別の名前になる（古い画像がキャッシュに残らないように）", () => {
    const first = buildPhotoFileName("2026-01-10", at("2026-01-10T21:00:00"));
    const second = buildPhotoFileName("2026-01-10", at("2026-01-10T23:00:00"));
    expect(first).not.toBe(second);
  });

  test("名前の先頭は帰属する学習日（撮影日ではない）", () => {
    // 1/11 1:30 に撮っても、その夜は 1/10
    expect(
      buildPhotoFileName("2026-01-10", at("2026-01-11T01:30:00")),
    ).toMatch(/^2026-01-10-/);
  });
});

describe("formatTakenAtLabel（撮影時刻の表示）", () => {
  test("日をまたいだ撮影は、その実際の時刻を出す", () => {
    expect(formatTakenAtLabel("2026-01-11T01:30:00")).toBe("1/11 1:30 に撮影");
  });

  test("分は2桁に揃える", () => {
    expect(formatTakenAtLabel("2026-01-10T21:05:00")).toBe("1/10 21:05 に撮影");
  });

  test("壊れた値でも例外にせず空文字を返す（写真なし扱いにする）", () => {
    expect(formatTakenAtLabel("")).toBe("");
  });
});
