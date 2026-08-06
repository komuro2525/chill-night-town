import { StyleSheet, Text, View } from "react-native";

import {
  BarChart,
  CountList,
  formatHourLabel,
  Stat,
  summaryStyles,
  type BarDatum,
} from "@/components/summary-parts";
import { LightColor, Spacing } from "@/constants/theme";
import type { MonthSummary } from "@/db/repositories/calendarRepo";
import { formatMinutes } from "@/lib/study-day";

// 月次サマリー・夜の天気アルバム（要件4.2）。
//
// 数字を並べて成績表にしないよう、静かなトーンでまとめる（コンセプト準拠）。
// 「最も多かった感情・天気」は、その月がどんな夜の集まりだったかを映す。
// 内訳は縦棒グラフで表す。その月に記録されたものだけを、多い順（左が高い）に並べる。
// 表示部品は通算のふりかえり（4.4）と共有する（summary-parts）。

export function MonthSummaryCard({
  summary,
  // 完了した月のねぎらいメッセージ（要件4.2拡張）。無い月・進行中の月は null
  reviewMessage = null,
}: {
  summary: MonthSummary | null;
  reviewMessage?: string | null;
}) {
  if (!summary || summary.sessionCount === 0) {
    return (
      <View style={summaryStyles.card}>
        <Text style={summaryStyles.emptyText}>この月は、まだ記録がありません</Text>
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

  const tagData: BarDatum[] = summary.tagCounts.map((t) => ({
    key: `t${t.tag.id}`,
    label: t.tag.name,
    value: t.count,
  }));

  // よく灯していた時間帯は文字で1つだけ示す。
  // startHours は夜の並び（18時台→翌4時台）で来るため、同数のときは夜の早い方が残る
  const topHour = summary.startHours.reduce<(typeof summary.startHours)[number] | null>(
    (best, h) => (best === null || h.count > best.count ? h : best),
    null,
  );

  const weatherData: BarDatum[] = [...summary.weatherAlbum]
    .sort((a, b) => b.nights - a.nights)
    .map((w) => ({
      key: `w${w.weather.id}`,
      label: w.weather.emoji ?? w.weather.name,
      value: w.nights,
    }));

  return (
    <View style={summaryStyles.card}>
      {/* 完了した月のねぎらいの一言（静かなトーン。あるときだけ） */}
      {reviewMessage ? (
        <View style={styles.review}>
          <Text style={styles.reviewLabel}>今月のふりかえり</Text>
          <Text style={styles.reviewText}>{reviewMessage}</Text>
        </View>
      ) : null}

      {/* 総学習時間・学習回数 */}
      <View style={summaryStyles.statsRow}>
        <Stat label="学習した時間" value={formatMinutes(summary.totalMinutes)} />
        <Stat label="学習した回数" value={`${summary.sessionCount}回`} />
      </View>

      <View style={summaryStyles.statsRow}>
        {/* 割合にはしない（届かなかった夜を失敗として数えないため） */}
        <Stat label="目標に届いた夜" value={`${summary.achievedNights}夜`} />
        {/* よく灯していた時間帯（開始時刻）。グラフにせず文字で1つだけ示す */}
        <Stat
          label="よく灯した時間"
          value={topHour ? formatHourLabel(topHour.hour) : "—"}
        />
      </View>

      {/* 最も多かった感情・天気。この2つは並べて1行に置く（対になる情報のため） */}
      <View style={summaryStyles.statsRow}>
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
        <View style={summaryStyles.section}>
          <Text style={summaryStyles.sectionLabel}>気持ちの内訳</Text>
          <BarChart data={emotionData} />
        </View>
      ) : null}

      {/* よく学んだ内容（タグ別・多い順）。名前が主役なのでリストで見せる */}
      {tagData.length > 0 ? (
        <View style={summaryStyles.section}>
          <Text style={summaryStyles.sectionLabel}>よく学んだ内容</Text>
          <CountList data={tagData} />
        </View>
      ) : null}

      {/* 夜の天気アルバム（縦棒グラフ・多い順） */}
      <View style={summaryStyles.section}>
        <Text style={summaryStyles.sectionLabel}>夜の天気アルバム</Text>
        {weatherData.length > 0 ? (
          <BarChart data={weatherData} />
        ) : (
          <Text style={summaryStyles.emptyMini}>まだ集まっていません</Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  review: {
    gap: Spacing.two,
    paddingBottom: Spacing.three,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.08)",
  },
  reviewLabel: {
    color: LightColor,
    fontSize: 11,
    letterSpacing: 1,
  },
  reviewText: {
    color: "rgba(255,255,255,0.9)",
    fontSize: 14,
    lineHeight: 23,
  },
});
