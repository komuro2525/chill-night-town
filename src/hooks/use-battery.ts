import * as Battery from "expo-battery";
import { useEffect, useState } from "react";

export type BatteryInfo = {
  /** 0〜1。取得不可（シミュレータ等）の場合は 1 を仮置き */
  level: number;
  charging: boolean;
};

/** 端末のバッテリー残量・充電状態を購読する（要件2.4: 端末から取得して表示） */
export function useBattery(): BatteryInfo {
  const [level, setLevel] = useState(1);
  const [charging, setCharging] = useState(false);

  useEffect(() => {
    let mounted = true;

    Battery.getBatteryLevelAsync()
      .then((l) => {
        if (mounted && l >= 0) setLevel(l);
      })
      .catch(() => {});
    Battery.getBatteryStateAsync()
      .then((s) => {
        if (mounted) {
          setCharging(
            s === Battery.BatteryState.CHARGING ||
              s === Battery.BatteryState.FULL,
          );
        }
      })
      .catch(() => {});

    const levelSub = Battery.addBatteryLevelListener(({ batteryLevel }) => {
      if (batteryLevel >= 0) setLevel(batteryLevel);
    });
    const stateSub = Battery.addBatteryStateListener(({ batteryState }) => {
      setCharging(
        batteryState === Battery.BatteryState.CHARGING ||
          batteryState === Battery.BatteryState.FULL,
      );
    });

    return () => {
      mounted = false;
      levelSub.remove();
      stateSub.remove();
    };
  }, []);

  return { level, charging };
}
