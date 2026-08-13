import { StyleSheet, View } from "react-native";

import { LightRgb } from "@/constants/theme";
import type { LevelProgress } from "@/lib/growth";

// 次のレベルまでの積み上がり（要件6.1・6.2）。レベルの灯りの真下に敷く。
//
// **成長方式によらずバーで表す。** 習慣型は「あと何回」が数えられる回数制だが、
// ドットで並べるとレベルの丸5個と個数が一致し、掛け算で読まれて
// 「25回でLv.5」と誤解される（実際は5回×4段＝20回）。形を変えることで、
// レベルの段数と積み上がりが別物だと一目で分かるようにする。
//
// 数字や「あと◯回」の文言は出さない。急かさない・煽らない方針（要件2.1）に沿って、
// 「どれくらい進んだか」が伝われば足りるという判断。
//
// 幅は親（レベルの灯りの並び）に合わせて伸ばす。定数を持ち合うと灯りの大きさを
// 変えたときに片方だけ直し忘れるため、alignSelf で追従させる。
//
// 街が完成（Lv.5）していれば呼び出し側が null を渡す。空のゲージを残さないため。
const BAR_HEIGHT = 3;

export function LevelProgressIndicator({
  progress,
}: {
  /** null なら何も描かない（街の完成・プロジェクト型で目標未設定） */
  progress: LevelProgress | null;
}) {
  if (!progress) return null;

  return (
    <View style={styles.bar}>
      <View
        style={[styles.barFill, { width: `${progress.ratio * 100}%` }]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    alignSelf: "stretch",
    height: BAR_HEIGHT,
    borderRadius: BAR_HEIGHT / 2,
    backgroundColor: "rgba(255,255,255,0.3)",
    overflow: "hidden",
  },
  // 溜まったぶんは灯りの色（発光はさせない。主役はレベルの灯り）
  barFill: {
    height: BAR_HEIGHT,
    borderRadius: BAR_HEIGHT / 2,
    backgroundColor: `rgba(${LightRgb},0.9)`,
  },
});
