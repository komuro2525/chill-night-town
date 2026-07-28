// マスタデータ参照リポジトリ（読み取り専用）
// Phase 0 では起動・初期設定・以降の土台に必要な最小限のみ実装する。
// 個別機能で必要になったマスタ取得は各Phaseで追加する。

import { getDatabase } from "../database";
import type {
  AmbientSound,
  Emotion,
  GrowthMethod,
  NightWeather,
  Npc,
  NpcMessage,
  NpcTriggerType,
  Town,
} from "../types";

/** 既定のNPC（最初の住人）。選択中NPCに候補が無いときのフォールバック先（要件7.1） */
export const DEFAULT_NPC_ID = 1;

/** 有効なNPC（夜の街の住人）の一覧。設定のNPC選択で使う（id順＝登場順） */
export async function getNpcs(): Promise<Npc[]> {
  const db = await getDatabase();
  return db.getAllAsync<Npc>(
    "SELECT * FROM npc WHERE is_active = 1 ORDER BY id",
  );
}

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

/** BGMプール（要件9: BGMに分類された有効な音源。再生順のシャッフルは再生側で行う） */
export async function getBgmTracks(): Promise<AmbientSound[]> {
  const db = await getDatabase();
  return db.getAllAsync<AmbientSound>(
    "SELECT * FROM ambient_sound WHERE sound_type = 'bgm' AND is_active = 1 ORDER BY id",
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

/**
 * 表示するNPCメッセージを1件選ぶ（要件7.1）。指定NPCの声色で出す。
 *
 * 選択ルール（すべて指定NPC内で）:
 *   1. タイミングが一致し、かつ選ばれた感情に紐づく候補があれば、その中からランダムに1件
 *   2. 無ければ（感情未選択・感情記録OFF・その感情の候補が未登録）、
 *      感情を問わない候補（emotion_id IS NULL）からランダムに1件
 *   3. 指定NPCに候補が無ければ、既定NPC(1)で同じ手順のフォールバック
 *      （マスタだけ追加して文面が未整備のNPCでも必ず何か話す）
 *
 * 条件は「NPC＋タイミング＋感情」の一致のみ（7.1の単純な条件マッチ方式）。
 * 感情ごとの候補は複数行を持てるため、行を追加するだけで文面を増やせる。
 *
 * @param npcId 出させたいNPC（学習セッションは開始時のスナップショット、おやすみは現在の選択）
 */
export async function pickNpcMessage(
  triggerType: NpcTriggerType,
  emotionId: number | null,
  npcId: number,
): Promise<string | null> {
  const db = await getDatabase();

  const pickForNpc = async (id: number): Promise<string | null> => {
    if (emotionId !== null) {
      const row = await db.getFirstAsync<{ message: string }>(
        `SELECT message FROM npc_message
          WHERE npc_id = ? AND trigger_type = ? AND is_active = 1 AND emotion_id = ?
          ORDER BY RANDOM() LIMIT 1`,
        id,
        triggerType,
        emotionId,
      );
      if (row) return row.message;
    }
    const fallback = await db.getFirstAsync<{ message: string }>(
      `SELECT message FROM npc_message
        WHERE npc_id = ? AND trigger_type = ? AND is_active = 1 AND emotion_id IS NULL
        ORDER BY RANDOM() LIMIT 1`,
      id,
      triggerType,
    );
    return fallback?.message ?? null;
  };

  const forSelected = await pickForNpc(npcId);
  if (forSelected !== null) return forSelected;
  // 指定NPCに1件も無いときだけ、既定NPCで話させる
  return npcId === DEFAULT_NPC_ID ? null : pickForNpc(DEFAULT_NPC_ID);
}

/**
 * レベルアップ閾値（要件6.1 / 6.2①）。レベル → 到達に必要な値。
 *
 * 習慣型は本マスタの値（必要累計経験値）を使う。要件6.2は「基準値はマスタデータとして
 * 保持し、実装後のバランス調整で変更できるようにする」としているため、
 * 定数ではなくここから読む（constants の GROWTH.HABIT_CUMULATIVE_EXP は写しであり参照しない）。
 *
 * プロジェクト型は街ごとの目標学習時間から動的に算出するため本マスタを使わない
 * （テーブル定義書: project 行は投入不要）。src/lib/growth.ts の getProjectThresholds を使う。
 */
export async function getGrowthThresholds(
  method: GrowthMethod,
): Promise<Record<number, number>> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<{ level: number; required_value: number }>(
    "SELECT level, required_value FROM growth_level_threshold WHERE method = ? ORDER BY level",
    method,
  );
  const thresholds: Record<number, number> = {};
  for (const r of rows) thresholds[r.level] = r.required_value;
  return thresholds;
}
