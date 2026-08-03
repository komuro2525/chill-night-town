// =====================================================================
// その夜の写真（要件2.6）— 画像ファイルの保存・削除
//
// DBが持つのはファイル名だけで、実体はアプリ専有領域の night-photos/ にある。
// ドキュメントディレクトリの絶対パスはOS・アプリ更新で変わり得るため、
// 参照するたびにここで組み立てる（テーブル定義書15a）。
//
// 保存前に必ず再エンコードする。目的はEXIF（撮影位置など）の除去であり、
// 容量削減は副次的な効果（セキュリティ方針 S10）。元ファイルは残さない。
//
// ファイル操作はここに閉じ込め、帰属・命名の判断は night-photo.ts が持つ。
// =====================================================================

import { Directory, File, Paths } from "expo-file-system";
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";

import { NIGHT_PHOTO_DIR } from "./night-photo";

/** 保存前に縮める長辺の上限（px）。EXIF除去のための再エンコードを兼ねる */
const MAX_EDGE = 1280;
/** JPEG品質。夜の写真は暗部が主なので、これ以上落とすと帯が出る */
const JPEG_QUALITY = 0.7;

function photoDirectory(): Directory {
  return new Directory(Paths.document, NIGHT_PHOTO_DIR);
}

/** ファイル名から表示用のURIを作る（DBは絶対パスを持たない） */
export function photoUri(fileName: string): string {
  return new File(photoDirectory(), fileName).uri;
}

/**
 * 撮影した画像を再エンコードして保存し、保存できたファイル名を返す。
 *
 * 呼び出し側は「保存が成功してからDBを更新する」こと（要件2.6）。
 * 逆順だと、実体のない参照が記録に残る。
 */
export async function saveCapturedPhoto(params: {
  /** カメラが返した一時ファイルのURI */
  sourceUri: string;
  /** 元画像の寸法（長辺を判断するために使う） */
  width: number;
  height: number;
  /** 保存名（night-photo.ts の buildPhotoFileName で作る） */
  fileName: string;
}): Promise<void> {
  const { sourceUri, width, height, fileName } = params;

  const context = ImageManipulator.manipulate(sourceUri);
  // 長辺だけを見て縮める。もともと小さい画像は引き伸ばさない
  const longEdge = Math.max(width, height);
  if (longEdge > MAX_EDGE) {
    context.resize(width >= height ? { width: MAX_EDGE } : { height: MAX_EDGE });
  }
  const rendered = await context.renderAsync();
  // ここで新しいJPEGとして書き出される＝元のEXIFは引き継がれない
  const result = await rendered.saveAsync({
    compress: JPEG_QUALITY,
    format: SaveFormat.JPEG,
  });

  const dir = photoDirectory();
  if (!dir.exists) dir.create({ intermediates: true });

  const destination = new File(dir, fileName);
  if (destination.exists) destination.delete();
  new File(result.uri).move(destination);
}

/** 写真1枚の実体を削除する（存在しなければ何もしない） */
export function deletePhotoFile(fileName: string): void {
  const file = new File(photoDirectory(), fileName);
  if (file.exists) file.delete();
}

/**
 * 保存ディレクトリごと削除する（データ初期化・要件10.10）。
 * 実体はDBの外にあり ON DELETE CASCADE では消えないため、初期化から明示的に呼ぶ。
 */
export function deleteAllPhotos(): void {
  const dir = photoDirectory();
  if (dir.exists) dir.delete();
}
