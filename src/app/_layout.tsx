import {
  DarkTheme,
  DefaultTheme,
  ThemeProvider,
} from "@react-navigation/native";
import { Stack, useRouter } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useEffect } from "react";
import { useColorScheme } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { AnimatedSplashOverlay } from "@/components/animated-icon";
import { AudioProvider } from "@/contexts/AudioContext";
import { SettingsProvider } from "@/contexts/SettingsContext";
import { TimerProvider } from "@/contexts/TimerContext";
import { getDatabase } from "@/db/database";
import { userRepo } from "@/db/repositories";

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const colorScheme = useColorScheme();

  // 画面の向きはホーム画面が一元管理する（要件2.4: 横画面対応はホームのみ）。
  // ホームは常にマウントされている根の画面で、フォーカス/離脱に応じて縦固定⇄回転許可を
  // 切り替え、離脱時（他画面・アンマウント）は縦へ戻す（src/app/index.tsx）。
  return (
    // 全画面でジェスチャ（ホームの街探索スワイプ等）を有効にするためルートに配置する
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ThemeProvider value={colorScheme === "dark" ? DarkTheme : DefaultTheme}>
          <SettingsProvider>
            <AudioProvider>
              <TimerProvider>
                <AnimatedSplashOverlay />
                <RootNavigator />
              </TimerProvider>
            </AudioProvider>
          </SettingsProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

/**
 * 起動ゲート（UC 1.1）＋ Stack ナビゲーション。
 * 常設タブは設けない（要件2.1: 街の全景を遮るナビゲーションバーを置かない）。
 *
 * 判定:
 *   - user なし        → 初期設定へ（/setup）
 *   - 未終了セッションあり → 復元して終了処理へ誘導（/record）
 *   - それ以外          → ホーム（index）に留まる
 *
 * S3〜S5・S11・鑑賞モードはルートを切らず、ホーム(index)内のオーバーレイとして実装する。
 */
function RootNavigator() {
  const router = useRouter();

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        await getDatabase(); // DBオープン＋マイグレーション（初回のみ）
        const hasUser = await userRepo.hasUser();
        if (!mounted) return;
        if (!hasUser) {
          router.replace("/setup");
        }
        // TODO(P3-4): 未終了セッションがある場合の復元（要件3.2「中断からの復元」）。
        //   保存済みの時刻情報からセッションを復元し、「前回のセッションが終了して
        //   いません」として終了処理（成果記録）へ誘導する。5:00を過ぎていれば
        //   5:00終了として扱い、実績1分未満なら破棄する。
        //   現状は TimerContext が active_session を読み込み、ホーム画面に
        //   計測中インジケータが出る状態まで復帰する（計測自体は時刻差分方式のため継続している）
      } catch (e) {
        console.error("起動時のDB初期化に失敗しました", e);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [router]);

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="setup" options={{ gestureEnabled: false }} />
      <Stack.Screen name="record" options={{ presentation: "modal" }} />
      {/* ホーム以外の画面はヘッダー（戻る）を出す。ホームだけは街の全景を遮らないため非表示（要件2.1） */}
      <Stack.Screen
        name="calendar"
        options={{ headerShown: true, title: "カレンダー", headerBackTitle: "戻る" }}
      />
      <Stack.Screen
        name="playlist"
        options={{ headerShown: true, title: "音楽", headerBackTitle: "戻る" }}
      />
      <Stack.Screen
        name="settings/index"
        options={{ headerShown: true, title: "設定", headerBackTitle: "戻る" }}
      />
      <Stack.Screen
        name="settings/towns"
        options={{ headerShown: true, title: "街の切り替え", headerBackTitle: "戻る" }}
      />
      <Stack.Screen
        name="settings/tags"
        options={{ headerShown: true, title: "マイタグ", headerBackTitle: "戻る" }}
      />
    </Stack>
  );
}
