// カレンダー表示のための純関数（要件4章）。
//
// カレンダーは「学習日」（study_date、要件0章）を単位に記録を並べる。
// グリッドの生成は月初の曜日やうるう年でずれやすく、画面を見ても正しさが
// 分かりにくいため、DBに触れない純関数にして境界をテストで固定する。

import { formatDateKey } from "./study-day";

/** カレンダーの1マス。null は前月・翌月ぶんの空セル */
export type CalendarCell = {
  /** 'YYYY-MM-DD'（その月の日。study_date と一致する） */
  dateKey: string;
  day: number;
} | null;

/**
 * 月のカレンダーグリッドを作る（週頭は日曜）。
 *
 * 先頭は月初の曜日ぶん null で詰め、末尾は7の倍数になるよう null で埋める。
 * これにより 7×N の長方形になり、UI側は7列で流し込むだけでよい。
 *
 * @param year 西暦
 * @param month 1〜12（JSの0始まりではない）
 */
export function getMonthGrid(year: number, month: number): CalendarCell[] {
  const firstDay = new Date(year, month - 1, 1);
  const leadingBlanks = firstDay.getDay(); // 0=日曜
  // 月末日: 翌月0日 = 当月末日
  const daysInMonth = new Date(year, month, 0).getDate();

  const cells: CalendarCell[] = [];
  for (let i = 0; i < leadingBlanks; i++) cells.push(null);
  for (let day = 1; day <= daysInMonth; day++) {
    cells.push({ dateKey: formatDateKey(new Date(year, month - 1, day)), day });
  }
  // 末尾を7の倍数まで埋める
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

/**
 * その月の study_date の範囲（両端含む）。集計クエリの絞り込みに使う。
 * @returns { start: 'YYYY-MM-01', end: 'YYYY-MM-末日' }
 */
export function getMonthRange(
  year: number,
  month: number,
): { start: string; end: string } {
  const daysInMonth = new Date(year, month, 0).getDate();
  return {
    start: formatDateKey(new Date(year, month - 1, 1)),
    end: formatDateKey(new Date(year, month - 1, daysInMonth)),
  };
}

/** 1か月前後へ移動する（月の切り替え）。年またぎも正しく扱う */
export function shiftMonth(
  year: number,
  month: number,
  delta: number,
): { year: number; month: number } {
  const d = new Date(year, month - 1 + delta, 1);
  return { year: d.getFullYear(), month: d.getMonth() + 1 };
}

/**
 * 最頻の要素を1つ選ぶ（要件4.2「最も多かった感情／夜の天気」）。
 *
 * 同数のときの扱い（tie-break）は要件に定義が無いため、**order（マスタの
 * display_order）の若い方**を選ぶ。これで結果が安定し、同じデータなら常に
 * 同じ答えになる（実装判断）。
 *
 * @param counts id → 出現回数
 * @param order  id → 並び順（display_order）。tie-break に使う
 * @returns 最頻の id。counts が空なら null
 */
export function pickMostFrequent(
  counts: Map<number, number>,
  order: Map<number, number>,
): number | null {
  let bestId: number | null = null;
  let bestCount = 0;
  let bestOrder = Infinity;

  for (const [id, count] of counts) {
    const ord = order.get(id) ?? Infinity;
    if (count > bestCount || (count === bestCount && ord < bestOrder)) {
      bestId = id;
      bestCount = count;
      bestOrder = ord;
    }
  }
  return bestId;
}
