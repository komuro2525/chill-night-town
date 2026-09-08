import { Colors } from '@/constants/theme';

/**
 * 配色は**常に dark 固定**で、OSのライト／ダーク設定には追従しない。
 *
 * 本アプリは「夜の街」という世界観そのものが土台で、画面の大半は夜空と街の灯りで
 * できている。OSがライトの端末では地の色が白へ寄り、灯りも文字も判別しづらくなる
 * ——見た目の好みではなく、成立しなくなる（2026-09-08 ユーザー判断）。
 *
 * Colors.light は使わないが、ThemeColor の型が両者のキーの共通部分から導かれているため
 * 定義自体は残してある。
 */
export function useTheme() {
  return Colors.dark;
}
