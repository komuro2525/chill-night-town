import {
  DarkTheme,
  DefaultTheme,
  ThemeProvider,
} from "@react-navigation/native";
import { Stack, useRouter } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useEffect } from "react";
import { useColorScheme } from "react-native";

import { AnimatedSplashOverlay } from "@/components/animated-icon";
import { AudioProvider } from "@/contexts/AudioContext";
import { SettingsProvider } from "@/contexts/SettingsContext";
import { TimerProvider } from "@/contexts/TimerContext";
import { getDatabase } from "@/db/database";
import { activeSessionRepo, userRepo } from "@/db/repositories";

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const colorScheme = useColorScheme();
  return (
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
        const hasActive = hasUser
          ? await activeSessionRepo.hasActiveSession()
          : false;
        if (!mounted) return;
        if (!hasUser) {
          router.replace("/setup");
        } else if (hasActive) {
          // TODO(Phase 3): active_session を復元して終了処理へ。現状は成果記録の空ルートへ遷移する
          router.replace("/record");
        }
        // hasUser かつ未終了なし → index に留まる
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
      <Stack.Screen name="calendar" />
      <Stack.Screen name="settings/index" />
      <Stack.Screen name="settings/towns" />
      <Stack.Screen name="settings/tags" />
    </Stack>
  );
}
