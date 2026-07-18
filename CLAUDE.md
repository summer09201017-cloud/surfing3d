# CLAUDE.md — 3D 衝浪 Surfing 3D(維護守則)

**C4 Extreme Terrain 的首跑與地基的家**(2026-07-18 晚,agape250 機,使用者點名開工;2028 LA 前排入 🏄)。
底座=jonah-water3d 殼(單人流程/HUD/觸控/SW);核心新地基=`src/terrain.js`。

## 這是什麼
U 型池(halfpipe)計分賽:泵速(下坡按住=加速)→ 衝出池緣騰空 → 空中轉體/抓板 → 落地結算
(穩=combo 加成)→ 時間到 → 總分 → 三星。**永不會輸**:落地不穩只是晃一下,不摔不傷,最少 ⭐+鼓勵。

## ★C4 地基:src/terrain.js(收割不重寫)
照 water-kit(water.js)同一套範式——**零遊戲耦合、整檔可搬**:
- `terrainHeightAt(x,z)` / `terrainSlopeAt(x,z)`:高度場+斜率(板、人、道具全用它=判定=畫面)。
- `createTerrainMesh()`:位移 PlaneGeometry(靜態建一次);`createCoping()`:池緣鋼管。
- `alignToSurface(obj,x,z,{offset,tiltMul})`:任何 Object3D 貼地形(高度+順坡傾斜)。
- `TERRAIN.halfpipe`(flat/radius/length):改這裡=改池型。
**換皮路線**:BMX=同池換車(board→車架+雙輪);衝浪=把 terrainHeightAt 換成 water-kit 的
`waterHeightAt(x,z,t)`(浪=會動的地形),alignToSurface 照用。

## 物理(讀懂再改)
- 地面:1D 沿 z(橫向)——重力沿坡分量 `-G*slope` + 小摩擦;泵=下坡(往池心)按住加 `pump` 加速度。
- 騰空:|z| 過 lip 且外向速度 >2.2 → `vy = |v|*0.92` 拋體;←/→ 轉體(420°/s 趨近)、按住=抓板。
- 落地:回到 lip 高度→結算(高度/半圈數/抓板/穩不穩);穩=`assist` 度內離整半圈。
- 低速自動補力(池底永不卡死);速度不夠出緣=貼弧頂滑回(不硬彈)。

## 量值可調(鐵則)
全在 `DIFFICULTY_PRESETS`(game.js):runSeconds/pump/maxSpeed/assist(落地寬容度)/stars 三星門檻。

## 操作
空白鍵按住=泵(地面)/抓板(空中)・A/D 或 ←/→=沿池移動(地面)/轉體(空中)・V 視角(斜側/正側轉播/高空)。
觸控:◀ ▶ + 泵/抓板(按住式)。

## 常用指令
- `npm run dev` / `npm run build` / `npx vite preview`
- `node scripts/gen-voice.mjs` 烤雲哲播報 8 句(本作無經文;SCRIPTURES=[] 保留欄位跨專案通用)
- `node scripts/verify-surf.mjs [outDir] [url]` Playwright 全流程截圖+抓 pageerror

## 收尾鐵則
- 每次部署 bump `public/sw.js` 的 `CACHE_NAME`(surfing3d-nf1 → nf2…)。
- 上架(GitHub public/Netlify prod/奧運頁卡)**要使用者逐字點名**;完成後同步 gamefleet sites.json。
- 相關:[[3d-game-kit]]、[[water-kit]](衝浪雙拼)、[[baked-voice-commentary]]、[[sports-arcade-kit]]、[[combo-judge-kit]](評分思路同源)。

榮耀歸神。
