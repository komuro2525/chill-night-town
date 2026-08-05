import { useVideoPlayer, VideoView } from "expo-video";
import { StyleSheet } from "react-native";

import { getWeatherEffect } from "@/constants/weatherEffect";

// その夜の天気の演出レイヤー（要件8章）。背景（街）の上、UIの下に敷く。
//
// 素材は黒背景のMP4で、mixBlendMode: "screen" を掛けて黒を抜く（アルファは使わない。
// 詳細は constants/weatherEffect.ts）。
//
// 街の背景と違い、スワイプ探索（要件2.2）では動かさない。雨はカメラの手前にあるもので、
// 街と一緒に流れると視点がおかしくなるため、画面に固定する。
//
// 動画のデコードが背景と合わせて2本になるため、「背景を動かす」（要件10.11）がオフの
// ときとおやすみの暗転後は、背景と同じく再生しない（呼び出し側が enabled を落とす）。
export function WeatherOverlay({
  weatherCode,
  enabled,
}: {
  /** その学習日に選択された天気（night_weather.code）。未選択は null */
  weatherCode: string | null | undefined;
  /** 演出を出すか（背景を動かす設定・おやすみの暗転に追従する） */
  enabled: boolean;
}) {
  const effect = enabled ? getWeatherEffect(weatherCode) : undefined;
  if (!effect) return null;
  return <WeatherVideo source={effect.source} opacity={effect.opacity} />;
}

// プレイヤーはフックのため、演出の有無で条件分岐できるよう内側の部品に分ける。
function WeatherVideo({ source, opacity }: { source: number; opacity: number }) {
  const player = useVideoPlayer(source, (p) => {
    p.loop = true;
    p.muted = true;
    // 雨の音は環境音（要件9 / ambient-select.ts）が担う。映像側の音は使わない
    p.audioMixingMode = "mixWithOthers";
    p.play();
  });

  return (
    <VideoView
      player={player}
      // screen 合成で黒を抜く（素材にアルファが無いため。詳細は constants/weatherEffect.ts）
      style={[StyleSheet.absoluteFill, { opacity, mixBlendMode: "screen" }]}
      contentFit="cover"
      nativeControls={false}
      // 演出なので操作は一切受け付けない。タップ・スワイプは下の背景へ通す
      pointerEvents="none"
    />
  );
}
