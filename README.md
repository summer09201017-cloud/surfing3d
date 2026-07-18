# 3D 衝浪 Surfing 3D 🏄

U 型池計分賽——**泵出速度、飛出池緣、空中轉體抓板、穩穩落地**;連續穩落地有連招加成,時間到看總分拿星星。LA 2028 滑板入奧應援之作。可離線 PWA、手機/平板/投影皆可玩,**摔不傷、永遠能完賽**。

## 怎麼玩
- **空白鍵按住**:泵(地面下坡=加速)/ 抓板(空中)
- **A / D** 或 **← / →**:沿池移動(地面)/ 轉體(空中)
- **V**:視角(斜側/正側轉播/高空)
- 手機:◀ ▶ + 大顆「泵/抓板」按住式按鈕、⛶ 全螢幕、直向會提示轉橫
- 訣竅:下坡按住泵→速度條衝紅→飛出池緣→轉滿整半圈(180°/360°…)落地=穩!

## 開發
```bash
npm install
npm run dev        # 本機開發(localhost 不註冊 SW)
npm run build      # 產出 dist/
node scripts/gen-voice.mjs     # 烤播報人聲 mp3(雲哲)
node scripts/verify-surf.mjs  # Playwright 全流程截圖驗收
```

## 技術
- Three.js;零相依、可離線 PWA。
- **C4 Extreme Terrain 地基**:`src/terrain.js`(heightAt/slopeAt/alignToSurface,零遊戲耦合整檔可搬)——BMX 換車、衝浪把高度場換成 water-kit 浪高場即可收割。
- 播報預烤 mp3(絕不 Web Speech 機器聲)。

榮耀歸神。
