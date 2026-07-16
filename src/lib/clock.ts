// =====================================================================
// アプリの「現在時刻」の単一の出所
//
// タイマーは計測・5:00自動終了の判定・中断復元のすべてが現在時刻に依存する。
// 時刻の取得先が散らばると、表示と判定が食い違ったり、開発時に片方だけしか
// 上書きできなくなる。そのため現在時刻は必ず本モジュールから取る。
//
// 開発時のみ、実時間からのオフセットを差し込める（__DEV__ 限定）。
// これは 5:00 自動終了などを実際にその時刻まで待たずに確認するためのもので、
// 端末の時計は変更しない。本番ビルドでは常に実時間を返す。
// 詳細は docs/開発用テストボタン.md を参照。
// =====================================================================

import { useEffect, useMemo, useState } from "react";

/** 実時間からのオフセット（ミリ秒）。__DEV__ でのみ 0 以外になる */
let devOffsetMs = 0;

/** オフセット変更を購読中のフック（変更時に即座に再描画させる） */
const listeners = new Set<() => void>();

/** アプリ内の現在時刻（ミリ秒）。計測・判定は必ずこれを使う */
export function nowMs(): number {
  return Date.now() + (__DEV__ ? devOffsetMs : 0);
}

/** アプリ内の現在時刻（Date） */
export function now(): Date {
  return new Date(nowMs());
}

/**
 * 一定間隔で更新される現在時刻を返す。
 * 時計・経過時間の表示や、時刻の変化に応じた判定（夜間帯・5:00到達）に使う。
 */
export function useAppNow(intervalMs = 1000): Date {
  const [ms, setMs] = useState(() => nowMs());

  useEffect(() => {
    const id = setInterval(() => setMs(nowMs()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);

  // 開発用オフセットの変更を、次の tick を待たずに反映する
  useEffect(() => {
    if (!__DEV__) return;
    const listener = () => setMs(nowMs());
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);

  return useMemo(() => new Date(ms), [ms]);
}

// ---------------------------------------------------------------------
// 以下は開発用（__DEV__ 限定）。本番ビルドでは呼ばれても何も起きない
// ---------------------------------------------------------------------

function emitChange() {
  listeners.forEach((listener) => listener());
}

/** 現在のオフセット（ミリ秒）。0 なら実時間 */
export function getDevOffsetMs(): number {
  return __DEV__ ? devOffsetMs : 0;
}

/** 実時間を上書きしているか */
export function isDevTimeOverridden(): boolean {
  return getDevOffsetMs() !== 0;
}

/**
 * 今日の指定時刻（hour:00:00）へ時刻を合わせる。null で実時間へ戻す。
 * オフセットは実時間との差として保持するため、合わせた後も時刻は自然に進む。
 */
export function setDevTimeToHour(hour: number | null): void {
  if (!__DEV__) return;
  if (hour === null) {
    devOffsetMs = 0;
  } else {
    const target = new Date();
    target.setHours(hour, 0, 0, 0);
    devOffsetMs = target.getTime() - Date.now();
  }
  emitChange();
}

/** 時刻を進める（5:00自動終了の確認用）。負値で戻すこともできる */
export function advanceDevTime(ms: number): void {
  if (!__DEV__) return;
  devOffsetMs += ms;
  emitChange();
}

/** 実時間へ戻す */
export function resetDevTime(): void {
  if (!__DEV__) return;
  devOffsetMs = 0;
  emitChange();
}
