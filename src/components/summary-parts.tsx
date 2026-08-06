import { StyleSheet, Text, View } from "react-native";

import { LightColor, Spacing } from "@/constants/theme";

// 月次サマリー（要件4.2）と通算のふりかえり（要件4.4）で共有する表示部品。
//
// 見た目を1か所に持つ。同じ形の棒グラフ・数値表示を2つのカードで別々に持つと、
// 片方だけ手を入れたときに月と通算で見た目が食い違う。

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
