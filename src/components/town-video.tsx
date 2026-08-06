import { Image } from "expo-image";
import { VideoView } from "expo-video";
import type { ImageSourcePropType } from "react-native";
import { StyleSheet } from "react-native";

import type { TownVideo } from "@/constants/townVideo";
import { useLoopVideoPlayer } from "@/hooks/use-loop-video";

// 街の背景のループ動画（要件2.2）。静止画の代わりに敷く。
//
// ・ポスター（対応する静止画）を下敷きに敷き、読み込みの一瞬で黒画面が出ないようにする
// ・無音・ループ・バックグラウンドから戻ったときの再開は useLoopVideoPlayer に集約している
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
  const player = useLoopVideoPlayer(video.source);

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
