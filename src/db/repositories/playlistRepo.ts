// 音楽プレイリスト（要件9・音楽プレイリスト）リポジトリ。
//
// 曲ごとの ★お気に入り と マイプレイリスト所属・並び順を user_sound_preference で保持する。
// 行は「★を付けた／プレイリストに入れた曲」だけに作り、無い曲は非お気に入り・非所属とみなす。
// プレイリストは1つだけ（playlist_position の昇順が並び順）。

import { getDatabase } from "../database";
import type { AmbientSound } from "../types";

/** 管理画面（S・プレイリスト）に出す曲＋ユーザー設定 */
export type LibraryTrack = {
  track: AmbientSound;
  isFavorite: boolean;
  /** マイプレイリスト内の並び順（未所属は null） */
  playlistPosition: number | null;
};

/**
 * BGMの全曲に、ユーザーの★・プレイリスト所属を左結合して返す（曲は id 昇順）。
 * user_sound_preference に行が無い曲は isFavorite=false / playlistPosition=null。
 */
export async function getBgmLibrary(userId: number): Promise<LibraryTrack[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<
    AmbientSound & { is_favorite: number | null; playlist_position: number | null }
  >(
    `SELECT a.*,
            p.is_favorite       AS is_favorite,
            p.playlist_position AS playlist_position
       FROM ambient_sound a
       LEFT JOIN user_sound_preference p
              ON p.ambient_sound_id = a.id AND p.user_id = ?
      WHERE a.sound_type = 'bgm' AND a.is_active = 1
      ORDER BY a.id`,
    userId,
  );
  return rows.map(({ is_favorite, playlist_position, ...track }) => ({
    track,
    isFavorite: is_favorite === 1,
    playlistPosition: playlist_position,
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

/** マイプレイリストの曲IDを並び順（playlist_position 昇順）で返す（キュー生成用） */
export async function getPlaylistOrderedIds(userId: number): Promise<number[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<{ ambient_sound_id: number }>(
    `SELECT ambient_sound_id FROM user_sound_preference
      WHERE user_id = ? AND playlist_position IS NOT NULL
      ORDER BY playlist_position, ambient_sound_id`,
    userId,
  );
  return rows.map((r) => r.ambient_sound_id);
}

/** 曲ごとの設定行を無ければ作る（お気に入り・プレイリストの更新前に呼ぶ） */
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
 * マイプレイリストへの追加・削除（要件9）。
 * 追加は末尾（現在の最大 position + 1）へ、削除は playlist_position を NULL にする。
 */
export async function setInPlaylist(
  userId: number,
  soundId: number,
  on: boolean,
): Promise<void> {
  const db = await getDatabase();
  if (on) {
    await ensureRow(userId, soundId);
    const row = await db.getFirstAsync<{ max_pos: number | null }>(
      "SELECT MAX(playlist_position) AS max_pos FROM user_sound_preference WHERE user_id = ?",
      userId,
    );
    const nextPos = (row?.max_pos ?? 0) + 1;
    await db.runAsync(
      "UPDATE user_sound_preference SET playlist_position = ? WHERE user_id = ? AND ambient_sound_id = ?",
      nextPos,
      userId,
      soundId,
    );
  } else {
    await db.runAsync(
      "UPDATE user_sound_preference SET playlist_position = NULL WHERE user_id = ? AND ambient_sound_id = ?",
      userId,
      soundId,
    );
  }
}

/**
 * マイプレイリストを並べ替える（要件9: 編集モードでの並び替え）。
 * 渡された曲IDの順に playlist_position を 1..N で振り直す（1トランザクション）。
 */
export async function reorderPlaylist(
  userId: number,
  orderedSoundIds: number[],
): Promise<void> {
  const db = await getDatabase();
  await db.withTransactionAsync(async () => {
    let pos = 1;
    for (const soundId of orderedSoundIds) {
      await db.runAsync(
        "UPDATE user_sound_preference SET playlist_position = ? WHERE user_id = ? AND ambient_sound_id = ?",
        pos,
        userId,
        soundId,
      );
      pos += 1;
    }
  });
}
