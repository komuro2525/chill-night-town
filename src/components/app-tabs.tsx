import { Tabs } from "expo-router";
import { Image, useColorScheme } from "react-native";

import { Colors } from "@/constants/theme";

export default function AppTabs() {
  const scheme = useColorScheme();
  const colors = Colors[scheme === "dark" ? "dark" : "light"];

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.text,
        tabBarStyle: { backgroundColor: colors.background },
        headerShown: false,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Home",
          tabBarIcon: ({ focused }) => (
            <Image
              source={require("@/assets/images/tabIcons/home.png")}
              style={{
                width: 24,
                height: 24,
                tintColor: focused ? colors.text : undefined,
              }}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="explore"
        options={{
          title: "Explore",
          tabBarIcon: ({ focused }) => (
            <Image
              source={require("@/assets/images/tabIcons/explore.png")}
              style={{
                width: 24,
                height: 24,
                tintColor: focused ? colors.text : undefined,
              }}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="test"
        options={{
          title: "テスト",
          tabBarIcon: ({ focused }) => (
            <Image
              source={require("@/assets/images/tabIcons/explore.png")}
              style={{
                width: 24,
                height: 24,
                tintColor: focused ? colors.text : undefined,
              }}
            />
          ),
        }}
      />
    </Tabs>
  );
}
