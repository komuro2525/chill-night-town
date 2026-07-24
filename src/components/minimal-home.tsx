import {
  StyleSheet,
  Text,
  View,
} from "react-native";
import type { EdgeInsets } from "react-native-safe-area-context";

import { Spacing } from "@/constants/theme";
import { useAudio } from "@/contexts/AudioContext";
import type { ActiveSession } from "@/db/types";
import { useAppNow } from "@/lib/clock";
import { getPlannedEndMs } from "@/lib/timer";
import { BatteryIndicator } from "./battery-indicator";
import { ClockButton } from "./clock-button";
import { MeasuringIndicator } from "./measuring-indicator";

// ホームの「最小UI」（アイドル最小表示・横画面で共用。要件2.4）。
// 左上に バッテリー・日付・大きな時刻・再生中の曲名。計測中のみ右上に時計＋「作業中」を出す。
// 操作系は持たない表示専用。時計だけは onPressClock を渡したときにタップできる
// （縦のアイドルでは詳細（タイマー表示）へ飛ぶ。横画面は閲覧専用のため渡さない）。

const CLOCK_SIZE = 155;
const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];

// 例: 2026/08/01(月)
function formatDate(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}/${mm}/${dd}(${WEEKDAYS[d.getDay()]})`;
}

// 例: 21:00 PM
function formatTime(d: Date): string {
  const h24 = d.getHours();
  const hh = String(h24).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  return `${hh}:${mi} ${h24 < 12 ? "AM" : "PM"}`;
}

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
        <View style={styles.info}>
          <Text style={styles.date}>{formatDate(now)}</Text>
          <Text style={styles.time}>{formatTime(now)}</Text>
          <Text style={styles.nowPlaying} numberOfLines={1}>
            ♪ {bgmTrack ? bgmTrack.name : "音楽なし"}
          </Text>
        </View>
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

const styles = StyleSheet.create({
  leftInfo: { position: "absolute", gap: Spacing.two },
  clock: { position: "absolute", alignItems: "center" },
  info: { marginTop: Spacing.two, gap: 2 },
  date: {
    color: "rgba(255,255,255,0.85)",
    fontSize: 13,
    fontWeight: "500",
    textShadowColor: "rgba(0,0,0,0.6)",
    textShadowRadius: 4,
  },
  time: {
    color: "#ffffff",
    fontSize: 40,
    fontWeight: "300",
    letterSpacing: 1,
    textShadowColor: "rgba(0,0,0,0.6)",
    textShadowRadius: 6,
  },
  nowPlaying: {
    marginTop: Spacing.two,
    color: "rgba(255,255,255,0.8)",
    fontSize: 13,
    maxWidth: 240,
    textShadowColor: "rgba(0,0,0,0.6)",
    textShadowRadius: 4,
  },
});
