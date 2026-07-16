import { Pressable, StyleSheet, Text, View } from "react-native";

// 右上のアナログ時計。現在時刻を表示しつつ、タップでタイマー機能へ入るボタンを兼ねる。
// 遷移先（タイマー設定モーダル S3）は Phase 3 で実装する。
// デザインは後で本格的に差し替える前提の暫定版。size で大きさを可変にする。

function Hand({
  size,
  angle,
  length,
  thickness,
  color,
}: {
  size: number;
  angle: number;
  length: number;
  thickness: number;
  color: string;
}) {
  const center = size / 2;
  return (
    <View
      style={[StyleSheet.absoluteFill, { transform: [{ rotate: `${angle}deg` }] }]}
      pointerEvents="none"
    >
      <View
        style={{
          position: "absolute",
          left: center - thickness / 2,
          top: center - length,
          width: thickness,
          height: length,
          borderRadius: thickness / 2,
          backgroundColor: color,
        }}
      />
    </View>
  );
}

export function ClockButton({
  size = 200,
  now,
  onPress,
}: {
  size?: number;
  now: Date;
  onPress: () => void;
}) {
  const center = size / 2;
  const hours = now.getHours() % 12;
  const minutes = now.getMinutes();
  const hourAngle = hours * 30 + minutes * 0.5;
  const minuteAngle = minutes * 6;

  const numFont = Math.round(size * 0.1);
  const dot = size * 0.035;
  const numColor = "rgba(255,255,255,0.7)";
  const numStyle = { color: numColor, fontSize: numFont, fontWeight: "600" as const };

  return (
    <Pressable
      onPress={onPress}
      accessibilityLabel="タイマーを開始する"
      // 枠線は親に付けない。borderWidth があると子の座標基準（パディングボックス）が
      // 枠の分ずれ、針の回転軸と中央の丸の位置がずれるため、枠は下で重ねて描く。
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: "rgba(18,26,46,0.4)",
        overflow: "hidden",
      }}
    >
      <Text
        style={[
          numStyle,
          { position: "absolute", top: size * 0.05, left: 0, right: 0, textAlign: "center" },
        ]}
      >
        XII
      </Text>
      <Text
        style={[
          numStyle,
          { position: "absolute", bottom: size * 0.05, left: 0, right: 0, textAlign: "center" },
        ]}
      >
        VI
      </Text>
      <Text
        style={[numStyle, { position: "absolute", right: size * 0.07, top: center - numFont * 0.7 }]}
      >
        III
      </Text>
      <Text
        style={[numStyle, { position: "absolute", left: size * 0.07, top: center - numFont * 0.7 }]}
      >
        IX
      </Text>

      {/* 短針: 細く、円に収まる長さ */}
      <Hand
        size={size}
        angle={hourAngle}
        length={size * 0.22}
        thickness={Math.max(2, size * 0.012)}
        color="rgba(255,255,255,0.95)"
      />
      {/* 長針（少し細く） */}
      <Hand
        size={size}
        angle={minuteAngle}
        length={size * 0.33}
        thickness={Math.max(1.5, size * 0.014)}
        color="rgba(255,255,255,0.95)"
      />

      {/* 中央の丸（小さめ）。針の回転軸と同じ中心に置く */}
      <View
        style={{
          position: "absolute",
          left: center - dot / 2,
          top: center - dot / 2,
          width: dot,
          height: dot,
          borderRadius: dot / 2,
          backgroundColor: "#ffffff",
        }}
      />

      {/* 枠線（重ねて描画。親に border を付けないことで座標ズレを防ぐ） */}
      <View
        pointerEvents="none"
        style={{
          ...StyleSheet.absoluteFillObject,
          borderRadius: size / 2,
          borderWidth: 2.5,
          // 枠の色は針と同じにする
          borderColor: "rgba(255,255,255,0.95)",
        }}
      />
    </Pressable>
  );
}
