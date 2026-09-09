import { Image } from "expo-image";
import { useState } from "react";
import {
  type ImageSourcePropType,
  Pressable,
  StyleSheet,
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

// 背景の当て方。cover=全画面に敷き詰め（上下は切れる）。
//
// 背景素材はすべて約16:9（1672x941・比1.78）で、端末を横にすると画面は約2.16のため、
// **上下が2割ほど切れる**（例: 844x390 の端末で約18%）。これは要件2.4の
// 「背景素材は、横向き表示時に見える上下の範囲を考慮した高さで制作すること」に沿った
// 前提であり、切れること自体は想定どおり。切れる位置に見せたいものが入る場合は、
// 素材側で余白を持たせるか "contain" に変える（contain は左右に帯が出る）。
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
        <TownVideoBackdrop
          video={video}
          poster={art}
          contentFit={CONTENT_FIT}
        />
      ) : art ? (
        <Image
          source={art}
          style={StyleSheet.absoluteFill}
          contentFit={CONTENT_FIT}
        />
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
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#05070f" },
  fallback: { backgroundColor: "#05070f" },
});
