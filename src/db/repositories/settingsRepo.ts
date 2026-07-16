// 設定（1:1テーブル）参照リポジトリ
// audio_setting / notification_setting はユーザー作成時（Phase 1）に既定値で作られる。
// Phase 0 では読み取りのみ実装する。更新は各Phase（10章）で追加する。

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
