import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import {
  type LayoutChangeEvent,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";

import { LightColor, Spacing } from "@/constants/theme";
import { useAudio } from "@/contexts/AudioContext";
import { isMuted } from "@/lib/audio";

// BGMミニプレイヤー（要件9「BGMの再生とミニプレイヤー」/ UC 9.2）。
// ホーム画面に常時表示する（タイマー計測中も継続。鑑賞モード中のみ非表示）。
//
// 再生そのものは AudioContext が持つ。ここは表示と操作の受け口だけを担う:
//   - 再生中の曲名・アーティスト（クレジット表記）の表示
//   - 一時停止／再開（対象はBGMのみ）・スキップ・頭出し（前の曲へは戻らない）
//   - BGM音量が0のときは非表示（AudioContext 側も再生処理を行わない。要件9）

const BUTTON_SIZE = 34;
const PLAY_BUTTON_SIZE = 44;
// 曲名の表示幅。これを超える曲名はスクロールさせる
const TEXT_WIDTH = 180;

export function BgmMiniPlayer() {
  const router = useRouter();
  const {
    volumes,
    bgmTrack,
    bgmPlaying,
    bgmProgress,
    bgmHasTracks,
    toggleBgm,
    skipBgm,
    restartBgm,
  } = useAudio();

  // アプリにBGMが1曲も無い（読み込み中含む）ときだけ出さない。
  // 選択中ソース（お気に入り/プレイリスト）が空で bgmTrack が無くても、
  // プレイリスト画面への入口を保つためミニプレイヤーは残す（要件9改訂）。
  if (!bgmHasTracks) return null;
  const muted = isMuted(volumes.bgm);

  return (
    <View style={styles.container}>
      {/* 曲名エリアをタップするとプレイリスト画面へ（要件9・音楽プレイリスト） */}
      <Pressable
        onPress={() => router.push("/playlist")}
        accessibilityLabel="プレイリストを開く"
        style={({ pressed }) => [styles.infoArea, pressed && styles.pressed]}
      >
        {bgmTrack ? (
          <>
            {/* 長い曲名はスクロール表示（要件9。収まる曲名は静止したまま） */}
            <MarqueeText text={bgmTrack.name} style={styles.title} width={TEXT_WIDTH} />
            {bgmTrack.artist ? (
              <Text style={styles.artist} numberOfLines={1}>
                {bgmTrack.artist}
              </Text>
            ) : null}

            {muted ? (
              // 音量0のときは進捗バーの代わりに「音量オフ」を示す（押しても鳴らない理由）
              <View style={styles.mutedRow}>
                <Ionicons name="volume-mute" size={12} color="rgba(255,255,255,0.5)" />
                <Text style={styles.mutedText}>音量オフ</Text>
              </View>
            ) : (
              /* 再生位置の進捗バー（要件9: 曲がどれくらい進んだか視覚的に示す） */
              <View style={styles.progressTrack}>
                <View
                  style={[
                    styles.progressFill,
                    { width: `${Math.round(Math.min(1, Math.max(0, bgmProgress)) * 100)}%` },
                  ]}
                />
              </View>
            )}
          </>
        ) : (
          // 選択中ソース（お気に入り/マイプレイリスト）に曲が無い。入口だけ残す
          <>
            <Text style={styles.emptyTitle}>再生する曲がありません</Text>
            <Text style={styles.emptyHint}>タップして選ぶ</Text>
          </>
        )}
      </Pressable>

      {/* 再生対象があるときだけ操作ボタンを出す */}
      {bgmTrack ? (
        <View style={styles.controls}>
          {/* 巻き戻し: 再生中の曲の頭に戻る（前の曲へは戻らない） */}
          <ControlButton
            name="play-back"
            size={BUTTON_SIZE}
            accessibilityLabel="曲の最初に戻る"
            onPress={restartBgm}
          />
          <ControlButton
            name={bgmPlaying ? "pause" : "play"}
            size={PLAY_BUTTON_SIZE}
            accessibilityLabel={bgmPlaying ? "BGMを一時停止" : "BGMを再開"}
            onPress={toggleBgm}
          />
          <ControlButton
            name="play-forward"
            size={BUTTON_SIZE}
            accessibilityLabel="次の曲へ"
            onPress={skipBgm}
          />
        </View>
      ) : null}
    </View>
  );
}

/**
 * 幅に収まらないテキストだけを左右へゆっくりスクロールさせる（要件9）。
 *
 * 収まる曲名は静止させたいので、実際の文字幅を測ってから判定する。
 * 端まで行ったら少し止めて戻る、を繰り返す（急かさない静かな動き）。
 */
function MarqueeText({
  text,
  style,
  width,
}: {
  text: string;
  style: object;
  width: number;
}) {
  const [textWidth, setTextWidth] = useState(0);
  const offset = useSharedValue(0);
  const overflow = Math.max(0, textWidth - width);

  useEffect(() => {
    cancelAnimation(offset);
    offset.value = 0;
    if (overflow <= 0) return;
    // 端で1秒ずつ止めながら往復する。速度は距離に比例（長いほど時間をかける）
    const durationMs = overflow * 30;
    offset.value = withRepeat(
      withSequence(
        withDelay(1000, withTiming(-overflow, {
          duration: durationMs,
          easing: Easing.inOut(Easing.ease),
        })),
        withDelay(1000, withTiming(0, {
          duration: durationMs,
          easing: Easing.inOut(Easing.ease),
        })),
      ),
      -1,
    );
    return () => cancelAnimation(offset);
    // text が変われば測り直す。overflow はその結果から算出される
  }, [overflow, text, offset]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: offset.value }],
  }));

  function handleLayout(e: LayoutChangeEvent) {
    setTextWidth(e.nativeEvent.layout.width);
  }

  return (
    <View style={{ width, overflow: "hidden" }}>
      <Animated.Text
        onLayout={handleLayout}
        numberOfLines={1}
        style={[style, animatedStyle, { width: "auto", flexShrink: 0 }]}
      >
        {text}
      </Animated.Text>
    </View>
  );
}

function ControlButton({
  name,
  size,
  onPress,
  accessibilityLabel,
}: {
  name: React.ComponentProps<typeof Ionicons>["name"];
  size: number;
  onPress: () => void;
  accessibilityLabel: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={6}
      accessibilityLabel={accessibilityLabel}
      style={({ pressed }) => [
        {
          width: size,
          height: size,
          borderRadius: size / 2,
        },
        styles.controlButton,
        pressed && styles.pressed,
      ]}
    >
      <Ionicons name={name} size={size * 0.46} color="rgba(255,255,255,0.95)" />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: "flex-end",
  },
  infoArea: {
    alignItems: "flex-end",
  },
  title: {
    color: "rgba(255,255,255,0.95)",
    fontSize: 13,
    fontWeight: "500",
  },
  artist: {
    color: "rgba(255,255,255,0.6)",
    fontSize: 11,
    marginTop: 1,
    maxWidth: 180,
  },
  progressTrack: {
    width: TEXT_WIDTH,
    height: 3,
    borderRadius: 2,
    marginTop: Spacing.two,
    backgroundColor: "rgba(255,255,255,0.18)",
    overflow: "hidden",
  },
  mutedRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    marginTop: Spacing.two,
  },
  mutedText: {
    color: "rgba(255,255,255,0.5)",
    fontSize: 11,
  },
  emptyTitle: {
    color: "rgba(255,255,255,0.9)",
    fontSize: 13,
    fontWeight: "500",
  },
  emptyHint: {
    color: "rgba(255,255,255,0.55)",
    fontSize: 11,
    marginTop: 1,
  },
  progressFill: {
    height: "100%",
    borderRadius: 2,
    backgroundColor: LightColor,
  },
  controls: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.two,
    marginTop: Spacing.two,
  },
  controlButton: {
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.95)",
    backgroundColor: "rgba(18,26,46,0.4)",
    alignItems: "center",
    justifyContent: "center",
  },
  pressed: {
    opacity: 0.6,
  },
});
