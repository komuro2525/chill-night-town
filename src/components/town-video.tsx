import { Image } from "expo-image";
import { useVideoPlayer, VideoView } from "expo-video";
import type { ImageSourcePropType } from "react-native";
import { StyleSheet } from "react-native";

import type { TownVideo } from "@/constants/townVideo";

// 街の背景のループ動画（要件2.2）。静止画の代わりに敷く。
//
// ・無音で再生する。動画の音は一切使わない
// ・audioMixingMode は "mixWithOthers" が必須。既定のままだとBGM・環境音（expo-audio）を
//   止めてしまう。背景が音楽を消すことはあってはならない（要件9）
// ・ポスター（対応する静止画）を下敷きに敷き、読み込みの一瞬で黒画面が出ないようにする
// ・アプリがバックグラウンドへ回ると再生は自動で止まる（背景再生を有効にしていないため）
export function TownVideoBackdrop({
  video,
  poster,
  contentFit = "cover",
}: {
  video: TownVideo;
  /** 読み込み中に敷く静止画（対応する townArt の画像） */
  poster: ImageSourcePropType | undefined;
  contentFit?: "cover" | "contain";
}) {
  const player = useVideoPlayer(video.source, (p) => {
    p.loop = true;
    p.muted = true;
    p.audioMixingMode = "mixWithOthers";
    p.play();
  });

  return (
    <>
      {poster ? (
        <Image
          source={poster}
          style={StyleSheet.absoluteFill}
          contentFit={contentFit}
        />
      ) : null}
      <VideoView
        player={player}
        style={StyleSheet.absoluteFill}
        contentFit={contentFit}
        nativeControls={false}
        // 背景なので操作は一切受け付けない。タップ・スワイプは下の背景土台へ通す
        pointerEvents="none"
      />
    </>
  );
}
