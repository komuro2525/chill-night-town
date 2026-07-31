# 街ごとの終了演出の鐘（bell）素材の置き場所

学習終了演出（要件3.3）で鳴らす鐘を、**街ごとに音色を変える**ための素材フォルダ。
背景アート（`assets/home/<town>/…`）と同じく、街コードでサブフォルダを分ける。

## 命名・配置

```
assets/audio/bell/<townCode>/<townCode>_bell.mp3
```

- `<townCode>`: `nightTown` / `castleTown` / `snowTown` / `starHill`（`town.code` と一致）
- 例: `assets/audio/bell/castleTown/castleTown_bell.mp3`

## 反映のしかた

素材を置いたら、[`src/constants/audioAssets.ts`](../../../src/constants/audioAssets.ts) の
`TOWN_BELL` にその街の `require(...)` を1行足すだけで有効になる（`getTownBell()` が拾う）。

## フォールバック

`TOWN_BELL` に未登録の街は、既定の鐘
（`assets/audio/ambient/The sound of the bell.mp3`＝`SFX.bell`）にフォールバックする。
背景が `night` に落ちるのと同じ考え方で、素材が無い街でも終了演出は必ず鳴る。

## 音づくりの共通ルール（重要）

街ごとに**音色（timbre）は変えてよい**が、**気分は全街で揃える**こと。
やわらかく・余韻があり・急かさない、落ち着いた締めの一打にする（コンセプト準拠）。

- nightTown（港町）: 時計台のベル（澄んだ金属音・長めの余韻）※イメージ
- castleTown（城下町）: 梵鐘（低く深い一打・尾を引く）※イメージ
- snowTown / starHill: 未定（雪にこもった鈍い鐘 / 風鈴・チャイム系 など）※イメージ

※ レベルでは分けない（街ごとに1音）。
