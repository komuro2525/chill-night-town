import {
  DarkTheme,
  DefaultTheme,
  ThemeProvider,
} from "@react-navigation/native";
import * as SplashScreen from "expo-splash-screen";
import { useColorScheme } from "react-native";

import { AnimatedSplashOverlay } from "@/components/animated-icon";
import AppTabs from "@/components/app-tabs";
import { AudioProvider } from "@/contexts/AudioContext";
import { SettingsProvider } from "@/contexts/SettingsContext";
import { TimerProvider } from "@/contexts/TimerContext";

SplashScreen.preventAutoHideAsync();

export default function TabLayout() {
  const colorScheme = useColorScheme();
  return (
    <ThemeProvider value={colorScheme === "dark" ? DarkTheme : DefaultTheme}>
      <SettingsProvider>
        <AudioProvider>
          <TimerProvider>
            <AnimatedSplashOverlay />
            <AppTabs />
          </TimerProvider>
        </AudioProvider>
      </SettingsProvider>
    </ThemeProvider>
  );
}
