# 段考單字補發音

## 完整例句錄音

首頁「預覽單字」與《狙擊暗殺》的錯題畫面共用 Kokoro 的美式女聲 `af_heart`，預設語速為 0.94 倍，少數句子為了聽清楚子音再放慢。點「聽例句」會播放與畫面完整句子相符的 MP3。相同句子可以共用錄音，同一個字搭配不同句子時各自對應音檔。單字的口音選擇只套用到「聽單字」。

首頁的兒童短句與繁中翻譯收在 `data/reading-examples.js`。三款遊戲的內建主題填空題共用這些短句。`data/cloze-options.js` 逐句列出可當錯誤選項的單字，也收錄遊戲各自的備用題庫。修改英文句子後，需重新核對選項並更新對應句子。學生當天選的字湊不齊該回合的選項時，遊戲會跳過那一題。

更新短句、內建主題或狙擊備用題庫後，可以在 Mac 上重新執行產檔工具。產檔需 Node、FFmpeg、LAME，以及裝有 NumPy、ONNX Runtime、Misaki 英語 G2P（含 eSpeak fallback）和 spaCy `en_core_web_sm` 的 Python 環境。提供 Kokoro v1.0 ONNX 模型、`af_heart` 原始 float32 聲線檔及對應的 tokenizer JSON。模型和依賴裝好後可在本機離線產檔。學生播放時由遊戲站提供 MP3。

```sh
python3 scripts/generate-example-audio.py --dry-run
python3 scripts/generate-example-audio.py --model /path/to/model.onnx --voice /path/to/af_heart.bin --tokens /path/to/tokenizer.json
python3 scripts/generate-example-audio.py --verify-only
```

工具只產生缺少的句子，完成後更新 `data/example-audio-manifest.js`。正式發布前，另以獨立語音辨識或聽查比對句子內容。

## 單字錄音

遊戲與複習預設播放美式 Marin 音檔，產檔語速為 0.9 倍。首頁的主題單字預覽另提供美式、英式、澳式和隱藏的印度口音，每種都可選女聲或男聲。重複出現在不同主題的單字共用同一份發音。段考單字若缺少所選錄音，預覽會提示，並可另外點「使用裝置朗讀」。

### 印度口音

全部 380 個內建主題單字的印度口音女聲使用 ElevenLabs 的 The Mumbai Storyteller，男聲使用 Cartesia 的 Rahul（Calm Office Guy）。來源標示收錄於各 MP3 的標題。選擇口音或男女聲後，點單字即可用所選聲音朗讀。口音按鈕的國旗圖檔來自 [Flagpedia](https://flagpedia.net/download/images)。

首頁 380 句內建主題例句都已提供 Rahul 男聲，其中 114 句也提供 The Mumbai Storyteller 女聲。各聲線的例句音檔存於 `assets/example-audio/profiles/`，以 `data/example-audio-profiles.js` 登錄。選了印度口音但當前例句還沒有對應錄音時，按鈕會顯示「聽美式例句」。

產檔在老師的電腦上執行，完成品質核對與發布後才供學生播放。匯入題庫本身不會呼叫 OpenAI API；API key 不可放進網頁或 Git。

## 輸入

使用 UTF-8 JSON，接受單字陣列、`{"words":[...]}` 或 `{"payload":{"words":[...]}}`。例如：

```json
{
  "words": [
    {"word": "apple", "chinese": "蘋果"},
    {"word": "responsibility", "chinese": "責任", "example": "Taking care of the dog is my responsibility."}
  ]
}
```

英文欄位可用 `word`、`en` 或 `phrase`；中文可用 `chinese`、`zh`、`meaning`、`translation` 或 `definition`。`sentence`／`example` 和 `pos`／`part_of_speech` 可提供發音語境。純字串陣列也可使用，但同形異音字應附上中文或詞性。

## 操作

先預覽重複與缺少的字，這一步不讀 API key、不產生費用，也不修改音檔或對照表：

```sh
cd ~/Desktop/studentgames
python3 scripts/generate-word-audio.py --words-file /你的路徑/段考單字.json --dry-run
```

確認清單後，只產生缺少的音檔：

```sh
python3 scripts/generate-word-audio.py --words-file /你的路徑/段考單字.json --key-file /你的路徑/openai-api-key.txt
```

也可用 `OPENAI_API_KEY` 環境變數。來源 JSON 和 key 可留在專案外。

工具保留整份既有音庫、檔名和品質紀錄；相同英文忽略大小寫與多餘空格後只計一次。API 請求失敗可重跑，不需要重做已完成登錄的字。新增音檔會標示為待品質核對。

```sh
python3 scripts/generate-word-audio.py --verify-only
```

這個唯讀檢查只核對音檔格式、時長和音量。發布前仍須聽查／獨立音訊核對是否正確、是否複讀或夾雜額外音效，再依專案規範做靜態檢查、commit、fetch 比對與 push。學生端不需要再次更改遊戲程式。

## 主題單字的口音與聲線

擴充主題題庫時，先用原流程補齊預設音庫，再執行下面指令。加上 `--dry-run` 可預覽缺檔數，`--verify-only` 可檢查音檔格式、時長和音量。

```sh
python3 scripts/generate-word-audio.py --preview-profiles --key-file /你的路徑/openai-api-key.txt
```

新增主題單字時，先用上面列的兩個聲線補齊印度口音音檔。工具會重用已存在的 MP3，補齊其餘口音缺檔，並更新 `data/word-audio-profiles.js`。中斷後可以用同一指令接續。

## 不同義項

目前音檔依英文索引，不能把 `wind` 的「風」和「纏繞」當成同一種發音。工具發現已知同形異音字的意思或詞性衝突時會列出來，不能直接覆寫舊音檔；須先確認義項及播放方式。同一批資料若英文相同、意思互相衝突，也不會偷偷採用最後一筆。

`read` 的現在式與過去式即使中文、詞性相同，讀音仍不同；新舊例句不同時會列為待確認。此檢查不是完整的語意判斷，段考中有指定時態或特殊讀法時，請在資料中註明並核對音檔。

目前產檔使用原先試聽通過的 `gpt-4o-mini-tts-2025-12-15`。OpenAI 公告此模型於 2027-01-06 停用，屆時新增音檔需更新產檔 API；已發布的 MP3 不受影響。參考 [OpenAI 官方語音文件](https://developers.openai.com/api/docs/guides/text-to-speech)。
