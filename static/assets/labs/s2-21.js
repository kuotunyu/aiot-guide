/* Labs for s2-21: pure logic is exported for tests; the DOM part runs only in a browser. */
(function (root) {
  'use strict';

  // ----- input pin: pull-up / pull-down / floating -----
  // Floating means the same wiring as pull-up (button to GND) with the resistor left out.
  function pinState(mode, pressed) {
    if (mode === 'pullup') {
      return pressed
        ? {level: 'LOW', top: 'resistor', bottom: 'button', hotTop: true, hotBottom: true, say: '按下時腳位經按鈕直通 GND，讀到 LOW。電阻限制了從電源流到 GND 的電流（3.3V÷10kΩ≈0.33mA），所以不會短路。這是負向邏輯：按下＝LOW。'}
        : {level: 'HIGH', top: 'resistor', bottom: 'button', hotTop: true, hotBottom: false, say: '放開時按鈕斷開，上拉電阻把腳位拉到電源，讀到 HIGH。'};
    }
    if (mode === 'pulldown') {
      return pressed
        ? {level: 'HIGH', top: 'button', bottom: 'resistor', hotTop: true, hotBottom: true, say: '按下時腳位經按鈕直通電源，讀到 HIGH。電阻限制了流到 GND 的電流（3.3V÷10kΩ≈0.33mA），所以不會短路。這是正向邏輯：按下＝HIGH。'}
        : {level: 'LOW', top: 'button', bottom: 'resistor', hotTop: false, hotBottom: true, say: '放開時按鈕斷開，下拉電阻把腳位拉到 GND，讀到 LOW。'};
    }
    return pressed
      ? {level: 'LOW', top: 'none', bottom: 'button', hotTop: false, hotBottom: true, say: '按下時腳位經按鈕接到 GND，讀到 LOW，看起來完全正常，所以這種接線錯誤不容易發現。'}
      : {level: 'UNKNOWN', top: 'none', bottom: 'button', hotTop: false, hotBottom: false, say: '放開時腳位沒接到任何固定電位，讀值會受雜訊影響而跳動。這就是浮接。切到上拉或下拉就能解決。'};
  }
  function sampleReads(level, n, rng) {
    const r = rng || Math.random, out = [];
    for (let i = 0; i < n; i++) out.push(level === 'HIGH' ? 1 : level === 'LOW' ? 0 : r() < 0.5 ? 1 : 0);
    return out;
  }

  // ----- battery life: ideal estimate, ignores ageing, temperature and regulator losses -----
  function batteryEstimate(o) {
    const active = Math.min(o.activeSec, o.intervalSec);
    const sleep = o.intervalSec - active;
    const workCharge = o.activeMa * active;
    const sleepCharge = (o.sleepUa / 1000) * sleep;
    const total = workCharge + sleepCharge;
    const avgMa = total / o.intervalSec;
    const hours = avgMa > 0 ? o.capacityMah / avgMa : Infinity;
    return {
      avgMa, hours,
      days: hours / 24,
      workShare: total > 0 ? workCharge / total : 0,
      sleepShare: total > 0 ? sleepCharge / total : 0,
      // However long the interval gets, the sleep current alone sets this ceiling.
      maxDays: o.sleepUa > 0 ? o.capacityMah / (o.sleepUa / 1000) / 24 : Infinity,
      halfCapacityDays: hours / 2 / 24,
    };
  }
  function batteryAdvice(est) {
    if (est.workShare >= 0.8) return '工作時段吃掉大部分電量：拉長回報間隔、縮短每次工作時間，效果最明顯。';
    if (est.sleepShare >= 0.5) return '休眠已占一半以上：再拉長間隔的效果會變小，應該改選休眠電流更低的設計。';
    return '工作與休眠都占不小的比例：兩邊都值得調整。';
  }
  function formatDays(d) {
    if (!isFinite(d)) return '無上限';
    if (d >= 730) return Math.round(d) + ' 天（約 ' + (d / 365).toFixed(1) + ' 年）';
    if (d >= 10) return Math.round(d) + ' 天';
    return d.toFixed(1) + ' 天';
  }

  // Lab settings: active mA, sleep µA, seconds awake, report interval in minutes, capacity mAh.
  // PRESETS[0] is the chapter's example; the other two answer "12 times the interval, 12 times the life?".
  const BATTERY_PRESETS = [
    {name: '本節的例子（5 分鐘）', v: {active: 80, sleep: 100, sec: 5, min: 5, cap: 2000}},
    {name: '間隔拉到 1 小時', v: {active: 80, sleep: 100, sec: 5, min: 60, cap: 2000}},
    {name: '1 小時＋休眠降到 10 µA', v: {active: 80, sleep: 10, sec: 5, min: 60, cap: 2000}},
  ];
  function labEstimate(v) {
    return batteryEstimate({activeMa: v.active, sleepUa: v.sleep, activeSec: v.sec, intervalSec: v.min * 60, capacityMah: v.cap});
  }
  // Life compared with the chapter's example; null when the settings are the example itself.
  function vsExample(v) {
    const base = BATTERY_PRESETS[0].v;
    if (Object.keys(base).every(k => v[k] === base[k])) return null;
    return labEstimate(v).days / labEstimate(base).days;
  }

  const api = {pinState, sampleReads, batteryEstimate, batteryAdvice, formatDays, BATTERY_PRESETS, labEstimate, vsExample};
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof document === 'undefined') return;

  // ----- DOM -----
  const {esc, $$, radios, slider} = root.AIOTLab;

  // One branch of the circuit, drawn between rail y0 and rail y1 on the vertical at x=150.
  function branch(kind, y0, y1, hot, pressed) {
    const c = (y0 + y1) / 2, w = hot ? 'la' : 'ln';
    if (kind === 'none') return '<line class="ln dash" x1="150" y1="' + y0 + '" x2="150" y2="' + y1 + '"/><text class="ts" x="164" y="' + (c + 5) + '">沒有電阻</text>';
    if (kind === 'resistor') {
      return '<line class="' + w + '" x1="150" y1="' + y0 + '" x2="150" y2="' + (c - 26) + '"/><rect class="warn" x="128" y="' + (c - 26) + '" width="44" height="52" rx="4"/><line class="' + w + '" x1="150" y1="' + (c + 26) + '" x2="150" y2="' + y1 + '"/><text class="t" x="184" y="' + (c + 6) + '">10kΩ</text>';
    }
    const a = c - 18, b = c + 18;
    const lever = pressed
      ? '<line class="la" x1="150" y1="' + a + '" x2="150" y2="' + b + '"/>'
      : '<line class="ln" x1="150" y1="' + a + '" x2="122" y2="' + (b - 8) + '"/>';
    return '<line class="' + w + '" x1="150" y1="' + y0 + '" x2="150" y2="' + a + '"/><line class="' + w + '" x1="150" y1="' + b + '" x2="150" y2="' + y1 + '"/>' + lever + '<circle class="box" cx="150" cy="' + a + '" r="4"/><circle class="box" cx="150" cy="' + b + '" r="4"/><text class="t" x="184" y="' + (c - 2) + '">按鈕</text><text class="ts" x="184" y="' + (c + 17) + '">' + (pressed ? '按下：接通' : '放開：斷開') + '</text>';
  }

  function pinCircuit(mode, pressed) {
    const s = pinState(mode, pressed), unknown = s.level === 'UNKNOWN';
    const word = unknown ? '不確定' : s.level;
    const pinClass = unknown ? 'warn' : s.level === 'HIGH' ? 'acc' : 'box';
    return '<svg viewBox="90 0 385 306" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="輸入腳位電路：腳位目前讀到' + word + '">' +
      '<text class="tb tc" x="150" y="18">電源 3.3V</text><line class="ln" x1="120" y1="28" x2="180" y2="28"/>' +
      branch(s.top, 28, 150, s.hotTop, pressed) +
      branch(s.bottom, 150, 270, s.hotBottom, pressed) +
      '<line class="ln" x1="130" y1="270" x2="170" y2="270"/><line class="ln" x1="138" y1="277" x2="162" y2="277"/><line class="ln" x1="145" y1="284" x2="155" y2="284"/><text class="ts tc" x="150" y="302">GND（0V）</text>' +
      '<line class="' + (unknown ? 'ln dash' : 'la') + '" x1="150" y1="150" x2="310" y2="150"/><circle class="' + (unknown ? 'warn' : 'acc') + '" cx="150" cy="150" r="6"/>' +
      '<rect class="' + pinClass + '" x="310" y="116" width="160" height="68" rx="8"/><text class="ts tc" x="390" y="140">輸入腳位讀到</text><text class="th tc" x="390" y="168">' + word + '</text></svg>';
  }

  function pinLab(el) {
    const MODES = [['pullup', '上拉電阻'], ['pulldown', '下拉電阻'], ['floating', '浮接（沒有電阻）']];
    const CODE = {
      pullup: 'pinMode(腳位, INPUT_PULLUP);  // 或外接 10kΩ 到電源',
      pulldown: 'pinMode(腳位, INPUT);  // 外接 10kΩ 到 GND',
      floating: 'pinMode(腳位, INPUT);  // 按鈕接 GND，卻沒有任何電阻',
    };
    let mode = 2, pressed = 0;
    el.innerHTML = '<h3>實驗：按鈕腳位會讀到什麼？</h3><p class="small">切換接法與按鈕狀態，看腳位讀到 HIGH、LOW 或不確定。粗線是決定腳位電位的路徑。</p><div class="lab-form">' + radios('p-mode', '接法', MODES.map(m => m[1]), mode) + radios('p-press', '按鈕', ['放開', '按下'], pressed) + '</div><div class="lab-viz"></div><p class="lab-say" aria-live="polite"></p><p class="small">程式：<code class="p-code"></code></p><p class="small">連讀 8 次：<code class="p-reads"></code> <button type="button" class="linkbtn">再讀一次</button></p><p class="small muted">電路為簡化示意，浮接時的跳動是模擬，實際行為取決於雜訊與晶片。內建電阻依晶片而異：Uno 只有內建上拉，下拉要外接。</p>';
    const viz = el.querySelector('.lab-viz'), say = el.querySelector('.lab-say'), code = el.querySelector('.p-code'), reads = el.querySelector('.p-reads');
    function read() { reads.textContent = sampleReads(pinState(MODES[mode][0], !!pressed).level, 8).join(' '); }
    function draw() {
      const m = MODES[mode][0], s = pinState(m, !!pressed);
      viz.innerHTML = pinCircuit(m, !!pressed);
      say.innerHTML = '<b>讀到 ' + esc(s.level === 'UNKNOWN' ? '不確定' : s.level) + '。</b>' + esc(s.say);
      code.textContent = CODE[m];
      read();
    }
    $$('input', el).forEach(i => i.onchange = () => {
      if (i.name === 'p-mode') mode = +i.value; else pressed = +i.value;
      draw();
    });
    el.querySelector('.linkbtn').onclick = read;
    draw();
  }

  function batteryBar(est) {
    const width = 440, work = Math.round(est.workShare * width);
    const pct = x => Math.round(x * 100) + '%';
    return '<p class="small">一個週期用掉的電量：<b>工作 ' + pct(est.workShare) + '</b>（藍），<b>休眠 ' + pct(est.sleepShare) + '</b>（黃）</p><svg viewBox="0 0 480 34" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="一個週期的耗電比例：工作 ' + pct(est.workShare) + '，休眠 ' + pct(est.sleepShare) + '"><rect class="warn" x="20" y="4" width="' + width + '" height="26" rx="4"/><rect class="acc" x="20" y="4" width="' + work + '" height="26" rx="4"/></svg>';
  }

  function batteryLab(el) {
    const v = Object.assign({}, BATTERY_PRESETS[0].v);
    const UNIT = {active: 'mA', sleep: 'µA', sec: ' 秒', min: ' 分鐘', cap: 'mAh'};
    let active = 0;
    el.innerHTML = '<h3>實驗：探頭的電池能撐多久？</h3><p class="small">選一組設定，或拖動滑桿，看平均電流、續航天數，以及電量花在哪一段。</p>' +
      '<div class="chips" role="group" aria-label="設定">' + BATTERY_PRESETS.map((p, i) => '<button type="button" data-p="' + i + '">' + esc(p.name) + '</button>').join('') + '</div><div class="lab-form">' +
      slider('b-active', '工作電流', 1, 300, 1, v.active, UNIT.active) +
      slider('b-sleep', '休眠電流（1000µA＝1mA）', 1, 1000, 1, v.sleep, UNIT.sleep) +
      slider('b-sec', '每次工作時間', 0.5, 30, 0.5, v.sec, UNIT.sec) +
      slider('b-min', '回報間隔', 1, 60, 1, v.min, UNIT.min) +
      slider('b-cap', '電池容量', 200, 6000, 100, v.cap, UNIT.cap) +
      '</div><div class="lab-out" aria-live="polite"></div><div class="lab-viz"></div><p class="small muted">這是忽略老化、溫度與穩壓損失的理想估算。低溫環境電池的可用容量會下降，冷凍櫃裡的探頭要留餘裕，實際續航要實測。</p>';
    const out = el.querySelector('.lab-out'), viz = el.querySelector('.lab-viz');
    function draw() {
      $$('[data-p]', el).forEach((b, i) => b.setAttribute('aria-pressed', String(i === active)));
      const e = labEstimate(v), x = vsExample(v);
      out.innerHTML = '<p class="lab-say"><b>平均電流約 ' + e.avgMa.toFixed(3) + ' mA，理想續航約 ' + esc(formatDays(e.days)) + '</b>（' + Math.round(e.hours).toLocaleString('en-US') + ' 小時）。' + (x === null ? '' : '和本節的例子相比：約 ' + x.toFixed(1) + ' 倍。') + esc(batteryAdvice(e)) + '</p>';
      viz.innerHTML = batteryBar(e) + ('<p class="small">間隔拉得再長，續航也不會超過「容量÷休眠電流」：約 ' + esc(formatDays(e.maxDays)) + '。若低溫下可用容量只剩一半（示意）：約 ' + esc(formatDays(e.halfCapacityDays)) + '。</p>');
    }
    $$('input[type=range]', el).forEach(i => i.oninput = () => {
      const k = i.id.slice(2);
      v[k] = +i.value;
      i.parentElement.querySelector('output').textContent = i.value + UNIT[k];
      active = -1;
      draw();
    });
    $$('[data-p]', el).forEach(b => b.onclick = () => {
      active = +b.dataset.p;
      Object.assign(v, BATTERY_PRESETS[active].v);
      $$('input[type=range]', el).forEach(i => {
        const k = i.id.slice(2);
        i.value = v[k];
        i.parentElement.querySelector('output').textContent = v[k] + UNIT[k];
      });
      draw();
    });
    draw();
  }

  root.AIOTLab.register('s2-21-pin', pinLab);
  root.AIOTLab.register('s2-21-battery', batteryLab);
})(this);
