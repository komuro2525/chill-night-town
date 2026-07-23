import { Ionicons } from "@expo/vector-icons";
import Slider from "@react-native-community/slider";
import { useFocusEffect } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
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
import type {
  LibraryTrack,
  PlaylistItem,
} from "@/db/repositories/playlistRepo";
import type { AmbientSound, BgmSource } from "@/db/types";
import { validatePlaylistName } from "@/lib/validation";

// 音楽プレイリスト画面（要件9・音楽プレイリスト）。ミニプレイヤーの曲名タップで開く。
//
// 上部で再生ソース（すべて/お気に入り/マイプレイリスト）・シャッフル・1曲リピートを選び、
// 再生ボタンで流す。再生中は現在再生中バー（シークバー＋残り時間）を出す。曲タップでその曲を再生。
// 各曲の「…」メニューからお気に入り・プレイリストに追加・クレジット表示を行う。
// マイプレイリストは「編集」でドラッグ並び替えと複数選択＋ゴミ箱の削除ができる。名前も編集できる。
// プレイリストは同じ曲を複数入れられる（追加時に重複確認ダイアログを出す）。

const SOURCES: { value: BgmSource; label: string }[] = [
  { value: "all", label: "すべて" },
  { value: "favorites", label: "お気に入り" },
  { value: "playlist", label: "マイプレイリスト" },
];

const DANGER = "rgba(255,120,120,0.95)";

/** 「…」メニューの対象（一覧の曲・プレイリストのエントリで共通に使う） */
type MenuTarget = { track: AmbientSound; isFavorite: boolean; inPlaylist: boolean };

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
  const [playlistItems, setPlaylistItems] = useState<PlaylistItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  // 並び替え用のローカル順（ドラッグ中のスナップバックを防ぐ）と、複数選択削除の選択（エントリID）
  const [dragData, setDragData] = useState<PlaylistItem[]>([]);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  // プレイリスト名（編集可）とその編集ダイアログ
  const [playlistName, setPlaylistName] = useState("マイプレイリスト");
  const [nameModal, setNameModal] = useState(false);
  // シークバーのドラッグ中の値（離すまで再生位置には反映しない）
  const [seeking, setSeeking] = useState<number | null>(null);
  // 「…」メニューを開いている対象（お気に入り・追加・クレジットの受け口）と表示モード。
  // メニューとクレジットは同じモーダルで切り替える（別モーダルにすると開閉のラグが出るため）
  const [menuItem, setMenuItem] = useState<MenuTarget | null>(null);
  const [menuMode, setMenuMode] = useState<"actions" | "credits">("actions");

  function openMenu(target: MenuTarget) {
    setMenuMode("actions");
    setMenuItem(target);
  }
  function closeMenu() {
    setMenuItem(null);
  }

  const reload = useCallback(async () => {
    if (!user) return;
    try {
      const [lib, plist, name] = await Promise.all([
        playlistRepo.getBgmLibrary(user.id),
        playlistRepo.getPlaylist(user.id),
        settingsRepo.getPlaylistName(),
      ]);
      setLibrary(lib);
      setPlaylistItems(plist);
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

  // ドラッグ用のローカル順を、読み込んだプレイリストに同期する
  useEffect(() => {
    setDragData(playlistItems);
  }, [playlistItems]);

  const isPlaylist = audio.bgmSource === "playlist";
  // すべて/お気に入りタブの一覧（マイプレイリストは playlistItems を別に描く）
  const shownLibrary = audio.bgmSource === "favorites" ? favorites : library;

  function selectSource(value: BgmSource) {
    setEditing(false);
    setSelectedIds([]);
    void audio.setBgmSource(value);
  }

  async function toggleFavorite(target: MenuTarget) {
    if (!user) return;
    try {
      await playlistRepo.setFavorite(user.id, target.track.id, !target.isFavorite);
      await reload();
      await audio.refreshBgm();
    } catch (e) {
      console.error("お気に入りの更新に失敗しました", e);
    }
  }

  async function doAddToPlaylist(soundId: number) {
    if (!user) return;
    try {
      await playlistRepo.addToPlaylist(user.id, soundId);
      await reload();
      await audio.refreshBgm();
    } catch (e) {
      console.error("プレイリストへの追加に失敗しました", e);
    }
  }

  // プレイリストに追加。既に入っている曲は重複確認ダイアログを出す（要件9・重複可）
  function handleAdd(target: MenuTarget) {
    if (target.inPlaylist) {
      Alert.alert("この曲はすでにプレイリスト内にあります。", undefined, [
        { text: "もう一度追加", onPress: () => void doAddToPlaylist(target.track.id) },
        { text: "スキップ", style: "cancel" },
      ]);
    } else {
      void doAddToPlaylist(target.track.id);
    }
  }


  // ドラッグ並び替えの確定（要件9: 3本線ドラッグ）。エントリ単位で position を振り直す
  async function onDragEnd(data: PlaylistItem[]) {
    if (!user) return;
    setDragData(data); // 先に見た目を確定させてスナップバックを防ぐ
    try {
      await playlistRepo.reorderPlaylist(
        user.id,
        data.map((d) => d.entryId),
      );
      await reload();
      await audio.refreshBgm();
    } catch (e) {
      console.error("並び替えに失敗しました", e);
    }
  }

  function toggleSelect(entryId: number) {
    setSelectedIds((prev) =>
      prev.includes(entryId) ? prev.filter((x) => x !== entryId) : [...prev, entryId],
    );
  }

  // 複数選択したエントリをプレイリストから削除（要件9: ゴミ箱）。曲自体・お気に入りは残る
  function confirmDeleteSelected() {
    if (!user || selectedIds.length === 0) return;
    const n = selectedIds.length;
    Alert.alert(
      `${n}曲を削除しますか？`,
      "このミュージックをプレイリストから削除してもよろしいですか？",
      [
        { text: "キャンセル", style: "cancel" },
        {
          text: "曲を削除",
          style: "destructive",
          onPress: () => {
            void (async () => {
              try {
                await playlistRepo.removeEntries(user.id, selectedIds);
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
    ({ item, drag, isActive }: RenderItemParams<PlaylistItem>) => {
      const checked = selectedIds.includes(item.entryId);
      return (
        <ScaleDecorator>
          <View style={[styles.row, isActive && styles.rowActive]}>
            <Pressable
              onPress={() => toggleSelect(item.entryId)}
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
          // マイプレイリストのタブは編集した名前を表示する（要件9）
          const label = s.value === "playlist" ? playlistName : s.label;
          return (
            <Pressable
              key={s.value}
              onPress={() => selectSource(s.value)}
              style={[styles.segItem, active && styles.segItemActive]}
              accessibilityState={{ selected: active }}
            >
              <Text
                style={[styles.segText, active && styles.segTextActive]}
                numberOfLines={1}
              >
                {label}
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

      {/* 再生＋シャッフル＋リピート */}
      <View style={styles.playRow}>
        <Pressable
          onPress={() => audio.startBgm()}
          style={({ pressed }) => [styles.playButton, pressed && styles.pressed]}
          accessibilityLabel="このソースを再生"
        >
          <Ionicons name="play" size={18} color="#05070f" />
          <Text style={styles.playText}>再生</Text>
        </Pressable>
        <View style={styles.toggleGroup}>
          <ToggleIcon
            icon="shuffle"
            label="シャッフル"
            on={audio.bgmShuffle}
            onPress={() => void audio.setBgmShuffle(!audio.bgmShuffle)}
          />
          <ToggleIcon
            icon="repeat"
            label="リピート"
            on={audio.bgmRepeatOne}
            onPress={() => void audio.setBgmRepeatOne(!audio.bgmRepeatOne)}
          />
        </View>
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
          {playlistItems.length > 0 ? (
            <View style={styles.plTools}>
              {editing ? (
                <Pressable
                  onPress={confirmDeleteSelected}
                  disabled={selectedIds.length === 0}
                  hitSlop={8}
                  style={styles.trashBtn}
                  accessibilityLabel="選択した曲を削除"
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
          keyExtractor={(item) => String(item.entryId)}
          onDragEnd={({ data }) => void onDragEnd(data)}
          renderItem={renderDragRow}
          containerStyle={styles.listFlex}
          contentContainerStyle={styles.list}
        />
      ) : (
        <ScrollView contentContainerStyle={styles.list}>
          {isPlaylist ? (
            playlistItems.length === 0 ? (
              <View style={styles.empty}>
                <Text style={styles.emptyText}>
                  「すべて」の一覧から … の「追加」でプレイリストに入れてください
                </Text>
              </View>
            ) : (
              playlistItems.map((item) => (
                <TrackRow
                  key={item.entryId}
                  track={item.track}
                  playing={audio.bgmTrack?.id === item.track.id}
                  onPlay={() => audio.playTrack(item.track.id)}
                  onOpenMenu={() =>
                    openMenu({
                      track: item.track,
                      isFavorite: item.isFavorite,
                      inPlaylist: true,
                    })
                  }
                />
              ))
            )
          ) : shownLibrary.length === 0 ? (
            <View style={styles.empty}>
              <Text style={styles.emptyText}>
                {audio.bgmSource === "favorites"
                  ? "★を付けた曲がここに集まります"
                  : "登録された曲がありません"}
              </Text>
            </View>
          ) : (
            shownLibrary.map((item) => (
              <TrackRow
                key={item.track.id}
                track={item.track}
                playing={audio.bgmTrack?.id === item.track.id}
                onPlay={() => audio.playTrack(item.track.id)}
                onOpenMenu={() =>
                  openMenu({
                    track: item.track,
                    isFavorite: item.isFavorite,
                    inPlaylist: item.inPlaylist,
                  })
                }
              />
            ))
          )}
        </ScrollView>
      )}

      {/* 曲の「…」メニュー（追加・お気に入り・クレジット）。背景1タップで閉じる。
          クレジットは同じモーダル内で表示を切り替える（別モーダルにすると開閉のラグが出る） */}
      <Modal
        transparent
        visible={menuItem !== null}
        animationType="fade"
        onRequestClose={closeMenu}
      >
        <Pressable style={styles.menuBackdrop} onPress={closeMenu}>
          {menuItem ? (
            menuMode === "credits" ? (
              // クレジット表示: どこをタップしても閉じる（カードのタップも背景へ伝わる）
              <View style={styles.menuCard}>
                <Text style={styles.menuTitle} numberOfLines={2}>
                  {menuItem.track.name}
                </Text>
                <Text style={styles.creditText}>
                  {menuItem.track.artist
                    ? `アーティスト: ${menuItem.track.artist}`
                    : "アーティスト情報は登録されていません"}
                </Text>
              </View>
            ) : (
              // メニュー: カードのタップは閉じない（誤操作防止）。操作は各項目で行う
              <Pressable style={styles.menuCard} onPress={() => {}}>
                <Text style={styles.menuTitle} numberOfLines={1}>
                  {menuItem.track.name}
                </Text>
                <View style={styles.menuRow}>
                  <MenuAction
                    icon="add-circle"
                    label="追加"
                    active={menuItem.inPlaylist}
                    onPress={() => {
                      const it = menuItem;
                      closeMenu();
                      handleAdd(it);
                    }}
                  />
                  <MenuAction
                    icon={menuItem.isFavorite ? "star" : "star-outline"}
                    label="お気に入り"
                    active={menuItem.isFavorite}
                    onPress={() => {
                      const it = menuItem;
                      closeMenu();
                      void toggleFavorite(it);
                    }}
                  />
                  <MenuAction
                    icon="information-circle-outline"
                    label="クレジット"
                    onPress={() => setMenuMode("credits")}
                  />
                </View>
              </Pressable>
            )
          ) : null}
        </Pressable>
      </Modal>

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

/** シャッフル・リピートのアイコントグル（タップでON/OFF、色で状態を示す） */
function ToggleIcon({
  icon,
  label,
  on,
  onPress,
}: {
  icon: React.ComponentProps<typeof Ionicons>["name"];
  label: string;
  on: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={styles.toggle}
      hitSlop={6}
      accessibilityLabel={label}
      accessibilityState={{ selected: on }}
    >
      <Ionicons
        name={icon}
        size={22}
        color={on ? LightColor : "rgba(255,255,255,0.4)"}
      />
      <Text style={[styles.toggleText, on && styles.toggleOn]}>{label}</Text>
    </Pressable>
  );
}

/** 「…」メニューの1アクション（アイコン＋ラベルの縦ボタン） */
function MenuAction({
  icon,
  label,
  active,
  disabled,
  onPress,
}: {
  icon: React.ComponentProps<typeof Ionicons>["name"];
  label: string;
  active?: boolean;
  disabled?: boolean;
  onPress: () => void;
}) {
  const color = disabled
    ? "rgba(255,255,255,0.3)"
    : active
      ? LightColor
      : "rgba(255,255,255,0.9)";
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={styles.menuAction}
      accessibilityLabel={label}
    >
      <Ionicons name={icon} size={26} color={color} />
      <Text style={[styles.menuActionText, { color }]} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

function TrackRow({
  track,
  playing,
  onPlay,
  onOpenMenu,
}: {
  track: AmbientSound;
  playing: boolean;
  onPlay: () => void;
  onOpenMenu: () => void;
}) {
  return (
    <View style={[styles.row, playing && styles.rowPlaying]}>
      {/* 曲名部をタップするとその曲を再生（要件9） */}
      <Pressable
        style={styles.rowText}
        onPress={onPlay}
        accessibilityLabel={`${track.name}を再生`}
      >
        <Text
          style={[styles.trackName, playing && styles.trackNamePlaying]}
          numberOfLines={1}
        >
          {track.name}
        </Text>
        {track.artist ? (
          <Text style={styles.trackArtist} numberOfLines={1}>
            {track.artist}
          </Text>
        ) : null}
      </Pressable>

      {/* お気に入り・追加・クレジットは「…」メニューにまとめる（要件9） */}
      <Pressable onPress={onOpenMenu} hitSlop={8} accessibilityLabel="メニュー">
        <Ionicons
          name="ellipsis-horizontal"
          size={22}
          color="rgba(255,255,255,0.6)"
        />
      </Pressable>
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
  toggleGroup: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.five,
  },
  toggle: { alignItems: "center", gap: 2 },
  toggleText: { color: "rgba(255,255,255,0.5)", fontSize: 11 },
  toggleOn: { color: LightColor },
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
  empty: { alignItems: "center", paddingVertical: Spacing.six },
  emptyText: {
    color: "rgba(255,255,255,0.45)",
    fontSize: 14,
    textAlign: "center",
  },
  pressed: { opacity: 0.6 },
  menuBackdrop: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.5)",
    padding: Spacing.six,
  },
  menuCard: {
    width: "100%",
    maxWidth: 340,
    borderRadius: 16,
    backgroundColor: "rgba(40,44,54,0.98)",
    paddingVertical: Spacing.four,
    paddingHorizontal: Spacing.three,
    gap: Spacing.three,
  },
  menuTitle: {
    color: "rgba(255,255,255,0.9)",
    fontSize: 14,
    fontWeight: "600",
    textAlign: "center",
    paddingHorizontal: Spacing.two,
  },
  menuRow: { flexDirection: "row", justifyContent: "space-around" },
  menuAction: {
    flex: 1,
    alignItems: "center",
    gap: Spacing.two,
    paddingVertical: Spacing.two,
  },
  menuActionText: { fontSize: 12 },
  creditText: {
    color: "rgba(255,255,255,0.75)",
    fontSize: 13,
    textAlign: "center",
    paddingHorizontal: Spacing.two,
  },
});
