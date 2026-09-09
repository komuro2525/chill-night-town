import { Image } from "expo-image";
import { useState } from "react";
import {
  type ImageSourcePropType,
  Pressable,
  Image as RNImage,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { MinimalHomeUI } from "@/components/minimal-home";
import { TownVideoBackdrop } from "@/components/town-video";
import { WeatherOverlay } from "@/components/weather-overlay";
import type { TownVideo } from "@/constants/townVideo";
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
  video,
  session,
  weatherCode,
  studyDate,
  effectsEnabled,
  clockHidden,
}: {
  /** 選択中の街の全景（未登録なら暗い背景のみ） */
  art: ImageSourcePropType | undefined;
  /** 全景のループ動画（素材が無い・設定OFFなら undefined＝静止画） */
  video: TownVideo | undefined;
  /** 計測中セッション（非計測時は null）。稼働中のみ時計＋作業中を出す */
  session: ActiveSession | null;
  /** その学習日に選択された天気（要件8）。未選択は null＝演出なし */
  weatherCode: string | null | undefined;
  /** 表示中の学習日（YYYY-MM-DD）。天気の素材が複数あるときの抽選に使う */
  studyDate: string;
  /** 天気の演出を出すか（「背景を動かす」設定・おやすみの暗転に追従する） */
  effectsEnabled: boolean;
  /** 設定「学習中の時計」（要件10.16）がOFFか。計測中の時計（文字盤）を出さない（実績学習時間は残す） */
  clockHidden: boolean;
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
      {video ? (
        <TownVideoBackdrop video={video} poster={art} contentFit={CONTENT_FIT} />
      ) : art ? (
        <Image source={art} style={StyleSheet.absoluteFill} contentFit={CONTENT_FIT} />
      ) : (
        <View style={[StyleSheet.absoluteFill, styles.fallback]} />
      )}

      {/* 天気の演出（要件8）。街より上・最小情報表示より下に敷く */}
      <WeatherOverlay
        weatherCode={weatherCode}
        studyDate={studyDate}
        enabled={effectsEnabled}
      />

      {/* アイドル最小表示と同じUI。横画面は閲覧専用のため時計は非操作（onPressClock を渡さない） */}
      {infoVisible ? (
        <MinimalHomeUI
          session={session}
          insets={insets}
          clockHidden={clockHidden}
        />
      ) : null}

      <LandscapeDebugReadout art={art} video={video} />
    </Pressable>
  );
}

/**
 * 開発用の切り分け表示（__DEV__ 限定）。
 *
 * 「縦 → UI最小化 → 横」で背景が拡大されて一部しか見えないことがある、という報告の
 * 原因を切り分けるために置いている。contentFit="cover" は素材と画面の比の差だけ切り取るので、
 * 比が想定どおりなら切れ方は毎回同じはずである。**毎回違う／想定より大きく拡大される**なら、
 * 画面サイズか素材の実寸が思っているものと違うことになる。
 *
 * 原因が確定したら消すこと（docs/開発用テストボタン.md の撤去チェックリストに載せてある）。
 */
function LandscapeDebugReadout({
  art,
  video,
}: {
  art: ImageSourcePropType | undefined;
  video: TownVideo | undefined;
}) {
  const { width: winW, height: winH } = useWindowDimensions();
  if (!__DEV__) return null;

  const resolved = art ? RNImage.resolveAssetSource(art) : undefined;
  const srcW = video?.width ?? resolved?.width;
  const srcH = video?.height ?? resolved?.height;
  const screenRatio = winH > 0 ? winW / winH : 0;
  const srcRatio = srcW && srcH ? srcW / srcH : 0;
  // cover は「画面の比 ÷ 素材の比」の分だけ縦を切る（画面の方が横長のとき）
  const cropPercent =
    srcRatio > 0 && screenRatio > srcRatio
      ? Math.round((1 - srcRatio / screenRatio) * 100)
      : 0;

  return (
    <View style={styles.debug} pointerEvents="none">
      <Text style={styles.debugText}>
        画面 {Math.round(winW)}×{Math.round(winH)}（比 {screenRatio.toFixed(2)}）
      </Text>
      <Text style={styles.debugText}>
        素材 {srcW ?? "?"}×{srcH ?? "?"}（比 {srcRatio.toFixed(2)}）
        {video ? " 動画" : " 静止画"}
      </Text>
      <Text style={styles.debugText}>
        {CONTENT_FIT} / 上下の切れ 約{cropPercent}%
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#05070f" },
  fallback: { backgroundColor: "#05070f" },
  // 開発用の切り分け表示（__DEV__ 限定・原因が確定したら消す）
  debug: {
    position: "absolute",
    left: 8,
    bottom: 8,
    padding: 6,
    borderRadius: 6,
    backgroundColor: "rgba(0,0,0,0.6)",
  },
  debugText: { color: "#ffffff", fontSize: 10, fontVariant: ["tabular-nums"] },
});
