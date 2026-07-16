import { StyleSheet, Text, View } from "react-native";

import { useBattery } from "@/hooks/use-battery";

// 夜の街に馴染む、控えめで上品なバッテリー表示。
// OSのステータスバーを隠す代わりに自作する（要件2.4）。
const BODY_WIDTH = 34;
const BODY_HEIGHT = 16;
const BORDER = 1.5;
const PADDING = 2;
const INNER_WIDTH = BODY_WIDTH - BORDER * 2 - PADDING * 2;

// 残量に応じた色（低残量は暖色、充電中は落ち着いた緑、通常は淡い白青）
function fillColor(level: number, charging: boolean): string {
  if (charging) return "rgba(150, 230, 170, 0.95)";
  if (level <= 0.15) return "rgba(255, 130, 120, 0.95)";
  return "rgba(224, 236, 255, 0.92)";
}

export function BatteryIndicator() {
  const { level, charging } = useBattery();
  const clamped = Math.max(0, Math.min(1, level));
  const percent = Math.round(clamped * 100);

  return (
    <View style={styles.container}>
      <Text style={styles.percentText}>{percent}%</Text>
      <View style={styles.body}>
        <View
          style={[
            styles.fill,
            {
              width: Math.max(2, INNER_WIDTH * clamped),
              backgroundColor: fillColor(clamped, charging),
            },
          ]}
        />
        {charging ? <Text style={styles.bolt}>⚡</Text> : null}
      </View>
      <View style={styles.cap} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
  },
  percentText: {
    color: "rgba(255,255,255,0.85)",
    fontSize: 11,
    fontWeight: "600",
    marginRight: 5,
  },
  body: {
    width: BODY_WIDTH,
    height: BODY_HEIGHT,
    borderRadius: 4,
    borderWidth: BORDER,
    borderColor: "rgba(255,255,255,0.6)",
    backgroundColor: "rgba(255,255,255,0.08)",
    padding: PADDING,
    justifyContent: "center",
  },
  fill: {
    height: "100%",
    borderRadius: 2,
  },
  bolt: {
    position: "absolute",
    alignSelf: "center",
    color: "rgba(0,0,0,0.7)",
    fontSize: 10,
    lineHeight: 12,
  },
  cap: {
    width: 2,
    height: BODY_HEIGHT * 0.4,
    marginLeft: 1,
    borderTopRightRadius: 2,
    borderBottomRightRadius: 2,
    backgroundColor: "rgba(255,255,255,0.6)",
  },
});
