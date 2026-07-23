import { Ionicons } from "@expo/vector-icons";
import Slider from "@react-native-community/slider";
import { useFocusEffect } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from "react-native";
import DraggableFlatList, {
  ScaleDecorator,
  type RenderItemParams,
} from "react-native-draggable-flatlist";

import { EditFieldModal } from "@/components/settings-ui";
import { LIMITS } from "@/constants/domain";
import { LightColor, Spacing } from "@/constants/theme";
import { useAudio } from "@/contexts/AudioContext";
import { useSettings } from "@/contexts/SettingsContext";
import { playlistRepo, settingsRepo } from "@/db/repositories";
import type { LibraryTrack } from "@/db/repositories/playlistRepo";
import type { BgmSource } from "@/db/types";
import { validatePlaylistName } from "@/lib/validation";

// 音楽プレイリスト画面（要件9・音楽プレイリスト）。ミニプレイヤーの曲名タップで開く。
//
// 上部で再生ソース（すべて/お気に入り/マイプレイリスト）とシャッフルを選び、再生ボタンで流す。
// 再生中は現在再生中バー（シークバー＋残り時間）を出す。曲をタップするとその曲を再生する。
// 各行で★お気に入り・＋マイプレイリスト追加/削除。マイプレイリストは「編集」で
// 3本線ドラッグの並び替えと、複数選択＋ゴミ箱でのまとめ削除ができる。名前も編集できる。

const SOURCES: { value: BgmSource; label: string }[] = [
  { value: "all", label: "すべて" },
  { value: "favorites", label: "お気に入り" },
  { value: "playlist", label: "マイプレイリスト" },
];

const DANGER = "rgba(255,120,120,0.95)";

/** 秒を m:ss へ整形する（負・非数は0扱い） */
function formatTime(sec: number): string {
  const s = Number.isFinite(sec) && sec > 0 ? Math.floor(sec) : 0;
  const m = Math.floor(s / 60);
  return `${m}:${(s % 60).toString().padStart(2, "0")}`;
}

export default function PlaylistScreen() {
  const { user } = useSettings();
  const audio = useAudio();
  const [library, setLibrary] = useState<LibraryTrack[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  // 並び替え用のローカル順（ドラッグ中のスナップバックを防ぐ）と、複数選択削除の選択ID
  const [dragData, setDragData] = useState<LibraryTrack[]>([]);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  // プレイリスト名（編集可）とその編集ダイアログ
  const [playlistName, setPlaylistName] = useState("マイプレイリスト");
  const [nameModal, setNameModal] = useState(false);
  // シークバーのドラッグ中の値（離すまで再生位置には反映しない）
  const [seeking, setSeeking] = useState<number | null>(null);

  const reload = useCallback(async () => {
    if (!user) return;
    try {
      const [lib, name] = await Promise.all([
        playlistRepo.getBgmLibrary(user.id),
        settingsRepo.getPlaylistName(),
      ]);
      setLibrary(lib);
      setPlaylistName(name);
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

  // ドラッグ用のローカル順を、読み込んだプレイリストに同期する
  useEffect(() => {
    setDragData(playlist);
  }, [playlist]);

  const isPlaylist = audio.bgmSource === "playlist";
  const shown =
    audio.bgmSource === "favorites"
      ? favorites
      : isPlaylist
        ? playlist
        : library;

  function selectSource(value: BgmSource) {
    setEditing(false);
    setSelectedIds([]);
    void audio.setBgmSource(value);
  }

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

  // ドラッグ並び替えの確定（要件9: 3本線ドラッグ）
  async function onDragEnd(data: LibraryTrack[]) {
    if (!user) return;
    setDragData(data); // 先に見た目を確定させてスナップバックを防ぐ
    try {
      await playlistRepo.reorderPlaylist(
        user.id,
        data.map((d) => d.track.id),
      );
      await reload();
      await audio.refreshBgm();
    } catch (e) {
      console.error("並び替えに失敗しました", e);
    }
  }

  function toggleSelect(id: number) {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  // 複数選択した曲をプレイリストからまとめて外す（要件9: ゴミ箱）。お気に入り・曲自体は残る
  function confirmDeleteSelected() {
    if (!user || selectedIds.length === 0) return;
    const n = selectedIds.length;
    Alert.alert(
      "プレイリストから外す",
      `選択した${n}曲をマイプレイリストから外しますか（曲自体は残ります）`,
      [
        { text: "やめる", style: "cancel" },
        {
          text: `外す（${n}）`,
          style: "destructive",
          onPress: () => {
            void (async () => {
              try {
                await playlistRepo.removeManyFromPlaylist(user.id, selectedIds);
                setSelectedIds([]);
                await reload();
                await audio.refreshBgm();
              } catch (e) {
                console.error("プレイリストからの削除に失敗しました", e);
              }
            })();
          },
        },
      ],
    );
  }

  async function saveName(value: string): Promise<string | void> {
    const err = validatePlaylistName(value);
    if (err) return err;
    try {
      await settingsRepo.updatePlaylistName(value.trim());
      setPlaylistName(value.trim());
    } catch (e) {
      console.error("プレイリスト名の保存に失敗しました", e);
      return "保存に失敗しました。時間をおいて再度お試しください";
    }
  }

  const renderDragRow = useCallback(
    ({ item, drag, isActive }: RenderItemParams<LibraryTrack>) => {
      const checked = selectedIds.includes(item.track.id);
      return (
        <ScaleDecorator>
          <View style={[styles.row, isActive && styles.rowActive]}>
            <Pressable
              onPress={() => toggleSelect(item.track.id)}
              hitSlop={8}
              accessibilityLabel={checked ? "選択を外す" : "選択する"}
            >
              <Ionicons
                name={checked ? "checkmark-circle" : "ellipse-outline"}
                size={22}
                color={checked ? LightColor : "rgba(255,255,255,0.4)"}
              />
            </Pressable>
            <View style={styles.rowText}>
              <Text style={styles.trackName} numberOfLines={1}>
                {item.track.name}
              </Text>
              {item.track.artist ? (
                <Text style={styles.trackArtist} numberOfLines={1}>
                  {item.track.artist}
                </Text>
              ) : null}
            </View>
            {/* 3本線を押しながらスライドで並び替え（要件9） */}
            <Pressable
              onPressIn={drag}
              hitSlop={8}
              accessibilityLabel="ドラッグして並び替え"
            >
              <Ionicons
                name="reorder-three"
                size={28}
                color="rgba(255,255,255,0.6)"
              />
            </Pressable>
          </View>
        </ScaleDecorator>
      );
    },
    [selectedIds],
  );

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
              onPress={() => selectSource(s.value)}
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

      {/* 現在再生中バー（シークバー＋残り時間）。要件9: 流しているときに残りが分かる */}
      {audio.bgmTrack ? (
        <View style={styles.nowPlaying}>
          <Pressable
            onPress={audio.toggleBgm}
            style={({ pressed }) => [styles.nowPlayBtn, pressed && styles.pressed]}
            accessibilityLabel={audio.bgmPlaying ? "一時停止" : "再生"}
          >
            <Ionicons
              name={audio.bgmPlaying ? "pause" : "play"}
              size={20}
              color="#05070f"
            />
          </Pressable>
          <View style={styles.nowInfo}>
            <Text style={styles.nowTitle} numberOfLines={1}>
              {audio.bgmTrack.name}
            </Text>
            <Slider
              value={seeking ?? audio.bgmPositionSec}
              minimumValue={0}
              maximumValue={Math.max(1, audio.bgmDurationSec)}
              minimumTrackTintColor={LightColor}
              maximumTrackTintColor="rgba(255,255,255,0.2)"
              thumbTintColor={LightColor}
              disabled={audio.bgmDurationSec <= 0}
              onValueChange={setSeeking}
              onSlidingComplete={(v) => {
                setSeeking(null);
                audio.seekBgm(v);
              }}
              accessibilityLabel="再生位置"
            />
            <View style={styles.timeRow}>
              <Text style={styles.timeText}>
                {formatTime(seeking ?? audio.bgmPositionSec)}
              </Text>
              <Text style={styles.timeText}>
                -
                {formatTime(
                  audio.bgmDurationSec - (seeking ?? audio.bgmPositionSec),
                )}
              </Text>
            </View>
          </View>
        </View>
      ) : null}

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
          <Text style={[styles.shuffleText, audio.bgmShuffle && styles.shuffleOn]}>
            シャッフル
          </Text>
          <Switch
            value={audio.bgmShuffle}
            onValueChange={(v) => void audio.setBgmShuffle(v)}
          />
        </Pressable>
      </View>

      {/* マイプレイリストの名前＋編集ツール */}
      {isPlaylist ? (
        <View style={styles.plHeader}>
          <Pressable
            onPress={() => setNameModal(true)}
            style={styles.plNameBtn}
            accessibilityLabel="プレイリスト名を編集"
          >
            <Text style={styles.plName} numberOfLines={1}>
              {playlistName}
            </Text>
            <Ionicons name="pencil" size={14} color="rgba(255,255,255,0.6)" />
          </Pressable>
          {playlist.length > 0 ? (
            <View style={styles.plTools}>
              {editing ? (
                <Pressable
                  onPress={confirmDeleteSelected}
                  disabled={selectedIds.length === 0}
                  hitSlop={8}
                  style={styles.trashBtn}
                  accessibilityLabel="選択した曲を外す"
                >
                  <Ionicons
                    name="trash-outline"
                    size={20}
                    color={selectedIds.length > 0 ? DANGER : "rgba(255,255,255,0.25)"}
                  />
                </Pressable>
              ) : null}
              <Pressable
                onPress={() => {
                  setEditing((v) => !v);
                  setSelectedIds([]);
                }}
                style={({ pressed }) => [
                  styles.editBtn,
                  pressed && styles.pressed,
                ]}
              >
                <Text style={styles.editText}>{editing ? "完了" : "編集"}</Text>
              </Pressable>
            </View>
          ) : null}
        </View>
      ) : null}

      {/* 一覧。マイプレイリストの編集中はドラッグ並び替え＋複数選択、それ以外はタップで再生 */}
      {editing && isPlaylist ? (
        <DraggableFlatList
          data={dragData}
          keyExtractor={(item) => String(item.track.id)}
          onDragEnd={({ data }) => void onDragEnd(data)}
          renderItem={renderDragRow}
          containerStyle={styles.listFlex}
          contentContainerStyle={styles.list}
        />
      ) : (
        <ScrollView contentContainerStyle={styles.list}>
          {shown.length === 0 ? (
            <View style={styles.empty}>
              <Text style={styles.emptyText}>
                {audio.bgmSource === "favorites"
                  ? "★を付けた曲がここに集まります"
                  : isPlaylist
                    ? "「すべて」の一覧から ＋ で曲を追加してください"
                    : "登録された曲がありません"}
              </Text>
            </View>
          ) : (
            shown.map((item) => (
              <TrackRow
                key={item.track.id}
                item={item}
                playing={audio.bgmTrack?.id === item.track.id}
                onPlay={() => audio.playTrack(item.track.id)}
                onToggleFavorite={() => void toggleFavorite(item)}
                onTogglePlaylist={() => void togglePlaylist(item)}
              />
            ))
          )}
        </ScrollView>
      )}

      <EditFieldModal
        visible={nameModal}
        title="プレイリスト名"
        description={`${LIMITS.PLAYLIST_NAME_MAX}文字以内`}
        initialValue={playlistName}
        placeholder="マイプレイリスト"
        maxLength={LIMITS.PLAYLIST_NAME_MAX}
        validate={validatePlaylistName}
        onCancel={() => setNameModal(false)}
        onSubmit={saveName}
      />
    </View>
  );
}

function TrackRow({
  item,
  playing,
  onPlay,
  onToggleFavorite,
  onTogglePlaylist,
}: {
  item: LibraryTrack;
  playing: boolean;
  onPlay: () => void;
  onToggleFavorite: () => void;
  onTogglePlaylist: () => void;
}) {
  const inPlaylist = item.playlistPosition != null;
  return (
    <View style={[styles.row, playing && styles.rowPlaying]}>
      {/* 曲名部をタップするとその曲を再生（要件9） */}
      <Pressable
        style={styles.rowText}
        onPress={onPlay}
        accessibilityLabel={`${item.track.name}を再生`}
      >
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
      </Pressable>

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
  nowPlaying: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.three,
    marginTop: Spacing.four,
    marginHorizontal: Spacing.four,
    padding: Spacing.three,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.05)",
  },
  nowPlayBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.95)",
  },
  nowInfo: { flex: 1 },
  nowTitle: { color: LightColor, fontSize: 13, fontWeight: "600" },
  timeRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: -Spacing.one,
  },
  timeText: { color: "rgba(255,255,255,0.5)", fontSize: 11 },
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
  plHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: Spacing.four,
    marginHorizontal: Spacing.four,
  },
  plNameBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.two,
    flex: 1,
  },
  plName: { color: "rgba(255,255,255,0.95)", fontSize: 17, fontWeight: "700" },
  plTools: { flexDirection: "row", alignItems: "center", gap: Spacing.three },
  trashBtn: {
    padding: Spacing.one,
  },
  editBtn: {
    paddingVertical: Spacing.one,
    paddingHorizontal: Spacing.three,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.3)",
  },
  editText: { color: "rgba(255,255,255,0.9)", fontSize: 13 },
  listFlex: { flex: 1 },
  list: { paddingTop: Spacing.two, paddingBottom: Spacing.six },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.three,
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.four,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(255,255,255,0.1)",
    backgroundColor: "#05070f",
  },
  rowPlaying: { backgroundColor: "rgba(255,206,138,0.06)" },
  rowActive: { backgroundColor: "rgba(255,255,255,0.12)" },
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
