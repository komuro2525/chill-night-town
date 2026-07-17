import * as Battery from "expo-battery";
import { useEffect, useState } from "react";

export type BatteryInfo = {
  /** 0〜1。取得不可（シミュレータ等）の場合は 1 を仮置き */
  level: number;
  charging: boolean;
};

// 直近に取得した値をモジュールに覚えておく。
//
// バッテリーの取得は非同期のため、マウント直後は仮置きの値しか出せない。
// ホーム画面のUIはタイマー設定モーダル等を開くと丸ごと非表示になる（＝アンマウントされる）ので、
// 閉じるたびに再マウントされ、そのつど仮置きの100%が一瞬見えてから実際の値へ飛んでしまう。
// 一度でも取得できていればその値から始めることで、この「一瞬おかしくなる」表示を防ぐ。
let lastLevel = 1;
let lastCharging = false;

/** 端末のバッテリー残量・充電状態を購読する（要件2.4: 端末から取得して表示） */
export function useBattery(): BatteryInfo {
  const [level, setLevel] = useState(lastLevel);
  const [charging, setCharging] = useState(lastCharging);

  useEffect(() => {
    let mounted = true;

    // 取得・購読のどちらで得た値もキャッシュへ反映する（次のマウントの初期値になる）
    const applyLevel = (l: number) => {
      lastLevel = l;
      if (mounted) setLevel(l);
    };
    const applyCharging = (state: Battery.BatteryState) => {
      const c =
        state === Battery.BatteryState.CHARGING ||
        state === Battery.BatteryState.FULL;
      lastCharging = c;
      if (mounted) setCharging(c);
    };

    Battery.getBatteryLevelAsync()
      .then((l) => {
        if (l >= 0) applyLevel(l);
      })
      .catch(() => {});
    Battery.getBatteryStateAsync().then(applyCharging).catch(() => {});

    const levelSub = Battery.addBatteryLevelListener(({ batteryLevel }) => {
      if (batteryLevel >= 0) applyLevel(batteryLevel);
    });
    const stateSub = Battery.addBatteryStateListener(({ batteryState }) => {
      applyCharging(batteryState);
    });

    return () => {
      mounted = false;
      levelSub.remove();
      stateSub.remove();
    };
  }, []);

  return { level, charging };
}
