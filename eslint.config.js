// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require("eslint-config-expo/flat");

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ["dist/*"],
  },
  {
    // SDK 57（eslint-config-expo@57）で新たに error として有効化された
    // React Compiler 系のルールのうち、本プロジェクトでは成立しないものを外す。
    //
    // reactCompiler 自体は SDK 54 の時点で既に有効であり、これらは
    // 「新しく壊れた」ものではなく「検査が厳しくなって見えた」もの。
    // 同時に検出された react-hooks/refs（25件）は実際に直す価値があったため
    // 解消済みで、ここに残しているのは直しようがない・直す意味がない3つだけ。
    rules: {
      // Reanimated の SharedValue（`translateY.value = ...`）と expo-audio の
      // AudioPlayer（`player.volume = ...` / `player.loop = ...`）への代入を
      // 「変更できない値の書き換え」として検出する。どちらも書き換えるために
      // 存在するオブジェクトで、代入以外に設定手段がない。
      // 該当: setup.tsx・calendar-day-detail.tsx（Reanimated）、AudioContext.tsx（プレイヤー）
      "react-hooks/immutability": "off",

      // 該当箇所はすべて次の2種で、いずれも意図した形。
      //   1. 非同期のデータ読み込み（await の後に setState する。Context・カレンダー）
      //   2. モーダルを開くたびの値リセット（visible が true になったら初期値へ戻す）
      // ルールに従う形へ直すとデータ読み込みの構造とモーダルの制御を
      // 広範に作り替えることになり、挙動は良くならない。
      "react-hooks/set-state-in-effect": "off",

      // 「Compilation Skipped: Existing memoization could not be preserved」の報告。
      // コンパイラが自動メモ化を諦めただけで、手書きの useCallback は
      // そのまま効いており動作は変わらない。正しさの問題ではない。
      "react-hooks/preserve-manual-memoization": "off",
    },
  },
]);
