// 音楽プレイリスト（要件9・音楽プレイリスト）リポジトリ。
//
// ★お気に入りは user_sound_preference（1曲=1行）で持つ。
// マイプレイリストの並び（所属）は playlist_entry（1行=1曲・重複可）で持つ。
// プレイリストは1つだけ（playlist_entry.position 昇順が並び順）。同じ曲を複数入れられる。

import { getDatabase } from "../database";
import type { AmbientSound } from "../types";

/** 一覧（すべて/お気に入り）に出す曲＋ユーザー設定 */
export type LibraryTrack = {
  track: AmbientSound;
  isFavorite: boolean;
  /** マイプレイリストに1回以上入っているか */
  inPlaylist: boolean;
};

/** マイプレイリストの1エントリ（並びの1要素。同じ曲が複数並ぶことがある） */
export type PlaylistItem = {
  /** playlist_entry.id（並び替え・削除の単位） */
  entryId: number;
  track: AmbientSound;
  isFavorite: boolean;
};

/**
 * BGMの全曲に、★お気に入りとプレイリスト所属の有無を付けて返す（曲は id 昇順）。
 * すべて／お気に入りタブの一覧に使う。
 */
export async function getBgmLibrary(userId: number): Promise<LibraryTrack[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<
    AmbientSound & { is_favorite: number | null; in_playlist: number }
  >(
    `SELECT a.*,
            p.is_favorite AS is_favorite,
            EXISTS (SELECT 1 FROM playlist_entry e
                     WHERE e.user_id = ? AND e.ambient_sound_id = a.id) AS in_playlist
       FROM ambient_sound a
       LEFT JOIN user_sound_preference p
              ON p.ambient_sound_id = a.id AND p.user_id = ?
      WHERE a.sound_type = 'bgm' AND a.is_active = 1
      ORDER BY a.id`,
    userId,
    userId,
  );
  return rows.map(({ is_favorite, in_playlist, ...track }) => ({
    track,
    isFavorite: is_favorite === 1,
    inPlaylist: in_playlist === 1,
  }));
}

/** マイプレイリストの並び（エントリ）を position 昇順で返す（重複を含む） */
export async function getPlaylist(userId: number): Promise<PlaylistItem[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<
    AmbientSound & { entry_id: number; is_favorite: number | null }
  >(
    `SELECT a.*,
            e.id          AS entry_id,
            p.is_favorite AS is_favorite
       FROM playlist_entry e
       JOIN ambient_sound a ON a.id = e.ambient_sound_id
       LEFT JOIN user_sound_preference p
              ON p.ambient_sound_id = a.id AND p.user_id = e.user_id
      WHERE e.user_id = ? AND a.is_active = 1
      ORDER BY e.position, e.id`,
    userId,
  );
  return rows.map(({ entry_id, is_favorite, ...track }) => ({
    entryId: entry_id,
    track,
    isFavorite: is_favorite === 1,
  }));
}

/** ★お気に入りの曲IDを昇順で返す（キュー生成用） */
export async function getFavoriteIds(userId: number): Promise<number[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<{ ambient_sound_id: number }>(
    `SELECT ambient_sound_id FROM user_sound_preference
      WHERE user_id = ? AND is_favorite = 1
      ORDER BY ambient_sound_id`,
    userId,
  );
  return rows.map((r) => r.ambient_sound_id);
}

/** マイプレイリストの曲IDを並び順（position 昇順）で返す（重複を含む。キュー生成用） */
export async function getPlaylistOrderedIds(userId: number): Promise<number[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<{ ambient_sound_id: number }>(
    `SELECT ambient_sound_id FROM playlist_entry
      WHERE user_id = ?
      ORDER BY position, id`,
    userId,
  );
  return rows.map((r) => r.ambient_sound_id);
}

/** 曲がマイプレイリストに1回以上入っているか（重複追加の確認ダイアログ判定用） */
export async function isInPlaylist(
  userId: number,
  soundId: number,
): Promise<boolean> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ n: number }>(
    "SELECT COUNT(*) AS n FROM playlist_entry WHERE user_id = ? AND ambient_sound_id = ?",
    userId,
    soundId,
  );
  return (row?.n ?? 0) > 0;
}

/** 曲ごとの設定行を無ければ作る（お気に入りの更新前に呼ぶ） */
async function ensureRow(userId: number, soundId: number): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    `INSERT INTO user_sound_preference (user_id, ambient_sound_id)
     VALUES (?, ?)
     ON CONFLICT (user_id, ambient_sound_id) DO NOTHING`,
    userId,
    soundId,
  );
}

/** ★お気に入りを設定・解除する（要件9） */
export async function setFavorite(
  userId: number,
  soundId: number,
  on: boolean,
): Promise<void> {
  const db = await getDatabase();
  await ensureRow(userId, soundId);
  await db.runAsync(
    "UPDATE user_sound_preference SET is_favorite = ? WHERE user_id = ? AND ambient_sound_id = ?",
    on ? 1 : 0,
    userId,
    soundId,
  );
}

/**
 * マイプレイリストへ曲を追加する（要件9）。末尾（最大 position + 1）へ足す。
 * 同じ曲でも別エントリとして追加する（重複可）。重複の確認は呼び出し側で行う。
 */
export async function addToPlaylist(
  userId: number,
  soundId: number,
): Promise<void> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ max_pos: number | null }>(
    "SELECT MAX(position) AS max_pos FROM playlist_entry WHERE user_id = ?",
    userId,
  );
  const nextPos = (row?.max_pos ?? 0) + 1;
  await db.runAsync(
    "INSERT INTO playlist_entry (user_id, ambient_sound_id, position) VALUES (?, ?, ?)",
    userId,
    soundId,
    nextPos,
  );
}

/**
 * マイプレイリストから複数エントリをまとめて削除する（要件9: 編集の複数選択＋ゴミ箱）。
 * エントリ単位で消す（同じ曲の別エントリは残る）。お気に入り・曲自体は残る。
 */
export async function removeEntries(
  userId: number,
  entryIds: number[],
): Promise<void> {
  if (entryIds.length === 0) return;
  const db = await getDatabase();
  const placeholders = entryIds.map(() => "?").join(", ");
  await db.runAsync(
    `DELETE FROM playlist_entry WHERE user_id = ? AND id IN (${placeholders})`,
    userId,
    ...entryIds,
  );
}

/**
 * マイプレイリストを並べ替える（要件9: 編集モードでのドラッグ並び替え）。
 * 渡されたエントリIDの順に position を 1..N で振り直す（1トランザクション）。
 */
export async function reorderPlaylist(
  userId: number,
  orderedEntryIds: number[],
): Promise<void> {
  const db = await getDatabase();
  await db.withTransactionAsync(async () => {
    let pos = 1;
    for (const entryId of orderedEntryIds) {
      await db.runAsync(
        "UPDATE playlist_entry SET position = ? WHERE user_id = ? AND id = ?",
        pos,
        userId,
        entryId,
      );
      pos += 1;
    }
  });
}
