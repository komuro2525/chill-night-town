import { Image } from "expo-image";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";

import { Spacing } from "@/constants/theme";
import { photoUri } from "@/lib/night-photo-storage";

// その夜の写真の拡大表示（要件2.6 / 4.1）。
//
// カレンダーの日別詳細・学習成果記録・天気の選択欄のどこから開いても同じ見え方に
// なるよう、部品として切り出してある。
//
// できるのは「大きく見る」「閉じる」だけとし、つまんで拡大する操作は持たない。
// 撮るのは夜空や外の風景で細部を確かめる被写体ではないうえ、保存時に長辺1280pxへ
// 縮めているため寄っても粗さが出るだけで、記録を眺める画面に操作を増やす利がない。
//
// ボタンは画面の中ほどに置く。端に寄せると指が届きにくく、「消す」が下端にあると
// 閉じるつもりで押し間違えるため。

export function NightPhotoViewer({
  fileName,
  onClose,
  onDelete,
}: {
  /** 表示する写真のファイル名。null なら閉じている */
  fileName: string | null;
  onClose: () => void;
  /** 渡したときだけ「消す」を出す（削除の入口を増やしすぎないため） */
  onDelete?: () => void;
}) {
  return (
    <Modal
      visible={fileName !== null}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.root}>
        {fileName ? (
          <Image
            source={{ uri: photoUri(fileName) }}
            style={styles.image}
            contentFit="contain"
          />
        ) : null}

        <View style={styles.actions}>
          <Pressable
            onPress={onClose}
            accessibilityLabel="閉じる"
            hitSlop={10}
            style={({ pressed }) => [pressed && styles.pressed]}
          >
            <Text style={styles.action}>閉じる</Text>
          </Pressable>
          {onDelete ? (
            <Pressable
              onPress={onDelete}
              accessibilityLabel="この写真を消す"
              hitSlop={10}
              style={({ pressed }) => [pressed && styles.pressed]}
            >
              <Text style={styles.action}>消す</Text>
            </Pressable>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "rgba(3,6,15,0.96)",
    alignItems: "center",
    justifyContent: "center",
    padding: Spacing.four,
    gap: Spacing.four,
  },
  // 画面いっぱいには広げず、ボタンが画面の中ほどへ来るようにする
  image: {
    width: "100%",
    height: "70%",
  },
  actions: {
    flexDirection: "row",
    gap: Spacing.five,
  },
  action: {
    color: "rgba(255,255,255,0.85)",
    fontSize: 15,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
  },
  pressed: {
    opacity: 0.6,
  },
});
