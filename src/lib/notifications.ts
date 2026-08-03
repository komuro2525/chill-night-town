// OSローカル通知の薄いラッパ（要件12章・4.3 / UC 10.3・12.1）。
//
// 発火はOSが行い、アプリは時刻を監視しない。登録する通知は3種類:
//   ・学習開始リマインド（毎日同時刻。要件12章）
//   ・予定のお知らせ（各予定の1週間前・前日の12:00。要件4.3）
//   ・ポモドーロの切り替わり（計測中のフェーズ境界。要件12章 / UC 12.2）
// どの変更でも「全解除 → 全登録し直し」で足りる（識別子の管理は持たない）。
// これにより、片方の再登録で他方が消える事故を避ける。
//
// 文面の組み立て（学習開始＝18:00前後の出し分け／予定＝1週間前・前日／フェーズ境界）は純関数
// notification-message.ts・event-notice.ts・pomodoro-notice.ts に委ねる。
// ここはOSとのやり取りだけを担う。DBを読んで内容を組み立てる調整は notification-sync.ts が行う。

import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import { getDevOffsetMs } from "./clock";
import type { EventNotice } from "./event-notice";
import { buildNotificationContent } from "./notification-message";
import type { PomodoroPhaseNotice } from "./pomodoro-notice";

/**
 * 通知の種別（content.data に載せる）。フォアグラウンド時に出すかどうかの判定に使う。
 * ポモドーロの切り替わりだけは、フォアグラウンドでは切り替わり音（要件3.1）で
 * 既に伝えているため、通知を重ねない
 */
const POMODORO_PHASE_KIND = "pomodoro_phase";

/**
 * ポモドーロの切り替わり通知のAndroidチャンネル（UC 12.2）。
 * Android 8以降は通知音がチャンネル単位で決まるため、音を鳴らす通知には専用のチャンネルが要る。
 * 学習開始リマインド・予定のお知らせは無音のままにしたいので、チャンネルを分ける。
 *
 * 音はOS標準（sound を渡さない＝システムの既定音）。**チャンネルは一度作ると音を変更できない**ため、
 * 将来アプリ独自の音へ差し替えるときは、このIDを変えて新しいチャンネルを作ること。
 */
const POMODORO_CHANNEL_ID = "pomodoro-phase-default";

/**
 * アプリ内時刻で算出した発火時刻を、OSに渡す実時間へ直す。
 *
 * フェーズ境界は active_session の開始時刻（＝アプリ内時刻。開発時は上書きされうる）から
 * 算出するが、**OSは実時間で発火する**。開発用の時刻上書き（clock.ts）を使っていると、
 * 例えば実時間15:00にアプリ内21:00で開始したセッションの境界は「6時間後」に予約されてしまい、
 * 待っても通知が来ない。オフセットを引いて実時間へ戻す。
 *
 * 本番では getDevOffsetMs() が常に0のため、この関数は何もしない。
 */
function toRealTime(fireAt: Date): Date {
  const offset = getDevOffsetMs();
  return offset === 0 ? fireAt : new Date(fireAt.getTime() - offset);
}

/** チャンネルの作成は冪等だが、毎回の予約で待たせないよう一度だけ行う */
let channelReady: Promise<void> | null = null;

function ensurePomodoroChannel(): Promise<void> {
  if (Platform.OS !== "android") return Promise.resolve();
  if (!channelReady) {
    channelReady = Notifications.setNotificationChannelAsync(
      POMODORO_CHANNEL_ID,
      {
        name: "ポモドーロの切り替わり",
        // 休憩の始まり・終わりに気づくための通知のため、音の鳴る重要度にする
        importance: Notifications.AndroidImportance.HIGH,
      },
    ).then(() => undefined);
  }
  return channelReady;
}

// 通知の表示方法。ハンドラが呼ばれるのはアプリがフォアグラウンドにあるときだけなので、
// ポモドーロの切り替わりはここで表示を落とせば「バックグラウンド中のみ通知」になる（UC 12.2）。
// 音は鳴らさない（アプリ内の静けさを保つ）。モジュール読み込み時に一度だけ設定する
Notifications.setNotificationHandler({
  handleNotification: async (notification) => {
    const show =
      notification.request.content.data?.kind !== POMODORO_PHASE_KIND;
    return {
      shouldShowBanner: show,
      shouldShowList: show,
      shouldPlaySound: false,
      shouldSetBadge: false,
    };
  },
});

/**
 * 通知許可を確保する（要件12章）。
 * 既に許可済みなら何もせず true。未取得で要求可能なら要求する。
 *
 * 端末側で既に拒否されている場合（canAskAgain=false）は要求できないため、
 * ダイアログを出さずに false を返す。この場合はOSの設定から変更してもらうしかない。
 * どちらの理由で false になったかは画面から分からないため、切り分け用にログへ残す。
 *
 * @returns 許可されていれば true。拒否・要求不可なら false
 */
export async function ensureNotificationPermission(): Promise<boolean> {
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;

  if (!current.canAskAgain) {
    // 一度拒否された後・OSの設定でOFFにされている場合など。再要求はOSが受け付けない
    console.warn(
      "通知許可: 端末側で拒否済みのため要求できません（OSの設定から許可が必要）",
      { status: current.status, canAskAgain: current.canAskAgain },
    );
    return false;
  }

  const requested = await Notifications.requestPermissionsAsync();
  if (!requested.granted) {
    console.warn("通知許可: 要求しましたが許可されませんでした", {
      status: requested.status,
      canAskAgain: requested.canAskAgain,
    });
  }
  return requested.granted;
}

/**
 * 登録済みの通知をすべて解除し、渡された内容で登録し直す（全消し→全再登録。要件12章・4.3）。
 * 学習開始リマインド（毎日同時刻）・予定通知・ポモドーロの切り替わり（いずれも日時指定）を
 * 1つの窓口でまとめて管理する。
 * @param reminderTime 学習開始リマインドの時刻 'HH:MM'。null なら出さない
 * @param eventNotices 予定のお知らせ（それぞれ fireAt に鳴らす）
 * @param phaseNotices ポモドーロのフェーズ境界（空なら予約しない＝一時停止中・設定OFF等）
 */
export async function applyNotificationSchedule({
  reminderTime,
  eventNotices,
  phaseNotices = [],
}: {
  reminderTime: string | null;
  eventNotices: EventNotice[];
  phaseNotices?: PomodoroPhaseNotice[];
}): Promise<void> {
  await Notifications.cancelAllScheduledNotificationsAsync();

  if (reminderTime) {
    const [hour, minute] = reminderTime.split(":").map(Number);
    const content = buildNotificationContent(reminderTime);
    await Notifications.scheduleNotificationAsync({
      content: { title: content.title, body: content.body },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DAILY,
        hour,
        minute,
      },
    });
  }

  for (const n of eventNotices) {
    await Notifications.scheduleNotificationAsync({
      content: { title: n.title, body: n.body },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: n.fireAt,
      },
    });
  }

  if (phaseNotices.length > 0) await ensurePomodoroChannel();
  for (const n of phaseNotices) {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: n.title,
        body: n.body,
        // アプリを離れているあいだに気づくための通知なので、音を鳴らす（OS標準音）。
        // 他の2種類は無音のまま（夜の静けさを優先する）
        sound: "default",
        // kind はフォアグラウンド時に表示を落とすための目印（上のハンドラを参照）
        data: { kind: POMODORO_PHASE_KIND },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        // 境界はアプリ内時刻で算出されるため、実時間へ直してからOSへ渡す
        date: toRealTime(n.fireAt),
        channelId: POMODORO_CHANNEL_ID, // Android 8以降は音がチャンネル単位のため
      },
    });
  }

  if (__DEV__) await logScheduledNotifications();
}

/**
 * 開発用: 数秒後に鳴るテスト通知を1件だけ入れる（__DEV__ 限定）。
 *
 * 通知が届かないとき、原因が「アプリの予約の作り方」なのか「OS側の許可・抑制」なのかを
 * 切り分けるために使う。ポモドーロの予約とは独立した最小の1件で、
 * 本物と同じ経路（scheduleNotificationAsync・同じチャンネル・音あり）を通す。
 *
 * これが鳴らなければOS側（許可・集中モード・通知の要約）の問題、
 * 鳴るならアプリ側の予約の作り方の問題と判断できる。
 *
 * @param seconds 何秒後に鳴らすか
 */
export async function scheduleTestNotification(seconds = 10): Promise<void> {
  if (!__DEV__) return;
  const granted = await ensureNotificationPermission();
  console.log(`テスト通知: 許可=${granted} / ${seconds}秒後に予約します`);
  if (!granted) return;

  await ensurePomodoroChannel();
  await Notifications.scheduleNotificationAsync({
    content: {
      title: "テスト通知",
      body: `${seconds}秒後に鳴るよう予約したものです。`,
      sound: "default",
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
      seconds,
      repeats: false,
      channelId: POMODORO_CHANNEL_ID,
    },
  });
  await logScheduledNotifications();
}

/**
 * OSに入っている予約の一覧をログへ出す（開発時のみ）。
 *
 * 通知が届かないとき、「予約されていない」のか「予約はされたがOS側で抑制された」のかは
 * 画面からは区別できない。ここで予約の有無と発火時刻を確認できるようにしておく。
 */
async function logScheduledNotifications(): Promise<void> {
  try {
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    console.log(
      `通知の予約: ${scheduled.length}件`,
      scheduled.map((s) => ({
        title: s.content.title,
        // DATE トリガーは発火時刻、DAILY は時刻指定のため、そのまま出して目視で確かめる
        trigger: s.trigger,
      })),
    );
  } catch (e) {
    console.warn("通知の予約一覧の取得に失敗しました", e);
  }
}
