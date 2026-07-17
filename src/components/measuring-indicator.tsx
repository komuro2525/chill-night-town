import { StyleSheet, Text } from "react-native";

import type { ActiveSession } from "@/db/types";
import { useAppNow } from "@/lib/clock";
import {
  getActualStudySeconds,
  getElapsedSeconds,
  getPomodoroPhase,
} from "@/lib/timer";
import { formatDuration } from "./timer-display";

// ホーム画面の計測中インジケータ（要件2.1）。
//
// タイマー稼働中に時計の下へ常時表示する。表示するのは経過時間と、
// ポモドーロモードの場合は現在フェーズ。タップでタイマー表示を再展開する
// （タップの受け口は時計側が持つ）。
//
// 1秒ごとに更新するため独立した部品にしている。上部オーバーレイ本体に
// useAppNow(1000) を持たせると、時計・バッテリー・レベル・学習時間まで
// 毎秒描き直すことになるため、更新をこの1行に閉じ込める。

export function MeasuringIndicator({
  session,
  width,
}: {
  session: ActiveSession;
  /** 時計と同じ幅に揃えて中央寄せする */
  width: number;
}) {
  const now = useAppNow(1000);

  const isPaused = session.pause_started_at !== null;
  const actual = getActualStudySeconds(session, now.getTime());
  const phase =
    session.timer_mode === "pomodoro"
      ? getPomodoroPhase(session, getElapsedSeconds(session, now.getTime()))
      : null;

  // 一時停止中はフェーズより「止まっている」ことを優先して伝える
  const label = isPaused
    ? "一時停止中"
    : phase
      ? phase.kind === "work"
        ? "作業中"
        : "休憩中"
      : "学習中";

  return (
    <Text
      style={[styles.text, { width }, isPaused && styles.paused]}
      numberOfLines={1}
    >
      {formatDuration(actual)} {label}
    </Text>
  );
}

const styles = StyleSheet.create({
  text: {
    marginTop: 8,
    textAlign: "center",
    color: "rgba(255,206,138,0.95)",
    fontSize: 11,
    fontWeight: "500",
    fontVariant: ["tabular-nums"],
    textShadowColor: "rgba(0,0,0,0.6)",
    textShadowRadius: 4,
  },
  // 止まっているときは灯りの色を外し、動いていないことを色でも示す
  paused: {
    color: "rgba(255,255,255,0.6)",
  },
});
