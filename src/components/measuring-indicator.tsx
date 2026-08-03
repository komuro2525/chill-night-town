import { StyleSheet, Text } from "react-native";

import type { ActiveSession } from "@/db/types";
import { useTimerNow } from "@/hooks/use-timer-now";
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
// 経過の秒境界に合わせて更新するため独立した部品にしている。上部オーバーレイ本体に
// この毎秒更新を持たせると、時計・バッテリー・レベル・学習時間まで描き直すことになるため、
// 更新をこの部品に閉じ込める。useTimerNow は一時停止/再開の瞬間も正確に反映する。

export function MeasuringIndicator({
  session,
  width,
}: {
  session: ActiveSession;
  /** 時計と同じ幅に揃えて中央寄せする */
  width: number;
}) {
  const now = useTimerNow(session);

  const isPaused = session.pause_started_at !== null;
  const actual = getActualStudySeconds(session, now);
  const phase =
    session.timer_mode === "pomodoro"
      ? getPomodoroPhase(session, getElapsedSeconds(session, now))
      : null;

  // 一時停止中はフェーズより「止まっている」ことを優先して伝える
  const label = isPaused
    ? "一時停止中"
    : phase
      ? phase.kind === "work"
        ? "作業中"
        : "休憩中"
      : "学習中";

  // 休憩中は実績学習時間が進まないため、タイマー表示と同じく休憩の残り時間を出す
  const seconds =
    !isPaused && phase?.kind === "break" ? phase.remainingSeconds : actual;

  return (
    <Text
      style={[styles.text, { width }, isPaused && styles.paused]}
      numberOfLines={1}
    >
      {formatDuration(seconds)} {label}
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
