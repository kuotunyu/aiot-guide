/* Lab for 2.3: the same compressor reading via Modbus (bare register) and OPC UA (self-describing node).
   Pure logic is exported for tests; the DOM part runs only in a browser. */
(function (root) {
  'use strict';

  // The physical truth is the same for both brands. Register maps are invented for this lab.
  const POINTS = {
    room: {name: '機房溫度', browse: 'RoomTemp', value: 25.3, unit: '°C', dataType: 'Float', write: false},
    freezer: {name: '冷凍櫃庫內溫度', browse: 'FreezerTemp', value: -18.5, unit: '°C', dataType: 'Float', write: false},
    speed: {name: '壓縮機轉速', browse: 'CompressorSpeed', value: 1450, unit: 'rpm', dataType: 'UInt16', write: false},
    pressure: {name: '排氣壓力', browse: 'DischargePressure', value: 18.2, unit: 'bar', dataType: 'Float', write: false},
    setpoint: {name: '溫度設定值', browse: 'TempSetpoint', value: -20, unit: '°C', dataType: 'Float', write: true},
  };
  const POINT_ORDER = ['room', 'freezer', 'speed', 'pressure', 'setpoint'];
  // Register map: point, stored number (unsigned wire value), scale, and how the vendor documents the type.
  const BRANDS = {
    A: {label: '廠牌 A', map: {
      40001: {point: 'room', raw: 253, scale: 0.1, type: 'INT16'},
      40002: {point: 'freezer', raw: 65351, scale: 0.1, type: 'INT16'},
      40003: {point: 'speed', raw: 1450, scale: 1, type: 'UINT16'},
      40004: {point: 'pressure', raw: 1820, scale: 0.01, type: 'UINT16'},
      40005: {point: 'setpoint', raw: 65336, scale: 0.1, type: 'INT16'},
    }},
    B: {label: '廠牌 B', map: {
      40001: {point: 'speed', raw: 1450, scale: 1, type: 'UINT16'},
      40002: {point: 'setpoint', raw: 63536, scale: 0.01, type: 'INT16'},
      40003: {point: 'room', raw: 2530, scale: 0.01, type: 'INT16'},
      40004: {point: 'freezer', raw: 63686, scale: 0.01, type: 'INT16'},
      40005: {point: 'pressure', raw: 182, scale: 0.1, type: 'UINT16'},
    }},
  };
  const ADDRESSES = [40001, 40002, 40003, 40004, 40005];
  const SCALES = [1, 0.1, 0.01];
  const TYPES = ['UINT16', 'INT16'];

  const toSigned = raw => (raw >= 32768 ? raw - 65536 : raw);
  // Round away binary floating-point noise such as 253 * 0.1 = 25.3000000000000004.
  function decode(raw, type, scale) {
    return Number(((type === 'INT16' ? toSigned(raw) : raw) * scale).toFixed(2));
  }
  // 40001 is a conventional label: function code 03 selects the table, the PDU carries a zero-based offset.
  const pduOffset = ref => ref - 40001;
  const hex16 = n => {
    const h = n.toString(16).toUpperCase().padStart(4, '0');
    return h.slice(0, 2) + ' ' + h.slice(2);
  };
  const requestPdu = ref => '03 ' + hex16(pduOffset(ref)) + ' 00 01';
  const responsePdu = raw => '03 02 ' + hex16(raw);

  function judge(brand, ref, type, scale) {
    const e = BRANDS[brand].map[ref], truth = POINTS[e.point];
    const got = decode(e.raw, type, scale);
    const problems = [];
    if (decode(e.raw, type, e.scale) !== truth.value) problems.push('type');
    if (scale !== e.scale) problems.push('scale');
    return {got, truth, entry: e, ok: got === truth.value, problems};
  }
  // NodeIds differ per server; the browse name and metadata come from the shared type.
  function nodeOf(brand, key) {
    const p = POINTS[key];
    const id = brand === 'A' ? 'ns=2;s=Comp01.' + p.browse : 'ns=3;i=' + (1001 + POINT_ORDER.indexOf(key));
    return Object.assign({nodeId: id}, p);
  }

  const api = {POINTS, POINT_ORDER, BRANDS, ADDRESSES, SCALES, toSigned, decode, pduOffset, requestPdu, responsePdu, judge, nodeOf};
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof document === 'undefined') return;

  // ----- DOM -----
  const {esc, $$, radios} = root.AIOTLab;
  const num = v => String(v).replace('-', '−');

  function modelLab(el) {
    const TASKS = [
      {q: '廠牌 A，用 Modbus 讀出冷凍櫃庫內溫度 −18.5 °C', done: s => s.brand === 'A' && isFreezer(s), a: {brand: 'A', ref: 40002, scale: 0.1, type: 'INT16', table: true}},
      {q: '換成廠牌 B，用 Modbus 讀出同一個溫度', done: s => s.brand === 'B' && isFreezer(s), a: {brand: 'B', ref: 40004, scale: 0.01, type: 'INT16', table: true}},
      {q: '用 OPC UA 點開同一個溫度，再切換廠牌，看哪些欄位沒變', done: s => s.node === 'freezer', a: {node: 'freezer'}},
    ];
    const isFreezer = s => {
      const r = judge(s.brand, s.ref, s.type, s.scale);
      return r.entry.point === 'freezer' && r.ok;
    };
    const s = {brand: 'A', ref: 40001, scale: 1, type: 'UINT16', table: false, node: 'room'};
    const reached = TASKS.map(() => false);

    el.innerHTML = '<h3>實驗：同一台壓縮機，兩種讀法</h3><p class="small">先只看 Modbus 收到什麼，再打開對照表，改比例因子與型別解出真值。接著在 OPC UA 瀏覽同一筆資料。</p>' +
      '<div class="lab-form"><div class="lab-brand"></div></div>' +
      '<div class="lab-form"><div><h4>Modbus：讀暫存器</h4><div class="chips" role="group" aria-label="暫存器位址">' + ADDRESSES.map(a => '<button type="button" data-a="' + a + '">' + a + '</button>').join('') + '</div><div class="m-wire"></div><div class="m-form"></div><p class="lab-say m-out" aria-live="polite"></p><div class="m-table"></div></div>' +
      '<div><h4>OPC UA：瀏覽節點</h4><p class="small">Objects ▸ Compressor01（物件）</p><div class="chips" role="group" aria-label="變數節點">' + POINT_ORDER.map(k => '<button type="button" data-n="' + k + '">' + esc(POINTS[k].browse) + '</button>').join('') + '</div><div class="o-out" aria-live="polite"></div></div></div>' +
      '<div class="tasks"><b>挑戰</b>' + TASKS.map((t, i) => '<div class="task" data-t="' + i + '"><span class="mark" aria-hidden="true">○</span><span>' + esc(t.q) + '</span><button type="button" class="linkbtn">看答案</button></div>').join('') + '</div>' +
      '<p class="small muted">對照表與節點內容都是本站虛構的簡化例子，只讀單一暫存器。真實設備的編號要查原廠文件；節點有沒有單位，要看 Server 怎麼建模。這裡假設兩家 Server 採用同一套型別定義，所以名稱相同；NodeId 仍可能不同。</p>';

    const brandEl = el.querySelector('.lab-brand'), wire = el.querySelector('.m-wire'), form = el.querySelector('.m-form');
    const mOut = el.querySelector('.m-out'), mTable = el.querySelector('.m-table'), oOut = el.querySelector('.o-out');
    const row = (cls, st, k, v) => '<li class="' + cls + '"><span class="st">' + esc(st) + '</span><b>' + esc(k) + '</b><span class="why">' + v + '</span></li>';

    function drawForm() {
      brandEl.innerHTML = radios('m-brand', '壓縮機廠牌', ['廠牌 A', '廠牌 B'], s.brand === 'A' ? 0 : 1);
      form.innerHTML = radios('m-scale', '比例因子', SCALES.map(x => '×' + x), SCALES.indexOf(s.scale)) + radios('m-type', '解讀型別', ['UINT16 無號', 'INT16 有號'], TYPES.indexOf(s.type)) + radios('m-table', '廠商對照表', ['不看', '打開'], s.table ? 1 : 0);
      $$('input', el).forEach(i => i.onchange = () => {
        const v = +i.value;
        if (i.name === 'm-brand') s.brand = v ? 'B' : 'A';
        if (i.name === 'm-scale') s.scale = SCALES[v];
        if (i.name === 'm-type') s.type = TYPES[v];
        if (i.name === 'm-table') s.table = !!v;
        draw();
      });
    }
    function draw() {
      $$('[data-a]', el).forEach(b => b.setAttribute('aria-pressed', String(+b.dataset.a === s.ref)));
      $$('[data-n]', el).forEach(b => b.setAttribute('aria-pressed', String(b.dataset.n === s.node)));
      const r = judge(s.brand, s.ref, s.type, s.scale), e = r.entry;
      wire.innerHTML = '<ul class="rank">' +
        row('ok', '送出', '請求 PDU', '<code>' + requestPdu(s.ref) + '</code><br>功能碼 03，偏移量 ' + pduOffset(s.ref) + '（' + s.ref + ' 是慣用標示）') +
        row('ok', '收到', '回應 PDU', '<code>' + responsePdu(e.raw) + '</code>') +
        row('ok', '收到', '暫存器值', '<b>' + e.raw + '</b>') +
        row('no', '沒有', '名稱', '封包裡沒有') + row('no', '沒有', '單位', '封包裡沒有') + row('no', '沒有', '比例、型別', '封包裡沒有') + '</ul>';
      const shown = num(r.got);
      if (!s.table) {
        mOut.innerHTML = '<b>算出 ' + shown + '。</b>通訊沒有回報任何錯誤，但封包沒說這個數字是什麼。打開對照表才能判斷。';
        mTable.innerHTML = '';
      } else {
        let msg;
        if (r.ok) msg = '<b>' + esc(POINTS[e.point].name) + '＝' + shown + ' ' + esc(r.truth.unit) + '，正確。</b>';
        else {
          const why = [];
          if (r.problems.includes('type')) why.push('型別錯：' + e.raw + ' 的最高位元是 1，INT16 要減 65536');
          if (r.problems.includes('scale')) why.push('比例錯：對照表寫 ×' + e.scale);
          msg = '<b>算出 ' + shown + '，實際是 ' + num(r.truth.value) + ' ' + esc(r.truth.unit) + '。</b>' + esc(why.join('；')) + '。協定不會替你發現這種錯。';
        }
        mOut.innerHTML = msg;
        mTable.innerHTML = '<table><thead><tr><th>位址</th><th>名稱</th><th>比例</th><th>型別</th></tr></thead><tbody>' + ADDRESSES.map(a => {
          const x = BRANDS[s.brand].map[a], p = POINTS[x.point];
          return '<tr><td>' + (a === s.ref ? '<b>' + a + '</b>' : a) + '</td><td>' + esc(p.name) + '（' + esc(p.unit) + '）</td><td>×' + x.scale + '</td><td>' + x.type + '</td></tr>';
        }).join('') + '</tbody></table>';
      }
      const n = nodeOf(s.brand, s.node);
      oOut.innerHTML = '<ul class="rank">' +
        row('ok', '節點', '名稱', esc(n.name) + '（DisplayName）') +
        row('ok', '節點', '值', '<b>' + num(n.value) + '</b>（已是工程值，不必換算）') +
        row('ok', '節點', '單位', esc(n.unit) + '（EngineeringUnits）') +
        row('ok', '節點', '型別', esc(n.dataType) + '（DataType）') +
        row('ok', '節點', '存取', (n.write ? '可讀可寫' : '唯讀') + '（AccessLevel）') +
        row('ok', '節點', '狀態', 'Good（StatusCode）') +
        row('maybe', '定位', 'NodeId', '<code>' + esc(n.nodeId) + '</code>') + '</ul><p class="lab-say">' + esc(BRANDS[s.brand].label) + '：比例因子對這裡沒有作用，換算在 Server 端做完了。</p>';
      $$('.task', el).forEach((d, i) => {
        // Tasks 1 and 2 need different brands, so a finished task stays ticked.
        const done = reached[i] = reached[i] || TASKS[i].done(s);
        d.classList.toggle('done', done); d.querySelector('.mark').textContent = done ? '✓' : '○';
      });
    }
    $$('[data-a]', el).forEach(b => b.onclick = () => { s.ref = +b.dataset.a; draw(); });
    $$('[data-n]', el).forEach(b => b.onclick = () => { s.node = b.dataset.n; draw(); });
    $$('.task button', el).forEach((b, i) => b.onclick = () => { Object.assign(s, TASKS[i].a); drawForm(); draw(); });
    drawForm(); draw();
  }

  root.AIOTLab.register('s1-23-model', modelLab);
})(this);
