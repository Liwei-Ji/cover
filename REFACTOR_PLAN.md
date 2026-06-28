# main.js 模組化重構計畫

> 目標：把 775 行的單檔 [main.js](main.js) 拆成 registry 架構，讓「新增一個風格 = 新增一支檔案」，且重構期間**視覺輸出零變化**。最後才加「藍色印象」(`artcard_blue`)。

---

## 0. 前提與限制

- 原生 ESM + importmap，**無 build step**（見 [index.html](index.html)）。
- 所有自有模組用**相對路徑 + `.js` 副檔名** import；importmap 只映射 `react` / `react-dom/client`，自有模組不動 importmap。
- React 取得：新增 `src/dom.js` 匯出 `h = React.createElement`，各 component 從這裡 import。
- **`index.html` 自始至終不改**——進入點仍是 `<script type="module" src="main.js">`，新模組由 main.js 遞移 import。這是降低風險的關鍵之一。

---

## 1. 目標檔案結構與符號搬遷對照

| 目標檔案 | 匯出 | 來源（main.js 現行行號） |
| :- | :- | :- |
| `src/dom.js` | `h` | 新增（取代各處 `const h = React.createElement`） |
| `src/config.js` | `palettes`, `sizes`, `defaultState` | 6-16, 41-47, 49-70 |
| `src/utils/math.js` | `clamp`, `lerp` | 72-78 |
| `src/utils/color.js` | `hexToRgb`, `rgba`, `mixHex`, `paletteAt` | 80-110（`paletteAt` import `palettes`、`lerp`） |
| `src/utils/random.js` | `mulberry32` | 112-121 |
| `src/utils/canvas.js` | `roundedRect`, `drawNoise` | 123-156（`drawNoise` import `mulberry32`） |
| `src/render/text.js` | `wrapText`, `drawText` | 428-477 |
| `src/render/background.js` | `drawBackground`（派發器） | 由 158-426 拆出 |
| `src/render/artwork.js` | `drawArtwork` | 479-482 |
| `src/presets/shared.js` | `drawBase`, `drawHorizonBands`, `drawWatercolor`, `drawFinish` | 見 §2 |
| `src/presets/*.js` | 每風格一支（default export） | 見 §2 |
| `src/presets/index.js` | `registry`, `presetList`, `presetDefaults` | 取代 18-28, 30-39 |
| `src/components/ControlRange.js` | `ControlRange` | 484-497 |
| `src/components/NumberField.js` | `NumberField` | 499-512 ⚠️ 見備註 |
| `src/components/App.js` | `App`（含 `sizeLabel`） | 514-772 |
| `main.js` | —（只留 bootstrap） | 774 |

> ⚠️ **`NumberField` 目前是 dead code**——定義了但 `App` 沒用到。建議保留並抽出、標記未使用；或直接刪。**待你裁示。**

---

## 2. 最關鍵：`drawBackground` 怎麼拆

`drawBackground` 不是「一個 preset 一個分支」那麼乾淨，有**跨風格的條件層**——這是重構最容易改錯行為的地方：

- 底圖＋blobs（277-296）→ 所有非獨立 preset 共用
- 地平線色帶（298-306）→ 條件 `article||warmflow||horizon || bands>18`（**跨風格＋滑桿門檻**）
- 水彩 blobs（391-409）→ 條件 `watercolor || brush>55`（**跨風格＋滑桿門檻**）
- 收尾 shine/vignette/noise（411-425）→ 所有非獨立 preset 共用

→ 這些跨風格層**留在 `shared.js`、由 settings 驅動**，不能塞進單一 preset 模組，否則「article 開高 bands」「任意 preset 開高 brush」的既有行為會跑掉。只有**各 preset 獨佔層**進 preset 模組：

| preset 模組的 `draw` 內容 | 來源行號 |
| :- | :- |
| `article.js` | 334-354 |
| `warmflow.js` | 308-332 |
| `aurora.js` / `prism.js` | 共用 356-371 |
| `material.js` | 373-389 |
| `horizon.js` | 無獨佔層（只靠 base＋地平線帶）→ `draw` 為 noop |
| `diffusion.js` | 無獨佔層 → noop |
| `watercolor.js` | 無獨佔層（blobs 屬 shared 水彩層）→ noop |
| `warpLavender.js`（**standalone**） | 167-275 整段 |

---

## 3. 最安全的組件化設計（重點）

重構唯一真正有風險的是 §2 的拆解；其餘都是機械搬移。以下是把風險壓到最低的設計決策。

### 3.1 ⚠️ 頭號陷阱：共用的亂數序列必須整條 threading

現行 `drawBackground` 在**第 160 行只建立「一個」`random = mulberry32(settings.seed)`**，然後 base blobs → 各 preset 獨佔層 → 水彩層**依序消耗同一條序列**。

> 若拆檔後每支模組各自 `mulberry32(settings.seed)` 重新起一條，blob/overlay 的隨機值會全部不同 → **輸出完全變樣**。這是最隱蔽的破壞點。

**對策：派發器只建立一次 rng 與 palette，threading 給所有層**，且**消耗順序必須與原始由上而下一致**。各層／preset 的 `draw` 介面統一為：

```js
draw(ctx, settings, r)   // r = { rng, p }
```

- `rng`：唯一的 `mulberry32(settings.seed)` 實例（取代原第 160 行）。
- `p`：唯一的 `paletteAt(settings.colorMix)`（取代原第 161 行）。

哪些層會消耗 `rng`（決定 threading 順序的正確性）：
- `drawBase`：**會**（blobs 迴圈，12 或 18 次）
- `drawHorizonBands`：不會（只用 settings.bands）
- `article` / `aurora` / `prism` / `material`：**會**
- `warmflow`：不會（固定座標）
- `drawWatercolor`：**會**（watercolor 或 brush>55 時）
- `drawFinish` 的 `drawNoise`：自建 `mulberry32(seed+404)`，與主序列獨立（維持原樣即可）

standalone（warp_lavender）是第一個消耗者，`rng` 起點等同 `mulberry32(seed)`，threading 後與原輸出一致。

### 3.2 派發器（保留原始順序與單一 rng/p）

```js
// src/render/background.js
import { mulberry32 } from '../utils/random.js';
import { paletteAt } from '../utils/color.js';
import { registry } from '../presets/index.js';
import { drawBase, drawHorizonBands, drawWatercolor, drawFinish } from '../presets/shared.js';

export function drawBackground(ctx, settings) {
  const { width, height } = ctx.canvas;
  ctx.clearRect(0, 0, width, height);              // 對應原第 165 行，務必在分支前
  const r = { rng: mulberry32(settings.seed), p: paletteAt(settings.colorMix) };
  const preset = registry[settings.preset];

  if (preset.standalone) { preset.draw(ctx, settings, r); return; }   // warp_lavender / 未來 artcard_blue

  drawBase(ctx, settings, r);          // 277-296
  drawHorizonBands(ctx, settings, r);  // 298-306（內部保留原條件）
  preset.draw(ctx, settings, r);       // 各 preset 獨佔層（可能 noop）
  drawWatercolor(ctx, settings, r);    // 391-409（內部保留原條件）
  drawFinish(ctx, settings, r);        // 411-425
}
```

### 3.3 其他保真要點

- **`ctx.save/restore` 成對搬移**：每個 preset 區塊自帶 save/restore，整段搬、不可拆散，避免 transform / `globalCompositeOperation` 外洩到下一層。
- **`ctx.clearRect` 位置**：原本在分支判斷之前（165 行）就清空，派發器照此擺在最前。
- **浮點完全不變**：純搬移、運算順序不變 → 輸出應**逐位元相同**（見 §5 驗證）。

### 3.4 依賴方向（無循環）

```
config ← color ← (background, presets/*, shared)
math   ← color
random ← canvas, background, presets/*
所有 ← App（最上層）
```
葉節點（config / math / random）不 import 任何自有模組；由下往上抽，永不形成環。

### 3.5 registry 介面與 index.js

```js
// presets/aurora.js
import { rgba, paletteAt } from '../utils/color.js';
export default {
  id: 'aurora', label: '極光', standalone: false,
  defaults: { colorMix: 94, softness: 86, texture: 56, materialDepth: 30, bands: 28, brush: 18, vignette: 38 },
  draw(ctx, settings, r) { /* 356-371，用 r.rng / r.p */ },
};
```
```js
// presets/index.js
import article from './article.js';
/* …其餘… */ import warpLavender from './warpLavender.js';
export const presetList = [article, diffusion, horizon, aurora, prism, watercolor, material, warmflow, warpLavender];
export const registry = Object.fromEntries(presetList.map((p) => [p.id, p]));
export const presetDefaults = Object.fromEntries(presetList.map((p) => [p.id, p.defaults]));
```
`presetDefaults` / `presets` 不再手寫，全由 registry 衍生。

### 3.6 App 連動 registry（注意一個行為等價性）

- 主按鈕區 → `presetList.filter(p => !p.standalone).map(...)`（取代寫死的 presets 陣列）。
- 第二排 → 「隨機」按鈕（**非 preset，保留原樣**）＋ `presetList.filter(p => p.standalone).map(...)`。
- ⚠️ **等價性檢查**：產生出的按鈕**順序與 label 必須和現行完全一致**（主排 8 顆順序＝現行 `presets` 陣列；第二排＝隨機＋紫霧）。registry 化後「藍色印象」設 `standalone:true` 就會自動長在紫霧旁邊，App 不必再改。
- `choosePreset` 照舊用 `presetDefaults[preset]`。
- `defaultState` 建議改成 `{ preset:'article', ...presetDefaults.article, width:1200, height:630, text:..., ... }` 消除與 article 預設的重複（可選）。

---

## 4. 遷移步驟（每步可獨立執行、可回退）

1. **建 baseline 快照**（見 §5）。
2. 抽 `dom.js` + `utils/*`（math, color, random, canvas）→ main.js 改 import → 快照比對。
3. 抽 `config.js`、`render/text.js` → 比對。
4. **拆 `drawBackground`**（最大步）：建 `shared.js` + 各 preset 模組 + `index.js` + `render/background.js` + `render/artwork.js`，main.js 改 import → **逐一比對 9 個 preset**，外加兩個跨風格案例：① `article` + 高 `bands`、② 任一 preset + `brush>55`。
5. 抽 `components/*`，main.js 只剩 `createRoot(...).render(h(App))` → 整體驗收。
6. 全綠後**另開一步**新增 `presets/artcardBlue.js`（`standalone:true`）並在 index 註冊一行。

> 建議在重構分支上進行，每個綠燈步驟各一個 commit，隨時可回退（commit 時機聽你的）。

---

## 5. 驗證方式：確定性快照（比肉眼可靠）

輸出在給定 `seed` 下**完全確定**，所以可做**逐位元比對**而非目視：

1. 重構前，用一支臨時 harness（`tools/snapshot.html` 或丟 scratchpad）把「9 個 preset × 關鍵 slider 組合」各渲染到 offscreen canvas，輸出 `{ key: canvas.toDataURL() }` 成 JSON baseline。
2. 每完成一個遷移步驟，重跑 harness，與 baseline 比對 dataURL；**預期完全相同**，不同即代表搬壞了（最可能是 §3.1 的 rng 問題）。
3. 用 Playwright（或 /run、/verify skill）在無頭瀏覽器自動跑這輪比對。
4. harness 屬重構工具、**不進產品程式**（放 `tools/` 或 scratchpad，重構結束可刪）。

關鍵比對組合至少涵蓋：8 個主 preset 各一張預設、warp_lavender、`article` 高 bands、`material` 強制 `brush>55`、隨機 seed 固定值一張。

---

## 6. 待裁示事項

- `NumberField` 保留還是刪？（目前未被使用）
- `defaultState` 要不要改成從 `presetDefaults.article` 衍生？
- commit 策略：每步一 commit、或最後一次？
