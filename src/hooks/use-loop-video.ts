import { useVideoPlayer, type VideoSource } from "expo-video";
import { useEffect } from "react";
import { AppState } from "react-native";

// 背景で流し続けるループ動画のプレイヤー（街の背景・天気の演出で共用）。
//
// 共通の設定:
//   ・loop / muted。動画側の音は一切使わない（音はBGM・環境音・効果音が担う。要件9）
//   ・audioMixingMode = "mixWithOthers" は必須。既定のままだと expo-audio の再生を
//     止めてしまい、無音の動画がBGMを消すという最悪の壊れ方をする
//
// アプリがバックグラウンドへ回ると、expo-video は再生を止める（背景再生を有効に
// していないため）。**戻ってきても自動では再開しない**ので、ここで面倒を見る。
// これが無いと、アプリを開き直したときに背景が静止画のまま固まって見える。
export function useLoopVideoPlayer(source: VideoSource) {
  const player = useVideoPlayer(source, (p) => {
    p.loop = true;
    p.muted = true;
    p.audioMixingMode = "mixWithOthers";
    p.play();
  });

  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state !== "active") return;
      // 解放済みのプレイヤーに触れると例外になり得るため、握りつぶして次回に任せる
      try {
        player.play();
      } catch {
        // 画面から外れた直後の復帰など。次にマウントされたときに再生される
      }
    });
    return () => sub.remove();
  }, [player]);

  return player;
}
