import { StyleSheet, Text, View } from "react-native";

import { LightColor, Spacing } from "@/constants/theme";
import type { MonthSummary } from "@/db/repositories/calendarRepo";
import { formatMinutes } from "@/lib/study-day";

// 月次サマリー・夜の天気アルバム（要件4.2）。
//
// 数字を並べて成績表にしないよう、静かなトーンでまとめる（コンセプト準拠）。
// 「最も多かった感情・天気」は、その月がどんな夜の集まりだったかを映す。
// 内訳は縦棒グラフで表す。その月に記録されたものだけを、多い順（左が高い）に並べ、
// 本数が増減してもバーの幅を変えて一定の表示範囲に収める。

// 夜の天気の総数（マスタは11種）。専用定数が無いためここに置く（シード投入数と一致）
const WEATHER_KINDS = 11;

// 棒グラフの描画領域の高さ（固定）。バーの高さは最大値に対する割合で決める
const PLOT_HEIGHT = 150;
// バーの上に置く回数ラベルのぶん、最大バー高はこの値を差し引いて収める
const VALUE_LABEL_HEIGHT = 16;

// 灯りの暖色（バーの色）。他画面のレベル表示・合計時間と同じトーン

type BarDatum = { key: string; label: string; value: number };

// 縦棒グラフ。列は flex で等分するため、本数が増減しても枠内に収まり幅だけ変わる。
// 高さは最大値＝満杯になるよう正規化する（絶対値ではなく割合で見せる）。
function BarChart({ data }: { data: BarDatum[] }) {
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

export function MonthSummaryCard({ summary }: { summary: MonthSummary | null }) {
  // 全11種のうち何種の天気を集めたか（アルバムの充実度）
  const collectedKinds = summary?.weatherAlbum.length ?? 0;

  if (!summary || summary.sessionCount === 0) {
    return (
      <View style={styles.card}>
        <Text style={styles.emptyText}>この月は、まだ記録がありません</Text>
      </View>
    );
  }

  // 多い順（左が高い）に並べる。ラベルは絵文字（列が細くなるため名前は入れない）
  const emotionData: BarDatum[] = [...summary.emotionCounts]
    .sort((a, b) => b.count - a.count)
    .map((e) => ({
      key: `e${e.emotion.id}`,
      label: e.emotion.emoji ?? e.emotion.name,
      value: e.count,
    }));

  const weatherData: BarDatum[] = [...summary.weatherAlbum]
    .sort((a, b) => b.nights - a.nights)
    .map((w) => ({
      key: `w${w.weather.id}`,
      label: w.weather.emoji ?? w.weather.name,
      value: w.nights,
    }));

  return (
    <View style={styles.card}>
      {/* 総学習時間・学習回数 */}
      <View style={styles.statsRow}>
        <Stat label="学習した時間" value={formatMinutes(summary.totalMinutes)} />
        <Stat label="学習した回数" value={`${summary.sessionCount}回`} />
      </View>

      {/* 最も多かった感情・天気 */}
      <View style={styles.statsRow}>
        <Stat
          label="多かった気持ち"
          value={
            summary.topEmotion
              ? `${summary.topEmotion.emoji} ${summary.topEmotion.name}`
              : "—"
          }
        />
        <Stat
          label="多かった夜"
          value={
            summary.topWeather
              ? `${summary.topWeather.emoji} ${summary.topWeather.name}`
              : "—"
          }
        />
      </View>

      {/* 感情別の記録回数（縦棒グラフ・多い順） */}
      {emotionData.length > 0 ? (
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>気持ちの内訳</Text>
          <BarChart data={emotionData} />
        </View>
      ) : null}

      {/* 夜の天気アルバム（縦棒グラフ・多い順） */}
      <View style={styles.section}>
        <Text style={styles.sectionLabel}>
          夜の天気アルバム（{collectedKinds}/{WEATHER_KINDS}）
        </Text>
        {weatherData.length > 0 ? (
          <BarChart data={weatherData} />
        ) : (
          <Text style={styles.emptyMini}>まだ集まっていません</Text>
        )}
      </View>
    </View>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
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
  section: {
    gap: Spacing.two,
  },
  sectionLabel: {
    color: "rgba(255,255,255,0.5)",
    fontSize: 11,
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
