import { useEffect, useRef, useState } from "react";
import { Animated, StyleSheet, Text, View } from "react-native";

import { LightColor, Spacing } from "@/constants/theme";
import type { AlbumStage } from "@/lib/calendar";

// 月次サマリー（要件4.2）と通算のふりかえり（要件4.4）で共有する表示部品。
//
// 見た目を1か所に持つ。同じ形の棒グラフ・数値表示を2つのカードで別々に持つと、
// 片方だけ手を入れたときに月と通算で見た目が食い違う。

// 星の位置（帯の中での縦横%）・大きさ・明るさ・明滅の周期（ミリ秒）とずれ。
// 配置は固定にして、見るたびに散らばりが変わらないようにする。
// 周期と遅れは星ごとに変えて、全部が揃って光らないようにする（一斉に点滅すると
// 信号のように見え、夜空にならない）。先頭6つが2段階目、全部が3段階目。
type StarSpec = {
  top: `${number}%`;
  left: `${number}%`;
  size: number;
  opacity: number;
  period: number;
  delay: number;
  /** 大きい星だけに付ける淡いにじみ（1つだけ光ると点に見えるため） */
  glow: boolean;
};

/**
 * 星を作る。位置も明るさも**渡された種から生成する**ため、同じ種なら毎回まったく同じ
 * 夜空になる（乱数をそのまま使うと再描画のたびに星が飛ぶ）。種を月ごとに変えることで、
 * 月を切り替えると別の夜空になる——同じ空が並ぶと、月を移動しても景色が変わらない。
 *
 * 手で座標を並べると等間隔になりがちで、星空ではなく模様に見えてしまう。
 * 大きさ・明るさに幅を持たせ、小さく暗い星を多く混ぜると空気の奥行きが出る。
 */
function makeStars(count: number, seedValue: number): StarSpec[] {
  // 線形合同法。0を種にすると数列が動かないため、必ず正の値へずらす
  let seed = (Math.abs(Math.trunc(seedValue)) % 2147483647) + 1;
  const rand = () => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed / 2147483648;
  };

  const stars: StarSpec[] = [];
  for (let i = 0; i < count; i++) {
    // 4つに1つだけ大きめ。残りは小さな星にして数で空を埋める
    const big = rand() < 0.22;
    const size = big ? (rand() < 0.4 ? 3 : 2.5) : rand() < 0.5 ? 1 : 1.5;
    stars.push({
      top: `${Math.round(rand() * 96)}%`,
      left: `${Math.round(rand() * 96)}%`,
      size,
      // 大きい星ほど明るく。小さい星は控えめにして奥行きを作る
      opacity: big ? 0.85 + rand() * 0.15 : 0.5 + rand() * 0.35,
      period: 2200 + Math.round(rand() * 2600),
      delay: Math.round(rand() * 3000),
      glow: big,
    });
  }
  return stars;
}

/** 3段階目の星の数。2段階目はこの先頭ぶん（STARS_STAGE2）だけ灯す */
const STARS_TOTAL = 120;
const STARS_STAGE2 = 50;

// 種ごとの夜空を覚えておく（月を行き来するたびに作り直さない）
const skyCache = new Map<number, StarSpec[]>();
function starsFor(seed: number): StarSpec[] {
  const cached = skyCache.get(seed);
  if (cached) return cached;
  const stars = makeStars(STARS_TOTAL, seed);
  skyCache.set(seed, stars);
  return stars;
}

/** 星1つ。ゆっくり明るさが上下するだけで、位置も大きさも動かさない */
function Star({ spec }: { spec: StarSpec }) {
  const dim = spec.opacity * 0.3;
  const value = useRef(new Animated.Value(spec.opacity)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay(spec.delay),
        Animated.timing(value, {
          toValue: dim,
          duration: spec.period,
          useNativeDriver: true,
        }),
        Animated.timing(value, {
          toValue: spec.opacity,
          duration: spec.period,
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [value, dim, spec.delay, spec.period, spec.opacity]);

  const halo = spec.size * 4;
  return (
    <Animated.View
      style={[
        styles.starWrap,
        { top: spec.top, left: spec.left, opacity: value },
      ]}
    >
      {/* にじみ。星そのものより十分暗くし、輪郭が出ないようにする */}
      {spec.glow ? (
        <View
          style={[
            styles.glow,
            {
              width: halo,
              height: halo,
              borderRadius: halo / 2,
              marginLeft: -(halo - spec.size) / 2,
              marginTop: -(halo - spec.size) / 2,
            },
          ]}
        />
      ) : null}
      <View
        style={[
          styles.star,
          { width: spec.size, height: spec.size, borderRadius: spec.size / 2 },
        ]}
      />
    </Animated.View>
  );
}

/** 流れ星の間隔（ミリ秒）。この幅の中でばらつかせ、周期的に見えないようにする */
const SHOOTING_MIN_MS = 8000;
const SHOOTING_MAX_MS = 18000;
/**
 * 流れる時間（ミリ秒）と距離（px）。どちらも1回ごとにこの幅で振る。
 * 2つを別々に振ることで速さもばらつき、すっと消えるものと長く尾を引くものが混ざる。
 */
const SHOOTING_DURATION_MIN_MS = 1200;
const SHOOTING_DURATION_MAX_MS = 6000;
const SHOOTING_DISTANCE_MIN = 70;
const SHOOTING_DISTANCE_MAX = 260;

/**
 * 流れ星（要件4.2 / 4.4）。8〜18秒に1度ほど流れて消える。
 *
 * 出る位置・流れる時間（1.2〜6秒）・距離・傾きを毎回変える。時間と距離を別々に振るため
 * 速さもばらつき、すっと消えるものと長く尾を引くものが混ざる——同じ見え方で繰り返すと
 * 演出の反復に見え、夜空を眺めている感じが出ないためである。
 */
function ShootingStar() {
  const progress = useRef(new Animated.Value(0)).current;
  // 1回ごとに決まる見え方。位置・距離・傾きをまとめて持つ
  const [shot, setShot] = useState({
    top: "18%",
    left: "12%",
    distance: 120,
    // 落ちる角度。横移動に対する縦移動の比（0.3=浅い、0.7=急）
    slope: 0.5,
  });

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    let cancelled = false;

    const schedule = () => {
      const wait =
        SHOOTING_MIN_MS + Math.random() * (SHOOTING_MAX_MS - SHOOTING_MIN_MS);
      timer = setTimeout(() => {
        if (cancelled) return;
        // 出る場所・距離・傾きは毎回ばらばら。流れ切る先が画面外へ出ないよう右下は少し空ける
        setShot({
          top: `${Math.round(Math.random() * 70)}%`,
          left: `${Math.round(Math.random() * 75)}%`,
          distance:
            SHOOTING_DISTANCE_MIN +
            Math.random() * (SHOOTING_DISTANCE_MAX - SHOOTING_DISTANCE_MIN),
          slope: 0.3 + Math.random() * 0.4,
        });
        progress.setValue(0);
        Animated.timing(progress, {
          toValue: 1,
          duration:
            SHOOTING_DURATION_MIN_MS +
            Math.random() * (SHOOTING_DURATION_MAX_MS - SHOOTING_DURATION_MIN_MS),
          useNativeDriver: true,
        }).start(() => {
          if (!cancelled) schedule();
        });
      }, wait);
    };
    schedule();

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [progress]);

  // 尾の向きを移動方向へ合わせる（傾きが変わるのに尾が固定だと不自然）
  const angle = `${(Math.atan(shot.slope) * 180) / Math.PI}deg`;
  return (
    <Animated.View
      style={[
        styles.shooting,
        { top: shot.top as `${number}%`, left: shot.left as `${number}%` },
        {
          opacity: progress.interpolate({
            // 出ながら明るくなり、流れ切る前に消える（点いたまま止まらない）
            inputRange: [0, 0.2, 0.7, 1],
            outputRange: [0, 1, 0.7, 0],
          }),
          transform: [
            {
              translateX: progress.interpolate({
                inputRange: [0, 1],
                outputRange: [0, shot.distance],
              }),
            },
            {
              // 斜めに落とす（真横だと線に見え、真下だと雨に見える）
              translateY: progress.interpolate({
                inputRange: [0, 1],
                outputRange: [0, shot.distance * shot.slope],
              }),
            },
            { rotate: angle },
          ],
        },
      ]}
    >
      <View style={styles.shootingTail} />
      <View style={styles.shootingHead} />
    </Animated.View>
  );
}

/**
 * 流れ星をいくつ空に置くか（要件4.2 / 4.4）。2段階目は1〜2、3段階目は2〜4。
 *
 * 本数は開いたときに決め、見ている間は変えない（見るたびに増減すると落ち着かない）。
 * それぞれが別々の間隔で流れるため、重なることも間が空くこともある。
 */
function ShootingStars({ stage }: { stage: AlbumStage }) {
  const [count] = useState(() =>
    stage === 3
      ? 2 + Math.floor(Math.random() * 3)
      : 1 + Math.floor(Math.random() * 2),
  );
  return (
    <>
      {Array.from({ length: count }, (_, i) => (
        <ShootingStar key={i} />
      ))}
    </>
  );
}

/**
 * 学習した夜の数に応じて灯る星（要件4.2 / 4.4）。
 *
 * **置き場所の全面に散らし、記録の背面に敷く。** 帯に押し込めると一列に並んで
 * 見栄えが悪く、前面に出すと数字やグラフが読みづらい。背面の夜空として扱う。
 * 色は文字（白）ともグラフ（灯り色）とも変えて淡い青にし、夜空のものだと分かるようにする。
 *
 * 明滅は明るさだけをゆっくり上下させる（位置も大きさも動かさない）。周期は星ごとに
 * ずらし、一斉に光らないようにする——揃って点滅すると信号のように見えるためである。
 *
 * 1段階目は何も出さない——飾りが剥がされた状態に見せないため、これが完成形。
 *
 * 置く側は `position: relative`（Viewの既定）と `overflow: hidden` を持たせること。
 */
export function StarField({
  stage,
  seed,
}: {
  stage: AlbumStage;
  /** 夜空の種。月ごとに変えると、月を切り替えたとき別の星空になる */
  seed: number;
}) {
  if (stage === 1) return null;
  const all = starsFor(seed);
  const stars = stage === 3 ? all : all.slice(0, STARS_STAGE2);
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {/* 3段階目は夜空をほんのり明るくする（数値を出さずに段階の違いを伝える） */}
      {stage === 3 ? (
        <View style={[StyleSheet.absoluteFill, styles.skyLit]} />
      ) : null}
      {stars.map((s, i) => (
        <Star key={i} spec={s} />
      ))}
      {/* 流れ星。2段階目は1〜2、3段階目は2〜4 */}
      <ShootingStars stage={stage} />
    </View>
  );
}

/** 時間帯のラベル（要件4.2）。null は夜間帯の外＝昼 */
export function formatHourLabel(hour: number | null): string {
  return hour === null ? "昼" : `${hour}時台`;
}

// 棒グラフの描画領域の高さ（固定）。バーの高さは最大値に対する割合で決める
const PLOT_HEIGHT = 150;
// バーの上に置く回数ラベルのぶん、最大バー高はこの値を差し引いて収める
const VALUE_LABEL_HEIGHT = 16;

export type BarDatum = { key: string; label: string; value: number };

/**
 * 縦棒グラフ。列は flex で等分するため、本数が増減しても枠内に収まり幅だけ変わる。
 * 高さは最大値＝満杯になるよう正規化する（絶対値ではなく割合で見せる）。
 */
export function BarChart({ data }: { data: BarDatum[] }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  const usableHeight = PLOT_HEIGHT - VALUE_LABEL_HEIGHT;
  return (
    <View>
      <View style={styles.plot}>
        {data.map((d) => (
          <View key={d.key} style={styles.barColumn}>
            <Text style={styles.barValue}>{d.value}</Text>
            <View
              style={[
                styles.bar,
                { height: Math.max(3, Math.round((d.value / max) * usableHeight)) },
              ]}
            />
          </View>
        ))}
      </View>
      <View style={styles.labelRow}>
        {data.map((d) => (
          <View key={d.key} style={styles.labelCell}>
            <Text style={styles.barLabel} numberOfLines={1}>
              {d.label}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

/**
 * 名前つきの項目を多い順に並べるリスト（学習内容タグなど）。
 *
 * 棒グラフは列が細く、日本語の名前を置くと切れてしまうため、
 * 文字が主役になるものはこちらで見せる。背後の帯で量の差だけ示す。
 */
export function CountList({
  data,
  max: limit = 6,
}: {
  data: BarDatum[];
  /** 並べる上限。多すぎると一覧が縦に伸びるため既定6件 */
  max?: number;
}) {
  const sorted = [...data].sort((a, b) => b.value - a.value).slice(0, limit);
  const top = Math.max(1, ...sorted.map((d) => d.value));
  return (
    <View style={styles.list}>
      {sorted.map((d) => (
        <View key={d.key} style={styles.listRow}>
          {/* 量を示す帯。数字を読まなくても差が分かる程度の濃さに留める */}
          <View style={[styles.listBar, { width: `${(d.value / top) * 100}%` }]} />
          <Text style={styles.listLabel} numberOfLines={1}>
            {d.label}
          </Text>
          <Text style={styles.listValue}>{d.value}</Text>
        </View>
      ))}
    </View>
  );
}

/** ラベル＋値の1項目（学習した時間・通った夜 など） */
export function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue}>{value}</Text>
    </View>
  );
}

/** 両カードで共有するスタイル（カード枠・数値・見出し・空表示） */
export const summaryStyles = StyleSheet.create({
  card: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(18,26,46,0.6)",
    padding: Spacing.four,
    gap: Spacing.three,
    // 星をカード全面に敷くため（角の外へはみ出させない）
    overflow: "hidden",
  },
  statsRow: {
    flexDirection: "row",
    gap: Spacing.three,
  },
  section: {
    gap: Spacing.two,
  },
  sectionLabel: {
    color: "rgba(255,255,255,0.5)",
    fontSize: 11,
  },
  emptyText: {
    color: "rgba(255,255,255,0.45)",
    fontSize: 14,
    textAlign: "center",
    paddingVertical: Spacing.three,
  },
  emptyMini: {
    color: "rgba(255,255,255,0.4)",
    fontSize: 12,
    paddingVertical: Spacing.two,
  },
});

const styles = StyleSheet.create({
  // 3段階目の夜空。ほんのり明るくして段階の違いを伝える（数値は出さない）
  skyLit: {
    backgroundColor: "rgba(168,200,255,0.05)",
  },
  starWrap: {
    position: "absolute",
  },
  // 星の色。文字（白）ともグラフ（灯り色）とも変えて、夜空のものだと分かるようにする
  star: {
    backgroundColor: "#eaf2ff",
  },
  glow: {
    position: "absolute",
    backgroundColor: "rgba(200,222,255,0.22)",
  },
  // 流れ星。尾と頭を横並びにして、まとめて斜めに回す
  shooting: {
    position: "absolute",
    flexDirection: "row",
    alignItems: "center",
  },
  shootingTail: {
    width: 26,
    height: 1.5,
    borderRadius: 1,
    backgroundColor: "rgba(220,235,255,0.45)",
  },
  shootingHead: {
    width: 2.5,
    height: 2.5,
    borderRadius: 1.25,
    backgroundColor: "#eaf2ff",
  },
  list: { gap: 4 },
  listRow: {
    flexDirection: "row",
    alignItems: "center",
    height: 26,
    borderRadius: 6,
    paddingHorizontal: Spacing.two,
    overflow: "hidden",
    backgroundColor: "rgba(255,255,255,0.04)",
  },
  listBar: {
    ...StyleSheet.absoluteFillObject,
    right: undefined,
    backgroundColor: "rgba(255,206,138,0.16)",
  },
  listLabel: {
    flex: 1,
    color: "rgba(255,255,255,0.85)",
    fontSize: 13,
  },
  listValue: {
    color: "rgba(255,255,255,0.6)",
    fontSize: 12,
  },
  stat: {
    flex: 1,
    gap: 2,
  },
  statLabel: {
    color: "rgba(255,255,255,0.5)",
    fontSize: 11,
  },
  statValue: {
    color: "rgba(255,255,255,0.95)",
    fontSize: 16,
    fontWeight: "500",
  },
  plot: {
    height: PLOT_HEIGHT,
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 6,
  },
  barColumn: {
    flex: 1,
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 3,
  },
  barValue: {
    height: VALUE_LABEL_HEIGHT,
    lineHeight: VALUE_LABEL_HEIGHT,
    color: "rgba(255,255,255,0.75)",
    fontSize: 10,
  },
  bar: {
    width: "40%",
    maxWidth: 16,
    minWidth: 6,
    borderRadius: 3,
    // 灯りの暖色。他画面のレベル表示・合計時間と同じトーン
    backgroundColor: LightColor,
  },
  labelRow: {
    flexDirection: "row",
    gap: 6,
    marginTop: 4,
  },
  labelCell: {
    flex: 1,
    alignItems: "center",
  },
  barLabel: {
    fontSize: 16,
  },
});
