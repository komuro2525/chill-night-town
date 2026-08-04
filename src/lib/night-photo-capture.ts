// =====================================================================
// その夜の写真（要件2.6 / UC 2.6）— 撮影の手順
//
// 権限の確認 → カメラ起動 → 再エンコードして保存、までをまとめる。
// DBへの記録は呼び出し側が行う（保存が成功してから書き込む順序を守るため）。
//
// 取得はカメラ撮影のみとし、写真ライブラリからは選ばせない。「その夜の外を
// 確かめる」ための機能であり、任意の過去の写真を入れられると
// 「その夜の記録」でなくなるため（要件2.6 / セキュリティ方針 S10）。
// =====================================================================

import * as ImagePicker from "expo-image-picker";

import { buildPhotoFileName } from "./night-photo";
import { saveCapturedPhoto } from "./night-photo-storage";

export type CaptureResult =
  /** 撮影して保存できた。呼び出し側はこの内容でDBを更新する */
  | { status: "saved"; fileName: string; takenAt: Date }
  /** ユーザーが撮らずに戻った（何も変更しない） */
  | { status: "cancelled" }
  /** カメラ権限が無い。端末の設定から変更できる旨を案内する */
  | { status: "denied" }
  /** 撮影・保存に失敗した。責めない文言で静かに知らせる */
  | { status: "failed" };

/**
 * その学習日の写真を撮って保存する。
 *
 * @param studyDate 帰属させる学習日。**撮り始めた時刻**の学習日を呼び出し側が渡す
 *   （保存完了時刻で判定しないため。要件2.6）
 * @param runAndRestoreAudio カメラから戻ったときにBGM・環境音を鳴らし直すためのラッパ
 *   （AudioContext が提供する）。撮影中は音が止まってよいが、戻って無音のままだと
 *   夜の街が死んで見えるため
 */
export async function captureNightPhoto(
  studyDate: string,
  runAndRestoreAudio: <T>(task: () => Promise<T>) => Promise<T>,
): Promise<CaptureResult> {
  const permission = await ImagePicker.requestCameraPermissionsAsync();
  if (!permission.granted) return { status: "denied" };

  // 撮り始めた時刻。これがファイル名と表示のもとになる
  const takenAt = new Date();

  try {
    const result = await runAndRestoreAudio(() =>
      ImagePicker.launchCameraAsync({
        // 編集画面は挟まない（夜の空をそのまま残す機能であり、加工の場ではない）
        allowsEditing: false,
        // 保存時に再エンコードするため、ここでの圧縮は最小限にとどめる
        quality: 1,
        // EXIF は保存時の再エンコードで落とすが、そもそも受け取らない
        exif: false,
      }),
    );

    if (result.canceled) return { status: "cancelled" };

    const asset = result.assets[0];
    if (!asset) return { status: "failed" };

    const fileName = buildPhotoFileName(studyDate, takenAt);
    await saveCapturedPhoto({
      sourceUri: asset.uri,
      width: asset.width,
      height: asset.height,
      fileName,
    });
    return { status: "saved", fileName, takenAt };
  } catch (e) {
    console.error("夜の写真の撮影・保存に失敗しました", e);
    return { status: "failed" };
  }
}
