import { Ionicons } from "@expo/vector-icons";
import { ComponentProps } from "react";
import { Pressable, StyleSheet } from "react-native";

// ホーム画面の丸アイコンボタン（カレンダー・設定・おやすみ・鑑賞モード）。
// 見た目は時計やLv表示と同じ言語（半透明の下地＋白い枠＋白いアイコン）で統一する。
const SIZE = 46;

export function RoundIconButton({
  name,
  onPress,
  accessibilityLabel,
  disabled = false,
  dimmed = false,
}: {
  name: ComponentProps<typeof Ionicons>["name"];
  onPress: () => void;
  accessibilityLabel: string;
  disabled?: boolean;
  /** 見た目だけ非活性に見せる（押下は受け付ける）。おやすみ等で「押すと理由を伝える」用途 */
  dimmed?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      hitSlop={6}
      accessibilityLabel={accessibilityLabel}
      style={[styles.button, (disabled || dimmed) && styles.disabled]}
    >
      <Ionicons
        name={name}
        size={SIZE * 0.5}
        color="rgba(255,255,255,0.95)"
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    width: SIZE,
    height: SIZE,
    borderRadius: SIZE / 2,
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.95)",
    backgroundColor: "rgba(18,26,46,0.4)",
    alignItems: "center",
    justifyContent: "center",
  },
  disabled: {
    opacity: 0.4,
  },
});
