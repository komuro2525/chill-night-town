import { useCallback, useEffect, useRef, useState } from "react";
import {
  FlatList,
  Image,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { LightColor, Spacing } from "@/constants/theme";
import { TUTORIAL_PAGES, type TutorialPage } from "@/constants/tutorial";

// 使い方チュートリアルのカルーセル（要件: 初回表示＋設定「使い方」から機能別に閲覧）。
//
// 全画面のスワイプ式。初回（初期設定完了後）は index0 から、設定からは選んだ機能の index から開く。
// GrowthHintCard と同じく Modal ベース。文面・ページ構成は src/constants/tutorial.ts が単一の出所。

export function TutorialOverlay({
  visible,
  pages = TUTORIAL_PAGES,
  initialIndex = 0,
  onClose,
}: {
  visible: boolean;
  /** 表示するページ（初回=最小限／設定=全部／機能ごとの初回=その1ページ）。既定は全ページ */
  pages?: TutorialPage[];
  /** 開始ページ（設定から特定の機能を開くときに使う） */
  initialIndex?: number;
  /** × / 最終ページの「とじる」/ スワイプ後の閉じ操作で呼ばれる */
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const listRef = useRef<FlatList<TutorialPage>>(null);
  const [index, setIndex] = useState(initialIndex);
  // 連打しても最新値から進めるよう、現在ページは ref でも持つ（state は描画反映が非同期のため）
  const indexRef = useRef(initialIndex);
  // 自前スクロール（矢印）の目標ページ。到達するまで momentum の中間位置でドットを上書きしない
  const targetRef = useRef<number | null>(null);

  // 開くたびに開始ページへ合わせる（Modal を閉じずに再利用しても正しい位置から始める）
  useEffect(() => {
    if (!visible) return;
    setIndex(initialIndex);
    indexRef.current = initialIndex;
    // FlatList は key 付け替えで initialScrollIndex から再マウントするため保留中のスクロールは無い
    targetRef.current = null;
  }, [visible, initialIndex]);

  // 指定ページへ移動（矢印用）。ref を正として即ドット反映＋アニメーションでスクロール
  const goTo = useCallback((next: number) => {
    const clamped = Math.max(0, Math.min(pages.length - 1, next));
    if (clamped === indexRef.current) return;
    indexRef.current = clamped;
    targetRef.current = clamped;
    setIndex(clamped);
    listRef.current?.scrollToIndex({ index: clamped, animated: true });
  }, [pages.length]);

  // スクロール停止時の反映。自前スクロール中は目標到達までドットを動かさない
  // （連打でアニメーションが途中中断され、中間位置でドットが戻る/飛ぶのを防ぐ）。
  const handleMomentumEnd = useCallback(
    (offsetX: number) => {
      const page = Math.round(offsetX / width);
      if (targetRef.current !== null) {
        if (page === targetRef.current) targetRef.current = null;
        return;
      }
      indexRef.current = page;
      setIndex(page);
    },
    [width],
  );

  const isLast = index >= pages.length - 1;
  const isFirst = index <= 0;
  const single = pages.length <= 1;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.backdrop}>
        {/* 閉じる（×） */}
        <Pressable
          onPress={onClose}
          hitSlop={12}
          accessibilityLabel="使い方を閉じる"
          style={({ pressed }) => [
            styles.close,
            { top: insets.top + Spacing.two },
            pressed && styles.pressed,
          ]}
        >
          <Text style={styles.closeText}>✕</Text>
        </Pressable>

        {/* ページ本体（横スワイプ） */}
        <FlatList
          key={initialIndex}
          ref={listRef}
          data={pages}
          keyExtractor={(p) => p.key}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          initialScrollIndex={initialIndex}
          getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
          onMomentumScrollEnd={(e) =>
            handleMomentumEnd(e.nativeEvent.contentOffset.x)
          }
          renderItem={({ item }) => (
            <View style={[styles.page, { width }]}>
              <View style={styles.pageInner}>
                {item.image ? (
                  <Image source={item.image} style={styles.image} resizeMode="contain" />
                ) : (
                  // 画像は後差し。いまは静かな余白を置く
                  <View style={styles.imagePlaceholder} />
                )}
                <Text style={styles.title}>{item.title}</Text>
                {item.body.map((paragraph, i) => (
                  <Text key={i} style={styles.body}>
                    {paragraph}
                  </Text>
                ))}
              </View>
            </View>
          )}
        />

        {/* 下部: ← ドット → / 最終ページは「とじる」 */}
        <View style={[styles.controls, { paddingBottom: insets.bottom + Spacing.three }]}>
          <Pressable
            onPress={() => goTo(indexRef.current - 1)}
            hitSlop={10}
            disabled={isFirst}
            accessibilityLabel="前へ"
            style={({ pressed }) => [styles.arrow, pressed && styles.pressed]}
          >
            <Text style={[styles.arrowText, isFirst && styles.arrowHidden]}>‹</Text>
          </Pressable>

          <View style={styles.dots}>
            {single
              ? null
              : pages.map((p, i) => (
                  <View
                    key={p.key}
                    style={[styles.dot, i === index && styles.dotActive]}
                  />
                ))}
          </View>

          {isLast ? (
            <Pressable
              onPress={onClose}
              hitSlop={10}
              accessibilityLabel="とじる"
              style={({ pressed }) => [styles.donePill, pressed && styles.pressed]}
            >
              <Text style={styles.doneText}>とじる</Text>
            </Pressable>
          ) : (
            <Pressable
              onPress={() => goTo(indexRef.current + 1)}
              hitSlop={10}
              accessibilityLabel="次へ"
              style={({ pressed }) => [styles.arrow, pressed && styles.pressed]}
            >
              <Text style={styles.arrowText}>›</Text>
            </Pressable>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(6,10,20,0.98)",
  },
  close: {
    position: "absolute",
    right: Spacing.three,
    zIndex: 2,
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  closeText: {
    color: "rgba(255,255,255,0.7)",
    fontSize: 22,
    fontWeight: "500",
  },
  page: {
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: Spacing.five,
  },
  pageInner: {
    gap: Spacing.three,
  },
  image: {
    width: "100%",
    height: 200,
    marginBottom: Spacing.two,
  },
  imagePlaceholder: {
    height: Spacing.six,
  },
  title: {
    color: "rgba(255,255,255,0.96)",
    fontSize: 22,
    fontWeight: "700",
    letterSpacing: 1,
  },
  body: {
    color: "rgba(255,255,255,0.82)",
    fontSize: 15,
    lineHeight: 26,
  },
  controls: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.four,
    gap: Spacing.two,
  },
  arrow: {
    width: 56,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  arrowText: {
    color: "rgba(255,255,255,0.85)",
    fontSize: 30,
    fontWeight: "300",
    lineHeight: 32,
  },
  arrowHidden: {
    opacity: 0,
  },
  dots: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.28)",
  },
  dotActive: {
    backgroundColor: LightColor,
    width: 9,
    height: 9,
  },
  donePill: {
    width: 56,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 999,
    borderWidth: 1,
    borderColor: LightColor,
  },
  doneText: {
    color: LightColor,
    fontSize: 13,
    fontWeight: "600",
  },
  pressed: {
    opacity: 0.6,
  },
});
