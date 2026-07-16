// アプリ内データの初期化（要件10.10の中核）。
// user 行を削除すると ON DELETE CASCADE により、ユーザーに紐づく全データ
// （学習記録・進捗・各種設定・マイタグ・延長宣言・計測状態・達成記録等）が連動削除される。
// マスタデータ（town / night_weather / emotion / npc / npc_message / ambient_sound /
// growth_level_threshold / 標準タグ）は削除されず、初回起動時と同じ状態に戻る。
//
// 注: 正式な初期化フロー（確認ダイアログ・タイマー稼働中の禁止・初期設定画面への遷移）は
//     Phase 6（設定画面 10.10）で実装する。本関数はその削除処理を先出しで用意したもの。

import { getDatabase } from "../database";

/** 全ユーザーデータを削除し、初回起動時の状態へ戻す */
export async function resetUserData(): Promise<void> {
  const db = await getDatabase();
  await db.runAsync("DELETE FROM user");
}
