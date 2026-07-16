import { Ionicons } from "@expo/vector-icons";
import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { Spacing } from "@/constants/theme";
import { masterRepo, settingsRepo } from "@/db/repositories";
import type { AmbientSound } from "@/db/types";

// BGMミニプレイヤー（要件9「BGMの再生とミニプレイヤー」）。
// ホーム画面に常時表示する（タイマー計測中も継続。鑑賞モード中のみ非表示）。
//
// TODO(Phase 7): 実際の再生は AudioContext + expo-audio で実装する。
//   現状は曲名・クレジットの表示と操作UIの枠のみで、操作しても音は鳴らない。
//   Phase 7 で対応する要件:
//     - ホーム初回表示で自動再生（フェードイン）／BGMプールのシャッフル再生
//     - 長い曲名のスクロール表示（現状は末尾を省略表示）
//     - 音量変更への追従（BGM音量0で非表示・再生処理なし）

const BUTTON_SIZE = 34;
const PLAY_BUTTON_SIZE = 44;

export function BgmMiniPlayer() {
  const [track, setTrack] = useState<AmbientSound | null>(null);
  const [bgmVolume, setBgmVolume] = useState<number | null>(null);
  const [isPlaying, setIsPlaying] = useState(true);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const [tracks, audio] = await Promise.all([
          masterRepo.getBgmTracks(),
          settingsRepo.getAudioSetting(),
        ]);
        if (!mounted) return;
        setTrack(tracks[0] ?? null);
        setBgmVolume(audio?.bgm_volume ?? null);
      } catch (e) {
        console.error("BGM情報の読み込みに失敗しました", e);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  // BGM音量0のときはミニプレイヤーを表示しない（要件9）
  if (track === null || bgmVolume === null || bgmVolume === 0) return null;

  return (
    <View style={styles.container}>
      <Text style={styles.title} numberOfLines={1}>
        {track.name}
      </Text>
      {track.artist ? (
        <Text style={styles.artist} numberOfLines={1}>
          {track.artist}
        </Text>
      ) : null}

      <View style={styles.controls}>
        {/* 巻き戻し: 再生中の曲の頭に戻る（前の曲へは戻らない） */}
        <ControlButton
          name="play-back"
          size={BUTTON_SIZE}
          accessibilityLabel="曲の最初に戻る"
          onPress={() => {}}
        />
        <ControlButton
          name={isPlaying ? "pause" : "play"}
          size={PLAY_BUTTON_SIZE}
          accessibilityLabel={isPlaying ? "BGMを一時停止" : "BGMを再開"}
          onPress={() => setIsPlaying((v) => !v)}
        />
        <ControlButton
          name="play-forward"
          size={BUTTON_SIZE}
          accessibilityLabel="次の曲へ"
          onPress={() => {}}
        />
      </View>
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
  title: {
    color: "rgba(255,255,255,0.95)",
    fontSize: 13,
    fontWeight: "500",
    maxWidth: 180,
  },
  artist: {
    color: "rgba(255,255,255,0.6)",
    fontSize: 11,
    marginTop: 1,
    maxWidth: 180,
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
