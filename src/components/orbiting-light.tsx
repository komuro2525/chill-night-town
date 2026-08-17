import { useEffect } from "react";
import { StyleSheet, View } from "react-native";
import Animated, {
  Easing,
  makeMutable,
  useAnimatedStyle,
  withRepeat,
  withTiming,
} from "react-native-reanimated";

// 計測中に、円い枠の上をゆっくり回る光の粒。尾を引いて軌跡を残す。
// ホームの時計とタイマー詳細の両方で使う（どちらも枠は円のため同じ部品で足りる）。
//
// 経過時間の数字を読まなくても「動いている」ことが分かるようにするための演出。
// 一時停止すると止まる（呼び出し側が running を落とす）ので、止まっていることも分かる。
//
// 【描き方】円弧のグラデーションは Skia 等が要るため使わない。かわりに、
// 回転する層の中へ粒を少しずつ後ろの角度に並べ、細く暗くしていくことで尾に見せる。
// **回転する層の中では「横幅」がそのまま進行方向になる**ため、横に長い粒を置くと
// 進行方向へ伸びた形（水滴が流れたような形）になる。
// 回転は Reanimated が UI スレッドで進めるため、画面の再描画とは無関係に滑らかに回る。
//
// 速さは1周9秒。速くするとローディングの回転に見えて急かす印象になるため、ゆっくり回す。
const ORBIT_MS = 9000;

// 先頭の粒の高さは、枠線の太さを基準にする（枠の直径からは決めない）。
// 枠の上を走る光なので、線より少し太いくらいがちょうどよく、
// 直径から決めると大きい枠（タイマー詳細）で光だけが目立ってしまう
const HEAD_TO_BORDER = 2;
const HEAD_MIN = 4;

// 尾の粒の数と、1つあたり後ろへずらす角度（度）。
//
// 角度で持つため、**筋の長さは枠の大きさに比例する**。円周に対する割合が同じになり、
// 大きいタイマー詳細では長く、小さい時計では短くなる。
const TRAIL_COUNT = 31;
const TRAIL_STEP_DEG = 1;

// 粒の横幅（高さに対する倍率）。
// **間隔よりずっと広く取ることが、滑らかに見せる条件。** 幅と間隔が近いと粒どうしが
// 接するだけになり、細長い粒が数珠つなぎに並んでいるように見える。幅を広くして
// 何重にも重ねると、輪郭は高さの変化だけで決まり、一本の筋として溶ける。
const WIDTH_TO_HEAD = 3;

// ただし枠の直径に対する上限も設ける。
// 粒は直線なので、円周に対して長すぎると弧から内側へ逃げ、筋がへこんで見える。
// 小さい枠（ホームの時計）でこれが出るため、直径の6%までに抑える。
const WIDTH_MAX_RATIO = 0.06;

// 回転の位置は**部品の外で持つ**。
//
// 時計をタップしてタイマー詳細を開くと、ホーム側の部品は外れて詳細側が付く。
// 部品ごとに位置を持つと、そのたびに先頭へ戻ってしまい、画面を行き来するだけで
// 光が飛ぶ。1つの値を全ての表示で共有すれば、どの画面から見ても同じ位置を指し、
// 付け外しでも途切れない。
//
// 一度動かしたら止めない。止めて再開すると、そこで位置が飛ぶため。
// 計測していないあいだは表示側を描かないので、見た目には現れない
// （動いているのは共有の数値ひとつで、描画は伴わない）。
const orbitAngle = makeMutable(0);
let orbitStarted = false;

function startOrbit() {
  if (orbitStarted) return;
  orbitStarted = true;
  orbitAngle.value = withRepeat(
    withTiming(360, { duration: ORBIT_MS, easing: Easing.linear }),
    -1,
    false,
  );
}

// 筋の色。先頭から尾へ向かって移り変わらせる。
// 単色だとただの光の点だが、暖色から寒色へ抜けると「灯りが夜気に溶けていく」
// 見え方になる。先頭は濃いめの琥珀、尾は夜空へ還る淡い菫青。
//
// **先頭に白を使わない。** 枠線が白のため、白に寄せると枠に溶けて粒の位置が見えなくなる。
// 枠の上を走る以上、枠と色相をずらしておく必要がある。
const TRAIL_STOPS: { at: number; rgb: [number, number, number] }[] = [
  { at: 0, rgb: [255, 188, 96] },
  { at: 0.45, rgb: [255, 170, 150] },
  { at: 1, rgb: [168, 178, 255] },
];

/** 筋の位置 t（0＝先頭・1＝尾の端）の色を、区間ごとに混ぜて求める */
function trailColor(t: number, alpha: number): string {
  let from = TRAIL_STOPS[0];
  let to = TRAIL_STOPS[TRAIL_STOPS.length - 1];
  for (let i = 0; i < TRAIL_STOPS.length - 1; i++) {
    if (t >= TRAIL_STOPS[i].at && t <= TRAIL_STOPS[i + 1].at) {
      from = TRAIL_STOPS[i];
      to = TRAIL_STOPS[i + 1];
      break;
    }
  }
  const span = to.at - from.at;
  const k = span === 0 ? 0 : (t - from.at) / span;
  const mix = (a: number, b: number) => Math.round(a + (b - a) * k);
  const [r, g, b] = [0, 1, 2].map((i) => mix(from.rgb[i], to.rgb[i]));
  return `rgba(${r},${g},${b},${alpha})`;
}

export function OrbitingLight({
  /** 枠の直径 */
  size,
  /** 枠の線の太さ。粒をその中央へ乗せるために使う */
  borderWidth,
  /**
   * 枠線が親そのものに付いているか。
   * RN では枠線付きの View の子は「枠の内側」を原点に置かれるため、
   * その分だけ外へ戻さないと粒が枠より内側にずれる。
   * 枠を別の View で重ねて描いている場合（原点＝枠の外側）は false のまま。
   */
  borderOnParent = false,
  /**
   * 尾の長さの倍率（既定1）。粒の数を増やして伸ばすため、間隔は変わらず
   * 途切れない。大きい枠でだけ長く見せたいときに使う。
   */
  trailScale = 1,
  /** 計測中か（一時停止中は false）。false のあいだは何も描かない */
  running,
}: {
  size: number;
  borderWidth: number;
  borderOnParent?: boolean;
  trailScale?: number;
  running: boolean;
}) {
  useEffect(() => {
    if (running) startOrbit();
  }, [running]);

  const spin = useAnimatedStyle(() => ({
    transform: [{ rotate: `${orbitAngle.value}deg` }],
  }));

  if (!running) return null;

  const head = Math.max(HEAD_MIN, borderWidth * HEAD_TO_BORDER);
  const pieceWidth = Math.min(head * WIDTH_TO_HEAD, size * WIDTH_MAX_RATIO);
  const count = Math.max(1, Math.round(TRAIL_COUNT * trailScale));
  // 枠線の中心に粒の中心を合わせる（線の上を進んでいるように見せる）
  const rimCenterY = borderOnParent ? -borderWidth / 2 : borderWidth / 2;

  /** 指定の大きさの粒を、枠の上（層の真上）へ置く */
  const piece = (w: number, h: number, color: string) => ({
    position: "absolute" as const,
    left: size / 2 - w / 2,
    top: rimCenterY - h / 2,
    width: w,
    height: h,
    borderRadius: h / 2,
    backgroundColor: color,
  });

  return (
    <Animated.View style={[StyleSheet.absoluteFill, spin]} pointerEvents="none">
      {/* 先頭から尾まで、途切れない一本の筋として描く。
          先頭だけを別に作ると形と明るさが飛び、別の物体に見えてしまうため、
          同じ列の0番目を先頭として扱い、高さと濃さをなめらかに落としていく。
          横幅は全て同じにして、輪郭が水滴のように先太り・後細りになるようにする。
          尾の端から順に描き、先頭を最後に（最前面へ）置く */}
      {Array.from({ length: count + 1 })
        .map((_, i) => count - i)
        .map((i) => {
          const t = i / (count + 1); // 0＝先頭、1に近いほど尾の端
          // 高さの落ち方が輪郭そのものになる。急だと途中で段が見えるため緩やかに
          const h = head * Math.pow(1 - t, 0.75);
          if (h < 0.4) return null;
          // 色の移り変わりが見えるよう、濃さは緩やかに落とす（急に消えると単色に見える）
          const alpha = Math.pow(1 - t, 1.1);
          const isHead = i === 0;
          return (
            <View
              key={i}
              style={[
                StyleSheet.absoluteFill,
                { transform: [{ rotate: `${-TRAIL_STEP_DEG * i}deg` }] },
              ]}
            >
              <View
                style={[
                  piece(pieceWidth, h, trailColor(t, alpha)),
                  // にじみは先頭だけ。全てに持たせると筋全体がぼやけ、描画も重くなる
                  isHead && {
                    shadowColor: `rgb(${TRAIL_STOPS[0].rgb.join(",")})`,
                    shadowOpacity: 0.9,
                    shadowRadius: head * 1.2,
                    shadowOffset: { width: 0, height: 0 },
                    elevation: 4,
                  },
                ]}
              />
            </View>
          );
        })}
    </Animated.View>
  );
}
