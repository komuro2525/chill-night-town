import { useCallback, useEffect, useRef, useState } from "react";
import {
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

import { LightColor, Spacing } from "@/constants/theme";
import type { DayDetail, DaySessionRecord } from "@/db/repositories/calendarRepo";
import { formatMinutes, formatStudyDateLabel } from "@/lib/study-day";
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
}: {
  /** 表示する学習日の詳細。null なら閉じている */
  detail: DayDetail | null;
  /** マイタグ作成に使うユーザーID */
  userId: number;
  onClose: () => void;
  /** 編集後にその学習日の詳細を読み直す（親が getDayDetail し直す） */
  onReload: (studyDate: string) => void;
}) {
  const { height: windowHeight } = useWindowDimensions();
  // 長押しで編集中のセッション（null なら編集していない）
  const [editingSession, setEditingSession] = useState<DaySessionRecord | null>(null);
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
                <Text style={styles.date}>
                  {detail ? formatStudyDateLabel(detail.studyDate) : ""}
                </Text>
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
              contentContainerStyle={hasRecord ? styles.scroll : styles.scrollEmpty}
              showsVerticalScrollIndicator={false}
            >
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
  close: {
    color: "rgba(255,255,255,0.6)",
    fontSize: 14,
  },
  scroll: { paddingBottom: Spacing.four },
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
