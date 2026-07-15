# Student Games 專案規範

本檔是這個專案「教訓與規則」的唯一存放處。以後被要求「記住／別再犯」的專案教訓，一律追加在這裡。
開發技術知識（架構慣例、單字注入鏈、常見調整）見全域 skill `studentgames-dev`。

## 測試規範 ⚠️

改完遊戲後**不要自己跑測試**（不要開 server / playwright 截圖驗證），直接交付，由使用者本機自己玩來測、回報問題再修。改完說明動了什麼、要他自測即可。

如使用者需要本機開來看，提供指令給他自己跑：
```
cd ~/Desktop/studentgames && python3 -m http.server 8765
# 瀏覽器開 http://localhost:8765/games/<遊戲>.html
```

（例外：使用者明確說「幫我測 / 驗證一下」才跑測試。）

注意：「不跑測試」指的是開 server、playwright 截圖這類**動態驗證**；語法檢查（`node --check`）、注入鏈核對、diff 範圍檢查這些**靜態自檢**仍是交付前必做，清單見全域 skill `studentgames-dev` 的「交付前自檢」。

## Git / Push 規範

改完（語法檢查過）直接 commit + push，不用每次問。

推送必須用 `chenchong882` 帳號——keychain / gh 預設帳號常是沒權限的 `Ivan-1999CODE`，一般 `git push` 會 403。可靠做法：

```
cd ~/Desktop/studentgames && TOK=$(gh auth token --user chenchong882) && git push "https://chenchong882:${TOK}@github.com/chenchong882/studentgames.git" HEAD:main
```

commit 用 `git -c user.name=chenchong882 -c user.email=chenchong885@gmail.com commit`。

## 部署

中央遊戲站 `studentgames.pages.dev`（push 到 `chenchong882/studentgames` 即 Cloudflare Pages 自動部署，全學生即時生效）。雄工學習站 KSVS（`ksvs-a7a.pages.dev`）已整合中央站遊戲並上線。Cloudflare Pages 會把 `.html` 308 轉址，驗證線上頁面要看無 `.html` 的乾淨路徑。

## 跨平台相容標準（所有英文教學檔案適用）⚠️

學生端裝置涵蓋四類：**Windows 電腦、Mac、Android 手機、iPhone/iPad**。任何功能（尤其發音）都要以「四平台都能正常運作」為交付標準，本標準適用於所有英文教學專案（studentgames、新組合、雄工⋯），不只本資料夾。

**發音（speechSynthesis）**：
- 第一次 `speak()` 必須由使用者手勢觸發（Chrome/Safari 都會擋非手勢觸發）；iOS 更嚴格，見下節兩大地雷
- 語音清單是非同步載入：`getVoices()` 可能回空陣列，要搭配 `voiceschanged` 事件，拿不到指定語音時要能退回預設語音而不是不發聲
- 一律明確設 `utterance.lang = 'en-US'`，不要依賴系統預設語言
- Safari 上 `cancel()` 緊接 `speak()` 會吞音，只在 `speaking`/`pending` 時才 cancel

**操作與畫面**：
- 遊戲操作要同時支援觸控（手機）與滑鼠/鍵盤（電腦）；不能有「只靠鍵盤」或「只靠 hover」才能用的功能
- BGM/音效在所有平台都要等使用者手勢後才啟動（autoplay 會被擋）
- 版面要能適應手機直式/橫式與桌機各種解析度（viewport meta、responsive）

**檢查方式**：交付前逐平台做靜態自檢（上述各點＋`studentgames-dev` 的交付前自檢）；實機測試依「測試規範」由使用者本機進行，Safari/iOS 通常是短板，用到較新的 Web API 前先查相容性。

## iOS 單字發音（speechSynthesis）兩大地雷 ⚠️

兩個**不同的根因**都會讓 iOS（含 iPadOS，UA 會偽裝成 Mac+touch）發音靜音，別搞混、別重走排查老路：

1. **觸發點必須是真實 DOM `<button>` 的 click**。canvas 的 `touchstart`/`touchend`（尤其有 `preventDefault`）即使在使用者手勢內，iOS 也不採信，第一次 `speak()` 被默默吞掉、之後整路靜音。已實證：手勢內 speak 無聲語句解鎖、關掉全部 Web Audio 排除搶音訊，都救不回來。
   → 修法：在 canvas 上疊**透明的真實 `<button>`**（`position:fixed` 對齊版面、每幀同步位置與顯示）承接點擊；「開始／選難度」等進場解鎖點也必須是真實按鈕。現成範例：`bomb-game.js` 的 `_speechOverlay`。
2. **運行中的 AudioContext 會佔走 iOS 音訊工作階段**，把 speechSynthesis 壓成靜音（miner 完全沒用 Web Audio，所以天生正常）。
   → 修法：僅在 iOS 唸字時 `ctx.suspend()` 讓出工作階段、`onend`/`onerror` 時 `ctx.resume()`；用世代 token 防連續換題 race；加 setTimeout 安全網避免 BGM 卡死。副作用：唸字時 BGM 短暫停 ~1 秒。範例：bomb（commit cb8764a）、runner（`ac.suspend/resume`，BGM 走 HTMLAudio 不受影響）。

另外：Safari 上 `cancel()` 緊接 `speak()` 會吞音，只在 `speaking`/`pending` 時才 cancel。

修復狀態（2026-06-25 記錄）：bomb 已修、runner 已加發音（待實機驗證）、miner 正常；**tank / ship / battle 未修**，要加發音時套用上述兩條。
