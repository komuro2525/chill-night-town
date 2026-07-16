// Jest 設定
// 対象は src/lib 配下の純粋なロジック（学習日の帰属・計測・入力検証）。
// これらは画面を見ても正しさが分からず、壊れると記録・成長判定に直接響くため、
// 実行して確認できる形（テスト）で残す。
//
// preset の jest-expo は Expo/React Native のトランスパイル設定を含む。
/** @type {import('jest').Config} */
module.exports = {
  preset: "jest-expo",
  // tsconfig の paths（@/* → src/*）に合わせる
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/src/$1",
  },
  testMatch: ["**/__tests__/**/*.test.ts"],
};
