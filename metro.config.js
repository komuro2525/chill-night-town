// Metro 設定
// スキーマ/シードの .sql をアセットとしてバンドルするため、assetExts に 'sql' を追加する。
// これにより db/*.sql を「正」として保持したまま、ランタイムで読み込んで実行できる。
const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);

if (!config.resolver.assetExts.includes("sql")) {
  config.resolver.assetExts.push("sql");
}

module.exports = config;
