import { ReactNode, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from "react-native";

import { Spacing } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";
import { ThemedText } from "./themed-text";

// 設定系画面（S8/S9/S10）で共通の見た目。
// コンセプト準拠: 静かなトーン・責めない文言・感嘆符を使わない。

const DANGER_COLOR = "#d9534f";

/** 見出し付きのグループ。中の行は薄い区切り線で仕切る */
export function SettingSection({
  title,
  footer,
  children,
}: {
  title?: string;
  footer?: string;
  children: ReactNode;
}) {
  const theme = useTheme();
  return (
    <View style={styles.section}>
      {title ? (
        <ThemedText type="small" themeColor="textSecondary" style={styles.sectionTitle}>
          {title}
        </ThemedText>
      ) : null}
      <View style={[styles.card, { backgroundColor: theme.backgroundElement }]}>
        {children}
      </View>
      {footer ? (
        <ThemedText type="small" themeColor="textSecondary" style={styles.footer}>
          {footer}
        </ThemedText>
      ) : null}
    </View>
  );
}

/**
 * 設定の1行。
 * - onPress があればタップ可能（右端に > を出す）
 * - right に任意の要素（Switch・セグメント等）を差し込める
 * - disabled のときはグレーアウトし、note（例: 学習中は変更できません）を添える
 */
export function SettingRow({
  label,
  value,
  note,
  right,
  onPress,
  disabled = false,
  danger = false,
  first = false,
}: {
  label: string;
  value?: string;
  note?: string;
  right?: ReactNode;
  onPress?: () => void;
  disabled?: boolean;
  danger?: boolean;
  /** グループ先頭の行は上区切り線を出さない */
  first?: boolean;
}) {
  const theme = useTheme();
  const tappable = !!onPress && !disabled;

  const body = (
    <View
      style={[
        styles.row,
        !first && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.backgroundSelected },
        disabled && styles.disabled,
      ]}
    >
      <View style={styles.rowLabel}>
        <ThemedText style={danger ? { color: DANGER_COLOR } : undefined}>{label}</ThemedText>
        {note ? (
          <ThemedText type="small" themeColor="textSecondary">
            {note}
          </ThemedText>
        ) : null}
      </View>
      {right ??
        (value != null ? (
          <ThemedText themeColor="textSecondary" style={styles.value} numberOfLines={1}>
            {value}
          </ThemedText>
        ) : null)}
      {tappable ? (
        <ThemedText themeColor="textSecondary" style={styles.chevron}>
          ›
        </ThemedText>
      ) : null}
    </View>
  );

  if (!tappable) return body;
  return (
    <Pressable onPress={onPress} style={({ pressed }) => (pressed ? styles.pressed : undefined)}>
      {body}
    </Pressable>
  );
}

/**
 * 1項目を入力し直すモーダル（ニックネーム・目標時間・サブタイトル・タグ名・プロジェクト目標で共用）。
 * validate はエラーメッセージ（無ければ null）を返す純関数。onSubmit の失敗はそのまま投げる。
 */
export function EditFieldModal({
  visible,
  title,
  description,
  initialValue,
  placeholder,
  keyboardType = "default",
  maxLength,
  submitLabel = "保存",
  validate,
  onCancel,
  onSubmit,
}: {
  visible: boolean;
  title: string;
  description?: string;
  initialValue: string;
  placeholder?: string;
  keyboardType?: "default" | "number-pad";
  maxLength?: number;
  submitLabel?: string;
  validate?: (raw: string) => string | null;
  onCancel: () => void;
  onSubmit: (value: string) => Promise<void> | void;
}) {
  const theme = useTheme();
  const [text, setText] = useState(initialValue);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // 開くたびに現在値へ初期化する
  useEffect(() => {
    if (visible) {
      setText(initialValue);
      setError(null);
      setSaving(false);
    }
  }, [visible, initialValue]);

  async function handleSubmit() {
    if (saving) return;
    const err = validate?.(text) ?? null;
    if (err) {
      setError(err);
      return;
    }
    setSaving(true);
    try {
      await onSubmit(text.trim());
      onCancel();
    } catch (e) {
      console.error("設定の保存に失敗しました", e);
      setError("保存に失敗しました。時間をおいて再度お試しください");
      setSaving(false);
    }
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      {/* キーボード回避で中央のダイアログを動かすと、閉じる際に位置がずれて見える。
          ダイアログは中央に固定し、キーボードは重なっても動かさない（1行入力のため隠れない） */}
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onCancel} />
        <View style={[styles.dialog, { backgroundColor: theme.background }]}>
          <ThemedText type="smallBold">{title}</ThemedText>
          {description ? (
            <ThemedText type="small" themeColor="textSecondary">
              {description}
            </ThemedText>
          ) : null}
          <TextInput
            value={text}
            onChangeText={setText}
            placeholder={placeholder}
            placeholderTextColor={theme.textSecondary}
            keyboardType={keyboardType}
            maxLength={maxLength}
            autoFocus
            style={[
              styles.input,
              { color: theme.text, backgroundColor: theme.backgroundElement, borderColor: theme.backgroundSelected },
            ]}
          />
          {error ? (
            <ThemedText type="small" style={{ color: DANGER_COLOR }}>
              {error}
            </ThemedText>
          ) : null}
          <View style={styles.dialogActions}>
            <Pressable onPress={onCancel} style={styles.dialogButton} hitSlop={6}>
              <ThemedText themeColor="textSecondary">やめる</ThemedText>
            </Pressable>
            <Pressable
              onPress={handleSubmit}
              disabled={saving}
              style={[styles.dialogButton, styles.primaryButton, { backgroundColor: theme.text }]}
            >
              {saving ? (
                <ActivityIndicator color={theme.background} />
              ) : (
                <ThemedText type="smallBold" style={{ color: theme.background }}>
                  {submitLabel}
                </ThemedText>
              )}
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  section: { marginBottom: Spacing.four },
  sectionTitle: { marginBottom: Spacing.two, marginLeft: Spacing.one },
  footer: { marginTop: Spacing.two, marginLeft: Spacing.one },
  card: {
    borderRadius: 12,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.4)",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 52,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    gap: Spacing.two,
  },
  rowLabel: { flex: 1, gap: 2 },
  value: { flexShrink: 1, textAlign: "right", maxWidth: "55%" },
  chevron: { fontSize: 20, lineHeight: 20 },
  disabled: { opacity: 0.4 },
  pressed: { opacity: 0.6 },
  backdrop: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.four,
    // 中央より少し上へ寄せる（下側に余白を多めに取る）。キーボードとも重なりにくい
    paddingBottom: Spacing.six * 3,
    backgroundColor: "rgba(0,0,0,0.5)",
  },
  dialog: {
    width: "100%",
    borderRadius: 16,
    padding: Spacing.four,
    gap: Spacing.three,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.4)",
  },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
    fontSize: 16,
  },
  dialogActions: { flexDirection: "row", justifyContent: "flex-end", gap: Spacing.two, marginTop: Spacing.one },
  dialogButton: { paddingVertical: Spacing.two, paddingHorizontal: Spacing.four, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  primaryButton: { minWidth: 88 },
});
