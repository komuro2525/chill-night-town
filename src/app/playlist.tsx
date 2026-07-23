import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from "react-native";

import { LightColor, Spacing } from "@/constants/theme";
import { useAudio } from "@/contexts/AudioContext";
import { useSettings } from "@/contexts/SettingsContext";
import { playlistRepo } from "@/db/repositories";
import type { LibraryTrack } from "@/db/repositories/playlistRepo";
import type { BgmSource } from "@/db/types";

// 音楽プレイリスト画面（要件9・音楽プレイリスト）。ミニプレイヤーの曲名タップで開く。
//
// 上部で再生ソース（すべて/お気に入り/マイプレイリスト）とシャッフルを選び、再生ボタンで流す。
// 一覧は選んだソースの曲。各行で★お気に入り・＋マイプレイリスト追加/削除、
// マイプレイリストは「並び替え」で▲▼移動。設定・並びはDBに保存され、選んだソースが流れる。

const SOURCES: { value: BgmSource; label: string }[] = [
  { value: "all", label: "すべて" },
  { value: "favorites", label: "お気に入り" },
  { value: "playlist", label: "マイプレイリスト" },
];

export default function PlaylistScreen() {
  const { user } = useSettings();
  const audio = useAudio();
  const [library, setLibrary] = useState<LibraryTrack[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);

  const reload = useCallback(async () => {
    if (!user) return;
    try {
      setLibrary(await playlistRepo.getBgmLibrary(user.id));
    } catch (e) {
      console.error("曲の読み込みに失敗しました", e);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload]),
  );

  const favorites = useMemo(
    () => library.filter((l) => l.isFavorite),
    [library],
  );
  const playlist = useMemo(
    () =>
      library
        .filter((l) => l.playlistPosition != null)
        .sort((a, b) => (a.playlistPosition ?? 0) - (b.playlistPosition ?? 0)),
    [library],
  );
  const isPlaylist = audio.bgmSource === "playlist";
  const shown =
    audio.bgmSource === "favorites"
      ? favorites
      : audio.bgmSource === "playlist"
        ? playlist
        : library;

  async function toggleFavorite(item: LibraryTrack) {
    if (!user) return;
    try {
      await playlistRepo.setFavorite(user.id, item.track.id, !item.isFavorite);
      await reload();
      await audio.refreshBgm();
    } catch (e) {
      console.error("お気に入りの更新に失敗しました", e);
    }
  }

  async function togglePlaylist(item: LibraryTrack) {
    if (!user) return;
    try {
      await playlistRepo.setInPlaylist(
        user.id,
        item.track.id,
        item.playlistPosition == null,
      );
      await reload();
      await audio.refreshBgm();
    } catch (e) {
      console.error("プレイリストの更新に失敗しました", e);
    }
  }

  // 並び替え（▲▼）。渡された index の曲を dir 方向へ1つ動かす
  async function move(index: number, dir: -1 | 1) {
    if (!user) return;
    const ids = playlist.map((l) => l.track.id);
    const j = index + dir;
    if (j < 0 || j >= ids.length) return;
    [ids[index], ids[j]] = [ids[j], ids[index]];
    try {
      await playlistRepo.reorderPlaylist(user.id, ids);
      await reload();
      await audio.refreshBgm();
    } catch (e) {
      console.error("並び替えに失敗しました", e);
    }
  }

  if (loading) {
    return (
      <View style={[styles.container, styles.center]}>
        <ActivityIndicator color="#ffffff" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* ソース切替 */}
      <View style={styles.segment}>
        {SOURCES.map((s) => {
          const active = audio.bgmSource === s.value;
          return (
            <Pressable
              key={s.value}
              onPress={() => {
                setEditing(false);
                void audio.setBgmSource(s.value);
              }}
              style={[styles.segItem, active && styles.segItemActive]}
              accessibilityState={{ selected: active }}
            >
              <Text style={[styles.segText, active && styles.segTextActive]}>
                {s.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {/* 再生＋シャッフル */}
      <View style={styles.playRow}>
        <Pressable
          onPress={() => audio.startBgm()}
          style={({ pressed }) => [styles.playButton, pressed && styles.pressed]}
          accessibilityLabel="このソースを再生"
        >
          <Ionicons name="play" size={18} color="#05070f" />
          <Text style={styles.playText}>再生</Text>
        </Pressable>
        <Pressable
          onPress={() => void audio.setBgmShuffle(!audio.bgmShuffle)}
          style={styles.shuffleRow}
          accessibilityLabel="シャッフル"
          accessibilityState={{ selected: audio.bgmShuffle }}
        >
          <Ionicons
            name="shuffle"
            size={20}
            color={audio.bgmShuffle ? LightColor : "rgba(255,255,255,0.4)"}
          />
          <Text
            style={[styles.shuffleText, audio.bgmShuffle && styles.shuffleOn]}
          >
            シャッフル
          </Text>
          <Switch
            value={audio.bgmShuffle}
            onValueChange={(v) => void audio.setBgmShuffle(v)}
          />
        </Pressable>
      </View>

      {/* マイプレイリストの並び替え切替 */}
      {isPlaylist && playlist.length > 1 ? (
        <Pressable
          onPress={() => setEditing((v) => !v)}
          style={({ pressed }) => [styles.editButton, pressed && styles.pressed]}
        >
          <Ionicons
            name={editing ? "checkmark" : "swap-vertical"}
            size={16}
            color="rgba(255,255,255,0.9)"
          />
          <Text style={styles.editText}>
            {editing ? "並び替えを終える" : "並び替え"}
          </Text>
        </Pressable>
      ) : null}

      <ScrollView contentContainerStyle={styles.list}>
        {shown.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyText}>
              {audio.bgmSource === "favorites"
                ? "★を付けた曲がここに集まります"
                : audio.bgmSource === "playlist"
                  ? "「すべて」の一覧から ＋ で曲を追加してください"
                  : "登録された曲がありません"}
            </Text>
          </View>
        ) : (
          shown.map((item, i) => (
            <TrackRow
              key={item.track.id}
              item={item}
              playing={audio.bgmTrack?.id === item.track.id}
              reorder={
                isPlaylist && editing
                  ? { index: i, count: shown.length, onMove: move }
                  : null
              }
              onToggleFavorite={() => void toggleFavorite(item)}
              onTogglePlaylist={() => void togglePlaylist(item)}
            />
          ))
        )}
      </ScrollView>
    </View>
  );
}

function TrackRow({
  item,
  playing,
  reorder,
  onToggleFavorite,
  onTogglePlaylist,
}: {
  item: LibraryTrack;
  playing: boolean;
  reorder: { index: number; count: number; onMove: (i: number, d: -1 | 1) => void } | null;
  onToggleFavorite: () => void;
  onTogglePlaylist: () => void;
}) {
  const inPlaylist = item.playlistPosition != null;
  return (
    <View style={[styles.row, playing && styles.rowPlaying]}>
      {reorder ? (
        <View style={styles.reorderCol}>
          <Pressable
            onPress={() => reorder.onMove(reorder.index, -1)}
            disabled={reorder.index === 0}
            hitSlop={6}
            accessibilityLabel="上へ"
          >
            <Ionicons
              name="chevron-up"
              size={22}
              color={reorder.index === 0 ? "rgba(255,255,255,0.2)" : "rgba(255,255,255,0.85)"}
            />
          </Pressable>
          <Pressable
            onPress={() => reorder.onMove(reorder.index, 1)}
            disabled={reorder.index === reorder.count - 1}
            hitSlop={6}
            accessibilityLabel="下へ"
          >
            <Ionicons
              name="chevron-down"
              size={22}
              color={
                reorder.index === reorder.count - 1
                  ? "rgba(255,255,255,0.2)"
                  : "rgba(255,255,255,0.85)"
              }
            />
          </Pressable>
        </View>
      ) : null}

      <View style={styles.rowText}>
        <Text
          style={[styles.trackName, playing && styles.trackNamePlaying]}
          numberOfLines={1}
        >
          {item.track.name}
        </Text>
        {item.track.artist ? (
          <Text style={styles.trackArtist} numberOfLines={1}>
            {item.track.artist}
          </Text>
        ) : null}
      </View>

      {!reorder ? (
        <View style={styles.rowActions}>
          <Pressable onPress={onToggleFavorite} hitSlop={8} accessibilityLabel="お気に入り">
            <Ionicons
              name={item.isFavorite ? "star" : "star-outline"}
              size={22}
              color={item.isFavorite ? LightColor : "rgba(255,255,255,0.4)"}
            />
          </Pressable>
          <Pressable onPress={onTogglePlaylist} hitSlop={8} accessibilityLabel="マイプレイリスト">
            <Ionicons
              name={inPlaylist ? "checkmark-circle" : "add-circle-outline"}
              size={24}
              color={inPlaylist ? LightColor : "rgba(255,255,255,0.4)"}
            />
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#05070f" },
  center: { alignItems: "center", justifyContent: "center" },
  segment: {
    flexDirection: "row",
    alignSelf: "center",
    marginTop: Spacing.four,
    marginHorizontal: Spacing.four,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.08)",
    padding: 3,
  },
  segItem: {
    flex: 1,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
    borderRadius: 999,
    alignItems: "center",
  },
  segItemActive: {
    backgroundColor: "rgba(18,26,46,0.9)",
    borderWidth: 1,
    borderColor: LightColor,
  },
  segText: { color: "rgba(255,255,255,0.6)", fontSize: 12 },
  segTextActive: { color: LightColor, fontWeight: "600" },
  playRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.three,
    paddingHorizontal: Spacing.four,
    marginTop: Spacing.four,
  },
  playButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.one,
    backgroundColor: "rgba(255,255,255,0.95)",
    borderRadius: 999,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.five,
  },
  playText: { color: "#05070f", fontSize: 15, fontWeight: "600" },
  shuffleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.two,
  },
  shuffleText: { color: "rgba(255,255,255,0.6)", fontSize: 12 },
  shuffleOn: { color: LightColor },
  editButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.one,
    alignSelf: "flex-end",
    marginTop: Spacing.three,
    marginHorizontal: Spacing.four,
    paddingVertical: Spacing.one,
    paddingHorizontal: Spacing.three,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.3)",
  },
  editText: { color: "rgba(255,255,255,0.9)", fontSize: 13 },
  list: { padding: Spacing.four, paddingBottom: Spacing.six },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.three,
    paddingVertical: Spacing.three,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(255,255,255,0.1)",
  },
  rowPlaying: { backgroundColor: "rgba(255,206,138,0.06)" },
  reorderCol: { alignItems: "center" },
  rowText: { flex: 1 },
  trackName: { color: "rgba(255,255,255,0.95)", fontSize: 15 },
  trackNamePlaying: { color: LightColor },
  trackArtist: { color: "rgba(255,255,255,0.55)", fontSize: 12, marginTop: 1 },
  rowActions: { flexDirection: "row", alignItems: "center", gap: Spacing.three },
  empty: { alignItems: "center", paddingVertical: Spacing.six },
  emptyText: {
    color: "rgba(255,255,255,0.45)",
    fontSize: 14,
    textAlign: "center",
  },
  pressed: { opacity: 0.6 },
});
