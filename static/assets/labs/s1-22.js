/* Labs for 2.2: pure logic is exported for tests; the DOM part runs only in a browser. */
(function (root) {
  'use strict';

  // ----- wireless selector -----
  // range: 0 touch, 1 room, 2 site, 3 kilometres. data: 0 ID only, 1 few readings, 2 voice/small files, 3 video.
  // power: 0 battery for years, 1 rechargeable, 2 mains. mobile: 2 fine, 1 limited, 0 poor.
  const TECHS = [
    {id: 'nfc', name: 'NFC', range: 0, data: 1, power: 0, mobile: 2, note: '碰一下才通訊，適合人拿手機互動。'},
    {id: 'rfid', name: 'RFID', range: 1, data: 0, power: 0, mobile: 2, note: '主要回傳標籤編號，被動標籤免電池。UHF 頻段可一次讀多個。'},
    {id: 'ble', name: 'BLE', range: 1, data: 2, power: 0, mobile: 2, note: '省電、手機都支援，傳感測值很合適。'},
    {id: 'zigbee', name: 'Zigbee', range: 2, data: 1, power: 0, mobile: 1, note: '節點可接力延伸，但需要閘道器，也需要插電的路由節點。'},
    {id: 'wifi', name: 'Wi-Fi', range: 2, data: 3, power: 1, mobile: 1, note: '速率高，可直接上網；離開 AP 涵蓋範圍就斷線。距離靠多台 AP 延伸。'},
    {id: 'lorawan', name: 'LoRaWAN', range: 3, data: 1, power: 0, mobile: 1, note: '可自建閘道，不必付門號費；速率極低，公共頻段可能受干擾。'},
    {id: 'nbiot', name: 'NB-IoT', range: 3, data: 1, power: 0, mobile: 1, note: '走電信網路，室內覆蓋深；要 SIM 與資費，移動性有限。'},
    {id: 'cat1', name: 'LTE Cat.1', range: 3, data: 2, power: 1, mobile: 2, note: '中等資料量、會移動的設備常用，成本與耗電低於高速 LTE。'},
    {id: 'lte', name: '4G／5G', range: 3, data: 3, power: 1, mobile: 2, note: '遠又快，可傳影像；耗電與資費都較高。'},
  ];
  const WORDS = {
    range: ['碰觸距離', '同一個房間', '整棟或整個廠區', '數公里以上'],
    data: ['只要辨識編號', '偶爾幾筆讀值', '語音或小檔案', '連續影像'],
    power: ['電池撐數年', '可定期充電', '有插座'],
  };
  function rankWireless(need) {
    return TECHS.map(t => {
      const problems = [], cautions = [];
      if (t.range < need.range) problems.push('距離不夠');
      if (t.data < need.data) problems.push(t.data === 0 ? '只能回傳編號，傳不了讀值' : '速率不足');
      if (t.power > need.power) problems.push('太耗電，電池撐不久');
      if (need.mobile && t.mobile === 1) cautions.push('移動時連線受限');
      if (t.range - need.range >= 2) cautions.push('距離遠超需求，通常較貴');
      const spare = Math.max(0, t.range - need.range) + Math.max(0, t.data - need.data);
      const status = problems.length ? 'no' : cautions.length ? 'maybe' : 'ok';
      return Object.assign({}, t, {problems, cautions, status, spare});
    }).sort((a, b) => {
      const order = {ok: 0, maybe: 1, no: 2};
      return order[a.status] - order[b.status] || a.problems.length - b.problems.length || a.spare - b.spare || a.power - b.power;
    });
  }

  // ----- MQTT topic filter (MQTT 5.0 section 4.7) -----
  function checkFilter(filter) {
    if (!filter) return '訂閱條件不能是空的。';
    const levels = filter.split('/');
    for (let i = 0; i < levels.length; i++) {
      const l = levels[i];
      if (l.includes('#') && (l !== '#' || i !== levels.length - 1)) return '# 必須獨佔一層，而且只能放在最後。';
      if (l.includes('+') && l !== '+') return '+ 必須獨佔一層，例如 a/+/c，不能寫成 a/b+/c。';
    }
    return '';
  }
  function topicMatches(filter, topic) {
    if (checkFilter(filter)) return false;
    if (topic[0] === '$' && (filter[0] === '#' || filter[0] === '+')) return false;
    const f = filter.split('/'), t = topic.split('/');
    for (let i = 0; i < f.length; i++) {
      if (f[i] === '#') return true;
      if (i >= t.length) return false;
      if (f[i] !== '+' && f[i] !== t[i]) return false;
    }
    return f.length === t.length;
  }

  // ----- QoS exchange between one device and the broker -----
  // Each row: [direction, packet, lost?, note]. The device resends unacknowledged messages after reconnecting.
  function simulateQos(qos, fault) {
    const rows = [];
    let delivered = 0;
    const add = (dir, pkt, lost, note) => rows.push({dir, pkt, lost: !!lost, note: note || ''});
    if (qos === 0) {
      if (fault === 'message') add('out', 'PUBLISH', true, '途中遺失，裝置不會知道');
      else { add('out', 'PUBLISH', false, 'Broker 收到，轉給訂閱者'); delivered = 1; }
    } else if (qos === 1) {
      if (fault === 'message') {
        add('out', 'PUBLISH', true, '途中遺失');
        add('out', 'PUBLISH（重送）', false, '沒等到確認，重新連線後重送；Broker 這次才收到'); delivered = 1;
        add('in', 'PUBACK');
      } else if (fault === 'ack') {
        add('out', 'PUBLISH', false, 'Broker 收到，轉給訂閱者'); delivered++;
        add('in', 'PUBACK', true, '確認在途中遺失');
        add('out', 'PUBLISH（重送）', false, '裝置以為沒送到而重送；Broker 把它當新訊息再轉一次'); delivered++;
        add('in', 'PUBACK');
      } else {
        add('out', 'PUBLISH', false, 'Broker 收到，轉給訂閱者'); delivered = 1;
        add('in', 'PUBACK');
      }
    } else {
      if (fault === 'message') add('out', 'PUBLISH', true, '途中遺失');
      if (fault === 'ack') {
        add('out', 'PUBLISH', false, 'Broker 記下封包編號');
        add('in', 'PUBREC', true, '確認在途中遺失');
      }
      add('out', fault ? 'PUBLISH（重送）' : 'PUBLISH', false, fault === 'ack' ? '編號已記錄，Broker 不會再轉一次' : 'Broker 記下封包編號');
      add('in', 'PUBREC');
      add('out', 'PUBREL');
      add('in', 'PUBCOMP', false, '交換完成');
      delivered = 1;
    }
    return {rows, delivered, packets: rows.length};
  }

  const api = {TECHS, rankWireless, checkFilter, topicMatches, simulateQos};
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof document === 'undefined') return;

  // ----- DOM -----
  const {esc, $$, radios} = root.AIOTLab;

  function wirelessLab(el) {
    const PRESETS = [
      {name: '冷藏庫內的溫度探頭', need: {range: 1, data: 1, power: 0, mobile: 0}, say: '探頭靠電池、讀值很少，範圍在庫內。短距離低功耗技術就夠，資料再由庫內閘道器送上平台。'},
      {name: '貨箱進出倉盤點', need: {range: 1, data: 0, power: 0, mobile: 1}, say: '只要知道是哪一箱，不需要傳讀值。貼被動標籤最便宜，所以 RFID 最合適。'},
      {name: '全台跑的冷藏貨車（溫度＋位置）', need: {range: 3, data: 1, power: 1, mobile: 1}, say: '要跨縣市、一直移動，車上可充電。移動是關鍵條件，LTE 類比 LPWAN 更穩。'},
      {name: '車廂即時影像', need: {range: 3, data: 3, power: 1, mobile: 1}, say: '連續影像把低速技術全部排除，只剩高速行動網路。'},
      {name: '偏遠產地的田間感測器', need: {range: 3, data: 1, power: 0, mobile: 0}, say: 'LoRaWAN 和 NB-IoT 都符合。行動訊號不穩又能自建閘道就選 LoRaWAN；當地電信涵蓋好、不想維運就選 NB-IoT。'},
    ];
    let need = Object.assign({}, PRESETS[0].need), say = PRESETS[0].say, active = 0;
    el.innerHTML = '<h3>實驗：替需求選無線技術</h3><p class="small">選一個冷鏈情境，或自己調條件。看哪些技術被排除，以及原因。</p><div class="chips" role="group" aria-label="情境">' + PRESETS.map((p, i) => '<button type="button" data-p="' + i + '">' + esc(p.name) + '</button>').join('') + '</div><div class="lab-form"></div><p class="lab-say" aria-live="polite"></p><div class="lab-out"></div><p class="small muted">排序只看這四個條件，是選型的起點。實際還要看成本、當地涵蓋、法規與現場測試。</p>';
    const form = el.querySelector('.lab-form'), out = el.querySelector('.lab-out'), sayEl = el.querySelector('.lab-say');
    function drawForm() {
      form.innerHTML = radios('w-range', '要傳多遠？', WORDS.range, need.range) + radios('w-data', '資料多大？', WORDS.data, need.data) + radios('w-power', '電從哪來？', WORDS.power, need.power) + radios('w-mobile', '會不會移動？', ['固定不動', '一直移動'], need.mobile);
      $$('input', form).forEach(i => i.onchange = () => {
        need[i.name.slice(2)] = +i.value; active = -1; say = ''; draw();
      });
    }
    function draw() {
      $$('[data-p]', el).forEach((b, i) => b.setAttribute('aria-pressed', String(i === active)));
      sayEl.textContent = say; sayEl.hidden = !say;
      const r = rankWireless(need), label = {ok: '符合', maybe: '要留意', no: '排除'};
      out.innerHTML = '<ul class="rank">' + r.map(t => '<li class="' + t.status + '"><span class="st">' + label[t.status] + '</span><b>' + esc(t.name) + '</b><span class="why">' + esc(t.problems.concat(t.cautions).join('、') || t.note) + '</span></li>').join('') + '</ul>';
    }
    $$('[data-p]', el).forEach(b => b.onclick = () => { const p = PRESETS[+b.dataset.p]; need = Object.assign({}, p.need); say = p.say; active = +b.dataset.p; drawForm(); draw(); });
    drawForm(); draw();
  }

  function topicLab(el) {
    const TOPICS = ['coldchain/truck7/temp', 'coldchain/truck7/door', 'coldchain/truck9/temp', 'coldchain/room1/temp', 'coldchain/room1/freezer/temp', 'office/room1/temp'];
    const TASKS = [
      {q: '只收 7 號車的所有資料', want: ['coldchain/truck7/temp', 'coldchain/truck7/door'], a: 'coldchain/truck7/+'},
      {q: '收所有車輛和冷藏庫的溫度，但不含冷凍櫃與 office', want: ['coldchain/truck7/temp', 'coldchain/truck9/temp', 'coldchain/room1/temp'], a: 'coldchain/+/temp'},
      {q: '收冷鏈底下的全部資料', want: TOPICS.slice(0, 5), a: 'coldchain/#'},
    ];
    el.innerHTML = '<h3>實驗：寫一條訂閱條件</h3><p class="small">下面是裝置發布的六個 Topic。輸入訂閱條件，看 Broker 會轉哪些給你。<code>+</code> 代表一層，<code>#</code> 代表以下全部。</p><label class="lab-input" for="t-filter">訂閱條件<input id="t-filter" type="text" spellcheck="false" autocomplete="off" value="coldchain/truck7/temp"></label><p class="lab-err" role="alert" hidden></p><ul class="topics"></ul><div class="tasks"><b>挑戰</b>' + TASKS.map((t, i) => '<div class="task" data-t="' + i + '"><span class="mark" aria-hidden="true">○</span><span>' + esc(t.q) + '</span><button type="button" class="linkbtn">看答案</button></div>').join('') + '</div>';
    const input = el.querySelector('input'), err = el.querySelector('.lab-err'), list = el.querySelector('.topics');
    function draw() {
      const f = input.value.trim(), bad = checkFilter(f);
      err.textContent = bad; err.hidden = !bad;
      list.innerHTML = TOPICS.map(t => { const m = !bad && topicMatches(f, t); return '<li class="' + (m ? 'hit' : '') + '"><span class="tick">' + (m ? '收到' : '—') + '</span><code>' + esc(t) + '</code></li>'; }).join('');
      $$('.task', el).forEach((d, i) => {
        const got = bad ? [] : TOPICS.filter(t => topicMatches(f, t));
        const done = got.length === TASKS[i].want.length && TASKS[i].want.every(t => got.includes(t));
        d.classList.toggle('done', done); d.querySelector('.mark').textContent = done ? '✓' : '○';
      });
    }
    input.oninput = draw;
    $$('.task button', el).forEach((b, i) => b.onclick = () => { input.value = TASKS[i].a; draw(); });
    draw();
  }

  function qosLab(el) {
    const FAULTS = [['none', '一切順利'], ['message', '訊息在途中遺失'], ['ack', '確認在途中遺失']];
    let qos = 1, fault = 'ack', revealed = false;
    el.innerHTML = '<h3>實驗：網路出問題時，訂閱者會收到幾次？</h3><p class="small">選等級和狀況，先猜再看。這裡示範裝置到 Broker 這一段。</p><div class="lab-form">' + radios('q-level', 'QoS 等級', ['QoS 0', 'QoS 1', 'QoS 2'], qos) + radios('q-fault', '狀況', FAULTS.map(x => x[1]), 2) + '</div><div class="guess"><b>你猜訂閱者會收到幾次？</b><div class="row"><button type="button" class="btn ghost" data-g="0">0 次</button><button type="button" class="btn ghost" data-g="1">1 次</button><button type="button" class="btn ghost" data-g="2">2 次</button></div></div><div class="lab-out" aria-live="polite"></div>';
    const out = el.querySelector('.lab-out'), guess = el.querySelector('.guess');
    function draw(g) {
      guess.hidden = revealed;
      if (!revealed) { out.innerHTML = ''; return; }
      const r = simulateQos(qos, fault);
      const verdict = g == null ? '' : (+g === r.delivered ? '猜對了。' : '不是 ' + g + ' 次。');
      let lesson = '';
      if (r.delivered === 0) lesson = 'QoS 0 送了就不管，遺失就是遺失。';
      else if (r.delivered === 2) lesson = '這就是「至少一次」：不會漏，但可能重複。接收端要能去重，例如比對事件編號。';
      else if (qos === 2) lesson = '代價是封包數最多。而且恰好一次只限協定交換，寫入資料庫時的去重仍要自己設計。';
      else if (qos === 1 && fault === 'message') lesson = '重送救回了遺失的訊息。';
      else if (qos === 0) lesson = fault === 'ack' ? 'QoS 0 沒有確認封包，所以沒有確認可以遺失。' : '網路順利時 QoS 0 最省，適合下一筆很快會來的讀值。';
      else lesson = '順利時只多一個確認封包。';
      out.innerHTML = '<div class="lanes"><div class="lane-h"><span>裝置</span><span>Broker</span></div>' + r.rows.map(x => '<div class="lane ' + x.dir + (x.lost ? ' lost' : '') + '"><span class="pkt">' + esc(x.pkt) + (x.lost ? ' ✕' : '') + '</span><span class="note">' + esc(x.note) + '</span></div>').join('') + '</div><p class="lab-say"><b>' + verdict + '訂閱者收到 ' + r.delivered + ' 次，來回 ' + r.packets + ' 個封包。</b>' + esc(lesson) + '</p><button type="button" class="linkbtn" data-again>換一組再猜</button>';
      const again = out.querySelector('[data-again]');
      if (again) again.onclick = () => { revealed = false; draw(); };
    }
    $$('input', el).forEach(i => i.onchange = () => {
      if (i.name === 'q-level') qos = +i.value; else fault = FAULTS[+i.value][0];
      revealed = false; draw();
    });
    $$('[data-g]', el).forEach(b => b.onclick = () => { revealed = true; draw(b.dataset.g); });
    draw();
  }

  root.AIOTLab.register('wireless', wirelessLab);
  root.AIOTLab.register('topic', topicLab);
  root.AIOTLab.register('qos', qosLab);
})(this);
