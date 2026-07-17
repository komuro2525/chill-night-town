// 開発用の操作（__DEV__ 限定で使う）。
//
// 本番の機能ではない。リリース前に本ファイルごと削除する。
// 詳細・撤去時期は docs/開発用テストボタン.md を参照。

import { getDatabase } from "../database";

/**
 * 指定学習日の学習記録を消す（開発用）。
 *
 * 目的: ホーム画面の「今夜の学習時間・目標達成状況」や休憩提案（要件5.1）は
 *   その学習日の実績合計に依存するため、確認をやり直すには合計を0へ戻す必要がある。
 *   本来のデータ初期化（要件10.10）は全データを消してしまい、確認のたびに
 *   初期設定からやり直すことになるため、その夜のぶんだけを消せるようにする。
 *
 * 消すもの: 学習記録（study_session）と目標達成記録（daily_goal_achievement）。
 *   学習記録に紐づくタグ（session_tag）はスキーマの ON DELETE CASCADE で連動削除される。
 *
 * 消さないもの:
 *   - その夜の天気（daily_night_weather）— 学習時間ではないため
 *   - 計測中のセッション（active_session）— 稼働中のタイマーは止めない
 *   - 延長宣言のログ（additional_study_time）— 学習時間ではなく、表示制御にも使われない
 *     （休憩提案の基準は active_session が持つ）
 */
export async function clearStudyDayRecords(studyDate: string): Promise<void> {
  const db = await getDatabase();
  await db.withTransactionAsync(async () => {
    await db.runAsync("DELETE FROM study_session WHERE study_date = ?", studyDate);
    await db.runAsync(
      "DELETE FROM daily_goal_achievement WHERE study_date = ?",
      studyDate,
    );
  });
}
