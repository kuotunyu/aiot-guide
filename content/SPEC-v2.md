# 章節改版規格 v2（在 SPEC.md 之上）

樣板是 `content/s1-22.json` 與 `static/assets/labs/s1-22.js`，動手前必讀這兩個檔，再用瀏覽器或文字看 `dist/s1-22.html`。SPEC.md 的讀者、語氣、著作權、SVG 規則全部繼續適用。

## 目標
目前章節內容正確但太密，像條列的教科書。改成：讀者先判斷、再讀核心、再動手，細節需要時才展開。**不可因此遺失任何知識點**：收合不是刪除，改版前所有粗體名詞、表格列、數字都要留在章節某處。

## 全站共用案例：冷鏈物流公司
每章都從同一家冷鏈物流公司的場景切入，不取公司名、不用人物。它有：冷藏庫與冷凍櫃（溫度探頭、壓縮機）、全台跑的冷藏貨車、每天進出倉的貨箱、雲端監控平台與手機 App、超溫告警。MQTT Topic 用 `coldchain/...`。各章自己找切入點，不必硬塞；與案例無關的知識點照常講。

## 新欄位
- `case`：`{"title": "本章的場景（短）", "body": "2–3 句，這章替公司解決什麼問題"}`
- `sections[].predict`：`{"q": "情境判斷題", "a": "答案與一句原因"}`。放在該節開頭，要真的需要思考，答案不可出現在題目裡。約一半到大多數小節有。
- `sections[].body`：只留核心，通常 1–3 段短文或短清單。
- `sections[].lab`：實驗名稱，渲染在 body 之後。
- `sections[].after`：放在實驗之後的 HTML（可省略）。
- `sections[].more`：`{"label": "看得出裡面是什麼的標題", "body": "HTML"}`。收合的細節，每節最多一個。規格數字、版本演進、次要名詞放這裡。
- `sources`：`[["來源名稱", "https://..."], ...]`，3–10 筆，標準文件、原廠或官方優先。**每個網址都要用 curl 確認能開**（`curl -s -o /dev/null -L -m 15 -A "Mozilla/5.0" -w "%{http_code}" URL`），打不開就換或不列。不可列官方歷屆試題，也不必列本站。內容事實要對得上來源，不要為了列來源而列。
- `prereq`：零基礎需要時保留，可精簡。
- 欄位 `id`、`title`、`subtitle`、`summary`、`learn`、`bridge`、`keypoints`、`pitfalls`、`examples`、`check`、`terms` 都保留（examples 可改用案例情境；`learn` 精簡）。svg 與 table 保留，除非有更好的版本。主文可以調整段落順序。

## 實驗（Lab）
每章 1–2 個，只做「動手比讀文字更能學會」的東西。沒有分數、徽章、計時。檔案：`static/assets/labs/<章id>.js`，測試：`tests/labs-<章id>.test.js`。

寫法照 `labs/s1-22.js`：
- 純邏輯函式放前面，`module.exports` 匯出給測試用；`if (typeof document === 'undefined') return;` 之後才碰 DOM，並用 `AIOTLab.register('實驗名', el => {...})` 註冊。工具 `AIOTLab.esc / $$ / radios / slider` 見 `static/assets/labs-core.js`。實驗名全站唯一，以章 id 開頭最安全（例如 `s2-23-oee`）。
- 實驗不能依賴外部函式庫、不能連網、不能 `alert/confirm`、不用 localStorage。開啟時就顯示有意義的狀態，不可一開啟就預先完成挑戰。
- 第一行是 `<h3>實驗：…</h3>`，接一句操作說明。使用者輸入經 `esc`。控制項要能用鍵盤操作、有 label。
- 樣式用現成 class：`lab-form lab-field seg chips lab-say lab-input lab-err lab-slider rank topics tasks task guess lanes linkbtn row btn ghost small muted`。圖用 inline SVG，外層 `<div class="lab-viz">`，形狀與文字 class 同 SPEC.md 的 svg（box acc ok bad warn soft ln la t tb ts th tc ta mk），不寫顏色值；互動中改變屬性時可用 `setAttribute` 改座標。不要新增 CSS；真的不夠用就在回報中提出。寬度要適應 375px 手機，不可造成橫向捲動。
- 要教的取捨或限制，用一句話寫在介面上（如「排序只看這四個條件」）。簡化模型要明說是簡化。
- 測試用 `node` 跑，assert 關鍵邏輯與邊界值；數值要手算核對。

## 完成前必做
1. 跑 `node tests/labs-<章id>.test.js`。
2. 改寫既有章節時，用 python 比對改版前後的粗體詞與表格列，確認知識點沒有遺失。
3. 跑 `npm run check`。

## 回報（精簡）
實驗名稱與教什麼、測試結果、知識點比對結果、需要的 CSS、不確定的事實。
