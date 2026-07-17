// 学習内容タグ（study_tag）リポジトリ
//
// 標準タグ（user_id IS NULL・シードで6種投入済み）と、
// ユーザーが自由入力で追加する「マイタグ」（user_id あり・is_custom = 1）を扱う。
//
// 要件3.4 のマイタグ仕様:
//   - 標準タグ・既存マイタグと同名は登録できない
//   - 削除は論理削除（is_active = 0）。過去の学習記録では表示され続ける
//   - 削除済みと同名が入力されたら、新規作成せず**復活**させる
//   - 上限20件。ただし**削除済みは上限に数えない**
//   - 名称変更は同じ行を更新するため、過去の記録の表示にも自然に反映される

import { LIMITS } from "@/constants/domain";
import { getDatabase } from "../database";
import type { StudyTag } from "../types";

/** 選択肢に出すタグ（標準タグ＋有効なマイタグ）。表示順は標準タグが先 */
export async function getSelectableTags(): Promise<StudyTag[]> {
  const db = await getDatabase();
  return db.getAllAsync<StudyTag>(
    `SELECT * FROM study_tag
      WHERE is_active = 1
      ORDER BY is_custom, display_order, id`,
  );
}

/** 有効なマイタグの件数（上限判定用。論理削除済みは含めない） */
export async function countActiveMyTags(): Promise<number> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ count: number }>(
    "SELECT COUNT(*) AS count FROM study_tag WHERE is_custom = 1 AND is_active = 1",
  );
  return row?.count ?? 0;
}

/** 同名のタグを探す（標準・マイタグ問わず。論理削除済みも含む） */
async function findByName(name: string): Promise<StudyTag | null> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<StudyTag>(
    "SELECT * FROM study_tag WHERE name = ? LIMIT 1",
    name,
  );
  return row ?? null;
}

export type CreateMyTagResult =
  | { ok: true; tag: StudyTag; revived: boolean }
  /** 標準タグまたは有効なマイタグと同名 */
  | { ok: false; reason: "duplicate" }
  /** 有効なマイタグが上限に達している */
  | { ok: false; reason: "limit" };

/**
 * マイタグを登録する（要件3.4）。
 *
 * 呼び出し側は名前の形式（必須・20文字以内）を validateTagName で先に検証すること。
 * ここが担うのは、名前の重複・復活・上限という**データ側のルール**のみ。
 */
export async function createMyTag(
  userId: number,
  rawName: string,
): Promise<CreateMyTagResult> {
  const name = rawName.trim();
  const existing = await findByName(name);

  if (existing) {
    // 削除済みのマイタグと同名 → 新規作成せず復活させる
    if (existing.is_custom === 1 && existing.is_active === 0) {
      if ((await countActiveMyTags()) >= LIMITS.MYTAG_MAX) {
        return { ok: false, reason: "limit" };
      }
      const db = await getDatabase();
      await db.runAsync("UPDATE study_tag SET is_active = 1 WHERE id = ?", existing.id);
      return { ok: true, tag: { ...existing, is_active: 1 }, revived: true };
    }
    // 標準タグ、または有効なマイタグと同名 → 登録しない
    return { ok: false, reason: "duplicate" };
  }

  if ((await countActiveMyTags()) >= LIMITS.MYTAG_MAX) {
    return { ok: false, reason: "limit" };
  }

  const db = await getDatabase();
  // 表示順はマイタグの末尾に置く
  const last = await db.getFirstAsync<{ max_order: number | null }>(
    "SELECT MAX(display_order) AS max_order FROM study_tag WHERE is_custom = 1",
  );
  const displayOrder = (last?.max_order ?? 0) + 1;

  const result = await db.runAsync(
    `INSERT INTO study_tag (user_id, name, is_custom, is_active, display_order)
     VALUES (?, ?, 1, 1, ?)`,
    userId,
    name,
    displayOrder,
  );
  const created = await db.getFirstAsync<StudyTag>(
    "SELECT * FROM study_tag WHERE id = ?",
    result.lastInsertRowId,
  );
  if (!created) throw new Error("マイタグの作成に失敗しました");
  return { ok: true, tag: created, revived: false };
}

/** 管理画面（S10）に出す有効なマイタグ一覧（要件10.9 手順1。論理削除済みは除く） */
export async function listMyTags(): Promise<StudyTag[]> {
  const db = await getDatabase();
  return db.getAllAsync<StudyTag>(
    `SELECT * FROM study_tag
      WHERE is_custom = 1 AND is_active = 1
      ORDER BY display_order, id`,
  );
}

export type RenameMyTagResult =
  | { ok: true; tag: StudyTag }
  /** 標準タグ、または（論理削除済みを含む）他のマイタグと同名 */
  | { ok: false; reason: "duplicate" };

/**
 * マイタグの名称を変更する（要件10.9 手順2・3）。
 *
 * 名前の形式（必須・20文字以内）は validateTagName で先に検証すること。
 * 重複判定は「自分以外に同名の行があるか」で行う。標準タグ（user_id IS NULL）との
 * 衝突はDBのユニーク索引では防げないためここで弾き、マイタグ同士の衝突は
 * idx_study_tag_custom_name（論理削除済みも含む）に一致させて弾く。
 * 同じ行を更新するため、過去の学習記録の表示にも新名称が自然に反映される。
 */
export async function renameMyTag(
  id: number,
  rawName: string,
): Promise<RenameMyTagResult> {
  const db = await getDatabase();
  const name = rawName.trim();

  const conflict = await db.getFirstAsync<{ id: number }>(
    "SELECT id FROM study_tag WHERE name = ? AND id != ? LIMIT 1",
    name,
    id,
  );
  if (conflict) return { ok: false, reason: "duplicate" };

  await db.runAsync(
    "UPDATE study_tag SET name = ? WHERE id = ? AND is_custom = 1",
    name,
    id,
  );
  const tag = await db.getFirstAsync<StudyTag>(
    "SELECT * FROM study_tag WHERE id = ?",
    id,
  );
  if (!tag) throw new Error("マイタグの更新に失敗しました");
  return { ok: true, tag };
}

/**
 * マイタグを論理削除する（要件10.9 手順4）。以後の選択肢から外れるが、
 * 過去の学習記録では表示され続ける（is_active=0）。上限20件のカウントにも数えない。
 */
export async function deactivateMyTag(id: number): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    "UPDATE study_tag SET is_active = 0 WHERE id = ? AND is_custom = 1",
    id,
  );
}

/** 指定セッションに紐づくタグ（カレンダー・記録表示用。論理削除済みも表示する） */
export async function getTagsBySessionId(
  studySessionId: number,
): Promise<StudyTag[]> {
  const db = await getDatabase();
  return db.getAllAsync<StudyTag>(
    `SELECT t.* FROM study_tag t
       JOIN session_tag st ON st.study_tag_id = t.id
      WHERE st.study_session_id = ?
      ORDER BY t.is_custom, t.display_order, t.id`,
    studySessionId,
  );
}
