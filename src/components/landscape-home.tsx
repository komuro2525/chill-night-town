import { Image } from "expo-image";
import { useState } from "react";
import {
  type ImageSourcePropType,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Spacing } from "@/constants/theme";
import type { ActiveSession } from "@/db/types";
import { useAppNow } from "@/lib/clock";
import {
  getActualStudySeconds,
  getElapsedSeconds,
  getPomodoroPhase,
} from "@/lib/timer";
import { BatteryIndicator } from "./battery-indicator";
import { formatDuration } from "./timer-display";

// 横画面表示（要件2.4「横画面表示（ホーム画面限定）」）。
//
// 端末を横向きにしたときの閲覧専用ビュー。街の全景を1画面に表示し、UIは持たない。
// 重ねるのは最小限の情報（日時・バッテリー、稼働中のみ経過時間＋フェーズ）だけで、
// 画面タップでその情報の表示/非表示を切り替える。それ以外の操作（タイマー操作等）は
// 一切行わない——操作したいときは端末を縦に戻す（縦向きが唯一の復帰操作）。
//
// スワイプによる街探索は行わない（全景が収まるためスクロール不要）。

// 背景の当て方。cover=全画面に敷き詰め（上下は切れる／素材は横向きのセーフマージンを想定）。
// 現行アートは縦向き前提のため、見栄えが悪ければ "contain" に変える
const CONTENT_FIT: "cover" | "contain" = "cover";

const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];

function formatDateTime(d: Date): string {
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const weekday = WEEKDAYS[d.getDay()];
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  return `${mm}/${dd}(${weekday}) ${hh}:${mi}`;
}

export function LandscapeHome({
  art,
  session,
}: {
  /** 選択中の街の全景（未登録なら暗い背景のみ） */
  art: ImageSourcePropType | undefined;
  /** 計測中セッション（非計測時は null）。稼働中のみ経過時間を出す */
  session: ActiveSession | null;
}) {
  const insets = useSafeAreaInsets();
  // 情報表示の表示/非表示（タップでトグル）。初期は表示
  const [infoVisible, setInfoVisible] = useState(true);

  return (
    <Pressable
      style={styles.container}
      onPress={() => setInfoVisible((v) => !v)}
      accessibilityLabel="タップで情報表示を切り替え"
    >
      {art ? (
        <Image source={art} style={StyleSheet.absoluteFill} contentFit={CONTENT_FIT} />
      ) : (
        <View style={[StyleSheet.absoluteFill, styles.fallback]} />
      )}

      {infoVisible ? (
        <View
          style={[
            styles.info,
            { top: insets.top + Spacing.two, left: insets.left + Spacing.four },
          ]}
          pointerEvents="none"
        >
          <BatteryIndicator />
          <Clock />
          {session ? <ElapsedLine session={session} /> : null}
        </View>
      ) : null}
    </Pressable>
  );
}

// 日時（1分ごとに更新すれば十分）
function Clock() {
  const now = useAppNow(10000);
  return <Text style={styles.dateText}>{formatDateTime(now)}</Text>;
}

// 経過時間＋（ポモドーロなら）フェーズ。measuring-indicator と同じ算出
function ElapsedLine({ session }: { session: ActiveSession }) {
  const now = useAppNow(1000);
  const isPaused = session.pause_started_at !== null;
  const actual = getActualStudySeconds(session, now.getTime());
  const phase =
    session.timer_mode === "pomodoro"
      ? getPomodoroPhase(session, getElapsedSeconds(session, now.getTime()))
      : null;
  const label = isPaused
    ? "一時停止中"
    : phase
      ? phase.kind === "work"
        ? "作業中"
        : "休憩中"
      : "学習中";
  return (
    <Text style={[styles.elapsedText, isPaused && styles.elapsedPaused]}>
      {formatDuration(actual)} {label}
    </Text>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#05070f" },
  fallback: { backgroundColor: "#05070f" },
  info: {
    position: "absolute",
    gap: 2,
  },
  dateText: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "500",
    textShadowColor: "rgba(0,0,0,0.6)",
    textShadowRadius: 4,
  },
  elapsedText: {
    marginTop: 2,
    color: "rgba(255,206,138,0.95)",
    fontSize: 12,
    fontWeight: "500",
    fontVariant: ["tabular-nums"],
    textShadowColor: "rgba(0,0,0,0.6)",
    textShadowRadius: 4,
  },
  elapsedPaused: {
    color: "rgba(255,255,255,0.6)",
  },
});
