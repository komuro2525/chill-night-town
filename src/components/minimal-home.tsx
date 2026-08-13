import {
  StyleSheet,
  Text,
  View,
} from "react-native";
import type { EdgeInsets } from "react-native-safe-area-context";

import { ClockAccent, Fonts, Spacing } from "@/constants/theme";
import { useAudio } from "@/contexts/AudioContext";
import type { ActiveSession } from "@/db/types";
import { useAppNow } from "@/lib/clock";
import {
  formatDotDate,
  formatHm,
  formatWeekdayShort,
} from "@/lib/study-day";
import { getPlannedEndMs } from "@/lib/timer";
import { BatteryIndicator } from "./battery-indicator";
import { ClockButton } from "./clock-button";
import { MeasuringIndicator } from "./measuring-indicator";

// ホームの「最小UI」（アイドル最小表示・横画面で共用。要件2.4）。
// 左上に バッテリー・日付・大きな時刻・再生中の曲名。計測中のみ右上に時計＋「作業中」を出す。
// 操作系は持たない表示専用。時計だけは onPressClock を渡したときにタップできる
// （縦のアイドルでは詳細（タイマー表示）へ飛ぶ。横画面は閲覧専用のため渡さない）。

const CLOCK_SIZE = 155;

export function MinimalHomeUI({
  session,
  insets,
  onPressClock,
}: {
  /** 計測中セッション（非計測時は null）。計測中のみ時計＋作業中を出す */
  session: ActiveSession | null;
  insets: EdgeInsets;
  /** 指定時のみ時計をタップできる（縦のアイドルで詳細へ飛ぶ。横画面は渡さない＝非操作） */
  onPressClock?: () => void;
}) {
  // 分が変わったら表示も更新する（大きな時刻表示）
  const now = useAppNow(30 * 1000);
  const { bgmTrack } = useAudio();
  const top = insets.top + Spacing.two;

  return (
    <>
      {/* 左上: バッテリー・日付・大きな時刻・再生中（表示専用） */}
      <View
        style={[styles.leftInfo, { top, left: insets.left + Spacing.four }]}
        pointerEvents="none"
      >
        <BatteryIndicator />
        {/* 日付・時刻・曜日を罫線で挟んだ置き時計の体裁。罫線は時刻の幅に合わせて
            伸びるため、曲名はこの塊の外に出す（長い曲名で罫線が伸びないように） */}
        <View style={styles.info}>
          <Text style={styles.date}>{formatDotDate(now)}</Text>
          <View style={styles.rule} />
          <Text style={styles.time}>{formatHm(now)}</Text>
          <View style={[styles.rule, styles.ruleAccent]} />
          <Text style={styles.weekday}>{formatWeekdayShort(now)}</Text>
        </View>
        <Text style={styles.nowPlaying} numberOfLines={1}>
          ♪ {bgmTrack ? bgmTrack.name : "音楽なし"}
        </Text>
      </View>

      {/* 計測中のみ右上に時計＋「作業中」。onPressClock があるときだけタップできる */}
      {session ? (
        <View
          style={[styles.clock, { top, right: insets.right + Spacing.four }]}
          pointerEvents={onPressClock ? "auto" : "none"}
        >
          <ClockButton
            size={CLOCK_SIZE}
            now={now}
            onPress={onPressClock ?? (() => {})}
            disabled={false}
            endAt={new Date(getPlannedEndMs(session, now.getTime()))}
          />
          <MeasuringIndicator session={session} width={CLOCK_SIZE} />
        </View>
      ) : null}
    </>
  );
}

/** 曲名の折り返しを防ぐ上限幅（これを超えたら末尾を省略する） */
const NOW_PLAYING_MAX_WIDTH = 240;

const styles = StyleSheet.create({
  // 中身は左端に揃える。中央揃えにするとブロックの幅（＝曲名の長さ）で
  // 時刻の位置が変わってしまうため、左端を基準にして動かないようにする
  leftInfo: {
    position: "absolute",
    alignItems: "flex-start",
    gap: Spacing.two,
  },
  clock: { position: "absolute", alignItems: "center" },
  // 罫線を時刻の幅いっぱいに伸ばすため、中身は中央に揃える
  info: { marginTop: Spacing.two, alignItems: "center" },
  date: {
    color: "rgba(255,255,255,0.9)",
    fontSize: 15,
    fontWeight: "500",
    letterSpacing: 3,
    fontFamily: Fonts.serif,
    textShadowColor: "rgba(0,0,0,0.6)",
    textShadowRadius: 4,
  },
  time: {
    color: "#ffffff",
    fontSize: 52,
    fontWeight: "300",
    letterSpacing: 4,
    fontFamily: Fonts.serif,
    textShadowColor: "rgba(0,0,0,0.6)",
    textShadowRadius: 6,
  },
  weekday: {
    color: ClockAccent,
    fontSize: 15,
    fontWeight: "500",
    letterSpacing: 4,
    fontFamily: Fonts.serif,
    textShadowColor: "rgba(0,0,0,0.6)",
    textShadowRadius: 4,
  },
  // 時刻の幅に合わせて伸び、左右を少し詰めた罫線
  rule: {
    alignSelf: "stretch",
    height: 1,
    marginHorizontal: Spacing.four,
    marginVertical: Spacing.one,
    backgroundColor: "rgba(255,255,255,0.75)",
  },
  ruleAccent: { backgroundColor: ClockAccent },
  nowPlaying: {
    color: "rgba(255,255,255,0.8)",
    fontSize: 13,
    maxWidth: NOW_PLAYING_MAX_WIDTH,
    textShadowColor: "rgba(0,0,0,0.6)",
    textShadowRadius: 4,
  },
});
