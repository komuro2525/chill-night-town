// 設定（1:1テーブル）リポジトリ
// audio_setting / notification_setting はユーザー作成時（Phase 1）に既定値で作られる。
// 行は常に1件のため、更新は WHERE を付けず全行を対象にする（他のリポジトリと同じ方針）。

import { getDatabase } from "../database";
import type { AudioSetting, BgmSource, NotificationSetting } from "../types";

/** 音量設定を取得する（ユーザー未作成時は null） */
export async function getAudioSetting(): Promise<AudioSetting | null> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<AudioSetting>(
    "SELECT * FROM audio_setting LIMIT 1",
  );
  return row ?? null;
}

/** 通知設定を取得する（ユーザー未作成時は null） */
export async function getNotificationSetting(): Promise<NotificationSetting | null> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<NotificationSetting>(
    "SELECT * FROM notification_setting LIMIT 1",
  );
  return row ?? null;
}

/**
 * 音量設定（4分類・各0〜100）を保存する（要件10.4）。
 * 値域はスキーマの CHECK（BETWEEN 0 AND 100）が担保する。
 */
export async function updateAudioVolumes(volumes: {
  bgm: number;
  ambient: number;
  sfx: number;
  bell: number;
}): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    `UPDATE audio_setting
        SET bgm_volume = ?, ambient_volume = ?, sfx_volume = ?, bell_volume = ?,
            updated_at = datetime('now')`,
    volumes.bgm,
    volumes.ambient,
    volumes.sfx,
    volumes.bell,
  );
}

/** BGMの再生設定（ソース・シャッフル）を取得する（要件9・音楽プレイリスト） */
export async function getPlaybackSettings(): Promise<{
  source: BgmSource;
  shuffle: boolean;
}> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ bgm_source: BgmSource; bgm_shuffle: number }>(
    "SELECT bgm_source, bgm_shuffle FROM audio_setting LIMIT 1",
  );
  return {
    source: row?.bgm_source ?? "all",
    shuffle: (row?.bgm_shuffle ?? 0) === 1,
  };
}

/** マイプレイリストの表示名を取得する（要件9・音楽プレイリスト） */
export async function getPlaylistName(): Promise<string> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ playlist_name: string }>(
    "SELECT playlist_name FROM audio_setting LIMIT 1",
  );
  return row?.playlist_name ?? "マイプレイリスト";
}

/** マイプレイリストの表示名を保存する（要件9・音楽プレイリスト） */
export async function updatePlaylistName(name: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    "UPDATE audio_setting SET playlist_name = ?, updated_at = datetime('now')",
    name,
  );
}

/** BGMの再生ソースを保存する（all / favorites / playlist）。要件9 */
export async function updateBgmSource(source: BgmSource): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    "UPDATE audio_setting SET bgm_source = ?, updated_at = datetime('now')",
    source,
  );
}

/** BGMのシャッフルON/OFFを保存する。要件9 */
export async function updateBgmShuffle(shuffle: boolean): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    "UPDATE audio_setting SET bgm_shuffle = ?, updated_at = datetime('now')",
    shuffle ? 1 : 0,
  );
}

/**
 * 通知設定（ON/OFF・時刻）を保存する（要件10.3 / 12章）。
 * OSへのスケジュール登録・解除は呼び出し側（lib/notifications）で行う。
 * @param time 'HH:MM'。OFF時は null
 */
export async function updateNotificationSetting(
  enabled: boolean,
  time: string | null,
): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    `UPDATE notification_setting
        SET is_enabled = ?, scheduled_time = ?, updated_at = datetime('now')`,
    enabled ? 1 : 0,
    enabled ? time : null,
  );
}
