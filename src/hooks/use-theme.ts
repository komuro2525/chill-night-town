/**
 * Learn more about light and dark modes:
 * https://docs.expo.dev/guides/color-schemes/
 */

import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

export function useTheme() {
  const scheme = useColorScheme();
  // useColorScheme は null / undefined を返すことがある（起動直後・未対応環境）。
  // その場合は light にフォールバックする
  return Colors[scheme === 'dark' ? 'dark' : 'light'];
}
