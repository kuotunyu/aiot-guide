/* Labs for 2.1: pure logic is exported for tests; the DOM part runs only in a browser. */
(function (root) {
  'use strict';

  // ----- sort components into the three layers -----
  const LAYERS = ['感知層', '網路層', '應用層'];
  const ITEMS = [
    {id: 'compressor', name: '壓縮機控制器', layer: 0, why: '它名字有「控制」，工作卻是驅動壓縮機依指令動作，屬於感知層的執行側。決定要不要加強製冷的判斷，才算用資料。'},
    {id: 'wifi', name: '庫內 Wi-Fi', layer: 1, why: '只負責把資料搬到下一站，不量也不分析。'},
    {id: 'dashboard', name: '雲端儀表板', layer: 2, why: '把資料變成人看得懂的畫面，是在用資料。'},
    {id: 'probe', name: '溫度探頭', layer: 0, why: '直接量溫度，是資料的起點。'},
    {id: 'modem', name: '貨車上的 4G 模組', layer: 1, why: '裝在現場、跟著車跑，但工作是傳資料。看工作，不看裝在哪裡。'},
    {id: 'rfid', name: '貨箱的 RFID 標籤', layer: 0, why: '回答「這是哪一箱」，屬於識別。它雖然用無線電，工作卻不是替別的設備搬資料。'},
    {id: 'rule', name: '超溫告警規則', layer: 2, why: '比對門檻、決定要不要通知，是在用資料做決定。'},
    {id: 'gateway', name: '閘道器', layer: 1, why: '核心工作是協定轉換與轉送。它常兼做彙整與邊緣運算，但這裡看主要工作。'},
    {id: 'gps', name: '貨車上的 GPS 模組', layer: 0, why: '量的是位置。它接收衛星訊號，但不負責把公司的資料傳出去，那是 4G 模組的事。'},
    {id: 'app', name: '手機 App', layer: 2, why: '雖然拿在現場人員手上，但它做的是顯示資料與接收通知，不量也不搬資料。'},
  ];
  // answers: {itemId: layerIndex}. Feedback stays empty until every item has an answer.
  function gradeLayers(answers) {
    const missing = ITEMS.filter(i => !Number.isInteger(answers[i.id]) || !LAYERS[answers[i.id]]).length;
    if (missing) return {complete: false, missing, results: []};
    return {complete: true, missing: 0, results: ITEMS.map(i => ({
      id: i.id, name: i.name, match: answers[i.id] === i.layer, chosen: LAYERS[answers[i.id]], right: LAYERS[i.layer], why: i.why,
    }))};
  }

  // ----- where did the data stop? -----
  const STATIONS = ['探頭量到讀值', '閘道器收到讀值', '平台存入新資料', '平台能發超溫告警', '畫面跟著更新'];
  // stopAt: index of the first station that no longer works when this part fails.
  const SEGMENTS = [
    {name: '探頭', stopAt: 0, symptom: '只有這一顆停更，同庫其他探頭正常；探頭本機也沒有新讀值。', look: '電池、探頭本身。'},
    {name: '探頭到閘道器', stopAt: 1, symptom: '探頭本機讀值正常，但上不了平台。常見是一顆或附近幾顆，同庫較遠處的探頭可能還正常。', look: '距離、金屬遮蔽、無線干擾、配對。'},
    {name: '閘道器', stopAt: 1, symptom: '這台閘道器底下的探頭全部同時停，閘道器也看不到新讀值，或根本連不上。', look: '電源、燈號、程式是否當掉。'},
    {name: '閘道器到平台', stopAt: 2, symptom: '這座倉庫全部停更，但閘道器仍收得到新讀值；其他倉庫與貨車正常。恢復後，有斷線暫存的閘道器會補傳。', look: 'Wi-Fi、路由器、對外網路。'},
    {name: '平台', stopAt: 2, symptom: '所有倉庫與貨車同時停更，超溫告警也發不出來。', look: '平台服務狀態、資料庫、Broker。'},
    {name: '平台到畫面', stopAt: 4, symptom: '平台資料其實一直進來，告警也照發，只有畫面不動。換一台手機或重新整理可能就好。', look: '瀏覽器或 App、網頁連線、畫面的「最後更新時間」。'},
  ];
  function symptoms(k) {
    return STATIONS.map((name, i) => ({name, ok: i < SEGMENTS[k].stopAt}));
  }
  const CLUES = [
    {q: '探頭本機讀值正常，同庫其他探頭也在更新，只有這顆上不了平台', a: 1},
    {q: '某座倉庫全部停更，但閘道器還看得到新讀值', a: 3},
    {q: '所有倉庫和貨車同時停更', a: 4},
    {q: '超溫告警照常推播，只有儀表板數字不動', a: 5},
  ];

  // Answering clue i with the segment currently selected above.
  function gradeClue(i, sel) {
    const c = CLUES[i], right = c.a === sel;
    return {right, text: right
      ? '對。先查：' + SEGMENTS[c.a].look
      : '再想想。上面選的是「' + SEGMENTS[sel].name + '」，它的症狀和這條線索對不上。'};
  }

  const api = {LAYERS, ITEMS, gradeLayers, STATIONS, SEGMENTS, symptoms, CLUES, gradeClue};
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof document === 'undefined') return;

  // ----- DOM -----
  const {esc, $$, radios} = root.AIOTLab;

  function layersLab(el) {
    const answers = {};
    let revealed = false;
    el.innerHTML = '<h3>實驗：把元件分到三層</h3><p class="small">替每個元件選一層，全部選完才看得到原因。</p><div class="lab-form">' + ITEMS.map(i => radios('l-' + i.id, i.name, LAYERS, -1)).join('') + '</div><div class="row"><button type="button" class="btn" data-check disabled>對答案</button><span class="small muted" data-left></span></div><div class="lab-out" aria-live="polite"></div><p class="small muted">這裡依每個元件的主要工作分類。實際一台設備可能同時做好幾件事，例如探頭內建無線晶片。</p>';
    const out = el.querySelector('.lab-out'), check = el.querySelector('[data-check]'), left = el.querySelector('[data-left]');
    function draw() {
      const g = gradeLayers(answers);
      check.disabled = !g.complete;
      left.textContent = g.complete ? '' : '還有 ' + g.missing + ' 項沒選';
      if (!revealed || !g.complete) { out.innerHTML = ''; return; }
      out.innerHTML = '<ul class="rank">' + g.results.map(r => '<li class="' + (r.match ? 'ok' : 'maybe') + '"><span class="st">' + (r.match ? '相符' : '再想想') + '</span><b>' + esc(r.name) + '</b><span class="why">' + (r.match ? '' : esc('應是' + r.right + '，你選了' + r.chosen + '。')) + esc(r.why) + '</span></li>').join('') + '</ul><p class="lab-say">判斷時問一句：它在<b>量</b>、在<b>傳</b>，還是在<b>用</b>？裝在哪裡、名字像什麼，都不是依據。</p>';
    }
    $$('input', el).forEach(i => i.onchange = () => { answers[i.name.slice(2)] = +i.value; revealed = false; draw(); });
    check.onclick = () => { revealed = true; draw(); };
    draw();
  }

  function pathLab(el) {
    // Diagram parts in path order: node, band, node, band, node, band... mapped to SEGMENTS order.
    const PARTS = [
      {x: 1, w: 88, label: '探頭', node: true},
      {x: 90, w: 80, label: '短距無線'},
      {x: 171, w: 88, label: '閘道器', node: true},
      {x: 260, w: 80, label: 'Wi-Fi、網際網路'},
      {x: 341, w: 88, label: '平台', node: true},
      {x: 430, w: 80, label: '網頁連線'},
    ];
    const svg = '<svg viewBox="0 0 600 130" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="資料路徑：探頭、短距無線、閘道器、Wi-Fi 與網際網路、平台、網頁連線、畫面"><defs><marker id="s1-21-lab-arr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" class="mk"/></marker></defs><text x="0" y="20" class="ts tc" data-mark>斷在這裡</text>' +
      PARTS.map((p, i) => p.node
        ? '<rect data-s="' + i + '" x="' + p.x + '" y="30" width="' + p.w + '" height="60" rx="8" class="box"/><text x="' + (p.x + p.w / 2) + '" y="66" class="tb tc" data-s="' + i + '">' + esc(p.label) + '</text>'
        : '<rect data-s="' + i + '" x="' + p.x + '" y="45" width="' + p.w + '" height="30" class="soft"/><line x1="' + (p.x + 6) + '" y1="60" x2="' + (p.x + p.w - 6) + '" y2="60" class="la" marker-end="url(#s1-21-lab-arr)"/><text x="' + (p.x + p.w / 2) + '" y="112" class="ts tc">' + esc(p.label) + '</text>').join('') +
      '<rect x="511" y="30" width="88" height="60" rx="8" class="box"/><text x="555" y="66" class="tb tc">畫面</text></svg>';
    let sel = 2;
    el.innerHTML = '<h3>實驗：畫面不更新，斷在哪一段？</h3><p class="small">點一段假設它壞了，看各站還剩什麼、出現什麼症狀。</p><div class="lab-viz">' + svg + '</div><div class="chips" role="group" aria-label="故障的位置">' + SEGMENTS.map((s, i) => '<button type="button" data-k="' + i + '">' + esc(s.name) + '</button>').join('') + '</div><ul class="topics"></ul><p class="lab-say" aria-live="polite"></p><div class="tasks"><b>反過來想：聽到這些線索，你會先懷疑哪一段？</b><p class="small">先在上面選一段，再按「就是上面選的這段」。</p>' + CLUES.map(c => '<div class="task"><span class="mark" aria-hidden="true">○</span><span>' + esc(c.q) + '<span class="res"></span></span><button type="button" class="linkbtn" data-pick>就是上面選的這段</button><button type="button" class="linkbtn" data-show>看答案</button></div>').join('') + '</div><p class="small muted">簡化模型：一次只壞一處，貨車走自己的行動網路，不經過倉庫閘道器。實際系統可能多處同時出問題。</p>';
    const list = el.querySelector('.topics'), say = el.querySelector('.lab-say'), mark = el.querySelector('[data-mark]');
    function draw() {
      $$('[data-k]', el).forEach((b, i) => b.setAttribute('aria-pressed', String(i === sel)));
      $$('rect[data-s]', el).forEach(r => { const i = +r.dataset.s; r.setAttribute('class', i === sel ? 'bad' : PARTS[i].node ? 'box' : 'soft'); });
      mark.setAttribute('x', PARTS[sel].x + PARTS[sel].w / 2);
      list.innerHTML = symptoms(sel).map(s => '<li class="' + (s.ok ? 'hit' : '') + '"><span class="tick">' + (s.ok ? '正常' : '停住') + '</span><span>' + esc(s.name) + '</span></li>').join('');
      say.innerHTML = '<b>症狀：</b>' + esc(SEGMENTS[sel].symptom) + '<br><b>先查：</b>' + esc(SEGMENTS[sel].look);
    }
    $$('[data-k]', el).forEach((b, i) => b.onclick = () => { sel = i; draw(); });
    $$('[data-s]', el).forEach(s => s.addEventListener('click', () => { sel = +s.dataset.s; draw(); }));
    const done = {};
    $$('.task', el).forEach((row, i) => {
      const res = row.querySelector('.res');
      row.querySelector('[data-pick]').onclick = () => {
        const g = gradeClue(i, sel);
        if (g.right) done[i] = true;
        row.classList.toggle('done', !!done[i]);
        row.querySelector('.mark').textContent = done[i] ? '✓' : '○';
        res.textContent = '　' + g.text;
      };
      // Show the answer in the row itself as well, so the tap visibly does something; the mark stays as it was.
      row.querySelector('[data-show]').onclick = () => { sel = CLUES[i].a; draw(); res.textContent = '　答案：' + SEGMENTS[sel].name + '。先查：' + SEGMENTS[sel].look + '（上面的路徑圖已標出）'; };
    });
    draw();
  }

  root.AIOTLab.register('s1-21-layers', layersLab);
  root.AIOTLab.register('s1-21-path', pathLab);
})(this);
