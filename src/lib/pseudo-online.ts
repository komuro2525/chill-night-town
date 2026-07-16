import { PSEUDO_ONLINE } from "@/constants/domain";

// 疑似オンライン人数（要件11章）。アプリ起動中は同じ値を表示し続ける（永続化しない）。
// 初回参照時に一度だけ 3〜27 の範囲で生成してキャッシュする。
let cached: number | null = null;

export function getPseudoOnlineCount(): number {
  if (cached == null) {
    const { MIN, MAX } = PSEUDO_ONLINE;
    cached = Math.floor(Math.random() * (MAX - MIN + 1)) + MIN;
  }
  return cached;
}
