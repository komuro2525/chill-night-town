import { useCallback, useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import {
  Directions,
  Gesture,
  GestureDetector,
} from "react-native-gesture-handler";
import { runOnJS } from "react-native-reanimated";

import { CalendarDayDetail } from "@/components/calendar-day-detail";
import { FeatureTutorial } from "@/components/feature-tutorial";
import { MonthSummaryCard } from "@/components/month-summary-card";
import { OverallSummaryCard } from "@/components/overall-summary-card";
import { StarField } from "@/components/summary-parts";
import { LightColor, Spacing } from "@/constants/theme";
import { useSettings } from "@/contexts/SettingsContext";
import { calendarRepo, eventRepo, townProgressRepo } from "@/db/repositories";
import type { TownWithProgress } from "@/db/repositories/townProgressRepo";
import type {
  DayDetail,
  DayMark,
  MonthSummary,
  OverallSummary,
} from "@/db/repositories/calendarRepo";
import {
  getAlbumStage,
  getMonthGrid,
  getMonthRange,
  isMonthComplete,
  shiftMonth,
} from "@/lib/calendar";
import { now } from "@/lib/clock";
import { buildReviewMessage, tallyFromCounts } from "@/lib/monthly-review";
import { refreshNotifications } from "@/lib/notification-sync";
import { getStudyDate } from "@/lib/study-day";

// S7 カレンダー画面（要件4章）。日別記録閲覧（4.1）・月次サマリー（4.2）。
// 集計はすべて学習日（study_date）基準。マス日付＝study_date で一致する。

const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];

// タブの並び。横スワイプはこの順序を1つずつ進む/戻る（端では止まる）
const TABS = [
  { key: "calendar", label: "カレンダー" },
  { key: "summary", label: "ふりかえり" },
  { key: "overall", label: "これまで" },
] as const;
type TabKey = (typeof TABS)[number]["key"];

export default function CalendarScreen() {
  const { user, townNpc } = useSettings();
  const today = now();
  const [ym, setYm] = useState({
    year: today.getFullYear(),
    month: today.getMonth() + 1,
  });
  const [marks, setMarks] = useState<Map<string, DayMark>>(new Map());
  // 予定がある暦日（マーク表示用。4章）
  const [eventDates, setEventDates] = useState<Set<string>>(new Set());
  const [summary, setSummary] = useState<MonthSummary | null>(null);
  const [detail, setDetail] = useState<DayDetail | null>(null);
  // 通算のふりかえり（要件4.4）。月に依存しないため、タブを開いたときだけ読む
  const [overall, setOverall] = useState<OverallSummary | null>(null);
  const [towns, setTowns] = useState<TownWithProgress[]>([]);
  // カレンダー（夜を1日ずつ辿る）／ふりかえり（月を俯瞰）／これまで（通算）を切り替える。
  // 月の選択はカレンダー・ふりかえりで共有する（これまでは月に依存しない）
  const [tab, setTab] = useState<TabKey>("calendar");

  // 「今日」のマスは暦日ではなく学習日基準（マス＝study_date のため）。
  // 深夜0:00〜4:59は前夜のサイクル内なので、今夜の記録が乗る前日のマスを光らせる
  const todayKey = getStudyDate(today);

  const reload = useCallback(async () => {
    const { start, end } = getMonthRange(ym.year, ym.month);
    try {
      const [markList, sum, evDates] = await Promise.all([
        calendarRepo.getMonthMarks(start, end),
        calendarRepo.getMonthSummary(start, end),
        user ? eventRepo.getEventDatesInRange(user.id, start, end) : Promise.resolve<string[]>([]),
      ]);
      setMarks(new Map(markList.map((m) => [m.studyDate, m])));
      setSummary(sum);
      setEventDates(new Set(evDates));
    } catch (e) {
      console.error("カレンダーの読み込みに失敗しました", e);
    }
  }, [ym, user]);

  useEffect(() => {
    void reload();
  }, [reload]);

  // 通算は全期間の集計のため、月を切り替えるたびに引き直さない。
  // 「これまで」を開いたときと、記録を編集したあとにだけ読む
  const reloadOverall = useCallback(async () => {
    try {
      const [sum, townList] = await Promise.all([
        calendarRepo.getOverallSummary(),
        townProgressRepo.listTownsWithProgress(),
      ]);
      setOverall(sum);
      setTowns(townList);
    } catch (e) {
      console.error("通算のふりかえりの読み込みに失敗しました", e);
    }
  }, []);

  useEffect(() => {
    if (tab === "overall") void reloadOverall();
  }, [tab, reloadOverall]);

  async function openDay(dateKey: string) {
    try {
      setDetail(await calendarRepo.getDayDetail(dateKey));
    } catch (e) {
      console.error("日別記録の読み込みに失敗しました", e);
    }
  }

  const grid = getMonthGrid(ym.year, ym.month);

  // 夜空の種。月ごとに星の配置を変える（同じ空が並ぶと月を移っても景色が変わらない）
  const skySeed = ym.year * 100 + ym.month;

  // 完了した月に限り、その月の感情傾向＋最多感情に応じたねぎらいの一言（要件4.2拡張）。
  // 進行中の月・記録の無い月には出さない。文面は傾向と住人で決まり、同じ月なら毎回同じ。
  const reviewMessage =
    summary &&
    summary.sessionCount > 0 &&
    isMonthComplete(ym.year, ym.month, todayKey)
      ? buildReviewMessage({
          tally: tallyFromCounts(
            summary.emotionCounts.map((e) => ({
              category: e.emotion.category,
              count: e.count,
            })),
          ),
          topEmotionLabel: summary.topEmotion
            ? `${summary.topEmotion.emoji} ${summary.topEmotion.name}`
            : null,
          topWeatherLabel: summary.topWeather
            ? `${summary.topWeather.emoji} ${summary.topWeather.name}`
            : null,
          // 天気の一言はその天気に沿った内容にするため、コードも渡す。
          // 年月は、天気の一言の候補（天気ごとに3本）を月で決めるために使う
          topWeatherCode: summary.topWeather?.code ?? null,
          year: ym.year,
          month: ym.month,
          // 振り返るのは、いまいる街の住人（要件7.1）
          npcId: townNpc?.id,
        })
      : null;

  // 横スワイプでタブ切替（左＝次のタブへ / 右＝前のタブへ）。端では止まる
  const shiftTab = useCallback((delta: number) => {
    setTab((prev) => {
      const i = TABS.findIndex((t) => t.key === prev);
      const next = Math.min(TABS.length - 1, Math.max(0, i + delta));
      return TABS[next].key;
    });
  }, []);

  const swipeTabs = Gesture.Race(
    Gesture.Fling()
      .direction(Directions.LEFT)
      .onEnd(() => runOnJS(shiftTab)(1)),
    Gesture.Fling()
      .direction(Directions.RIGHT)
      .onEnd(() => runOnJS(shiftTab)(-1)),
  );

  return (
    <View style={styles.container}>
      {/* 初めてカレンダーを開いたとき一度だけ、この機能の説明を出す */}
      <FeatureTutorial featureKey="calendar" />
      <ScrollView contentContainerStyle={styles.scroll}>
        {/* 月の切り替え。通算（これまで）は月に依存しないため出さない */}
        {tab !== "overall" ? (
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
        ) : (
          /* 月バーを消すと画面が上に詰まるため、同じ高さの余白で位置を揃える */
          <View style={styles.monthBarPlaceholder} />
        )}

        {/* タブ: カレンダー / ふりかえり / これまで */}
        <View style={styles.segment}>
          {TABS.map((t) => (
            <Pressable
              key={t.key}
              onPress={() => setTab(t.key)}
              style={[styles.segItem, tab === t.key && styles.segItemActive]}
              accessibilityLabel={t.label}
              accessibilityState={{ selected: tab === t.key }}
            >
              <Text style={[styles.segText, tab === t.key && styles.segTextActive]}>
                {t.label}
              </Text>
            </Pressable>
          ))}
        </View>

        <GestureDetector gesture={swipeTabs}>
          <View style={styles.swipeArea}>
        {tab === "calendar" ? (
          <View style={styles.sky}>
            {/* その月に学習した夜の数に応じて灯る星（要件4.2）。
                月の一覧の全面に、マスの背面として敷く */}
            <StarField
              stage={getAlbumStage(summary?.nightCount ?? 0, "monthly")}
              seed={skySeed}
            />

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
                // 予定がある日は数字を灯り色にする（4章）
                const hasEvent = eventDates.has(cell.dateKey);
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
                        style={[
                          styles.dayNum,
                          isToday && styles.dayNumToday,
                          hasEvent && styles.dayNumEvent,
                        ]}
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
          </View>
        ) : tab === "summary" ? (
          /* 月次サマリー・天気アルバム（要件4.2） */
          <MonthSummaryCard
            summary={summary}
            reviewMessage={reviewMessage}
            skySeed={skySeed}
          />
        ) : (
          /* 通算のふりかえり（要件4.4） */
          <OverallSummaryCard summary={overall} towns={towns} />
        )}
          </View>
        </GestureDetector>
      </ScrollView>

      <CalendarDayDetail
        detail={detail}
        userId={user?.id ?? 0}
        onClose={() => setDetail(null)}
        onReload={(studyDate) => void openDay(studyDate)}
        // 予定を追加/変更/削除したら、月のマークを読み直し、通知も張り直す
        onEventsChanged={() => {
          void reload();
          void refreshNotifications();
        }}
      />
    </View>
  );
}


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
  // 月バーと同じ高さ（ボタン44 + 下マージン）。タブ切替で見出しが飛び跳ねないようにする
  monthBarPlaceholder: { height: 44, marginBottom: Spacing.four },
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
    borderColor: LightColor,
  },
  segText: {
    color: "rgba(255,255,255,0.6)",
    fontSize: 13,
  },
  segTextActive: {
    color: LightColor,
    fontWeight: "600",
  },
  // 月の一覧の夜空。マスの下の余白まで広げ（flex:1）、そこにも星を灯す。
  // マスぶんの高さしか無いと、画面下half が空いて寂しく見えるため
  sky: { flex: 1, overflow: "hidden", borderRadius: 12 },
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
    borderColor: LightColor,
    backgroundColor: "rgba(255,206,138,0.08)",
  },
  dayNum: {
    color: "rgba(255,255,255,0.8)",
    fontSize: 14,
  },
  dayNumToday: {
    color: LightColor,
    fontWeight: "600",
  },
  // 予定がある日（4章）。灯り色で「ここに何かある」をそっと示す（急かす赤にはしない）
  dayNumEvent: {
    color: LightColor,
    fontWeight: "700",
  },
  mark: { fontSize: 13 },
  dot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: LightColor,
  },
  // 記録の無い日でも高さを揃えるための空きスペース
  markPlaceholder: { height: 13 },
  pressed: { opacity: 0.6 },
});
