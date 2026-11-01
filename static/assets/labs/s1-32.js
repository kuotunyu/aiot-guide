/* Labs for 3.2: pure logic is exported for tests; the DOM part runs only in a browser. */
(function (root) {
  'use strict';

  // ----- sampling, aliasing and ADC -----
  const WINDOW_MS = 20;

  // Apparent frequency after sampling: f_a = |f - k*fs|, where k*fs is the multiple of fs nearest to f.
  // sign is -1 when the spectrum folds, because sin(2*pi*(k*fs - fa)*n/fs) = -sin(2*pi*fa*n/fs).
  function aliasInfo(f, fs) {
    const k = Math.round(f / fs), diff = f - k * fs;
    const state = 2 * f < fs ? 'ok' : 2 * f === fs ? 'edge' : 'alias';
    return {k, fa: Math.abs(diff), sign: diff < 0 ? -1 : 1, state, need: 2 * f};
  }
  function adcInfo(bits, vref) {
    const levels = Math.pow(2, bits);
    return {levels, step: vref / levels};
  }
  // Simplified ideal ADC: rounds down to the nearest step; the top of the range stays in the last code.
  function quantize(v, bits, vref) {
    const {levels, step} = adcInfo(bits, vref);
    const code = Math.max(0, Math.min(levels - 1, Math.floor(v / step)));
    return {code, volt: code * step};
  }
  const clean = v => Math.round(v * 1e9) / 1e9;
  // The test signal stays inside the ADC range: centred at vref/2, peak 90% of half the range.
  function signalAt(tSec, f, vref) {
    return clean(vref / 2 * (1 + 0.9 * Math.sin(2 * Math.PI * f * tSec)));
  }
  function samples(f, fs, bits, vref, ms) {
    const rows = [], count = Math.floor(fs * ms / 1000 + 1e-9);
    for (let n = 0; n <= count; n++) {
      // (f*n % fs)/fs keeps the phase exact for integer frequencies, so f = fs/2 gives true zero crossings.
      const v = clean(vref / 2 * (1 + 0.9 * Math.sin(2 * Math.PI * ((f * n) % fs) / fs)));
      rows.push(Object.assign({t: n / fs, v}, quantize(v, bits, vref)));
    }
    return rows;
  }
  function aliasAt(tSec, f, fs, vref) {
    const a = aliasInfo(f, fs);
    return clean(vref / 2 * (1 + 0.9 * a.sign * Math.sin(2 * Math.PI * a.fa * tSec)));
  }
  function describe(f, fs) {
    const a = aliasInfo(f, fs);
    if (a.state === 'ok') return '取樣足夠：' + fs + ' Hz 大於 2×' + f + '＝' + a.need + ' Hz，看到的就是 ' + f + ' Hz。';
    if (a.state === 'edge') return '正好 2 倍，還不算「大於」：這條正弦波的取樣點全落在零點上，波形完全消失。相位不同時點會落在別處，但仍無法確定振幅。';
    const calc = '混疊頻率＝|' + f + '−' + a.k + '×' + fs + '|＝' + a.fa + ' Hz。';
    if (a.fa === 0) return '混疊：' + calc + '每次都量到週期上的同一點，資料看起來是不會變的固定值。要避免需取樣率高於 ' + a.need + ' Hz。';
    // f is an odd multiple of fs/2: with zero phase every sample lands on a zero crossing, so no wave shows in the data.
    if (2 * a.fa === fs) return '混疊：' + calc + '這個值正好是取樣率的一半，這條正弦波的取樣點全落在零點上，資料看起來沒有起伏；相位不同時點會落在別處，但仍無法分辨真實頻率。要避免需取樣率高於 ' + a.need + ' Hz。';
    return '混疊：真實訊號 ' + f + ' Hz，資料看起來卻是 ' + a.fa + ' Hz。' + calc + '要避免需取樣率高於 ' + a.need + ' Hz。';
  }

  // ----- interface comparison -----
  // dist: 0 same board, 1 a few metres, 2 hundreds of metres. speed: 0 about 100 kbps, 1 hundreds of kbps, 2 Mbps and up.
  // clock: 0 either, 1 needs a clock line, 2 no clock line.
  const BUSES = [
    {id: 'uart', name: 'UART', sync: false, maxDist: 1, single: true, duplex: true, wires: () => 2, speed: () => 1, note: 'TX 接對方 RX，靠雙方約定鮑率；常見 115200 bps，也可到約 1 Mbps。'},
    {id: 'i2c', name: 'I²C', sync: true, maxDist: 0, single: false, duplex: false, wires: () => 2, speed: () => 1, note: 'SDA、SCL 共用，靠位址點名，加裝置不必加線。'},
    {id: 'spi', name: 'SPI', sync: true, maxDist: 0, single: false, duplex: true, wires: need => 3 + need.devices, speed: () => 2, note: '每多一台從屬通常多一條 CS，換來高速與同時收發。'},
    {id: 'rs485', name: 'RS-485', sync: false, maxDist: 2, single: false, duplex: true, wires: need => need.duplex ? 4 : 2, speed: need => need.dist === 2 ? 0 : 2, note: '差動訊號抗干擾；距離越長速率越低。'},
  ];
  function rankBus(need) {
    return BUSES.map(b => {
      const wires = b.wires(need), problems = [], cautions = [];
      if (wires > need.wires) problems.push('要 ' + wires + ' 條線，超過可用的 ' + need.wires + ' 條');
      if (b.single && need.devices > 1) problems.push('只能點對點');
      if (b.maxDist < need.dist) problems.push('距離不夠');
      if (b.speed(need) < need.speed) problems.push(b.id === 'rs485' ? '拉到數百公尺時速率會降低' : '速率不足');
      if (need.duplex && !b.duplex) problems.push('半雙工，不能同時收發');
      if (need.clock === 1 && !b.sync) problems.push('沒有時脈線');
      if (need.clock === 2 && b.sync) problems.push('需要時脈線');
      if (b.id === 'rs485' && need.dist === 0) cautions.push('要外加收發器，同一塊板上用不到這麼遠');
      const status = problems.length ? 'no' : cautions.length ? 'maybe' : 'ok';
      return Object.assign({}, b, {wireCount: wires, problems, cautions, status});
    }).sort((a, b) => {
      const order = {ok: 0, maybe: 1, no: 2};
      return order[a.status] - order[b.status] || a.problems.length - b.problems.length || a.wireCount - b.wireCount;
    });
  }

  const api = {WINDOW_MS, aliasInfo, adcInfo, quantize, signalAt, samples, aliasAt, describe, BUSES, rankBus};
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof document === 'undefined') return;

  // ----- DOM -----
  const {esc, $$, radios, slider} = root.AIOTLab;
  const fmtV = v => v >= 1 ? v.toFixed(3) + ' V' : v >= 0.001 ? (v * 1000).toFixed(v >= 0.01 ? 1 : 2) + ' mV' : (v * 1000).toFixed(3) + ' mV';

  function adcLab(el) {
    const PRESETS = [
      {name: '夠快', f: 300, fs: 1000, bits: 3},
      {name: '壓縮機振動 900 Hz', f: 900, fs: 1000, bits: 10},
      {name: '正好 2 倍', f: 500, fs: 1000, bits: 10},
      {name: '等於取樣率', f: 1000, fs: 1000, bits: 10},
      {name: '超過取樣率', f: 1600, fs: 1000, bits: 10},
    ];
    const VREFS = [3.3, 5];
    let st = {f: 300, fs: 1000, bits: 3, vref: 3.3}, active = 0;
    const X0 = 44, X1 = 592, P1 = [32, 140], P2 = [190, 298];
    el.innerHTML = '<h3>實驗：取樣與量化</h3><p class="small">調訊號頻率和取樣率看混疊，調位元數看階梯變細。上圖管「量得多勤」，下圖管「量得多細」。</p>' +
      '<div class="chips" role="group" aria-label="情境">' + PRESETS.map((p, i) => '<button type="button" data-p="' + i + '">' + esc(p.name) + '</button>').join('') + '</div>' +
      '<div class="lab-form"><div>' + slider('a-f', '訊號頻率', 10, 2000, 10, st.f, ' Hz') + slider('a-fs', '取樣率', 200, 4000, 50, st.fs, ' Hz') + '</div><div>' + slider('a-bits', 'ADC 位元數', 1, 16, 1, st.bits, ' 位元') + radios('a-vref', '量測範圍', ['0–3.3 V', '0–5 V'], 0) + '</div></div>' +
      '<div class="lab-viz"><svg viewBox="0 0 600 330" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="上圖為訊號與取樣點，下圖為 ADC 量化後的階梯">' +
      '<text x="44" y="20" class="tb">取樣：真實訊號與取樣點</text><text x="44" y="178" class="tb">量化：ADC 存下來的值</text>' +
      '<rect x="44" y="32" width="548" height="108" class="soft"/><rect x="44" y="190" width="548" height="108" class="soft"/>' +
      '<text x="38" y="42" class="ts" text-anchor="end" data-top>3.3</text><text x="38" y="144" class="ts" text-anchor="end">0</text><text x="38" y="200" class="ts" text-anchor="end" data-top>3.3</text><text x="38" y="302" class="ts" text-anchor="end">0</text>' +
      '<text x="44" y="320" class="ts">0 ms</text><text x="592" y="320" class="ts" text-anchor="end">' + WINDOW_MS + ' ms</text>' +
      '<g data-grid></g><polyline class="ln" data-sig/><polyline class="la dash" data-alias/><g data-dots></g><polyline class="la" data-stair/></svg></div>' +
      '<p class="small muted">細線：真實訊號。圓點：取樣點。粗虛線：只看圓點會誤判的波（混疊時才出現）。粗線：量化結果。</p>' +
      '<p class="lab-say" aria-live="polite"></p><ul class="small" data-stats></ul>' +
      '<p class="small muted">簡化模型：理想 ADC、一律往下取到最近的刻度，訊號固定為振幅佔範圍 90% 的正弦波，沒有雜訊與抗混疊濾波器。圖只顯示 ' + WINDOW_MS + ' ms。</p>';
    const q = s => el.querySelector(s);
    const xOf = t => X0 + (X1 - X0) * t * 1000 / WINDOW_MS;
    const yOf = (v, p) => p[1] - (p[1] - p[0]) * v / st.vref;
    const pts = a => a.map(p => p[0].toFixed(1) + ',' + p[1].toFixed(1)).join(' ');
    function draw() {
      $$('[data-p]', el).forEach((b, i) => b.setAttribute('aria-pressed', String(i === active)));
      [['a-f', st.f, ' Hz'], ['a-fs', st.fs, ' Hz'], ['a-bits', st.bits, ' 位元']].forEach(([id, v, u]) => {
        const i = q('#' + id); i.value = v; i.parentNode.querySelector('output').textContent = v + u;
      });
      $$('[data-top]', el).forEach(t => { t.textContent = st.vref; });
      const dur = WINDOW_MS / 1000, N = 1200, sig = [];
      for (let i = 0; i <= N; i++) { const t = dur * i / N; sig.push([xOf(t), yOf(signalAt(t, st.f, st.vref), P1)]); }
      q('[data-sig]').setAttribute('points', pts(sig));
      const a = aliasInfo(st.f, st.fs), al = [];
      if (a.state === 'alias') for (let i = 0; i <= 300; i++) { const t = dur * i / 300; al.push([xOf(t), yOf(aliasAt(t, st.f, st.fs, st.vref), P1)]); }
      q('[data-alias]').setAttribute('points', pts(al));
      const rows = samples(st.f, st.fs, st.bits, st.vref, WINDOW_MS);
      q('[data-dots]').innerHTML = rows.map(r => '<circle cx="' + xOf(r.t).toFixed(1) + '" cy="' + yOf(r.v, P1).toFixed(1) + '" r="3.5" class="acc"/>').join('');
      const stair = [];
      rows.forEach((r, i) => {
        const next = i + 1 < rows.length ? rows[i + 1].t : dur, y = yOf(r.volt, P2);
        stair.push([xOf(r.t), y], [xOf(next), y]);
      });
      q('[data-stair]').setAttribute('points', pts(stair));
      const {levels, step} = adcInfo(st.bits, st.vref);
      let grid = '';
      if (levels <= 16) for (let i = 1; i < levels; i++) { const y = yOf(i * step, P2).toFixed(1); grid += '<line x1="' + X0 + '" y1="' + y + '" x2="' + X1 + '" y2="' + y + '" class="ln dash"/>'; }
      q('[data-grid]').innerHTML = grid;
      q('.lab-say').textContent = describe(st.f, st.fs);
      q('[data-stats]').innerHTML = '<li>階數：2<sup>' + st.bits + '</sup>＝' + levels + ' 階' + (levels > 16 ? '（格線太密，圖上不畫）' : '') + '</li><li>步階電壓：' + st.vref + ' V÷' + levels + ' ≈ ' + esc(fmtV(step)) + '</li><li>原始資料量：' + st.bits + ' 位元×' + st.fs + ' Hz＝' + (st.bits * st.fs / 1000) + ' kbps</li>';
    }
    $$('[data-p]', el).forEach(b => b.onclick = () => {
      const p = PRESETS[+b.dataset.p];
      st.f = p.f; st.fs = p.fs; st.bits = p.bits; active = +b.dataset.p; draw();
    });
    [['a-f', 'f'], ['a-fs', 'fs'], ['a-bits', 'bits']].forEach(([id, key]) => {
      q('#' + id).oninput = e => { st[key] = +e.target.value; active = -1; draw(); };
    });
    $$('input[name="a-vref"]', el).forEach(i => i.onchange = () => { st.vref = VREFS[+i.value]; draw(); });
    draw();
  }

  function busLab(el) {
    const PRESETS = [
      {name: '控制板接 3 顆感測器，腳位很少', need: {wires: 2, devices: 3, dist: 0, speed: 0, duplex: 0, clock: 0}, say: '線最少、加裝置不必加線，I²C 最合適。'},
      {name: '控制板寫記憶卡', need: {wires: 5, devices: 1, dist: 0, speed: 2, duplex: 1, clock: 0}, say: '要高速又要同時收發，多幾條線值得，所以選 SPI。'},
      {name: '貨車主控板接 GPS 模組', need: {wires: 2, devices: 1, dist: 1, speed: 0, duplex: 1, clock: 2}, say: '一對一、兩條線、不拉時脈線，正是 UART。'},
      {name: '冷凍櫃 12 台控制器連回 300 公尺外的機房', need: {wires: 2, devices: 12, dist: 2, speed: 0, duplex: 0, clock: 0}, say: '距離和多點一起把板內介面排除，只剩 RS-485。'},
    ];
    const WORDS = {dist: ['同一塊板', '數公尺', '數百公尺'], speed: ['約 100 kbps 內', '數百 kbps', '數 Mbps 以上'], duplex: ['輪流即可', '要同時收發'], clock: ['不拘', '要時脈線（同步）', '不拉時脈線（非同步）']};
    let need = Object.assign({}, PRESETS[0].need), say = PRESETS[0].say, active = 0;
    el.innerHTML = '<h3>實驗：替連線選介面</h3><p class="small">選一個情境或自己調條件，看 UART、I²C、SPI、RS-485 誰留下、誰被哪個條件排除。</p><div class="chips" role="group" aria-label="情境">' + PRESETS.map((p, i) => '<button type="button" data-p="' + i + '">' + esc(p.name) + '</button>').join('') + '</div><div class="lab-form"></div><p class="lab-say" aria-live="polite"></p><div class="lab-out"></div><p class="small muted">線數只算訊號線，另外都要共地（RS-485 依配線而定）。速率與距離取典型值，實際依晶片、線材與規格而定。排序只看這些條件；RS-232 也是點對點、約 15 公尺的選項，這裡未列入。</p>';
    const form = el.querySelector('.lab-form'), out = el.querySelector('.lab-out'), sayEl = el.querySelector('.lab-say');
    function drawForm() {
      form.innerHTML = '<div>' + slider('b-wires', '可用訊號線', 2, 8, 1, need.wires, ' 條') + slider('b-devices', '要連的從屬裝置', 1, 12, 1, need.devices, ' 台') + '</div>' + radios('b-dist', '距離', WORDS.dist, need.dist) + radios('b-speed', '速率', WORDS.speed, need.speed) + radios('b-duplex', '方向', WORDS.duplex, need.duplex) + radios('b-clock', '時脈', WORDS.clock, need.clock);
      $$('input[type=radio]', form).forEach(i => i.onchange = () => { need[i.name.slice(2)] = +i.value; active = -1; say = ''; draw(); });
      $$('input[type=range]', form).forEach(i => i.oninput = () => {
        need[i.id.slice(2)] = +i.value;
        i.parentNode.querySelector('output').textContent = i.value + (i.id === 'b-wires' ? ' 條' : ' 台');
        active = -1; say = ''; draw();
      });
    }
    function draw() {
      $$('[data-p]', el).forEach((b, i) => b.setAttribute('aria-pressed', String(i === active)));
      sayEl.textContent = say; sayEl.hidden = !say;
      const n = Object.assign({}, need, {duplex: !!need.duplex});
      const label = {ok: '符合', maybe: '要留意', no: '排除'};
      out.innerHTML = '<ul class="rank">' + rankBus(n).map(t => '<li class="' + t.status + '"><span class="st">' + label[t.status] + '</span><b>' + esc(t.name) + '</b><span class="why">' + esc(t.wireCount + ' 線・' + (t.sync ? '同步' : '非同步') + '。' + (t.problems.concat(t.cautions).join('、') || t.note)) + '</span></li>').join('') + '</ul>';
    }
    $$('[data-p]', el).forEach(b => b.onclick = () => { const p = PRESETS[+b.dataset.p]; need = Object.assign({}, p.need); say = p.say; active = +b.dataset.p; drawForm(); draw(); });
    drawForm(); draw();
  }

  root.AIOTLab.register('s1-32-adc', adcLab);
  root.AIOTLab.register('s1-32-bus', busLab);
})(this);
