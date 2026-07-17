import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { Spacing } from "@/constants/theme";
import type { DayDetail } from "@/db/repositories/calendarRepo";
import { formatMinutes, formatStudyDateLabel } from "@/lib/study-day";

// カレンダーの日別詳細（要件4.1）。
//
// その学習日の全セッション（複数なら全部）・天気・感情・タグ・メモを表示する。
// 記録が無い日は静かなデフォルト表示にする（責めない・急かさない）。

function formatTimeRange(startIso: string, endIso: string): string {
  const t = (iso: string) => {
    const d = new Date(iso);
    const p = (n: number) => String(n).padStart(2, "0");
    return `${p(d.getHours())}:${p(d.getMinutes())}`;
  };
  return `${t(startIso)}〜${t(endIso)}`;
}

export function CalendarDayDetail({
  detail,
  onClose,
}: {
  /** 表示する学習日の詳細。null なら閉じている */
  detail: DayDetail | null;
  onClose: () => void;
}) {
  const hasRecord = detail !== null && detail.sessions.length > 0;

  return (
    <Modal
      visible={detail !== null}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.handleRow}>
            <View style={styles.handle} />
          </View>

          <View style={styles.header}>
            <Text style={styles.date}>
              {detail ? formatStudyDateLabel(detail.studyDate) : ""}
            </Text>
            <Pressable onPress={onClose} hitSlop={10} accessibilityLabel="閉じる">
              <Text style={styles.close}>閉じる</Text>
            </Pressable>
          </View>

          {hasRecord ? (
            <ScrollView contentContainerStyle={styles.scroll}>
              {/* その夜の天気・合計・達成 */}
              <View style={styles.summary}>
                {detail.weather ? (
                  <Text style={styles.weather}>
                    {detail.weather.emoji} {detail.weather.name}
                  </Text>
                ) : null}
                <Text style={styles.total}>
                  この夜の学習 {formatMinutes(detail.totalMinutes)}
                </Text>
                {detail.achieved ? (
                  <Text style={styles.achieved}>目標を達成した夜</Text>
                ) : null}
              </View>

              {detail.sessions.map((s) => (
                <View key={s.id} style={styles.session}>
                  <View style={styles.sessionHead}>
                    <Text style={styles.sessionTime}>
                      {formatTimeRange(s.startTime, s.endTime)}
                    </Text>
                    <Text style={styles.sessionDur}>
                      {formatMinutes(s.durationMinutes)}
                    </Text>
                  </View>
                  {s.emotion ? (
                    <Text style={styles.emotion}>
                      {s.emotion.emoji} {s.emotion.name}
                    </Text>
                  ) : null}
                  {s.tags.length > 0 ? (
                    <View style={styles.tags}>
                      {s.tags.map((t) => (
                        <Text key={t.id} style={styles.tag}>
                          {t.name}
                        </Text>
                      ))}
                    </View>
                  ) : null}
                  {s.memo ? <Text style={styles.memo}>{s.memo}</Text> : null}
                </View>
              ))}
            </ScrollView>
          ) : (
            <View style={styles.empty}>
              <Text style={styles.emptyText}>この夜の記録はありません</Text>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}

const LIGHT_COLOR = "rgba(255,206,138,0.95)";

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(3,6,15,0.6)",
    justifyContent: "flex-end",
  },
  sheet: {
    maxHeight: "80%",
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.15)",
    backgroundColor: "rgba(14,20,36,0.99)",
    paddingHorizontal: Spacing.four,
    paddingBottom: Spacing.six,
  },
  handleRow: { alignItems: "center", paddingVertical: Spacing.two },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: "rgba(255,255,255,0.25)",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: Spacing.two,
  },
  date: {
    color: "rgba(255,255,255,0.95)",
    fontSize: 17,
    fontWeight: "600",
  },
  close: {
    color: "rgba(255,255,255,0.6)",
    fontSize: 14,
  },
  scroll: { paddingBottom: Spacing.four },
  summary: {
    alignItems: "center",
    gap: 2,
    paddingVertical: Spacing.three,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.1)",
    marginBottom: Spacing.three,
  },
  weather: {
    color: "rgba(255,255,255,0.85)",
    fontSize: 15,
  },
  total: {
    color: LIGHT_COLOR,
    fontSize: 22,
    fontWeight: "300",
    marginTop: 2,
  },
  achieved: {
    color: LIGHT_COLOR,
    fontSize: 12,
  },
  session: {
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.05)",
    padding: Spacing.three,
    marginBottom: Spacing.two,
    gap: Spacing.one,
  },
  sessionHead: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  sessionTime: {
    color: "rgba(255,255,255,0.6)",
    fontSize: 12,
  },
  sessionDur: {
    color: "rgba(255,255,255,0.9)",
    fontSize: 14,
    fontWeight: "500",
  },
  emotion: {
    color: "rgba(255,255,255,0.8)",
    fontSize: 13,
  },
  tags: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.one,
    marginTop: 2,
  },
  tag: {
    color: "rgba(255,255,255,0.7)",
    fontSize: 12,
    paddingVertical: 2,
    paddingHorizontal: Spacing.two,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.08)",
    overflow: "hidden",
  },
  memo: {
    color: "rgba(255,255,255,0.7)",
    fontSize: 13,
    lineHeight: 20,
    marginTop: 2,
  },
  empty: {
    alignItems: "center",
    paddingVertical: Spacing.six,
  },
  emptyText: {
    color: "rgba(255,255,255,0.45)",
    fontSize: 14,
  },
});
