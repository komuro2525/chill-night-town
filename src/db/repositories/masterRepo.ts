// マスタデータ参照リポジトリ（読み取り専用）
// Phase 0 では起動・初期設定・以降の土台に必要な最小限のみ実装する。
// 個別機能で必要になったマスタ取得は各Phaseで追加する。

import { getDatabase } from "../database";
import type {
  Emotion,
  NightWeather,
  NpcMessage,
  NpcTriggerType,
  Town,
} from "../types";

/** 有効な街の一覧（表示順） */
export async function getTowns(): Promise<Town[]> {
  const db = await getDatabase();
  return db.getAllAsync<Town>(
    "SELECT * FROM town WHERE is_active = 1 ORDER BY display_order",
  );
}

/** 夜の天気マスタ（11種、表示順） */
export async function getNightWeathers(): Promise<NightWeather[]> {
  const db = await getDatabase();
  return db.getAllAsync<NightWeather>(
    "SELECT * FROM night_weather ORDER BY display_order",
  );
}

/** 感情マスタ（11種、表示順） */
export async function getEmotions(): Promise<Emotion[]> {
  const db = await getDatabase();
  return db.getAllAsync<Emotion>(
    "SELECT * FROM emotion ORDER BY display_order",
  );
}

/** 指定タイミングの有効なNPCメッセージ一覧（要件7.1） */
export async function getNpcMessages(
  triggerType: NpcTriggerType,
): Promise<NpcMessage[]> {
  const db = await getDatabase();
  return db.getAllAsync<NpcMessage>(
    "SELECT * FROM npc_message WHERE trigger_type = ? AND is_active = 1",
    triggerType,
  );
}
