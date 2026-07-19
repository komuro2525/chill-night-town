import { useCallback, useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import {
  Directions,
  Gesture,
  GestureDetector,
} from "react-native-gesture-handler";
import { runOnJS } from "react-native-reanimated";

import { CalendarDayDetail } from "@/components/calendar-day-detail";
import { MonthSummaryCard } from "@/components/month-summary-card";
import { Spacing } from "@/constants/theme";
import { useSettings } from "@/contexts/SettingsContext";
import { calendarRepo } from "@/db/repositories";
import type {
  DayDetail,
  DayMark,
  MonthSummary,
} from "@/db/repositories/calendarRepo";
import { getMonthGrid, getMonthRange, shiftMonth } from "@/lib/calendar";
import { now } from "@/lib/clock";
import { getStudyDate } from "@/lib/study-day";

// S7 カレンダー画面（要件4章）。日別記録閲覧（4.1）・月次サマリー（4.2）。
// 集計はすべて学習日（study_date）基準。マス日付＝study_date で一致する。

const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];

export default function CalendarScreen() {
  const { user } = useSettings();
  const today = now();
  const [ym, setYm] = useState({
    year: today.getFullYear(),
    month: today.getMonth() + 1,
  });
  const [marks, setMarks] = useState<Map<string, DayMark>>(new Map());
  const [summary, setSummary] = useState<MonthSummary | null>(null);
  const [detail, setDetail] = useState<DayDetail | null>(null);
  // カレンダー（夜を1日ずつ辿る）と ふりかえり（月を俯瞰）を切り替える。
  // 月の選択は両タブで共有する
  const [tab, setTab] = useState<"calendar" | "summary">("calendar");

  // 「今日」のマスは暦日ではなく学習日基準（マス＝study_date のため）。
  // 深夜0:00〜4:59は前夜のサイクル内なので、今夜の記録が乗る前日のマスを光らせる
  const todayKey = getStudyDate(today);

  const reload = useCallback(async () => {
    const { start, end } = getMonthRange(ym.year, ym.month);
    try {
      const [markList, sum] = await Promise.all([
        calendarRepo.getMonthMarks(start, end),
        calendarRepo.getMonthSummary(start, end),
      ]);
      setMarks(new Map(markList.map((m) => [m.studyDate, m])));
      setSummary(sum);
    } catch (e) {
      console.error("カレンダーの読み込みに失敗しました", e);
    }
  }, [ym]);

  useEffect(() => {
    void reload();
  }, [reload]);

  async function openDay(dateKey: string) {
    try {
      setDetail(await calendarRepo.getDayDetail(dateKey));
    } catch (e) {
      console.error("日別記録の読み込みに失敗しました", e);
    }
  }

  const grid = getMonthGrid(ym.year, ym.month);

  // 横スワイプでタブ切替（左＝ふりかえりへ / 右＝カレンダーへ）。
  // 2タブなので方向でそのまま行き先が決まる
  const swipeTabs = Gesture.Race(
    Gesture.Fling()
      .direction(Directions.LEFT)
      .onEnd(() => runOnJS(setTab)("summary")),
    Gesture.Fling()
      .direction(Directions.RIGHT)
      .onEnd(() => runOnJS(setTab)("calendar")),
  );

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll}>
        {/* 月の切り替え */}
        <View style={styles.monthBar}>
          <Pressable
            onPress={() => setYm((p) => shiftMonth(p.year, p.month, -1))}
            hitSlop={10}
            accessibilityLabel="前の月"
            style={({ pressed }) => [styles.arrow, pressed && styles.pressed]}
          >
            <Text style={styles.arrowText}>‹</Text>
          </Pressable>
          <Text style={styles.monthLabel}>
            {ym.year}年 {ym.month}月
          </Text>
          <Pressable
            onPress={() => setYm((p) => shiftMonth(p.year, p.month, 1))}
            hitSlop={10}
            accessibilityLabel="次の月"
            style={({ pressed }) => [styles.arrow, pressed && styles.pressed]}
          >
            <Text style={styles.arrowText}>›</Text>
          </Pressable>
        </View>

        {/* タブ: カレンダー ⇄ ふりかえり */}
        <View style={styles.segment}>
          <Pressable
            onPress={() => setTab("calendar")}
            style={[styles.segItem, tab === "calendar" && styles.segItemActive]}
            accessibilityLabel="カレンダー"
            accessibilityState={{ selected: tab === "calendar" }}
          >
            <Text style={[styles.segText, tab === "calendar" && styles.segTextActive]}>
              カレンダー
            </Text>
          </Pressable>
          <Pressable
            onPress={() => setTab("summary")}
            style={[styles.segItem, tab === "summary" && styles.segItemActive]}
            accessibilityLabel="ふりかえり"
            accessibilityState={{ selected: tab === "summary" }}
          >
            <Text style={[styles.segText, tab === "summary" && styles.segTextActive]}>
              ふりかえり
            </Text>
          </Pressable>
        </View>

        <GestureDetector gesture={swipeTabs}>
          <View style={styles.swipeArea}>
        {tab === "calendar" ? (
          <>
            {/* 曜日の見出し */}
            <View style={styles.weekRow}>
              {WEEKDAYS.map((w, i) => (
                <Text
                  key={w}
                  style={[
                    styles.weekday,
                    i === 0 && styles.sunday,
                    i === 6 && styles.saturday,
                  ]}
                >
                  {w}
                </Text>
              ))}
            </View>

            {/* 日付グリッド */}
            <View style={styles.grid}>
              {grid.map((cell, i) => {
                if (cell === null)
                  return <View key={`b${i}`} style={styles.cell} />;
                const mark = marks.get(cell.dateKey);
                const isToday = cell.dateKey === todayKey;
                return (
                  <Pressable
                    key={cell.dateKey}
                    onPress={() => void openDay(cell.dateKey)}
                    style={({ pressed }) => [
                      styles.cell,
                      pressed && styles.pressed,
                    ]}
                  >
                    <View style={[styles.cellInner, isToday && styles.cellToday]}>
                      <Text
                        style={[styles.dayNum, isToday && styles.dayNumToday]}
                      >
                        {cell.day}
                      </Text>
                      {/* 記録のある日: 天気の絵文字。無い天気なら小さなドット */}
                      {mark ? (
                        mark.weatherEmoji ? (
                          <Text style={styles.mark}>{mark.weatherEmoji}</Text>
                        ) : (
                          <View style={styles.dot} />
                        )
                      ) : (
                        <View style={styles.markPlaceholder} />
                      )}
                    </View>
                  </Pressable>
                );
              })}
            </View>
          </>
        ) : (
          /* 月次サマリー・天気アルバム（要件4.2） */
          <MonthSummaryCard summary={summary} />
        )}
          </View>
        </GestureDetector>
      </ScrollView>

      <CalendarDayDetail
        detail={detail}
        userId={user?.id ?? 0}
        onClose={() => setDetail(null)}
        onReload={(studyDate) => void openDay(studyDate)}
      />
    </View>
  );
}

const LIGHT_COLOR = "rgba(255,206,138,0.95)";

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#05070f" },
  // flexGrow で内容が短くてもビューポート全体を占め、空欄でも横スワイプが効くようにする
  scroll: { padding: Spacing.four, paddingBottom: Spacing.six, flexGrow: 1 },
  // スワイプ判定を画面いっぱいに広げる（記録の無い余白でもタブ切替できる）
  swipeArea: { flex: 1 },
  monthBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: Spacing.four,
  },
  arrow: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  arrowText: {
    color: "rgba(255,255,255,0.85)",
    fontSize: 28,
    fontWeight: "300",
  },
  monthLabel: {
    color: "rgba(255,255,255,0.95)",
    fontSize: 18,
    fontWeight: "600",
  },
  segment: {
    flexDirection: "row",
    alignSelf: "center",
    marginBottom: Spacing.four,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.08)",
    padding: 3,
  },
  segItem: {
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.five,
    borderRadius: 999,
  },
  segItemActive: {
    backgroundColor: "rgba(18,26,46,0.9)",
    borderWidth: 1,
    borderColor: LIGHT_COLOR,
  },
  segText: {
    color: "rgba(255,255,255,0.6)",
    fontSize: 13,
  },
  segTextActive: {
    color: LIGHT_COLOR,
    fontWeight: "600",
  },
  weekRow: { flexDirection: "row" },
  weekday: {
    flex: 1,
    textAlign: "center",
    color: "rgba(255,255,255,0.5)",
    fontSize: 12,
    marginBottom: Spacing.two,
  },
  sunday: { color: "rgba(255,150,150,0.7)" },
  saturday: { color: "rgba(150,190,255,0.7)" },
  grid: { flexDirection: "row", flexWrap: "wrap" },
  cell: {
    width: `${100 / 7}%`,
    aspectRatio: 1,
    padding: 2,
  },
  cellInner: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 10,
    gap: 1,
  },
  cellToday: {
    borderWidth: 1,
    borderColor: LIGHT_COLOR,
    backgroundColor: "rgba(255,206,138,0.08)",
  },
  dayNum: {
    color: "rgba(255,255,255,0.8)",
    fontSize: 14,
  },
  dayNumToday: {
    color: LIGHT_COLOR,
    fontWeight: "600",
  },
  mark: { fontSize: 13 },
  dot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: LIGHT_COLOR,
  },
  // 記録の無い日でも高さを揃えるための空きスペース
  markPlaceholder: { height: 13 },
  pressed: { opacity: 0.6 },
});
