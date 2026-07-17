// 開発用の操作（__DEV__ 限定で使う）。
//
// 本番の機能ではない。リリース前に本ファイルごと削除する。
// 詳細・撤去時期は docs/開発用テストボタン.md を参照。

import { getProjectThresholds } from "@/lib/growth";
import { getDatabase } from "../database";
import type { GrowthMethod } from "../types";
import { getGrowthThresholds } from "./masterRepo";
import { formatDateKey } from "@/lib/study-day";

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

/**
 * 選択中の街のレベルを 1→2→3→4→5→1 と循環させる（開発用）。
 *
 * 目的: 各レベルの見た目（灯り・背景アート）の確認と、レベルアップ・完成演出の
 *   やり直しを1つのボタンで賄う。演出は上がる瞬間にしか出ず、レベルは下がらない
 *   （要件6.1）ため、戻せないと確認できない。
 *
 * **本ボタンは開発用として、要件6.1「レベルは下がらない」を意図的に破る**（5→1へ戻す）。
 *
 * レベルに応じて選択中の成長方式の実績値も辻褄を合わせる（表示レベルと実データが
 * 食い違い、次の学習で成長処理により表示が戻るのを防ぐため）:
 *   ・習慣型:       経験値をそのレベルの閾値ちょうどにする
 *   ・プロジェクト型: 累計学習時間をそのレベルの閾値ちょうどにする（目標未設定なら
 *                    判定不能のためレベルのみ動かす）
 *   ・Lv1（5→1）:   累計・経験値をともに0へ戻す（完全リセット）
 *
 * 戻さないもの: 学習記録（study_session）・達成記録・天気・ユーザー設定。
 *   学習記録も消したい場合は「今夜の学習時間を初期化」と併用する。
 */
export async function cycleTownLevel(
  method: GrowthMethod,
  projectTargetMinutes: number | null,
): Promise<void> {
  const db = await getDatabase();
  const progress = await db.getFirstAsync<{ current_level: number }>(
    "SELECT current_level FROM town_progress WHERE is_selected = 1",
  );
  if (!progress) return;
  const next = progress.current_level >= 5 ? 1 : progress.current_level + 1;

  if (next === 1) {
    await db.runAsync(
      `UPDATE town_progress
          SET current_level = 1, experience_points = 0, cumulative_study_minutes = 0,
              updated_at = datetime('now')
        WHERE is_selected = 1`,
    );
    return;
  }

  if (method === "habit") {
    const thresholds = await getGrowthThresholds("habit");
    await db.runAsync(
      `UPDATE town_progress
          SET current_level = ?, experience_points = ?, updated_at = datetime('now')
        WHERE is_selected = 1`,
      next,
      thresholds[next] ?? 0,
    );
  } else if (projectTargetMinutes !== null) {
    const thresholds = getProjectThresholds(projectTargetMinutes);
    await db.runAsync(
      `UPDATE town_progress
          SET current_level = ?, cumulative_study_minutes = ?, updated_at = datetime('now')
        WHERE is_selected = 1`,
      next,
      thresholds[next] ?? 0,
    );
  } else {
    // プロジェクト型で目標未設定: 累計では判定できないためレベルのみ動かす
    await db.runAsync(
      `UPDATE town_progress
          SET current_level = ?, updated_at = datetime('now')
        WHERE is_selected = 1`,
      next,
    );
  }
}

/** 本番の閾値（シードと同じ）。経験値一律5でレベルアップ（要件6.2①） */
export const HABIT_STEP_PRODUCTION = 5;
/** テスト用の閾値。目標達成1回ごとにレベルアップ */
export const HABIT_STEP_TEST = 1;

/**
 * 習慣型のレベルアップ閾値を書き換える（開発用）。
 *
 * 目的: 本番は目標達成5回で1レベル、Lv5（街完成）まで20日かかる（要件6.2①）。
 *   レベルアップ演出・完成演出を手で確認するには現実的ではないため、
 *   1回ごとに上がるよう一時的に下げられるようにする。
 *
 * マスタを書き換えるのは、要件6.2が「基準値はマスタデータとして保持し、実装後の
 * バランス調整で変更できるようにする」としているため。テスト用の抜け道を別に作るより、
 * 本来の調整機構をそのまま使うほうが筋が通り、その機構が効くことの確認にもなる。
 *
 * 注意: マスタはユーザーデータではないため、**「データ初期化」では元に戻らない**
 * （初期化は DELETE FROM user のみで、マスタは残る）。本ボタンで戻すこと。
 * 新規インストールでは常にシードの値（本番）から始まる。
 *
 * @param step 1レベルあたりの必要経験値（本番=5 / テスト=1）
 */
export async function setHabitLevelStep(step: number): Promise<void> {
  const db = await getDatabase();
  await db.withTransactionAsync(async () => {
    for (let level = 2; level <= 5; level++) {
      await db.runAsync(
        "UPDATE growth_level_threshold SET required_value = ? WHERE method = 'habit' AND level = ?",
        step * (level - 1),
        level,
      );
    }
  });
}

/** 現在の1レベルあたりの必要経験値（Lv2の閾値がそのまま刻み幅になる） */
export async function getHabitLevelStep(): Promise<number> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ required_value: number }>(
    "SELECT required_value FROM growth_level_threshold WHERE method = 'habit' AND level = 2",
  );
  return row?.required_value ?? HABIT_STEP_PRODUCTION;
}

/**
 * 過去数日ぶんのダミー学習記録を入れる（開発用）。
 *
 * 目的: カレンダー（要件4章）は過去日付の記録が無いと確認しづらい。
 *   本番のタイマーでは当日ぶんしか作れないため、確認用に散らした記録を投入する。
 *
 * 各日: 実績時間・感情・天気を変えた1〜2件のセッションと、その夜の天気を作る。
 * 目標（一日の目標時間）に達した日は達成記録も残す。街の成長には反映しない
 * （成長は本番フローの確認用。ここではカレンダー表示の確認だけが目的）。
 */
export async function seedCalendarSampleData(): Promise<void> {
  const db = await getDatabase();
  const user = await db.getFirstAsync<{ id: number; daily_goal_minutes: number }>(
    "SELECT id, daily_goal_minutes FROM user LIMIT 1",
  );
  const town = await db.getFirstAsync<{ town_id: number }>(
    "SELECT town_id FROM town_progress WHERE is_selected = 1 LIMIT 1",
  );
  if (!user || !town) return;

  // 感情・天気のIDはシード順（emotion 1〜11 / night_weather 1〜11）
  // [遡る日数, 実績分, 感情id(null可), 天気id, セッション数]
  const plan: [number, number, number | null, number, number][] = [
    [1, 75, 2, 6, 2], // 昨夜: 集中できた・雨音の夜・2セッション
    [2, 40, 5, 1, 1], // 星空の夜・穏やかだった
    [3, 90, 3, 3, 1], // 満月の夜・頑張れた
    [5, 20, null, 9, 1], // 静寂の夜・感情なし
    [6, 120, 8, 7, 1], // 嵐の夜・疲れた
    [9, 60, 2, 6, 1], // 雨音の夜・集中できた
    [12, 55, 1, 1, 1], // 星空の夜・達成感
  ];

  await db.withTransactionAsync(async () => {
    for (const [daysAgo, minutes, emotionId, weatherId, sessions] of plan) {
      const base = new Date();
      base.setDate(base.getDate() - daysAgo);
      base.setHours(21, 0, 0, 0);
      // 学習日は21時開始なのでその日付（18時以降＝当日帰属）
      const studyDate = formatDateKey(base);

      let dayTotal = 0;
      for (let i = 0; i < sessions; i++) {
        const start = new Date(base.getTime() + i * 90 * 60 * 1000);
        const dur = i === 0 ? minutes : Math.round(minutes / 2);
        const end = new Date(start.getTime() + dur * 60 * 1000);
        dayTotal += dur;
        await db.runAsync(
          `INSERT INTO study_session
             (user_id, town_id, emotion_id, timer_mode, study_date,
              start_time, end_time, planned_minutes, duration_minutes)
           VALUES (?, ?, ?, 'simple', ?, ?, ?, ?, ?)`,
          user.id, town.town_id, emotionId, studyDate,
          start.toISOString(), end.toISOString(), dur, dur,
        );
      }

      await db.runAsync(
        `INSERT INTO daily_night_weather (user_id, study_date, night_weather_id)
         VALUES (?, ?, ?)
         ON CONFLICT (user_id, study_date)
         DO UPDATE SET night_weather_id = excluded.night_weather_id`,
        user.id, studyDate, weatherId,
      );

      if (dayTotal >= user.daily_goal_minutes) {
        await db.runAsync(
          "INSERT OR IGNORE INTO daily_goal_achievement (user_id, study_date) VALUES (?, ?)",
          user.id, studyDate,
        );
      }
    }
  });
}
