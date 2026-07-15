# Student Games：卡頓修復 + Service Worker 加速快取

## Context

Ivan 回報學生玩 studentgames（`~/Desktop/studentgames/` → studentgames.pages.dev）時：
1. **手機/平板玩到一半掉幀**（沒特定規律）
2. **語音有時卡住沒發出來**
3. 想做 PWA 離線快取，擔心 Cloudflare Pages 不支援

討論結論：
- Cloudflare Pages 做 PWA **完全沒問題**（SW 只要求 HTTPS）。
- 但掉幀與語音卡住是**本地問題**，PWA 治不了，要分開修。
- 離線目標選定「**加速為主、順便離線**」：不做完整安裝式 PWA，做 Service Worker 分層快取即可（manifest 之後想做再加）。

探勘發現的具體病灶：
- 每個遊戲載入一首 **4~7 MB 的 MP3** BGM（`assets/music/` 共 38 MB）——SW 快取後不用每次重載（Ivan 確認同時頂多 2~3 人玩，頻寬非主因，故不轉檔壓縮）。
- `tank.html:208` 從 cdnjs 載 three.js（第三方網域，慢或被擋就整頁卡住）。
- **tank / ship / sniper 的語音沒有 `voiceschanged` 處理**（`getVoices()` 回空陣列時直接不發聲）——bomb / runner / battle / miner 都有，就這三個沒有。這與「語音偶爾不出來」高度吻合。
- runner / miner / battle 的 canvas 沒有 DPR 上限處理（tank/ship/sniper/bomb 都 cap 在 2）。

## Part A：語音卡住修復（優先，病灶明確）

對 `games/tank.html`、`games/ship.html`、`games/sniper.html`：

1. 補 `voiceschanged` 處理：比照 `games/battle.html` / `games/bomb-game.js` 既有寫法——先掛 `voiceschanged` 事件更新語音快取，拿不到指定語音時退回預設語音照樣發聲。
2. 逐檔核對專案 CLAUDE.md「iOS 兩大地雷」＋ Safari 規則：
   - 第一次 speak 是否由真實 DOM `<button>` click 觸發（範例：`bomb-game.js` 的 `_speechOverlay`）
   - 唸字時 `ctx.suspend()` / `onend` `resume()` ＋世代 token（三檔都已有 `suspend()`，核對完整性即可）
   - 只在 `speaking`/`pending` 時才 `cancel()`
3. 所有遊戲補一個 Android Chrome 地雷檢查：utterance 要保持全域引用，避免被 GC 後靜音。

## Part B：Service Worker 分層快取（加速為主、順便離線）

新增檔案（root，零建置、純手寫）：
- `sw.js`：
  - **network-first**：`index.html`、`games/*.html`、`games/bomb-game.js`、`games/bomb.css`、`data/wordbank.js` → 保住「push 即時生效」，斷網時退回快取（離線可玩已開過的遊戲）
  - **cache-first（runtime cache，第一次載入時存）**：`assets/music/*.mp3`、`assets/` 圖片、three.js
  - **MP3 要處理 Range request**：Safari 的 HTMLAudio 會發 `Range` 標頭，SW `cache.match` 不會自動回 206——要在 SW 內解析 Range、從快取切片回應，否則 iOS 音樂會壞。這是本 Part 最大的坑，實作時重點測。
  - 版本化 cache 名稱＋啟用時清舊版快取；`skipWaiting` + `clients.claim`
- 註冊碼：`index.html` 與各遊戲 HTML 各加 3 行 `navigator.serviceWorker.register('/sw.js')`（SW 放 root、scope 蓋全站；學生常直開遊戲頁所以每頁都註冊）

配套：
- **three.js 改本地**：下載 three 0.160.0 到 `assets/vendor/three-0.160.0.min.js`，`tank.html:208` 改指本地 → 去掉第三方網域依賴，SW 快取也乾淨（不用碰 opaque response）
- （MP3 不轉檔：Ivan 確認同時頂多 2~3 人玩，頻寬不是問題）

已知限制（已向 Ivan 說明）：iOS Safari 對 7 天沒用的網站可能清快取，「永久離線」不保證；當加速快取是穩的。

## Part C：BGM 音量調小 30%（Ivan 指定）

所有遊戲的 BGM 目標音量 ×0.7：
- `games/bomb-game.js`：改 `BGM_VOLUME` 常數（`bomb-game.js:437` 附近定義）
- 其他六個遊戲（tank / miner / battle / ship / sniper / runner）：BGM 都是 `volume=0` 起跳再 fade-in 到目標值，找出各檔 `fadeBgm(...)` 呼叫的目標音量參數，乘 0.7
- 只動 BGM，不動音效（sfx / gain）與 speechSynthesis 音量

## Part D：掉幀優化（手機/平板）

1. **補 DPR 上限**：runner / miner / battle 的 canvas 尺寸計算加 `Math.min(devicePixelRatio, 2)`，比照 `bomb-game.js:33-35` 的寫法與註解理由。
2. **FPS 自動降級**（3D 為主：tank / runner / ship / sniper）：在主迴圈量測滾動平均 FPS，持續低於 ~40 時降一級——three.js 遊戲 `setPixelRatio` 降到 1.5 → 1.25，2D 遊戲降 DPR；只降不升（避免震盪）。各檔實作貼合既有風格，不抽共用模組。
3. 不做大改動（物件池重構、特效重寫）——先上 1、2 觀察學生實測回饋，真的還卡再針對特定遊戲深入。

## 執行順序與 commit 切分

各 Part 獨立 commit + push（依專案規範用 chenchong882 帳號，push 前先 fetch 比對雙電腦同步）：
1. Part A（語音）
2. Part B（SW + three.js 本地化）
3. Part C（BGM 音量 -30%）
4. Part D（掉幀）

## 驗證

依專案測試規範：靜態自檢後直接交付，由 Ivan 實測。

交付前靜態自檢（每個 Part）：
- 抽出改動的 `<script>` 跑 `node --check`；`sw.js` 直接 `node --check`
- 單字注入鏈（`apply*Data` / hash / postMessage）未被碰到，`git diff` 範圍檢查
- 語音改動對照 CLAUDE.md 兩大地雷逐條核對

請 Ivan 實測的重點：
- **語音**：iPhone/iPad 開 tank、ship、sniper，點開始後打中幾個字，聽有沒有唸；Android 手機同測
- **SW**：手機開一個遊戲玩過 → 開飛航模式重新整理，確認還能開能玩、音樂有聲（iOS 重點測音樂，Range 坑）；電腦上改個小地方 push 後重新整理兩次，確認更新有進來（network-first 沒被快取卡死）
- **BGM**：隨便開兩個遊戲聽背景音樂，確認明顯變小聲但音效（射擊/爆炸）音量不變
- **掉幀**：之前會卡的手機玩 tank/runner，看有沒有比較順（畫面可能會稍微變糊一點，那是自動降解析度在作用，屬預期行為）
