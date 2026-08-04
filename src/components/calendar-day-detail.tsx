import { useCallback, useEffect, useRef, useState } from "react";
import {
  Alert,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import {
  Gesture,
  GestureDetector,
  GestureHandlerRootView,
} from "react-native-gesture-handler";
import Animated, {
  Extrapolation,
  interpolate,
  runOnJS,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

import { Image } from "expo-image";

import { EditFieldModal } from "@/components/settings-ui";
import { LIMITS, STUDY_DAY } from "@/constants/domain";
import { LightColor, Spacing } from "@/constants/theme";
import type { DayDetail, DaySessionRecord } from "@/db/repositories/calendarRepo";
import { eventRepo, weatherRepo } from "@/db/repositories";
import type { CalendarEvent } from "@/db/types";
import { useAudio } from "@/contexts/AudioContext";
import { useSettings } from "@/contexts/SettingsContext";
import { canAttachPhoto, formatTakenAtLabel } from "@/lib/night-photo";
import { captureNightPhoto } from "@/lib/night-photo-capture";
import { deletePhotoFile, photoUri } from "@/lib/night-photo-storage";
import { formatMinutes, formatStudyDateLabel } from "@/lib/study-day";
import { NightPhotoViewer } from "./night-photo-viewer";
import { validateEventTitle } from "@/lib/validation";
import { SessionEditModal } from "./session-edit-modal";

// カレンダーの日別詳細（要件4.1）。
//
// その学習日の全セッション（複数なら全部）・天気・感情・タグ・メモを表示する。
// 記録が無い日は静かなデフォルト表示にする（責めない・急かさない）。
//
// ボトムシートは2段階（既定＝画面の約55% / 拡大＝約90%）で、シートのどこを掴んでも
// 上スワイプで拡大・下スワイプで既定/閉、背景タップで閉じる。中身の ScrollView とは
// 「最上部から下へ引くときだけシートを動かす」という定番の協調で両立させる
// （スクロール位置が上端以外なら、下スワイプは中身のスクロールに回す）。

function formatTimeRange(startIso: string, endIso: string): string {
  const t = (iso: string) => {
    const d = new Date(iso);
    const p = (n: number) => String(n).padStart(2, "0");
    return `${p(d.getHours())}:${p(d.getMinutes())}`;
  };
  return `${t(startIso)}〜${t(endIso)}`;
}

export function CalendarDayDetail({
  detail,
  userId,
  onClose,
  onReload,
  onEventsChanged,
}: {
  /** 表示する学習日の詳細。null なら閉じている */
  detail: DayDetail | null;
  /** マイタグ作成に使うユーザーID */
  userId: number;
  onClose: () => void;
  /** 編集後にその学習日の詳細を読み直す（親が getDayDetail し直す） */
  onReload: (studyDate: string) => void;
  /** 予定を追加/変更/削除したとき（親が月のマークを読み直す・通知を張り直す） */
  onEventsChanged?: () => void;
}) {
  const { height: windowHeight } = useWindowDimensions();
  // 長押しで編集中のセッション（null なら編集していない）
  const [editingSession, setEditingSession] = useState<DaySessionRecord | null>(null);

  // その日の予定（4章）。日付が変わるたびに読み直す
  const dayDate = detail?.studyDate ?? null;
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  // 予定の追加/編集ダイアログ（null=閉、"add"=新規、event=そのタイトルを編集）
  const [eventEditing, setEventEditing] = useState<
    { mode: "add" } | { mode: "edit"; event: CalendarEvent } | null
  >(null);

  const reloadEvents = useCallback(async () => {
    if (!dayDate || !userId) {
      setEvents([]);
      return;
    }
    try {
      setEvents(await eventRepo.getEventsForDate(userId, dayDate));
    } catch (e) {
      console.error("予定の読み込みに失敗しました", e);
    }
  }, [dayDate, userId]);

  useEffect(() => {
    void reloadEvents();
  }, [reloadEvents]);

  // その夜の写真（要件2.6）。拡大表示中の写真（null なら閉じている）
  const [viewingPhoto, setViewingPhoto] = useState<string | null>(null);

  // 写真は過去の夜でも常に消せる（室内や人物が写り得るため。要件4.1）。
  // 追加・撮り直しだけが5:00までの制限を受ける
  const removePhoto = useCallback(() => {
    if (!detail?.photo) return;
    const { fileName } = detail.photo;
    const studyDate = detail.studyDate;
    Alert.alert("この夜の写真を消しますか", "元に戻すことはできません。", [
      { text: "やめる", style: "cancel" },
      {
        text: "消す",
        style: "destructive",
        onPress: () => {
          void (async () => {
            try {
              await weatherRepo.clearPhoto(studyDate);
              deletePhotoFile(fileName);
              setViewingPhoto(null);
              onReload(studyDate);
            } catch (e) {
              console.error("その夜の写真の削除に失敗しました", e);
            }
          })();
        },
      },
    ]);
  }, [detail, onReload]);

  // 撮る・撮り直せるのは、その学習日がまだ終わっていない（5:00前の）ときだけ。
  // 判定はホームの選択欄と同じ canAttachPhoto を通す（場所で挙動がずれないように）
  const { user } = useSettings();
  const { runAndRestoreAudio } = useAudio();
  const [capturing, setCapturing] = useState(false);
  const canTakePhoto =
    user?.night_photo_enabled === 1 &&
    detail !== null &&
    canAttachPhoto(detail.studyDate);

  const takePhoto = useCallback(async () => {
    if (!detail || !userId || capturing) return;
    const studyDate = detail.studyDate;
    const previous = detail.photo?.fileName;
    setCapturing(true);
    try {
      const result = await captureNightPhoto(studyDate, runAndRestoreAudio);
      if (result.status === "denied") {
        Alert.alert(
          "カメラを使えません",
          "写真は今夜の空を残すときだけ使います。端末の設定からカメラを許可すると撮れるようになります。",
        );
        return;
      }
      if (result.status === "failed") {
        Alert.alert("写真を残せませんでした", "少し時間をおいて試してください。");
        return;
      }
      if (result.status === "cancelled") return;

      // ファイルの保存が成功してからDBを更新する（逆順だと実体のない参照が残る）
      await weatherRepo.setPhoto(
        userId,
        studyDate,
        result.fileName,
        result.takenAt.toISOString(),
      );
      if (previous && previous !== result.fileName) deletePhotoFile(previous);
      onReload(studyDate);
    } finally {
      setCapturing(false);
    }
  }, [detail, userId, capturing, runAndRestoreAudio, onReload]);

  async function submitEvent(title: string): Promise<string | void> {
    const err = validateEventTitle(title);
    if (err) return err;
    if (!dayDate || !userId) return;
    try {
      if (eventEditing?.mode === "edit") {
        await eventRepo.updateEventTitle(eventEditing.event.id, title.trim());
      } else {
        await eventRepo.addEvent(userId, dayDate, title.trim());
      }
      await reloadEvents();
      onEventsChanged?.();
    } catch (e) {
      console.error("予定の保存に失敗しました", e);
      return "保存に失敗しました。時間をおいて再度お試しください";
    }
  }

  function confirmDeleteEvent(ev: CalendarEvent) {
    Alert.alert("予定を削除しますか", `「${ev.title}」を削除します`, [
      { text: "やめる", style: "cancel" },
      {
        text: "削除する",
        style: "destructive",
        onPress: () =>
          void (async () => {
            try {
              await eventRepo.deleteEvent(ev.id);
              await reloadEvents();
              onEventsChanged?.();
            } catch (e) {
              console.error("予定の削除に失敗しました", e);
            }
          })(),
      },
    ]);
  }
  const expandedHeight = Math.round(windowHeight * 0.9);
  const collapsedHeight = Math.round(windowHeight * 0.55);
  // シートの高さは expandedHeight 固定で、translateY で下げて既定の高さに見せる。
  // translateY: 0 = 拡大 / collapsedTranslate = 既定 / expandedHeight = 画面外（閉）
  const collapsedTranslate = expandedHeight - collapsedHeight;

  const translateY = useSharedValue(expandedHeight);
  const startY = useSharedValue(0);
  // 中身のスクロール位置と、いまシート自体をドラッグ中かどうか（協調判定に使う）
  const scrollY = useSharedValue(0);
  const draggingSheet = useSharedValue(false);
  const scrollHandler = useAnimatedScrollHandler((e) => {
    scrollY.value = e.contentOffset.y;
  });
  // ScrollView の native ジェスチャ。pan と同時成立させて両立を図る
  const scrollGesture = Gesture.Native();

  const hasRecord = detail !== null && detail.sessions.length > 0;
  // 予定または記録があれば上寄せ、どちらも無ければ中央寄せ（静かな空表示）
  const hasContent = hasRecord || events.length > 0;

  // スライドインは「新規に開いたとき」だけ行う。
  // 編集の保存後は detail を読み直すが、そのときシートを再アニメーションさせない
  // （下から出直すと気持ち悪いため）。開いている間の内容更新は位置を保つ。
  const wasOpenRef = useRef(false);
  useEffect(() => {
    const isOpen = detail !== null;
    if (isOpen && !wasOpenRef.current) {
      translateY.value = expandedHeight;
      translateY.value = withTiming(collapsedTranslate, { duration: 260 });
    }
    wasOpenRef.current = isOpen;
  }, [detail, expandedHeight, collapsedTranslate, translateY]);

  // 下へスライドアウトしてから閉じる
  const close = useCallback(() => {
    translateY.value = withTiming(expandedHeight, { duration: 200 }, (finished) => {
      if (finished) runOnJS(onClose)();
    });
  }, [expandedHeight, onClose, translateY]);

  const pan = Gesture.Pan()
    // ScrollView のスクロールと同時に成立させ、下の onUpdate でどちらが動くかを決める
    .simultaneousWithExternalGesture(scrollGesture)
    .onStart(() => {
      startY.value = translateY.value;
      draggingSheet.value = false;
    })
    .onUpdate((e) => {
      // モーダル全体で挙動をそろえる:
      //   ・既定サイズからは全方向でシートを動かす
      //   ・拡大中でも「下スワイプ」はどこでも常にシートを動かす（縮む/閉じる）
      //   ・拡大中の「上スワイプ」は最上部のときだけ動かし、それ以外は中身のスクロールへ
      const canDragSheet =
        startY.value > 0 || e.translationY > 0 || scrollY.value <= 0;
      if (canDragSheet) {
        draggingSheet.value = true;
        translateY.value = Math.max(
          0,
          Math.min(expandedHeight, startY.value + e.translationY),
        );
      }
    })
    .onEnd((e) => {
      // シートを動かしていない（＝中身のスクロールだった）ときは何もしない
      if (!draggingSheet.value) return;
      const snaps = [0, collapsedTranslate, expandedHeight]; // 拡大 / 既定 / 閉
      // しっかりスワイプしたときだけ位置を変える（誤操作防止のデッドゾーン）。
      // 小さい・遅い動きは開始位置へ戻す。速度の先読みも控えめにする
      const MOVE_THRESHOLD = 80;
      const VELOCITY_THRESHOLD = 800;
      const movedEnough =
        Math.abs(translateY.value - startY.value) > MOVE_THRESHOLD ||
        Math.abs(e.velocityY) > VELOCITY_THRESHOLD;

      let target = startY.value;
      if (movedEnough) {
        const projected = translateY.value + e.velocityY * 0.05;
        target = snaps[0];
        for (const s of snaps) {
          if (Math.abs(s - projected) < Math.abs(target - projected)) target = s;
        }
      }

      if (target === expandedHeight) {
        translateY.value = withTiming(expandedHeight, { duration: 220 }, (finished) => {
          if (finished) runOnJS(onClose)();
        });
      } else {
        translateY.value = withTiming(target, { duration: 220 });
      }
    });

  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));
  // 背景の暗さはシートの高さに連動させる（上げると濃く、下げると薄く）
  const dimStyle = useAnimatedStyle(() => ({
    opacity: interpolate(
      translateY.value,
      [0, expandedHeight],
      [1, 0],
      Extrapolation.CLAMP,
    ),
  }));

  return (
    <Modal
      visible={detail !== null}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={close}
    >
      {/* Modal は別の native 階層に描画されるため、ジェスチャ用に Root を内側にも置く */}
      <GestureHandlerRootView style={styles.flex}>
        <Animated.View
          style={[StyleSheet.absoluteFill, styles.dim, dimStyle]}
          pointerEvents="none"
        />
        {/* シートの外側（上の余白）をタップで閉じる */}
        <Pressable style={StyleSheet.absoluteFill} onPress={close} />

        {/* シートのどこを掴んでもドラッグできる（中身のスクロールとは onUpdate で協調） */}
        <GestureDetector gesture={pan}>
          <Animated.View style={[styles.sheet, { height: expandedHeight }, sheetStyle]}>
            <View style={styles.dragZone}>
              <View style={styles.handleRow}>
                <View style={styles.handle} />
              </View>
              <View style={styles.header}>
                <View>
                  <Text style={styles.date}>
                    {detail ? formatStudyDateLabel(detail.studyDate) : ""}
                  </Text>
                  {/* 学習日は暦日と一致しないため、その夜がどこからどこまでかを明示する */}
                  {detail ? (
                    <Text style={styles.dateRange}>
                      {STUDY_DAY.START_HOUR}:00 〜 翌{STUDY_DAY.END_HOUR}:00
                    </Text>
                  ) : null}
                </View>
                <Pressable onPress={close} hitSlop={10} accessibilityLabel="閉じる">
                  <Text style={styles.close}>閉じる</Text>
                </Pressable>
              </View>
            </View>

          {/* 記録の有無に関わらず常に ScrollView を置き、シート全体を同じように
              掴んで引っ張れるようにする（データが無い日でも上スワイプで拡大できる） */}
          <GestureDetector gesture={scrollGesture}>
            <Animated.ScrollView
              onScroll={scrollHandler}
              scrollEventThrottle={16}
              style={styles.flex}
              contentContainerStyle={hasContent ? styles.scroll : styles.scrollEmpty}
              showsVerticalScrollIndicator={false}
            >
              {/* 予定（4章）。記録の有無に関わらず常に置く。タップで編集・長押しで削除 */}
              <View style={styles.eventsSection}>
                <View style={styles.eventsHead}>
                  <Text style={styles.eventsTitle}>予定</Text>
                  <Pressable
                    onPress={() => setEventEditing({ mode: "add" })}
                    hitSlop={8}
                    style={({ pressed }) => [styles.eventsAdd, pressed && styles.pressedDim]}
                  >
                    <Text style={styles.eventsAddText}>＋ 追加</Text>
                  </Pressable>
                </View>
                {events.length > 0 ? (
                  <>
                    {events.map((ev) => (
                      <Pressable
                        key={ev.id}
                        onPress={() => setEventEditing({ mode: "edit", event: ev })}
                        onLongPress={() => confirmDeleteEvent(ev)}
                        delayLongPress={300}
                        style={({ pressed }) => [styles.eventRow, pressed && styles.pressedDim]}
                      >
                        <Text style={styles.eventBullet}>●</Text>
                        <Text style={styles.eventTitleText} numberOfLines={2}>
                          {ev.title}
                        </Text>
                      </Pressable>
                    ))}
                    <Text style={styles.eventsHint}>
                      予定をタップで編集・長押しで削除
                    </Text>
                  </>
                ) : (
                  <Text style={styles.eventsEmpty}>
                    予定はありません（＋で追加）
                  </Text>
                )}
              </View>

              {/* その夜の写真（要件2.6）。学習記録が無い夜でも、撮っていれば見せる。
                  撮り直しはその夜のあいだだけ（過ぎた夜は閲覧と削除のみ） */}
              {detail?.photo ? (
                <View style={styles.photoSection}>
                  <Pressable
                    onPress={() => setViewingPhoto(detail.photo!.fileName)}
                    accessibilityLabel="写真を拡大する"
                    style={({ pressed }) => [pressed && styles.sessionPressed]}
                  >
                    <Image
                      source={{ uri: photoUri(detail.photo.fileName) }}
                      style={styles.photoThumb}
                      contentFit="cover"
                      transition={200}
                    />
                  </Pressable>
                  <View style={styles.photoMeta}>
                    <Text style={styles.photoTakenAt}>
                      {formatTakenAtLabel(detail.photo.takenAt)}
                    </Text>
                    {canTakePhoto ? (
                      <Pressable
                        onPress={() => void takePhoto()}
                        disabled={capturing}
                        hitSlop={8}
                        accessibilityLabel="撮り直す"
                        style={({ pressed }) => [pressed && styles.sessionPressed]}
                      >
                        <Text style={styles.photoAction}>撮り直す</Text>
                      </Pressable>
                    ) : null}
                  </View>
                </View>
              ) : canTakePhoto ? (
                <Pressable
                  onPress={() => void takePhoto()}
                  disabled={capturing}
                  accessibilityLabel="今夜の空を撮る"
                  style={({ pressed }) => [
                    styles.photoEmpty,
                    pressed && styles.sessionPressed,
                  ]}
                >
                  <Text style={styles.photoEmptyText}>📷 今夜の空を撮る</Text>
                </Pressable>
              ) : null}

              {hasRecord ? (
              <>
              {/* その夜の天気・合計・達成 */}
              <View style={styles.summary}>
                {detail.weather ? (
                  <Text style={styles.weather}>
                    {detail.weather.emoji} {detail.weather.name}
                  </Text>
                ) : null}
                <Text style={styles.total}>
                  この夜の学習 {formatMinutes(detail.totalMinutes)}
                </Text>
                {detail.achieved ? (
                  <Text style={styles.achieved}>目標を達成した夜</Text>
                ) : null}
              </View>

              {detail.sessions.map((s) => (
                <Pressable
                  key={s.id}
                  onLongPress={() => setEditingSession(s)}
                  delayLongPress={300}
                  accessibilityLabel="長押しでタグ・メモを編集"
                  style={({ pressed }) => [styles.session, pressed && styles.sessionPressed]}
                >
                  <View style={styles.sessionHead}>
                    <Text style={styles.sessionTime}>
                      {formatTimeRange(s.startTime, s.endTime)}
                    </Text>
                    <Text style={styles.sessionDur}>
                      {formatMinutes(s.durationMinutes)}
                    </Text>
                  </View>
                  {s.emotion ? (
                    <Text style={styles.emotion}>
                      {s.emotion.emoji} {s.emotion.name}
                    </Text>
                  ) : null}
                  {s.tags.length > 0 ? (
                    <View style={styles.tags}>
                      {s.tags.map((t) => (
                        <Text key={t.id} style={styles.tag}>
                          {t.name}
                        </Text>
                      ))}
                    </View>
                  ) : null}
                  {s.memo ? <Text style={styles.memo}>{s.memo}</Text> : null}
                </Pressable>
              ))}
              <Text style={styles.editHint}>
                記録を長押しすると、タグとメモを整えられます
              </Text>
              </>
              ) : (
              <View style={styles.empty}>
                <Text style={styles.emptyText}>この夜の記録はありません</Text>
              </View>
              )}
            </Animated.ScrollView>
          </GestureDetector>
          </Animated.View>
        </GestureDetector>

        {/* セッションのタグ・メモ編集（長押しで開く。感情は読み取り専用） */}
        <SessionEditModal
          userId={userId}
          session={editingSession}
          onSaved={() => {
            if (detail) onReload(detail.studyDate);
            setEditingSession(null);
          }}
          onClose={() => setEditingSession(null)}
        />

        {/* 予定の追加・タイトル編集 */}
        <EditFieldModal
          visible={eventEditing !== null}
          title={eventEditing?.mode === "edit" ? "予定を編集" : "予定を追加"}
          description={`${LIMITS.EVENT_TITLE_MAX}文字以内`}
          initialValue={eventEditing?.mode === "edit" ? eventEditing.event.title : ""}
          placeholder="例: テスト"
          maxLength={LIMITS.EVENT_TITLE_MAX}
          validate={validateEventTitle}
          onCancel={() => setEventEditing(null)}
          onSubmit={submitEvent}
        />

        {/* その夜の写真の拡大表示（要件4.1）。ここから消すこともできる */}
        <NightPhotoViewer
          fileName={viewingPhoto}
          onClose={() => setViewingPhoto(null)}
          onDelete={removePhoto}
        />
      </GestureHandlerRootView>
    </Modal>
  );
}


const styles = StyleSheet.create({
  flex: { flex: 1 },
  dim: { backgroundColor: "rgba(3,6,15,0.6)" },
  sheet: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.15)",
    backgroundColor: "rgba(14,20,36,0.99)",
    paddingHorizontal: Spacing.four,
    paddingBottom: Spacing.six,
  },
  dragZone: { paddingBottom: Spacing.one },
  handleRow: { alignItems: "center", paddingVertical: Spacing.two },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: "rgba(255,255,255,0.25)",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: Spacing.two,
  },
  date: {
    color: "rgba(255,255,255,0.95)",
    fontSize: 17,
    fontWeight: "600",
  },
  dateRange: {
    color: "rgba(255,255,255,0.4)",
    fontSize: 11,
    marginTop: 2,
  },
  close: {
    color: "rgba(255,255,255,0.6)",
    fontSize: 14,
  },
  // --- その夜の写真（要件2.6 / 4.1） ---
  photoSection: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.three,
    marginBottom: Spacing.three,
  },
  photoThumb: {
    width: 72,
    height: 72,
    borderRadius: 10,
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  photoMeta: {
    gap: 6,
  },
  photoTakenAt: {
    color: "rgba(255,255,255,0.5)",
    fontSize: 12,
  },
  photoAction: {
    color: LightColor,
    fontSize: 13,
  },
  photoEmpty: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.24)",
    paddingVertical: Spacing.three,
    alignItems: "center",
    marginBottom: Spacing.three,
  },
  photoEmptyText: {
    color: "rgba(255,255,255,0.75)",
    fontSize: 14,
  },
  scroll: { paddingBottom: Spacing.four },
  eventsSection: {
    marginBottom: Spacing.four,
    paddingBottom: Spacing.three,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(255,255,255,0.12)",
  },
  eventsHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: Spacing.two,
  },
  eventsTitle: { color: "rgba(255,255,255,0.9)", fontSize: 14, fontWeight: "600" },
  eventsAdd: {
    paddingVertical: Spacing.one,
    paddingHorizontal: Spacing.three,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.3)",
  },
  eventsAddText: { color: "rgba(255,255,255,0.9)", fontSize: 13 },
  eventRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.two,
    paddingVertical: Spacing.two,
  },
  eventBullet: { color: LightColor, fontSize: 10 },
  eventTitleText: { color: "rgba(255,255,255,0.95)", fontSize: 15, flex: 1 },
  eventsHint: {
    marginTop: Spacing.one,
    color: "rgba(255,255,255,0.4)",
    fontSize: 11,
  },
  eventsEmpty: { color: "rgba(255,255,255,0.45)", fontSize: 13 },
  pressedDim: { opacity: 0.6 },
  // 記録が無い日: 中身を広げて中央寄せしつつ、全体を掴んで引っ張れるようにする
  scrollEmpty: { flexGrow: 1, justifyContent: "center" },
  summary: {
    alignItems: "center",
    gap: 2,
    paddingVertical: Spacing.three,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.1)",
    marginBottom: Spacing.three,
  },
  weather: {
    color: "rgba(255,255,255,0.85)",
    fontSize: 15,
  },
  total: {
    color: LightColor,
    fontSize: 22,
    fontWeight: "300",
    marginTop: 2,
  },
  achieved: {
    color: LightColor,
    fontSize: 12,
  },
  session: {
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.05)",
    padding: Spacing.three,
    marginBottom: Spacing.two,
    gap: Spacing.one,
  },
  sessionPressed: { backgroundColor: "rgba(255,255,255,0.1)" },
  editHint: {
    color: "rgba(255,255,255,0.4)",
    fontSize: 12,
    textAlign: "center",
    marginTop: Spacing.one,
  },
  sessionHead: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  sessionTime: {
    color: "rgba(255,255,255,0.6)",
    fontSize: 12,
  },
  sessionDur: {
    color: "rgba(255,255,255,0.9)",
    fontSize: 14,
    fontWeight: "500",
  },
  emotion: {
    color: "rgba(255,255,255,0.8)",
    fontSize: 13,
  },
  tags: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.one,
    marginTop: 2,
  },
  tag: {
    color: "rgba(255,255,255,0.7)",
    fontSize: 12,
    paddingVertical: 2,
    paddingHorizontal: Spacing.two,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.08)",
    overflow: "hidden",
  },
  memo: {
    color: "rgba(255,255,255,0.7)",
    fontSize: 13,
    lineHeight: 20,
    marginTop: 2,
  },
  empty: {
    alignItems: "center",
    paddingVertical: Spacing.six,
  },
  emptyText: {
    color: "rgba(255,255,255,0.45)",
    fontSize: 14,
  },
});
