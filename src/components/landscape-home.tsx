import { Image } from "expo-image";
import { useState } from "react";
import { type ImageSourcePropType, Pressable, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { MinimalHomeUI } from "@/components/minimal-home";
import type { ActiveSession } from "@/db/types";

// 横画面表示（要件2.4「横画面表示（ホーム画面限定）」）。
//
// 端末を横向きにしたときの閲覧専用ビュー。街の全景を1画面に表示する。重ねる情報は
// ホームの最小UI（アイドル最小表示と共用の MinimalHomeUI）に揃える。画面タップで
// その情報の表示/非表示を切り替える。タイマー操作等は行わない（時計は非操作）——
// 操作したいときは端末を縦に戻す（縦向きが唯一の復帰操作）。
//
// スワイプによる街探索は行わない（全景が収まるためスクロール不要）。

// 背景の当て方。cover=全画面に敷き詰め（上下は切れる／素材は横向きのセーフマージンを想定）。
// 現行アートは縦向き前提のため、見栄えが悪ければ "contain" に変える
const CONTENT_FIT: "cover" | "contain" = "cover";

export function LandscapeHome({
  art,
  session,
}: {
  /** 選択中の街の全景（未登録なら暗い背景のみ） */
  art: ImageSourcePropType | undefined;
  /** 計測中セッション（非計測時は null）。稼働中のみ時計＋作業中を出す */
  session: ActiveSession | null;
}) {
  const insets = useSafeAreaInsets();
  // 情報表示の表示/非表示（タップでトグル）。初期は表示
  const [infoVisible, setInfoVisible] = useState(true);

  return (
    <Pressable
      style={styles.container}
      onPress={() => setInfoVisible((v) => !v)}
      accessibilityLabel="タップで情報表示を切り替え"
    >
      {art ? (
        <Image source={art} style={StyleSheet.absoluteFill} contentFit={CONTENT_FIT} />
      ) : (
        <View style={[StyleSheet.absoluteFill, styles.fallback]} />
      )}

      {/* アイドル最小表示と同じUI。横画面は閲覧専用のため時計は非操作（onPressClock を渡さない） */}
      {infoVisible ? <MinimalHomeUI session={session} insets={insets} /> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#05070f" },
  fallback: { backgroundColor: "#05070f" },
});
