// カレンダー表示のための純関数（要件4章）。
//
// カレンダーは「学習日」（study_date、要件0章）を単位に記録を並べる。
// グリッドの生成は月初の曜日やうるう年でずれやすく、画面を見ても正しさが
// 分かりにくいため、DBに触れない純関数にして境界をテストで固定する。

import { ALBUM_DECOR, STUDY_DAY } from "@/constants/domain";

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

/**
 * その月が「完了した過去月」か（=その月の最終学習日を過ぎているか）。
 *
 * 月の記録は study_date が [start, end] に入るセッションで構成される。今日の学習日が
 * その月末（end）より後なら、その月はもう終わっている。現在進行中の月・未来の月は false。
 * 学習日は 'YYYY-MM-DD' 固定長のため、辞書順比較で日付の前後を判定できる。
 *
 * @param todayKey 今日の学習日（getStudyDate(now()) の結果）
 */
export function isMonthComplete(
  year: number,
  month: number,
  todayKey: string,
): boolean {
  return getMonthRange(year, month).end < todayKey;
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

/** 通算のふりかえりの「いちばん長かった夜」（要件4.4）。学習日とその夜の実績合計 */
export type NightTotal = {
  /** 'YYYY-MM-DD'（study_date） */
  studyDate: string;
  /** その学習日の実績学習時間の合計（分） */
  minutes: number;
};

/**
 * いちばん長かった夜を1つ選ぶ（要件4.4）。
 *
 * 同じ時間の夜が複数ある場合の扱い（tie-break）は要件に定義が無いため、
 * **より古い夜**を採る（実装判断）。先にその時間へ届いた夜を残すためであり、
 * 新しい記録が増えるたびに「いちばん長かった夜」が後の日付へ移り替わると、
 * 過去を振り返る表示としては落ち着かないためである。
 *
 * SQL の ORDER BY ... LIMIT 1 ではこの規則が仕様として残らないので、
 * 行を取り出したうえでここで選ぶ。
 *
 * @param nights 学習日ごとの実績合計（順序は問わない）
 * @returns 最長の夜。空、または実績がすべて0なら null
 */
export function pickLongestNight(nights: NightTotal[]): NightTotal | null {
  let best: NightTotal | null = null;
  for (const n of nights) {
    // 0分の夜は「いちばん長かった夜」として出さない（1分未満は保存されないため
    // 通常は現れないが、集計側の変化で混ざっても表示を汚さないようにする）
    if (n.minutes <= 0) continue;
    if (
      best === null ||
      n.minutes > best.minutes ||
      (n.minutes === best.minutes && n.studyDate < best.studyDate)
    ) {
      best = n;
    }
  }
  return best;
}

/** 夜の天気アルバムの見え方の段階（要件4.2 / 4.4）。1=飾りなし、2=枠、3=枠＋星 */
export type AlbumStage = 1 | 2 | 3;

/**
 * 学習した夜の数からアルバムの見え方の段階を求める（要件4.2 / 4.4）。
 *
 * 段階は画面に数値として出さない（出すと段階を上げること自体が目的になる）。
 * **1段階目は「飾りが無い状態」ではなく現行のカードそのもの**であり、2段階目以降が
 * 続けた人へのささやかな上乗せになる——夜が少なかった月を欠けた見た目にすると、
 * 「サボった月」を突きつける形になるためである。
 *
 * @param nights 学習した夜の数（月次はその月、通算は全期間）
 * @param scope 'monthly'（月ごとに変わる）か 'overall'（呼び出し側で不可逆に扱う）
 */
export function getAlbumStage(
  nights: number,
  scope: "monthly" | "overall",
): AlbumStage {
  const { STAGE2, STAGE3 } =
    scope === "monthly" ? ALBUM_DECOR.MONTHLY : ALBUM_DECOR.OVERALL;
  if (nights >= STAGE3) return 3;
  if (nights >= STAGE2) return 2;
  return 1;
}

/** よく灯していた時間帯の1区間（要件4.2）。hour は 0〜23、null は夜間帯の外（昼） */
export type HourCount = { hour: number | null; count: number };

/**
 * セッションの開始時刻を時間帯ごとに数える（要件4.2「よく灯していた時間帯」）。
 *
 * **時は端末のローカル時刻で取り出す。** start_time はUTCのISO文字列で保存されており、
 * SQL の strftime('%H', start_time) で数えると時差ぶん（日本なら9時間）ずれる。
 * 画面には「21時台が多い」と出るのに、実際には12時台の記録が数えられている——という
 * 形で静かに間違うため、時の算出はここに集約する。
 *
 * 並びは学習日と同じく夜から始める（18時台 → 翌4時台）。夜間帯の外（5:00〜17:59）に
 * 開始した記録は、区間を細かく並べても意味が薄いため「昼」（hour = null）へまとめる。
 * 記録のある区間のみを返す（0件の時間帯は並べない）。
 *
 * @param startTimes セッションの start_time（ISO文字列）の一覧
 */
export function tallyStartHours(startTimes: string[]): HourCount[] {
  const counts = new Map<number, number>();
  let daytime = 0;

  for (const iso of startTimes) {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) continue;
    const hour = d.getHours(); // ローカル時刻
    const isNight =
      hour >= STUDY_DAY.START_HOUR || hour < STUDY_DAY.END_HOUR;
    if (isNight) {
      counts.set(hour, (counts.get(hour) ?? 0) + 1);
    } else {
      daytime += 1;
    }
  }

  // 夜の並び順（18,19,…,23,0,1,…,4）を作り、記録のある時間帯だけ拾う
  const nightOrder: number[] = [];
  for (let h = STUDY_DAY.START_HOUR; h < 24; h++) nightOrder.push(h);
  for (let h = 0; h < STUDY_DAY.END_HOUR; h++) nightOrder.push(h);

  const result: HourCount[] = nightOrder
    .filter((h) => counts.has(h))
    .map((h) => ({ hour: h, count: counts.get(h)! }));

  // 昼は夜の並びの最後に置く（夜の街の時間割の外側にあるものとして）
  if (daytime > 0) result.push({ hour: null, count: daytime });
  return result;
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
