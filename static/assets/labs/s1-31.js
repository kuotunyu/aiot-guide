/* Labs for 3.1: pure logic is exported for tests; the DOM part runs only in a browser. */
(function (root) {
  'use strict';

  // ----- accuracy vs precision -----
  const TRUE_TEMP = 4.0; // degC, what the reference thermometer says
  const SHOT_COUNT = 12;
  const LIMIT = 0.5; // degC, the lab's own line between "good" and "not good"; for illustration only

  // Fixed pseudo-random sequence (mulberry32 + Box-Muller): same settings always give the same shots.
  function makeShots(seed, n) {
    let a = seed >>> 0;
    const next = () => {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    const shots = [];
    for (let i = 0; i < n; i++) {
      const r = Math.sqrt(-2 * Math.log(1 - next())), th = 2 * Math.PI * next();
      shots.push({zx: r * Math.cos(th), zy: r * Math.sin(th)});
    }
    return shots;
  }
  const SHOTS = makeShots(3131, SHOT_COUNT);

  // Round to the display step; the extra rounding removes binary noise such as 6.300000000000001.
  function quantize(v, step) { return +(Math.round(v / step) * step).toFixed(6); }
  function readings(bias, spread, step) { return SHOTS.map(s => quantize(TRUE_TEMP + bias + spread * s.zx, step)); }
  function stats(values, truth) {
    const n = values.length, mean = values.reduce((a, b) => a + b, 0) / n;
    const sd = n > 1 ? Math.sqrt(values.reduce((a, v) => a + (v - mean) * (v - mean), 0) / (n - 1)) : 0;
    return {mean, error: mean - truth, sd};
  }
  function judge(error, sd) {
    const accurate = Math.abs(error) < LIMIT, precise = sd < LIMIT;
    return {accurate, precise, label: accurate ? (precise ? '又準又精' : '準但不精') : (precise ? '精但不準' : '不準也不精')};
  }

  // ----- Pt100, linear approximation -----
  const STD_ALPHA = 0.00385;
  function pt100R(t, alpha) { return 100 * (1 + alpha * t); }
  function pt100T(r, alpha) { return (r / 100 - 1) / alpha; }

  // ----- Type K thermocouple: NIST ITS-90 reference values (reference junction at 0 degC), interpolated -----
  const K_TABLE = [[-100, -3.554], [-90, -3.243], [-80, -2.920], [-70, -2.587], [-60, -2.243], [-50, -1.889], [-40, -1.527], [-30, -1.156], [-20, -0.778], [-10, -0.392], [0, 0], [10, 0.397], [20, 0.798], [25, 1.000], [30, 1.203], [40, 1.612], [50, 2.023], [60, 2.436], [70, 2.851], [80, 3.267], [90, 3.682], [100, 4.096], [110, 4.509], [120, 4.920], [130, 5.328], [140, 5.735], [150, 6.138], [160, 6.540], [170, 6.941], [180, 7.340], [190, 7.739], [200, 8.138]];
  function interp(x, xi, yi) {
    let i = 1;
    while (i < K_TABLE.length - 1 && x > K_TABLE[i][xi]) i++;
    const p = K_TABLE[i - 1], q = K_TABLE[i];
    return p[yi] + (x - p[xi]) * (q[yi] - p[yi]) / (q[xi] - p[xi]);
  }
  function kMv(t) { return interp(t, 0, 1); }
  function kTemp(mv) { return interp(mv, 1, 0); }
  function thermocouple(hot, ref) {
    const measured = kMv(hot) - kMv(ref), none = kTemp(measured);
    return {measured, refMv: kMv(ref), sum: measured + kMv(ref), none, addTemp: none + ref, compensated: kTemp(measured + kMv(ref))};
  }

  // Verdicts for the three ways of reading the table. With the reference at 0 degC no compensation is needed,
  // and the "add to temperature" shortcut can match by coincidence (for example hot = ref), so the wording must follow the numbers.
  function tcVerdicts(hot, ref) {
    const c = thermocouple(hot, ref), one = v => (v < 0 ? '−' : '') + Math.abs(v).toFixed(1);
    const noComp = ref === 0
      ? {cls: 'ok', st: '不必補', how: '不補償', why: '參考端正好 0°C，符合查表的假設，直接查表就是 ' + one(c.none) + '°C'}
      : {cls: 'no', st: '錯誤', how: '不補償', why: '直接查表，讀成 ' + one(c.none) + '°C'};
    const addTemp = Math.abs(c.addTemp - c.compensated) < 0.05
      ? {cls: 'maybe', st: '碰巧相同', how: '加在溫度上', why: '查表後加參考端溫度，得 ' + one(c.addTemp) + '°C。這組溫度剛好沒差，換一組就會有落差，因為曲線不是直線'}
      : {cls: 'maybe', st: '有落差', how: '加在溫度上', why: '查表後加參考端溫度，得 ' + one(c.addTemp) + '°C。曲線不是直線，所以不準'};
    const volt = {cls: 'ok', st: '正確', how: '加在電壓上', why: '電壓補償後查表，得 ' + one(c.compensated) + '°C，與待測物相符'};
    return [noComp, addTemp, volt];
  }

  const api = {TRUE_TEMP, SHOTS, LIMIT, STD_ALPHA, makeShots, quantize, readings, stats, judge, pt100R, pt100T, kMv, kTemp, thermocouple, tcVerdicts};
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof document === 'undefined') return;

  // ----- DOM -----
  const {esc, $$, radios, slider} = root.AIOTLab;
  const signed = (v, d) => (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(v).toFixed(d);
  const num = (v, d) => (v < 0 ? '−' : '') + Math.abs(v).toFixed(d);

  function targetLab(el) {
    const STEPS = [0.01, 0.1, 1];
    const PRESETS = [
      {name: '又準又精', bias: 0, spread: 0.2},
      {name: '精但不準', bias: 2, spread: 0.2},
      {name: '準但不精', bias: 0, spread: 1.2},
      {name: '不準也不精', bias: 2.5, spread: 1.2},
    ];
    const FIX = {
      '又準又精': '這支探頭可以直接用，之後定期校正確認就好。',
      '精但不準': '讀值很穩卻整體偏掉，屬於系統誤差，靠校正修正。',
      '準但不精': '平均接近真值，單次讀值卻不可靠，屬於隨機誤差，靠多次量測取平均或濾波降低。',
      '不準也不精': '兩種誤差都有：先處理雜訊讓讀值穩定，再校正偏差。',
    };
    let bias = 2, spread = 0.2, stepIdx = 1;
    el.innerHTML = '<h3>實驗：探頭打靶</h3><p class="small">冷藏庫實際是 4.0°C，探頭連讀 12 次。調整偏差與分散，看統計值怎麼變；再改解析度，看哪些事情沒有變。</p>'
      + '<div class="chips" role="group" aria-label="四種組合">' + PRESETS.map((p, i) => '<button type="button" data-p="' + i + '">' + esc(p.name) + '</button>').join('') + '</div>'
      + slider('s131-bias', '偏差', -3, 3, 0.1, 2, '°C') + slider('s131-spread', '分散', 0, 1.5, 0.1, '0.2', '°C')
      + '<div class="lab-form">' + radios('s131-step', '解析度（最小刻度）', STEPS.map(s => s + '°C'), stepIdx) + '</div>'
      + '<div class="lab-viz"></div><p class="lab-say" aria-live="polite"></p><p class="small tb-list"></p>'
      + '<p class="small muted">點位是固定的偽隨機序列，相同設定結果相同；只有 12 筆，所以統計值與滑桿會略有差距。統計只用橫向的讀值，直向散開只是為了像打靶。準與精的分界 0.5°C 是本實驗自訂的，實務要看規格需求。</p>';
    const bi = el.querySelector('#s131-bias'), sp = el.querySelector('#s131-spread');
    const viz = el.querySelector('.lab-viz'), say = el.querySelector('.lab-say'), list = el.querySelector('.tb-list');
    const X0 = 200, Y0 = 118, PX = 25; // reading axis: 25 px per degC, centred on the true value
    function draw() {
      bi.value = bias; sp.value = spread;
      bi.parentElement.querySelector('output').textContent = signed(bias, 1) + '°C';
      sp.parentElement.querySelector('output').textContent = spread.toFixed(1) + '°C';
      const step = STEPS[stepIdx], vals = readings(bias, spread, step), s = stats(vals, TRUE_TEMP), j = judge(s.error, s.sd);
      const digits = step === 0.01 ? 2 : step === 0.1 ? 1 : 0;
      const dots = vals.map((v, i) => {
        const x = X0 + (v - TRUE_TEMP) * PX, y = Math.max(8, Math.min(228, Y0 + spread * SHOTS[i].zy * PX));
        return '<circle cx="' + x.toFixed(1) + '" cy="' + y.toFixed(1) + '" r="5" class="bad"/>';
      }).join('');
      const mx = X0 + s.error * PX;
      const ticks = [0, 2, 4, 6, 8].map(t => { const x = X0 + (t - TRUE_TEMP) * PX; return '<line x1="' + x + '" y1="238" x2="' + x + '" y2="244" class="ln"/><text x="' + x + '" y="260" class="ts tc">' + t + '</text>'; }).join('');
      viz.innerHTML = '<svg viewBox="0 0 400 290" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="打靶圖：靶心是真值 4.0 度，點越靠中心越準，越集中越精">'
        + '<circle cx="' + X0 + '" cy="' + Y0 + '" r="100" class="box"/><circle cx="' + X0 + '" cy="' + Y0 + '" r="50" class="box"/><circle cx="' + X0 + '" cy="' + Y0 + '" r="12.5" class="acc"/>'
        + dots + '<line x1="' + mx.toFixed(1) + '" y1="8" x2="' + mx.toFixed(1) + '" y2="238" class="la dash"/>'
        + '<line x1="0" y1="238" x2="400" y2="238" class="ln"/>' + ticks + '<text x="200" y="282" class="ts tc">讀值（°C）；虛線是平均讀值，靶心是真值</text></svg>';
      let extra = FIX[j.label], label = j.label;
      if (step === 1 && s.sd === 0 && spread > 0) { label = '看起來' + label; extra = '注意：標準差變成 0 不是探頭變穩，而是 1°C 的刻度太粗，把差異藏起來了。'; }
      else if (step === 0.01) extra += ' 解析度調到 0.01°C 只是多了位數，不會減少偏差與分散。';
      say.innerHTML = '<b>' + esc(label) + '。</b>平均讀值 ' + num(s.mean, 2) + '°C，平均誤差 ' + signed(s.error, 2) + '°C，標準差 ' + s.sd.toFixed(2) + '°C。' + esc(extra);
      list.textContent = '12 筆讀值：' + vals.map(v => num(v, digits)).join('、');
      $$('[data-p]', el).forEach((b, i) => b.setAttribute('aria-pressed', String(PRESETS[i].bias === bias && PRESETS[i].spread === spread)));
    }
    bi.oninput = () => { bias = +bi.value; draw(); };
    sp.oninput = () => { spread = +sp.value; draw(); };
    $$('[name="s131-step"]', el).forEach(i => i.onchange = () => { stepIdx = +i.value; draw(); });
    $$('[data-p]', el).forEach(b => b.onclick = () => { const p = PRESETS[+b.dataset.p]; bias = p.bias; spread = p.spread; draw(); });
    draw();
  }

  function tempLab(el) {
    let mode = 0, alpha = 0.004, temp = 100, hot = 100, ref = 25;
    el.innerHTML = '<h3>實驗：算一算溫度感測器</h3><p class="small">看公式算出什麼，以及少了一步會差多少。</p><div class="lab-form">' + radios('s131-mode', '感測器', ['Pt100', 'K 型熱電偶'], mode) + '</div><div class="temp-body"></div>';
    const body = el.querySelector('.temp-body');
    function bind(id, fn) { const i = el.querySelector('#' + id); i.oninput = () => { fn(+i.value); update(); }; }
    function setOut(id, text) { el.querySelector('#' + id).parentElement.querySelector('output').textContent = text; }

    function build() {
      if (mode === 0) {
        body.innerHTML = slider('s131-alpha', '電阻溫度係數 α', 0.0035, 0.0045, 0.00005, alpha.toFixed(5), '/°C') + slider('s131-t', '溫度 T', -50, 150, 5, temp, '°C') + '<div class="lab-viz"></div><p class="lab-say" aria-live="polite"></p><p class="small muted">用線性近似 R＝100(1＋αT)，是簡化模型；標準 Pt100 的實際曲線略彎，精確換算要用標準的查表或方程式。</p>';
        bind('s131-alpha', v => { alpha = v; }); bind('s131-t', v => { temp = v; });
      } else {
        body.innerHTML = slider('s131-hot', '量測端（待測物）溫度', -40, 200, 5, hot, '°C') + slider('s131-ref', '參考端（儀表）溫度', 0, 40, 1, ref, '°C') + '<p class="lab-say" aria-live="polite"></p><ul class="rank"></ul><p class="small muted">電壓與查表值來自 NIST 的 K 型參考表，表列點之間用直線內插，是簡化做法。</p>';
        bind('s131-hot', v => { hot = v; }); bind('s131-ref', v => { ref = v; });
      }
      update();
    }

    function update() {
      if (mode === 0) updatePt100(); else updateThermocouple();
    }

    function updatePt100() {
      setOut('s131-alpha', alpha.toFixed(5) + '/°C'); setOut('s131-t', temp + '°C');
      const r = pt100R(temp, alpha), rs = pt100R(temp, STD_ALPHA), misread = pt100T(r, STD_ALPHA);
      const X = t => 60 + (t + 50) * 1.6, Y = v => 200 - (v - 70) * 1.8;
      const ends = a => 'x1="' + X(-50) + '" y1="' + Y(pt100R(-50, a)).toFixed(1) + '" x2="' + X(150) + '" y2="' + Y(pt100R(150, a)).toFixed(1) + '"';
      const ticksX = [-50, 0, 50, 100, 150].map(t => '<line x1="' + X(t) + '" y1="200" x2="' + X(t) + '" y2="206" class="ln"/><text x="' + X(t) + '" y="222" class="ts tc">' + t + '</text>').join('');
      const ticksY = [80, 100, 120, 140, 160].map(v => '<line x1="54" y1="' + Y(v) + '" x2="60" y2="' + Y(v) + '" class="ln"/><text x="50" y="' + (Y(v) + 4) + '" class="ts" text-anchor="end">' + v + '</text>').join('');
      el.querySelector('.lab-viz').innerHTML = '<svg viewBox="0 0 400 270" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Pt100 電阻與溫度的直線：選定係數與標準係數 0.00385 比較">'
        + '<line x1="60" y1="200" x2="380" y2="200" class="ln"/><line x1="60" y1="200" x2="60" y2="20" class="ln"/>' + ticksX + ticksY
        + '<text x="10" y="17" class="ts">電阻（Ω）</text><text x="220" y="240" class="ts tc">溫度（°C）</text>'
        + '<line ' + ends(STD_ALPHA) + ' class="ln dash"/><line ' + ends(alpha) + ' class="la"/>'
        + '<circle cx="' + X(temp) + '" cy="' + Y(rs).toFixed(1) + '" r="5" class="box"/><circle cx="' + X(temp) + '" cy="' + Y(r).toFixed(1) + '" r="6" class="acc"/>'
        + '<text x="200" y="262" class="ts tc">實線：選定的 α；虛線：標準 0.00385</text></svg>';
      const same = Math.abs(alpha - STD_ALPHA) < 1e-9;
      const calc = '100×(1＋' + alpha.toFixed(5) + '×' + num(temp, 0) + ')＝<b>' + r.toFixed(2) + ' Ω</b>。';
      const cmp = temp === 0
        ? '0°C 時 α 不影響結果，都是 100 Ω。'
        : same
        ? '這就是工業標準係數，兩條線重合。'
        : '用標準 0.00385 算是 ' + rs.toFixed(2) + ' Ω，相差 ' + Math.abs(r - rs).toFixed(2) + ' Ω。如果感測器的 α 是這個值，平台卻用 0.00385 反推，' + num(temp, 0) + '°C 會被讀成 ' + num(misread, 2) + '°C。';
      el.querySelector('.lab-say').innerHTML = calc + esc(cmp);
    }

    function updateThermocouple() {
      setOut('s131-hot', hot + '°C'); setOut('s131-ref', ref + '°C');
      const c = thermocouple(hot, ref), f = v => num(v, 3);
      el.querySelector('.lab-say').innerHTML = '熱電偶輸出 <b>' + f(c.measured) + ' mV</b>，它只反映量測端與參考端的溫差。參考端 ' + ref + '°C 對應 ' + f(c.refMv) + ' mV，補回去得 ' + f(c.sum) + ' mV，再查表。';
      el.querySelector('.rank').innerHTML = tcVerdicts(hot, ref).map(x => '<li class="' + x.cls + '"><span class="st">' + esc(x.st) + '</span><b>' + esc(x.how) + '</b><span class="why">' + esc(x.why) + '</span></li>').join('');
    }

    $$('[name="s131-mode"]', el).forEach(i => i.onchange = () => { mode = +i.value; build(); });
    build();
  }

  root.AIOTLab.register('s1-31-target', targetLab);
  root.AIOTLab.register('s1-31-temp', tempLab);
})(this);
