import { StyleSheet, Text, View } from "react-native";

import {
  BarChart,
  CountList,
  StarField,
  Stat,
  summaryStyles,
  type BarDatum,
} from "@/components/summary-parts";
import { LightColor, Spacing } from "@/constants/theme";
import type { OverallSummary } from "@/db/repositories/calendarRepo";
import type { TownWithProgress } from "@/db/repositories/townProgressRepo";
import { getAlbumStage } from "@/lib/calendar";
import { formatMinutes } from "@/lib/study-day";

// 通算のふりかえり（要件4.4）。月をまたいだ全期間・全街合計の集計。
//
// 月次サマリー（4.2）が「その月がどんな夜の集まりだったか」を見る場所なのに対し、
// ここは「これまで通ってきた夜の全体」を見る場所。数字で成績をつけないよう、
// 順位・達成率・平均は出さず、積み上がったものだけを静かに並べる（コンセプト準拠）。

export function OverallSummaryCard({
  summary,
  // 街ごとの育成状況（要件4.4）。育てた街を並べて見られる唯一の場所
  towns = [],
}: {
  summary: OverallSummary | null;
  towns?: TownWithProgress[];
}) {
  if (!summary || summary.nightCount === 0) {
    return (
      <View style={summaryStyles.card}>
        <Text style={summaryStyles.emptyText}>
          まだ記録がありません{"\n"}過ごした夜が、ここに積み重なっていきます
        </Text>
      </View>
    );
  }

  // 通算の天気アルバム。多い順（左が高い）に並べる
  const weatherData: BarDatum[] = [...summary.weatherAlbum]
    .sort((a, b) => b.nights - a.nights)
    .map((w) => ({
      key: `w${w.weather.id}`,
      label: w.weather.emoji ?? w.weather.name,
      value: w.nights,
    }));

  const tagData: BarDatum[] = summary.tagCounts.map((t) => ({
    key: `t${t.tag.id}`,
    label: t.tag.name,
    value: t.count,
  }));

  return (
    <View style={summaryStyles.card}>
      {/* 通算で学習した夜の数に応じて灯る星（要件4.4）。
          カード全面の背面に敷く。通算は減らないため段階も戻らない */}
      {/* 通算は月に属さないため、種は固定（いつ見ても同じ夜空） */}
      <StarField stage={getAlbumStage(summary.nightCount, "overall")} seed={0} />

      <View style={summaryStyles.statsRow}>
        {/* 「通った夜」ではアプリを開いた回数とも読めるため、学習した夜と明示する */}
        <Stat label="学習した夜" value={`${summary.nightCount}夜`} />
        <Stat label="学習した時間" value={formatMinutes(summary.totalMinutes)} />
      </View>

      <View style={summaryStyles.statsRow}>
        <Stat
          label="いちばん長かった夜"
          value={
            summary.longestNight ? formatMinutes(summary.longestNight.minutes) : "—"
          }
        />
        {/* 割合にはしない（届かなかった夜を失敗として数えないため） */}
        <Stat label="目標に届いた夜" value={`${summary.achievedNights}夜`} />
      </View>

      {/* よく学んだ内容（タグ別・多い順） */}
      {tagData.length > 0 ? (
        <View style={summaryStyles.section}>
          <Text style={summaryStyles.sectionLabel}>よく学んだ内容</Text>
          <CountList data={tagData} />
        </View>
      ) : null}

      {/* 通算の夜の天気アルバム（縦棒グラフ・多い順） */}
      <View style={summaryStyles.section}>
        <Text style={summaryStyles.sectionLabel}>夜の天気アルバム</Text>
        {weatherData.length > 0 ? (
          <BarChart data={weatherData} />
        ) : (
          <Text style={summaryStyles.emptyMini}>まだ集まっていません</Text>
        )}
      </View>

      {/* 街ごとの育成状況。ここからは切り替えない（切替は設定 10.5 の役割） */}
      {towns.length > 0 ? (
        <View style={summaryStyles.section}>
          <Text style={summaryStyles.sectionLabel}>育てている街</Text>
          {towns.map(({ town, progress }) => (
            <View key={town.id} style={styles.townRow}>
              <Text
                style={[
                  styles.townName,
                  progress.is_selected === 1 && styles.townNameSelected,
                ]}
                numberOfLines={1}
              >
                {town.name}
                {progress.subtitle ? `（${progress.subtitle}）` : ""}
              </Text>
              <Text style={styles.townValue}>
                Lv.{progress.current_level}・
                {formatMinutes(progress.cumulative_study_minutes)}
              </Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  townRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.two,
    paddingVertical: 5,
  },
  townName: {
    flex: 1,
    color: "rgba(255,255,255,0.75)",
    fontSize: 13,
  },
  // 選択中の街だけ灯り色にする（今どこにいるかが分かるように）
  townNameSelected: {
    color: LightColor,
  },
  townValue: {
    color: "rgba(255,255,255,0.6)",
    fontSize: 12,
  },
});
