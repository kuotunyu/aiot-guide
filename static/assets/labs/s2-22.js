/* Labs for s2-22: pure logic is exported for tests; the DOM part runs only in a browser. */
(function (root) {
  'use strict';

  // ----- dashboard update model -----
  // Simplified: data changes on a fixed period, out of phase with the browser; network one-way time is fixed;
  // server processing and reconnects are ignored. Counts are for one hour.
  const HOUR = 3600, ONE_WAY = 0.05, LP_TIMEOUT = 30;
  // Up to this many viewers, the request count is small enough that simple polling is fine.
  const FEW_USERS = 10;

  function compareUpdates(pollSec, changeSec, users) {
    const changes = HOUR / changeSec;
    const pollPerUser = HOUR / pollSec;
    // A change waits for the next poll: uniform over one interval, so half an interval on average.
    const polling = {
      requests: Math.round(pollPerUser * users),
      delay: pollSec / 2 + ONE_WAY,
      emptyShare: Math.max(0, 1 - pollSec / changeSec),
      missedShare: Math.max(0, 1 - changeSec / pollSec),
      connections: 0,
    };
    // One request per change, plus re-asks whenever the server times a held request out.
    const lpPerChange = Math.max(1, Math.ceil(changeSec / LP_TIMEOUT));
    const longPolling = {
      requests: Math.round(changes * lpPerChange * users),
      delay: ONE_WAY,
      emptyShare: 1 - 1 / lpPerChange,
      missedShare: 0,
      connections: users,
    };
    // One HTTP handshake per user; every later update is a pushed frame, not an HTTP request.
    const webSocket = {
      requests: users,
      pushes: Math.round(changes * users),
      delay: ONE_WAY,
      emptyShare: 0,
      missedShare: 0,
      connections: users,
    };
    return {polling, longPolling, webSocket};
  }

  function insight(pollSec, changeSec, users) {
    const r = compareUpdates(pollSec, changeSec, users), parts = [];
    if (r.polling.missedShare > 0) parts.push('輪詢比資料變化慢，只看得到當下最新一筆，約 ' + Math.round(r.polling.missedShare * 100) + '% 的變化沒被看見。');
    else if (r.polling.emptyShare > 0) parts.push('有 ' + Math.round(r.polling.emptyShare * 100) + '% 的輪詢拿不到新資料。');
    else parts.push('輪詢間隔剛好等於資料變化週期，每次都拿到新資料，但平均仍要等半個間隔。');
    if (r.longPolling.requests > r.polling.requests) {
      parts.push(changeSec < pollSec
        ? '資料變得比輪詢還快時，長輪詢每筆都要再發一次請求，請求數反而比輪詢多。'
        : '輪詢間隔比長輪詢的 ' + LP_TIMEOUT + ' 秒逾時還長，長輪詢逾時就要重問，請求數反而比輪詢多。');
    }
    // Closing verdict for these settings: missed changes first, then few viewers, otherwise push.
    if (r.polling.missedShare > 0) parts.push('輪詢會漏、長輪詢更費，這組條件選 WebSocket。');
    else if (users <= FEW_USERS) parts.push((changeSec >= 60 ? '變化慢、人又少' : '人少、輪詢也跟得上變化') + '，這組條件下輪詢就夠，做法最簡單。');
    else parts.push('這組條件下推送較划算，代價是伺服器要掛著 ' + users.toLocaleString('en-US') + ' 條連線並處理重連。');
    return parts.join('');
  }

  // ----- the same readings in three text formats -----
  function readings(n) {
    const out = [];
    for (let i = 0; i < n; i++) {
      const mins = 480 + i, hh = String(Math.floor(mins / 60)).padStart(2, '0'), mm = String(mins % 60).padStart(2, '0');
      out.push({device: 'truck7', time: '2026-11-01T' + hh + ':' + mm + ':00Z', temp: (-18.2 + (i % 5) / 10).toFixed(1), hum: 62 + (i % 3)});
    }
    return out;
  }
  function toJson(rows) {
    const items = rows.map(r => '{"device":"' + r.device + '","time":"' + r.time + '","temp":' + r.temp + ',"hum":' + r.hum + '}');
    return rows.length === 1 ? items[0] : '[' + items.join(',') + ']';
  }
  function toCsv(rows, header) {
    const lines = rows.map(r => [r.device, r.time, r.temp, r.hum].join(','));
    if (header) lines.unshift('device,time,temp,hum');
    return lines.join('\n');
  }
  function toXml(rows) {
    const items = rows.map(r => '<reading><device>' + r.device + '</device><time>' + r.time + '</time><temp>' + r.temp + '</temp><hum>' + r.hum + '</hum></reading>');
    return rows.length === 1 ? items[0] : '<readings>' + items.join('') + '</readings>';
  }
  function formatSizes(n, header) {
    const rows = readings(n), json = toJson(rows), csv = toCsv(rows, header), xml = toXml(rows);
    return {json, csv, xml, sizes: {json: json.length, csv: csv.length, xml: xml.length}};
  }

  const api = {HOUR, ONE_WAY, LP_TIMEOUT, compareUpdates, insight, readings, toJson, toCsv, toXml, formatSizes};
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof document === 'undefined') return;

  // ----- DOM -----
  const {esc, $$, radios, slider} = root.AIOTLab;
  const num = v => v.toLocaleString('en-US');
  // Below 1 per second, whole numbers would round down to a false "0".
  const perSecond = v => (v >= 10 ? num(Math.round(v)) : String(Number(v.toFixed(2))));
  const secs = v => v >= 3600 ? (v / 3600) + ' 小時' : v >= 60 ? (v / 60) + ' 分鐘' : v + ' 秒';
  const delayText = v => v < 0.1 ? Math.round(v * 1000) + ' 毫秒' : v.toFixed(2) + ' 秒';

  // Horizontal bars, linear scale. rows: [[label, value, valueText], ...]
  function bars(title, rows, top) {
    const max = Math.max(...rows.map(r => r[1]), 1e-9);
    let s = '<text x="2" y="' + (top + 16) + '" class="tb">' + esc(title) + '</text>';
    rows.forEach((r, i) => {
      const y = top + 28 + i * 34, w = Math.max(2, r[1] / max * 190);
      s += '<text x="2" y="' + (y + 18) + '" class="ts">' + esc(r[0]) + '</text><rect x="100" y="' + y + '" width="' + w.toFixed(1) + '" height="24" rx="3" class="acc"/><text x="418" y="' + (y + 18) + '" class="ts" text-anchor="end">' + esc(r[2]) + '</text>';
    });
    return s;
  }

  function realtimeLab(el) {
    const POLL = [1, 2, 3, 5, 10, 15, 30, 60];
    const CHANGE = [1, 2, 5, 10, 30, 60, 300, 600, 1800, 3600];
    const USERS = [1, 5, 10, 50, 100, 500, 1000, 5000];
    const PRESETS = [
      {name: '冷藏庫溫度看板', p: 3, c: 5, u: 4},
      {name: '很少發生的超溫告警', p: 3, c: 9, u: 4},
      {name: '貨車每秒更新的追蹤畫面', p: 3, c: 0, u: 4},
      {name: '只有一人看的倉庫螢幕', p: 6, c: 6, u: 0},
    ];
    let idx = {p: 3, c: 5, u: 4};
    el.innerHTML = '<h3>實驗：儀表板怎麼即時更新</h3><p class="small">比較三種做法一小時內的請求數與延遲。</p><div class="chips" role="group" aria-label="情境">' + PRESETS.map((p, i) => '<button type="button" data-p="' + i + '">' + esc(p.name) + '</button>').join('') + '</div>' +
      slider('s222-p', '輪詢間隔', 0, POLL.length - 1, 1, idx.p, '') + slider('s222-c', '資料多久變一次', 0, CHANGE.length - 1, 1, idx.c, '') + slider('s222-u', '同時線上人數', 0, USERS.length - 1, 1, idx.u, '') +
      '<div class="lab-viz"></div><p class="lab-say" aria-live="polite"></p><ul class="rank"></ul><p class="small muted">這是簡化模型：資料固定週期變化、與瀏覽器不同步；網路單程固定 50 毫秒；長輪詢逾時 30 秒後重問；不計伺服器處理時間與斷線重連。長條為線性比例，太短時以最小寬度顯示。請求數不等於新連線數，HTTP/1.1 可重複使用同一條連線。</p>';
    const inputs = {p: el.querySelector('#s222-p'), c: el.querySelector('#s222-c'), u: el.querySelector('#s222-u')};
    function draw() {
      const P = POLL[idx.p], C = CHANGE[idx.c], U = USERS[idx.u], r = compareUpdates(P, C, U);
      const texts = {p: '每 ' + secs(P), c: '每 ' + secs(C), u: num(U) + ' 人'};
      Object.keys(inputs).forEach(k => {
        inputs[k].value = idx[k];
        inputs[k].setAttribute('aria-valuetext', texts[k]);
        inputs[k].parentElement.querySelector('output').textContent = texts[k];
      });
      $$('[data-p]', el).forEach((b, i) => {
        const x = PRESETS[i];
        b.setAttribute('aria-pressed', String(x.p === idx.p && x.c === idx.c && x.u === idx.u));
      });
      el.querySelector('.lab-viz').innerHTML = '<svg viewBox="0 0 420 268" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="三種做法的 HTTP 請求數與平均延遲比較">' +
        bars('一小時的 HTTP 請求數（全體）', [['Polling', r.polling.requests, num(r.polling.requests)], ['Long Polling', r.longPolling.requests, num(r.longPolling.requests)], ['WebSocket', r.webSocket.requests, num(r.webSocket.requests)]], 0) +
        bars('平均看到新資料的延遲', [['Polling', r.polling.delay, delayText(r.polling.delay)], ['Long Polling', r.longPolling.delay, delayText(r.longPolling.delay)], ['WebSocket', r.webSocket.delay, delayText(r.webSocket.delay)]], 134) + '</svg>';
      el.querySelector('.lab-say').textContent = insight(P, C, U);
      el.querySelector('.rank').innerHTML =
        '<li><span class="st">輪詢</span><b>Polling</b><span class="why">平均每秒 ' + perSecond(r.polling.requests / HOUR) + ' 個請求，不必一直掛著連線。</span></li>' +
        '<li><span class="st">長輪詢</span><b>Long Polling</b><span class="why">掛著 ' + num(r.longPolling.connections) + ' 個請求等資料；' + (r.longPolling.emptyShare > 0 ? Math.round(r.longPolling.emptyShare * 100) + '% 的請求因逾時而沒有資料。' : '每個請求都等到資料。') + '</span></li>' +
        '<li><span class="st">推送</span><b>WebSocket</b><span class="why">只有握手算 HTTP 請求；之後推送 ' + num(r.webSocket.pushes) + ' 則訊息，維持 ' + num(r.webSocket.connections) + ' 條連線。</span></li>';
    }
    Object.keys(inputs).forEach(k => { inputs[k].oninput = () => { idx[k] = +inputs[k].value; draw(); }; });
    $$('[data-p]', el).forEach(b => b.onclick = () => { const x = PRESETS[+b.dataset.p]; idx = {p: x.p, c: x.c, u: x.u}; draw(); });
    draw();
  }

  function formatsLab(el) {
    const COUNTS = [1, 2, 5, 10, 50, 100];
    let idx = 0, header = 0;
    el.innerHTML = '<h3>實驗：同一批讀值，三種格式有多大</h3><p class="small">長度是頁面實際組出的字串長度，每個英數字元算 1。</p>' + slider('s222-n', '一次打包', 0, COUNTS.length - 1, 1, idx, '') + '<div class="lab-form">' + radios('s222-h', 'CSV 要不要標題列？', ['要', '不要'], header) + '</div><div class="lab-viz"></div><p class="lab-say" aria-live="polite"></p><div class="lab-samples"></div><p class="small muted">只比較未壓縮的文字長度，也都用同一組平面欄位。CSV 不要標題列時，接收方必須事先知道每欄的意思；有上下層級的資料，CSV 也寫不出來。</p>';
    const input = el.querySelector('#s222-n');
    function sample(name, text) {
      const cut = text.length > 170 ? text.slice(0, 170) + '…' : text;
      return '<p class="small"><b>' + name + '</b><br><code>' + esc(cut).replace(/,/g, ',<wbr>').replace(/&gt;/g, '&gt;<wbr>').replace(/\n/g, '<br>') + '</code></p>';
    }
    function draw() {
      const n = COUNTS[idx], f = formatSizes(n, header === 0), z = f.sizes;
      input.setAttribute('aria-valuetext', n + ' 筆');
      input.parentElement.querySelector('output').textContent = n + ' 筆';
      el.querySelector('.lab-viz').innerHTML = '<svg viewBox="0 0 420 134" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="JSON、CSV、XML 的字串長度比較">' + bars('字串長度（字元）', [['JSON', z.json, num(z.json)], ['CSV', z.csv, num(z.csv)], ['XML', z.xml, num(z.xml)]], 0) + '</svg>';
      el.querySelector('.lab-say').textContent = 'JSON 是 CSV 的 ' + (z.json / z.csv).toFixed(1) + ' 倍，XML 是 CSV 的 ' + (z.xml / z.csv).toFixed(1) + ' 倍。JSON 與 XML 每筆都重複欄位名，CSV 的欄位名最多只寫一次。';
      el.querySelector('.lab-samples').innerHTML = sample('JSON', f.json) + sample('CSV', f.csv) + sample('XML', f.xml);
    }
    input.oninput = () => { idx = +input.value; draw(); };
    $$('input[type=radio]', el).forEach(i => i.onchange = () => { header = +i.value; draw(); });
    draw();
  }

  root.AIOTLab.register('s2-22-realtime', realtimeLab);
  root.AIOTLab.register('s2-22-formats', formatsLab);
})(this);
