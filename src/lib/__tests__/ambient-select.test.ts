import { selectAmbientCode } from "../ambient-select";

// 夜の天気 → 環境音の対応（要件9 / UC 9.1）。
//
// 対応表は「どの天気でどの環境音が流れるか」を決める唯一の場所。取り違えると
// 別の音が流れ、未対応の天気で無音になるべきところで音が出る（またはその逆）。
// 画面を見ても分からないため、対応する天気・しない天気・未選択を固定する。

describe("selectAmbientCode（夜の天気→環境音コード）", () => {
  test("雨音の夜は雨の環境音", () => {
    expect(selectAmbientCode("rainy_night")).toBe("amb_rain");
  });

  test("嵐の夜も雨の環境音（雨の音を流す）", () => {
    expect(selectAmbientCode("stormy_night")).toBe("amb_rain");
  });

  test("霧の夜は夜風の環境音", () => {
    expect(selectAmbientCode("foggy_night")).toBe("amb_wind");
  });

  test("対応する素材の無い天気は null（＝鳴らさない・ニュートラルな夜）", () => {
    // 素材が仮の2種のみのため、多くの天気はまだ無音（要件9: 未対応はニュートラル）
    expect(selectAmbientCode("starry_night")).toBeNull();
    expect(selectAmbientCode("full_moon_night")).toBeNull();
    expect(selectAmbientCode("snowy_night")).toBeNull();
    expect(selectAmbientCode("fireworks_night")).toBeNull();
  });

  test("天気が未選択（null）なら null（天気演出のないニュートラルな夜）", () => {
    expect(selectAmbientCode(null)).toBeNull();
  });

  test("未知のコードでも例外を投げず null を返す", () => {
    expect(selectAmbientCode("unknown_code")).toBeNull();
  });
});
