/* Labs for 2.4: pure logic is exported for tests; the DOM part runs only in a browser. */
(function (root) {
  'use strict';

  // ----- storage chooser -----
  // Fixed assumptions for the case company. Hand check: 500 probes x 1440 min = 720,000 rows a day;
  // 30 trucks x 2 Mbps / 8 = 7.5 MB/s, x 3600 s x 10 h = 270,000 MB = 270 GB a day.
  function dailyRows(probes, perMinute) { return probes * perMinute * 1440; }
  function videoGbPerDay(trucks, mbps, hours) { return trucks * mbps / 8 * 3600 * hours / 1000; }

  const STORES = [
    {id: 'rdb', name: '關聯式'},
    {id: 'nosql', name: 'NoSQL'},
    {id: 'tsdb', name: '時序'},
    {id: 'object', name: '物件儲存'},
  ];
  // verdict: ok = best fit, maybe = works with a cost, no = wrong tool.
  const DATA = [
    {
      id: 'temp', name: '每分鐘溫度',
      facts: '假設 500 支探頭，每分鐘各一筆，每天 ' + dailyRows(500, 1).toLocaleString('en-US') + ' 筆。欄位少、只會一直新增，查詢多半是「這台這週的曲線」。',
      best: 'tsdb',
      stores: {
        tsdb: {v: 'ok', why: '資料依時間持續寫入，查詢也依時間範圍，時序資料庫為此最佳化寫入、壓縮與彙整。', cost: '不擅長複雜的跨表關聯，也不適合當帳務系統。'},
        rdb: {v: 'maybe', why: '探頭少時完全可行，查詢語言也熟悉。', cost: '筆數上億後，索引與儲存壓力變大，要自己分割資料表與清舊資料。TimescaleDB 就是在 PostgreSQL 上補這一塊。'},
        nosql: {v: 'maybe', why: '能撐大量寫入，也能橫向擴充。', cost: '依時間的壓縮與彙整多半要自己設計，欄位其實也沒有彈性需求。'},
        object: {v: 'no', why: '儀表板要的是「查一段時間的讀值」，物件儲存是整個檔案存取，查不了單筆。', cost: '舊資料打包歸檔放這裡很便宜，但那是另一層用途。'},
      },
    },
    {
      id: 'order', name: '訂單',
      facts: '客戶、貨箱、費用要互相對應。扣庫存和開單必須同時成功，錯一筆就是帳務問題。',
      best: 'rdb',
      stores: {
        rdb: {v: 'ok', why: '欄位固定、靠鍵把客戶與訂單表連起來，ACID 交易確保要嘛全做、要嘛全不做。', cost: '要先設計欄位，改結構較費工；橫向擴充比 NoSQL 難。'},
        nosql: {v: 'maybe', why: '訂單整包存成一份文件，讀取方便，部分產品也支援交易。', cost: '跨客戶、跨訂單的對應與報表要自己設計，資料容易重複。'},
        tsdb: {v: 'no', why: '訂單有時間，但查詢重點是「誰、哪一箱、多少錢」，不是時間曲線。', cost: '訂單狀態還會更新，時序資料庫偏向只新增。'},
        object: {v: 'no', why: '只能整檔存取，查不了欄位，也沒有交易保證。', cost: '匯出的 PDF 帳單倒是可以放這裡。'},
      },
    },
    {
      id: 'event', name: '貨車事件 JSON',
      facts: '開門、急煞、壓縮機故障，每種事件欄位不同，新車型還會多出新欄位。',
      best: 'nosql',
      stores: {
        nosql: {v: 'ok', why: '文件型 NoSQL 每筆欄位不必相同，新增欄位不必改資料表，也方便橫向擴充。', cost: '欄位不受約束，資料品質要靠應用程式把關；跨文件關聯較弱。'},
        rdb: {v: 'maybe', why: '可以固定共通欄位，其餘放 JSON 欄。', cost: '常查的欄位一直變動時，要反覆改結構或建索引。'},
        tsdb: {v: 'maybe', why: '事件有時間，適合統計「每小時幾次開門」。', cost: '欄位差異大、要查單筆細節時就不順手。'},
        object: {v: 'maybe', why: '整批 JSON 檔放著很便宜，適合當日後分析的原始檔。', cost: '要查單一事件得先靠其他工具掃描，當不了線上查詢。'},
      },
    },
    {
      id: 'video', name: '車廂影片',
      facts: '假設 30 台車、每台 2 Mbps、每天 10 小時，每天約 ' + videoGbPerDay(30, 2, 10) + ' GB。很少看，出事才調閱。',
      best: 'object',
      stores: {
        object: {v: 'ok', why: '為大量檔案設計，容量幾乎不用事先規劃，存放成本低，還能設定舊檔自動轉到更便宜的層級。', cost: '不能查影片內容，也不適合頻繁小幅修改，要另存索引才找得到。'},
        rdb: {v: 'no', why: '把影片塞進資料表，資料庫迅速膨脹，備份和查詢都被拖慢。', cost: '正確做法是只在資料表存車號、時間與檔案位址。'},
        nosql: {v: 'no', why: '文件有大小上限（MongoDB 單一文件 16 MB），影片要切塊，成本也高。', cost: '適合存影片的描述資料，不適合存影片本體。'},
        tsdb: {v: 'no', why: '時序資料庫存的是一筆筆數值讀值，不是大型檔案。', cost: '影片雖然有時間，但有時間不等於該放時序資料庫。'},
      },
    },
  ];
  const VERDICT = {ok: '最合適', maybe: '可行，但有代價', no: '不合適'};

  function evaluateStore(dataId, storeId) {
    const d = DATA.find(x => x.id === dataId);
    if (!d || !d.stores[storeId]) return null;
    const s = d.stores[storeId];
    return {verdict: s.v, label: VERDICT[s.v], why: s.why, cost: s.cost, best: d.best === storeId};
  }
  // choices: {temp: 'tsdb', ...}. Returns the data ids not chosen yet and those with a better fit.
  function summarize(choices) {
    const pending = DATA.filter(d => !choices[d.id]).map(d => d.id);
    const better = DATA.filter(d => choices[d.id] && choices[d.id] !== d.best).map(d => d.id);
    return {pending, better, finished: pending.length === 0};
  }

  // ----- cloud responsibility -----
  // Typical split, same as the chapter figure: layers listed top to bottom.
  const LAYERS = [
    {id: 'app', name: '應用程式'},
    {id: 'data', name: '資料'},
    {id: 'runtime', name: '執行環境'},
    {id: 'os', name: '作業系統'},
    {id: 'virt', name: '虛擬化'},
    {id: 'hw', name: '硬體網路'},
  ];
  const MODELS = [
    {id: 'onprem', name: '地端', vendor: []},
    {id: 'iaas', name: 'IaaS', vendor: ['virt', 'hw']},
    {id: 'paas', name: 'PaaS', vendor: ['runtime', 'os', 'virt', 'hw']},
    {id: 'saas', name: 'SaaS', vendor: ['app', 'runtime', 'os', 'virt', 'hw']},
  ];
  function owner(modelId, layerId) {
    const m = MODELS.find(x => x.id === modelId);
    return m.vendor.includes(layerId) ? 'vendor' : 'you';
  }
  const TASKS = [
    {q: '用 IaaS 虛擬機跑資料庫，作業系統出現安全漏洞', model: 'iaas', layer: 'os', why: 'IaaS 只租到虛擬硬體，作業系統以上都自己管。'},
    {q: '用 IaaS 虛擬機，機房裡的硬碟故障', model: 'iaas', layer: 'hw', why: '硬體與機房屬於業者，這是租用的好處。'},
    {q: '用託管資料庫（PaaS），資料庫引擎要打修補程式', model: 'paas', layer: 'runtime', why: '修補與備份正是 PaaS 代管的部分。'},
    {q: '用託管資料庫（PaaS），資料表設計不良導致查詢很慢', model: 'paas', layer: 'data', why: '平台代管，但資料與程式還是自己的。'},
    {q: '用 SaaS 監控軟體，離職員工的帳號還看得到客戶溫度', model: 'saas', layer: 'data', why: '業者不知道誰離職。帳號與資料權限不會因為買 SaaS 就消失。'},
    {q: '用 SaaS 監控軟體，軟體本身有程式錯誤', model: 'saas', layer: 'app', why: 'SaaS 的應用程式由業者開發與維護。'},
  ];

  const api = {STORES, DATA, MODELS, LAYERS, TASKS, dailyRows, videoGbPerDay, evaluateStore, summarize, owner};
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof document === 'undefined') return;

  // ----- DOM -----
  const {esc, $$, radios} = root.AIOTLab;

  function storageLab(el) {
    const choices = {}, open = {};
    el.innerHTML = '<h3>實驗：替資料選家</h3><p class="small">替每種資料選一個儲存方式，看回饋的原因與代價；選錯可以改選。</p>' +
      DATA.map(d => '<div class="lab-form" data-d="' + d.id + '"><p><b>' + esc(d.name) + '</b><br><span class="small">' + esc(d.facts) + '</span></p>' +
        radios('st-' + d.id, '存到哪裡？', STORES.map(s => s.name), -1) + '</div><div class="lab-out" data-o="' + d.id + '" aria-live="polite"></div>').join('') +
      '<div class="lab-sum" aria-live="polite"></div><p class="small muted">這裡只比這四種常見選擇，數字都是假設。實務還要看成本、團隊熟悉度與保存期限，而且常常混用。</p>';
    const sum = el.querySelector('.lab-sum');
    function drawOne(d) {
      const out = el.querySelector('[data-o="' + d.id + '"]'), pick = choices[d.id];
      if (!pick) { out.innerHTML = ''; return; }
      const r = evaluateStore(d.id, pick);
      let html = '<p class="lab-say"><b>' + esc(r.label) + '。</b>' + esc(r.why) + '<br><b>代價：</b>' + esc(r.cost) + '</p>';
      html += '<button type="button" class="linkbtn">' + (open[d.id] ? '收起其他選項' : '看其他三個選項為什麼') + '</button>';
      if (open[d.id]) {
        const cls = {ok: 'ok', maybe: 'maybe', no: 'no'}, word = {ok: '最合適', maybe: '可行', no: '不合適'};
        html += '<ul class="rank">' + STORES.filter(s => s.id !== pick).map(s => { const x = evaluateStore(d.id, s.id); return '<li class="' + cls[x.verdict] + '"><span class="st">' + word[x.verdict] + '</span><b>' + esc(s.name) + '</b><span class="why">' + esc(x.why) + '</span></li>'; }).join('') + '</ul>';
      }
      out.innerHTML = html;
      out.querySelector('button').onclick = () => { open[d.id] = !open[d.id]; drawOne(d); };
    }
    function drawSum() {
      const s = summarize(choices);
      if (!s.finished) { sum.innerHTML = ''; return; }
      const names = s.better.map(id => DATA.find(d => d.id === id).name);
      sum.innerHTML = '<p class="lab-say"><b>' + (names.length ? esc(names.join('、')) + '還有更合適的家，可以再換換看。' : '四種資料都放進最合適的地方了。') + '</b>同一家公司同時用四種儲存很正常，因為資料的結構、數量與查詢方式都不同。影片本體放物件儲存，車號、時間與檔案位址則放資料庫，才找得到。要毫秒顯示最新溫度，可以再加記憶體快取，它搭配資料庫使用，不取代資料庫。</p>';
    }
    $$('input', el).forEach(i => i.onchange = () => {
      const id = i.name.slice(3), d = DATA.find(x => x.id === id);
      choices[id] = STORES[+i.value].id; open[id] = false; drawOne(d); drawSum();
    });
  }

  function cloudLab(el) {
    const done = {};
    el.innerHTML = '<h3>實驗：出事了，誰要處理？</h3><p class="small">對照上面的四欄分工圖，判斷下面的狀況該由誰處理。</p><div class="tasks">' +
      TASKS.map((t, i) => '<div class="task" data-t="' + i + '"><span class="mark" aria-hidden="true">○</span><span>' + esc(t.q) + '<span class="res" aria-live="polite"></span></span><button type="button" class="linkbtn" data-a="you">自己</button><button type="button" class="linkbtn" data-a="vendor">業者</button></div>').join('') +
      '</div><p class="small muted">這是典型分工的簡化，實際依服務契約而定。</p>';
    $$('.task', el).forEach((row, i) => {
      const t = TASKS[i], res = row.querySelector('.res');
      $$('button', row).forEach(b => b.onclick = () => {
        const right = b.dataset.a === owner(t.model, t.layer);
        if (right) done[i] = true;
        row.classList.toggle('done', !!done[i]);
        row.querySelector('.mark').textContent = done[i] ? '✓' : '○';
        res.textContent = '　' + (right ? '對。' + t.why : '再想想。對照上面的圖，看題目說的模式這一層由誰管。');
      });
    });
  }

  root.AIOTLab.register('s1-24-storage', storageLab);
  root.AIOTLab.register('s1-24-cloud', cloudLab);
})(this);
