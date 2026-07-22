// 設定（1:1テーブル）リポジトリ
// audio_setting / notification_setting はユーザー作成時（Phase 1）に既定値で作られる。
// 行は常に1件のため、更新は WHERE を付けず全行を対象にする（他のリポジトリと同じ方針）。

import { getDatabase } from "../database";
import type { AudioSetting, NotificationSetting } from "../types";

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
