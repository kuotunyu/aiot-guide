# AIoT 導讀：章節內容規格

## 這個網站是什麼
公開、非官方的學習網站，主題是 iPAS「AIoT 應用工程師（初級）」兩個學科的範圍：科一 AIoT 基礎概論（9 項）、科二 物聯網系統與應用（6 項）。

讀者：所有想學 AIoT 或準備這個考試的人。**不能假設**讀者有 AI、程式、電子或網路背景。

不做：倒數、讀書計畫、進度、個人化內容、衝刺語氣。

## 寫作要求
- 正體中文（台灣用語），專有名詞第一次出現時附英文。
- 用第三人稱或中性語氣講內容。可以用「你」指一般讀者，但不可寫成對某位特定學生說話（不可有「你有資料背景」「你熟 AI」「抱佛腳」「剩幾天」）。
- 不要太簡陋也不要太冗長：一章閱讀 12–20 分鐘。一節 2–5 個短段落。寧可用表格與圖，不堆文字。
- 新名詞當場用一句白話解釋。類比用生活例子（水管、門牌、郵局）。AI／軟體類比只放進 `bridge` 欄位，主文不依賴它。
- 內容要能獨立當學習材料讀，說清楚「它是什麼、為什麼這樣設計、怎麼選」，同時涵蓋應考會用到的名詞、比較與計算。
- 不寫出題頻率或押題（不可有「考題九成」「出題最多」「常考第一名」「考古題出現 N 次」）。應考提醒只放在 `pitfalls`，寫成「容易混淆的地方」。

## 正確性
- 依據順序：標準與原廠規格的通行事實、官方學習指引、既有教材。數字標「典型」。不確定就不寫。
- 官方指引與通行事實衝突時，主文寫正確事實，並在 `pitfalls` 中性註明：「部分教材寫法相反（如官方學習指引第 N 頁）；應考時留意題目的條件。」
- 已知要處理的例子：應變規拉伸時電阻增加（指引 PDF 第 134、141 頁寫反）；Google Cloud IoT Core 已於 2023 年停止服務；HTTP/1.1 預設持久連線；MTConnect 的 Adapter 不一定輸出 XML。

## 著作權（嚴格）
- **不可**放入歷屆試題原文，也不可只換幾個字改寫。例題要自己設計新情境與新數字。
- **不可**大段照抄官方學習指引；用自己的句子重寫，不引用超過 15 字的連續原文。
- 不可提及任何個人資料。

## 參考來源
- 官方評鑑內容：115 年度簡章第 5 頁。科一另有官方學習指引，頁碼列在 `content/site.json` 的 `guidePages`。
- 通行標準與原廠文件，列入各章 `sources`。

## 輸出：`aiot-guide/content/<id>.json`（UTF-8）
```json
{
  "id": "s1-22",
  "title": "通訊與網路",
  "subtitle": "替資料選合適的路與語言",
  "summary": "一到兩句：這章在講什麼，讀完能做什麼（≤70 字）",
  "learn": ["讀完能做到的事，3–5 條，用動詞開頭"],
  "prereq": "（可省略）先備知識，2–5 句，可含 <b>",
  "bridge": "（可省略）一句：有 AI／軟體背景的讀者可以怎麼對照",
  "sections": [
    {
      "id": "kebab-case 英文錨點",
      "h": "小節標題",
      "body": "HTML，只可用 <p> <b> <em> <br> <ul> <ol> <li> <code> <sub> <sup>，不可有屬性",
      "svg": "（可省略）規格見下",
      "caption": "（有 svg 時必填）",
      "table": {"head": ["…"], "rows": [["…"]]},
      "video": "（可省略）"
    }
  ],
  "keypoints": ["這章最該記住的事，4–7 條，每條一句，可含好記的口訣"],
  "pitfalls": ["容易混淆或誤解的地方，3–6 條"],
  "examples": [
    {"q": "自編的情境題題幹", "o": ["A","B","C","D"], "a": 0, "think": "怎麼想：抓關鍵條件 → 對應觀念 → 排除其他選項，2–4 句"}
  ],
  "check": [{"q": "自我檢查問題", "a": "一句答案"}],
  "terms": [{"term": "MQTT", "en": "Message Queuing Telemetry Transport", "def": "一句白話定義"}]
}
```
數量：`sections` 4–7 節，其中至少 2 節有 svg（沿用底稿中好的圖，可修改）；`examples` 2 題；`check` 5–8 題；`terms` 8–20 個本章核心名詞（`en` 可省略）。

`video` 只能用：`mqtt-http`（s1-22）、`adc-sampling`（s1-31）、`sampling-aliasing`、`serial-interfaces`（s1-32）、`pwm-duty`、`battery-duty`（s2-21）、`buffered-recovery`（s2-11）、`oee-losses`（s2-23）。

## SVG 規格
- 開頭 `<svg viewBox="0 0 600 H" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="一句描述">`，H 120–440，根元素不設 width/height。
- 不寫任何顏色值、`style=`、`fill="`、`stroke="`。只用 class：形狀 `box acc ok bad warn soft`；線 `ln la dash`；文字 `t tb ts th tc ta`；箭頭 `mk`。（`t` 16px、`tb` 粗體、`ts` 小字 13px、`th` 18px 標題、`tc` 置中、`ta` 主色）
- 箭頭 marker id 必須全站唯一：`<id>-<節序>-arr`，`viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"`，內含 `<path d="M0,0 L10,5 L0,10 z" class="mk"/>`。
- 只用 rect、circle、ellipse、line、polyline、polygon、path、text、tspan、g、defs、marker。
- 文字不可出界、重疊或超出方框（中文字寬約等於字級）。
- 圖要傳達結構，不當裝飾。圖中文字同樣不可有出題頻率或個人化語氣。
