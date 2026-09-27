# 交易日誌

記錄期貨與加密貨幣交易的個人日誌，採用三步驟流程：**進場 → 風控 → 復盤**。
判斷依據包括型態、趨勢線、道氏理論、葛蘭碧八大法則與 20／100 均線，並設有盈虧比門檻，預設至少 3：1。

這是純前端的靜態網站，同時也是 PWA，可以在 Android Chrome 安裝成 App。
資料透過 **Firebase**（Google 登入＋Firestore）在手機與電腦之間同步；還沒設定 Firebase 時，會自動改用瀏覽器 localStorage（本機模式）。
不需要自己架設後端，也不需要安裝任何 npm 套件。

---

## 專案結構

```
trading-journal/
├── public/                      ← 網站本體，Vercel 直接部署這個資料夾
│   ├── index.html               ← 頁面骨架：頂部導覽、主畫面容器、詳情面板
│   ├── manifest.webmanifest     ← PWA 設定：名稱、圖示、顏色、start_url
│   ├── sw.js                    ← Service Worker：離線快取
│   ├── assets/
│   │   ├── css/styles.css       ← 所有樣式；配色變數在最上方的 :root
│   │   └── js/
│   │       ├── app.js           ← 所有功能邏輯
│   │       └── firebase-config.js ← Firebase 專案設定（部署前要填）
│   └── icons/                   ← App 圖示
│       ├── icon-192.png / icon-512.png         （一般圖示）
│       ├── maskable-192.png / maskable-512.png （Android 自適應圖示）
│       ├── apple-touch-icon.png / favicon-32.png
│       └── icon.svg                            （圖示原始向量檔）
├── firebase/
│   └── firestore.rules          ← 資料庫權限規則（貼到 Firebase 主控台）
├── scripts/
│   ├── dev-server.mjs           ← 本機開發伺服器（不需要安裝套件）
│   └── check.mjs                ← 部署前檢查 PWA 檔案是否齊全
├── package.json                 ← npm 指令
├── vercel.json                  ← Vercel 設定：輸出資料夾、網址改寫、快取標頭
├── .gitignore
└── README.md
```

## 使用技術

| 項目 | 技術 |
|---|---|
| 介面 | HTML、CSS、原生 JavaScript（ES2020），沒有使用框架 |
| 字型 | Google Fonts：Noto Sans TC，粗體 700 與 900 |
| 資料保存 | Firebase Firestore（雲端同步，內建離線快取）；未設定時使用瀏覽器 `localStorage` |
| 登入 | Firebase Authentication（Google 登入） |
| 路由 | History API：`/`、`/trades`、`/new`、`/stats`、`/settings` |
| PWA | Web App Manifest、Service Worker |
| 部署 | Vercel 靜態網站 |

## 資料保存方式（重要）

網站有兩種模式，右上角的小圓點會顯示目前使用哪一種：

| 模式 | 什麼時候使用 | 資料存在哪裡 | 同步 |
|---|---|---|---|
| **雲端模式**（綠點「雲端同步」） | 已設定 Firebase，並用 Google 登入 | Firestore：`users/{uid}/…` | 手機、電腦同步 |
| **本機模式**（紅點「資料只存在此裝置」） | 尚未設定 Firebase，或在登入畫面選「先不登入」 | 瀏覽器 `localStorage`：`tj-trades`、`tj-settings` | 不同步 |

雲端模式的資料結構：

| 路徑 | 內容 |
|---|---|
| `users/{uid}/trades/{交易編號}` | 一筆交易。K 線圖欄位（`chartEntry`、`chartExit`）只存 `img:圖片編號` |
| `users/{uid}/images/{圖片編號}` | 一張 K 線截圖（壓縮後的 JPEG data URL，單張小於 1 MB） |
| `users/{uid}/meta/settings` | 設定（最低盈虧比、商品預設值、型態清單、外觀） |

- 權限規則在 `firebase/firestore.rules`，每個人只能讀寫自己 `users/{uid}` 底下的資料。
- 沒有網路時也能新增和修改，資料會先存在裝置上，恢復連線後自動上傳。
- 第一次登入時，如果這台裝置的 `localStorage` 已經有舊紀錄，總覽頁會詢問是否上傳到雲端。上傳不會刪除本機資料，同一筆交易重複上傳也只會覆蓋，不會變成兩筆。
- Firebase 免費方案（Spark）包含 1 GB 的 Firestore 空間，每天 5 萬次讀取、2 萬次寫入，個人使用綽綽有餘，而且不會因為閒置被暫停。
- 所有儲存相關程式碼集中在 `app.js` 的「儲存」區段。

## Firebase 設定（啟用同步，只需要做一次）

1. 到 https://console.firebase.google.com ，點「建立專案」，名稱輸入 `trading-journal`。Google Analytics 可以關閉。
2. **Google 登入**：左側「建構」→「Authentication」→「開始使用」→「登入方式」→「Google」→ 啟用 → 選擇支援電子郵件 →「儲存」。
3. **資料庫**：左側「建構」→「Firestore Database」→「建立資料庫」→ 位置選 `asia-east1 (台灣)` →「以正式版模式啟動」→「建立」。
4. **權限規則**：Firestore 頁面上方的「規則」分頁 → 刪掉原本內容，貼上 `firebase/firestore.rules` 的全部文字 →「發布」。
5. **取得設定值**：點「專案總覽」旁的齒輪 →「專案設定」→ 下方「你的應用程式」→ 點網頁圖示 `</>` → 暱稱輸入 `交易日誌` → **不要**勾選 Firebase Hosting →「註冊應用程式」。把畫面上 `firebaseConfig` 的六個值貼進 `public/assets/js/firebase-config.js`。
6. **授權網域**：「Authentication」→「設定」→「授權網域」→「新增網域」，填入 Vercel 給的網域，例如 `trading-journal-xxx.vercel.app`（不要加 `https://`）。之後如果綁定自己的網域，也要加進來。本機測試用的 `localhost` 預設已經在清單裡。

`firebaseConfig` 是公開的網站設定，不是密碼，可以放進 GitHub。資料安全是靠第 4 步的權限規則保護。

## 啟動方式（本機）

需要 Node.js 18 以上版本。

```bash
npm run dev
# 然後打開 http://localhost:3000
```

`dev-server.mjs` 的行為和 Vercel 相同：找不到檔案的網址都會回傳 `index.html`，所以直接開 `/stats` 也能正常顯示。
Service Worker 只能在 `localhost` 或 HTTPS 下運作，因此不要直接雙擊開啟 `index.html` 來測試。

## Build

這個專案**不需要編譯**。`npm run build` 只會執行 `scripts/check.mjs`，確認以下項目：

- `public/` 裡的 PWA 必要檔案都存在
- 提醒 `firebase-config.js` 是否還沒填寫（只會提醒，不會中止部署；未填寫時網站以本機模式運作）
- manifest 是有效的 JSON，並符合安裝條件：名稱、`standalone`、`start_url`、顏色、192 和 512 圖示
- `index.html` 有連結 manifest

Vercel 部署時會自動執行這個檢查；檢查失敗時會中止部署。

## 部署到 Vercel

`vercel.json` 已經設定好以下內容：

- `outputDirectory: public`：只部署 `public/` 資料夾。
- `rewrites`：除了 `assets/`、`icons/`、`sw.js`、`manifest.webmanifest` 之外的網址，都改寫成 `index.html`，所以在子頁面重新整理不會出現 404。
- `headers`：`sw.js` 和 `manifest.webmanifest` 不做快取，更新後能立刻生效，並使用正確的 Content-Type。

部署步驟：

1. 把整個專案推到 GitHub。
2. 到 vercel.com 選擇「Add New → Project」，匯入這個 repository。
3. Framework Preset 選「Other」；Build Command 和 Output Directory 會自動讀取 `vercel.json`，不用修改。
4. 按「Deploy」。

## 主要功能所在位置

所有邏輯都在 `public/assets/js/app.js`。可以搜尋 `=====` 找到各區段：

| 功能 | 區段／函式 |
|---|---|
| 型態、葛蘭碧、出場原因等選項清單 | 「常數」：`DEFAULT_PATTERNS`、`GRANVILLE`、`TL_SIGNALS`、`EXIT_REASONS` 等 |
| 商品預設值（ES、MNQ 等每點價值和手續費） | 「常數」：`DEFAULT_SYMBOLS` |
| 損益、R 倍數、盈虧比、訊號共振計算 | 「計算」：`calc`、`riskInfo`、`confluence`、`summary` |
| 讀寫資料、登入、本機紀錄上傳 | 「儲存」：`initBackend`、`saveTrade`、`deleteTrade`、`saveSettings`、`saveImage`、`loadImage`、`migrateLocal` |
| 登入畫面 | `viewGate` |
| 頁面切換與網址 | 「導覽」：`ROUTES`、`go`、`render` |
| 總覽頁 | 「總覽」：`viewHome` |
| 交易列表 | 「交易列表」：`viewList` |
| 新增／編輯（三步驟） | 「表單」：`step1`、`step2`、`step3`、`renderBar` |
| 3：1 門檻判斷與提示 | `riskInfo`、`rrPanelHTML`、`gate2` |
| 自動儲存 | 「表單：自動儲存」：`doSave`、`flushSave` |
| K 線圖上傳、壓縮與標註 | 「K 線圖與標註」：`chartZone`、`handleImage`、`compressImage`、`drawMarksInto`；雲端圖片載入：`imgTag`、`hydrateImages` |
| 交易詳情面板 | 「詳情」：`openDetail` |
| 策略分析 | 「分析」：`viewStats`、`groupTable` |
| 設定、CSV 匯出、登出 | 「設定」：`viewSettings`、`bindSettings` |
| PWA 安裝按鈕、Service Worker 註冊 | 「PWA」 |

## 修改時的注意事項（給之後接手的人或 AI）

- 新增頁面時，要在 `ROUTES` 加上網址。`vercel.json` 已經會把所有非檔案網址導向 `index.html`，不需要另外修改。
- 在 `public/` 新增需要離線使用的檔案時，請加進 `sw.js` 的 `APP_SHELL`，並把 `CACHE_VERSION` 加 1。
- 修改一般程式不需要改 `CACHE_VERSION`。Service Worker 採網路優先，重新開啟 App 就會拿到新版。
- 配色集中在 `styles.css` 最上方的 CSS 變數：淺色用 `:root`，深色用 `[data-theme="dark"]`。
- 更換 App 圖示時，請修改 `icons/icon.svg`，再輸出成各尺寸 PNG，檔名保持不變。maskable 圖示的主要內容需要放在中間 80% 的範圍內。
- 資料格式：每筆交易是一個物件，`status` 可能是 `watch`（觀察中）、`open`（持倉中）、`closed`（已平倉）或 `skipped`（已放棄）。完整欄位可以參考 `bindSettings` 裡匯出 CSV 的 `cols`。

## PWA 安裝條件檢查

已在 Chromium 中以 DevTools Protocol 驗證：

- `Page.getAppManifest`：manifest 沒有錯誤
- `Page.getInstallabilityErrors`：沒有任何不符合安裝條件的項目
- Service Worker 已註冊並控制頁面，離線時也能開啟並讀取資料
- Firebase 程式庫從 `www.gstatic.com` 動態載入（版本在 `app.js` 的 `FB_VER`），Service Worker 會快取，所以第一次開啟之後離線也能啟動

部署後可以用電腦版 Chrome 開啟網站，在 DevTools 的「Application → Manifest」再確認一次。
