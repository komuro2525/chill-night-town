import { useEventListener } from "expo";
import { useVideoPlayer, VideoView } from "expo-video";
import { useCallback, useEffect, useRef, useState } from "react";
import { AppState, StyleSheet } from "react-native";

// 天気の演出に重ねる「単発」のレイヤー（雷など）。要件8章。
//
// 雨や雪はずっと降り続けるのでループでよいが、**雷は光り続けない**。
// ループさせると素材の尺（9秒ほど）ごとに光ってしまい、静かな夜の画面が
// 落ち着かなくなる。そこで一度流したら消し、次までランダムな間隔を置く。
//
// 間隔に乱数を使ってよいのは、これが「どの素材を選ぶか」ではなく
// **時間軸の演出**だからである（素材の抽選に乱数を使わない理由は
// lib/video-variant.ts にある）。次の時刻は ref に持ち、描き直しでは
// 選び直さない。等間隔にしないのは、周期が読めると作り物に見えるため。
const MIN_GAP_MS = 15000;
const MAX_GAP_MS = 45000;
/** 最初の1回だけは短めに置く（開いてしばらく何も起きないと、素材が無いように見える） */
const FIRST_GAP_MS = 4000;

function nextGapMs(): number {
  return MIN_GAP_MS + Math.random() * (MAX_GAP_MS - MIN_GAP_MS);
}

export function WeatherFlash({
  source,
  opacity,
}: {
  /** require() した MP4（黒背景・screen 合成前提） */
  source: number;
  opacity: number;
}) {
  // 光っていないあいだは透明にして伏せておく。素材の最終フレームが残っても見えない
  const [lit, setLit] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const player = useVideoPlayer(source, (p) => {
    // ここだけは loop させない（間隔を置くのが目的のため）
    p.loop = false;
    p.muted = true;
    // 既定のままだとBGM・環境音を止めてしまう。雷の音は環境音が担う（要件9）
    p.audioMixingMode = "mixWithOthers";
  });

  const flashLater = useCallback(
    (delay: number) => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        // 先頭へ戻してから見せる。前回の最終フレームが一瞬見えないように
        try {
          player.currentTime = 0;
          setLit(true);
          player.play();
        } catch {
          // 画面から外れた直後など。次の機会に任せる
        }
      }, delay);
    },
    [player],
  );

  // 流し終わったら伏せて、次までの間隔を置く
  useEventListener(player, "playToEnd", () => {
    setLit(false);
    flashLater(nextGapMs());
  });

  useEffect(() => {
    flashLater(FIRST_GAP_MS);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [flashLater]);

  // 背面にいるあいだ setTimeout は当てにならず、戻っても次が来ないことがある。
  // 前面に戻った時点で伏せて置き直す（動画の復帰と同じ考え方）
  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state !== "active") return;
      setLit(false);
      flashLater(FIRST_GAP_MS);
    });
    return () => sub.remove();
  }, [flashLater]);

  return (
    <VideoView
      player={player}
      // screen 合成で黒を抜く（素材にアルファが無いため。詳細は constants/weatherEffect.ts）
      style={[
        StyleSheet.absoluteFill,
        { opacity: lit ? opacity : 0, mixBlendMode: "screen" },
      ]}
      contentFit="cover"
      nativeControls={false}
      // 演出なので操作は一切受け付けない。タップ・スワイプは下の背景へ通す
      pointerEvents="none"
    />
  );
}
