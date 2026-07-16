import { Asset } from "expo-asset";
// 新API(File)ではなく、テキスト読み取りが安定している legacy API を使用する
import * as LegacyFileSystem from "expo-file-system/legacy";
import { Platform } from "react-native";

/**
 * metro でバンドルした .sql アセット（`require('....sql')` の戻り値）を
 * 文字列として読み込む。
 *
 * - ネイティブ: アセットはローカルへ展開され file:// パスになる → legacy FS で読む
 * - Web: アセットは http(s) URL になる → fetch で読む
 *
 * @param moduleId `require('../../db/xxx.sql')` の戻り値
 */
export async function loadSqlAsset(moduleId: number): Promise<string> {
  const asset = Asset.fromModule(moduleId);
  await asset.downloadAsync(); // 展開済みなら即時解決する（冪等）

  const uri = asset.localUri ?? asset.uri;
  if (!uri) {
    throw new Error("SQLアセットのURIを解決できませんでした");
  }

  if (Platform.OS === "web") {
    const res = await fetch(uri);
    return await res.text();
  }

  return await LegacyFileSystem.readAsStringAsync(uri);
}
