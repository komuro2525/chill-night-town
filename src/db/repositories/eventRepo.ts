// カレンダーの予定・メモ（4章）リポジトリ。
//
// 予定は「暦日」（event_date = 'YYYY-MM-DD'）で持つ（学習日ではない）。
// 1日に複数可。通知（1週間前・前日の12:00）の登録・解除はアプリ側（lib/notifications）で行う。

import { getDatabase } from "../database";
import type { CalendarEvent } from "../types";

/** 指定した暦日の予定を作成順に返す */
export async function getEventsForDate(
  userId: number,
  date: string,
): Promise<CalendarEvent[]> {
  const db = await getDatabase();
  return db.getAllAsync<CalendarEvent>(
    "SELECT * FROM calendar_event WHERE user_id = ? AND event_date = ? ORDER BY id",
    userId,
    date,
  );
}

/** 範囲内で予定がある暦日（重複なし・昇順）。カレンダーのマーク表示用 */
export async function getEventDatesInRange(
  userId: number,
  startDate: string,
  endDate: string,
): Promise<string[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<{ event_date: string }>(
    `SELECT DISTINCT event_date FROM calendar_event
      WHERE user_id = ? AND event_date BETWEEN ? AND ?
      ORDER BY event_date`,
    userId,
    startDate,
    endDate,
  );
  return rows.map((r) => r.event_date);
}

/** これから来る予定（fromDate 以降）を日付順に返す。通知の登録に使う */
export async function getUpcomingEvents(
  userId: number,
  fromDate: string,
): Promise<CalendarEvent[]> {
  const db = await getDatabase();
  return db.getAllAsync<CalendarEvent>(
    "SELECT * FROM calendar_event WHERE user_id = ? AND event_date >= ? ORDER BY event_date, id",
    userId,
    fromDate,
  );
}

/** 予定を追加する。作成した行の id を返す */
export async function addEvent(
  userId: number,
  date: string,
  title: string,
): Promise<number> {
  const db = await getDatabase();
  const result = await db.runAsync(
    "INSERT INTO calendar_event (user_id, event_date, title) VALUES (?, ?, ?)",
    userId,
    date,
    title,
  );
  return result.lastInsertRowId;
}

/** 予定のタイトルを変更する */
export async function updateEventTitle(id: number, title: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    "UPDATE calendar_event SET title = ?, updated_at = datetime('now') WHERE id = ?",
    title,
    id,
  );
}

/** 予定を削除する */
export async function deleteEvent(id: number): Promise<void> {
  const db = await getDatabase();
  await db.runAsync("DELETE FROM calendar_event WHERE id = ?", id);
}
