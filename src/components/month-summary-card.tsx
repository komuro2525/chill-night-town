import { StyleSheet, Text, View } from "react-native";

import { Spacing } from "@/constants/theme";
import type { MonthSummary } from "@/db/repositories/calendarRepo";
import { formatMinutes } from "@/lib/study-day";

// 月次サマリー・夜の天気アルバム（要件4.2）。
//
// 数字を並べて成績表にしないよう、静かなトーンでまとめる（コンセプト準拠）。
// 「最も多かった感情・天気」は、その月がどんな夜の集まりだったかを映す。

export function MonthSummaryCard({ summary }: { summary: MonthSummary | null }) {
  // 全11種のうち何種の天気を集めたか（アルバムの充実度）
  const collectedKinds = summary?.weatherAlbum.length ?? 0;

  if (!summary || summary.sessionCount === 0) {
    return (
      <View style={styles.card}>
        <Text style={styles.emptyText}>
          この月は、まだ記録がありません
        </Text>
      </View>
    );
  }

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

      {/* 感情別の記録回数 */}
      {summary.emotionCounts.length > 0 ? (
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>気持ちの内訳</Text>
          <View style={styles.chips}>
            {summary.emotionCounts.map(({ emotion, count }) => (
              <Text key={emotion.id} style={styles.chip}>
                {emotion.emoji} {emotion.name} {count}
              </Text>
            ))}
          </View>
        </View>
      ) : null}

      {/* 夜の天気アルバム */}
      <View style={styles.section}>
        <Text style={styles.sectionLabel}>
          夜の天気アルバム（{collectedKinds}/{WEATHER_KINDS}）
        </Text>
        <View style={styles.chips}>
          {summary.weatherAlbum.map(({ weather, nights }) => (
            <Text key={weather.id} style={styles.chip}>
              {weather.emoji} {weather.name} {nights}
            </Text>
          ))}
        </View>
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

// 夜の天気の総数（マスタは11種）。専用定数が無いためここに置く（シード投入数と一致）
const WEATHER_KINDS = 11;

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
  chips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.two,
  },
  chip: {
    color: "rgba(255,255,255,0.8)",
    fontSize: 12,
    paddingVertical: 3,
    paddingHorizontal: Spacing.two,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.06)",
    overflow: "hidden",
  },
  emptyText: {
    color: "rgba(255,255,255,0.45)",
    fontSize: 14,
    textAlign: "center",
    paddingVertical: Spacing.three,
  },
});
