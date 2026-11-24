# 段考單字補發音

遊戲與複習預設播放美式 Marin 音檔，產檔語速為 0.9 倍。首頁的主題單字預覽另提供美式、英式、澳式和隱藏的印度口音，每種都可選女聲 Marin 或男聲 Cedar。重複出現在不同主題的單字共用同一份發音。段考單字若缺少所選錄音，預覽會提示，並可另外點「使用裝置朗讀」。

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

工具重用美式女聲原檔，在 `assets/word-audio/profiles/` 補齊其他七組 MP3，並於完成後更新 `data/word-audio-profiles.js`。中斷後可以用同一指令接續。

## 不同義項

目前音檔依英文索引，不能把 `wind` 的「風」和「纏繞」當成同一種發音。工具發現已知同形異音字的意思或詞性衝突時會列出來，不能直接覆寫舊音檔；須先確認義項及播放方式。同一批資料若英文相同、意思互相衝突，也不會偷偷採用最後一筆。

`read` 的現在式與過去式即使中文、詞性相同，讀音仍不同；新舊例句不同時會列為待確認。此檢查不是完整的語意判斷，段考中有指定時態或特殊讀法時，請在資料中註明並核對音檔。

目前產檔使用原先試聽通過的 `gpt-4o-mini-tts-2025-12-15`。OpenAI 公告此模型於 2027-01-06 停用，屆時新增音檔需更新產檔 API；已發布的 MP3 不受影響。參考 [OpenAI 官方語音文件](https://developers.openai.com/api/docs/guides/text-to-speech)。
