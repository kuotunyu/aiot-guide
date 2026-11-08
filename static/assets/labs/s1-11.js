/* Lab for 1.1: pure logic is exported for tests; the DOM part runs only in a browser. */
(function (root) {
  'use strict';

  // ----- edge or cloud: a deliberately simple model -----
  const UPLINK_MBPS = 10;        // assumed uplink for every scenario
  const SOFT_VOLUME_GB = 10;     // above this per day, volume is worth a second look
  const SOFT_STABILITY = 99;     // below this percent, outages are worth a second look
  // Illustrative room for a model on each kind of device, in MB.
  const DEVICES = [
    {name: 'MCU', cap: 1},
    {name: '閘道器', cap: 256},
    {name: '工業電腦', cap: 4000},
  ];

  // FP32 stores a weight in 4 bytes and INT8 in 1, so weights take about a quarter of the space.
  function quantize(fp32MB) { return fp32MB / 4; }

  // kbps: KB per second of raw data; oneWayMs: one-way network delay; limitMs: allowed reaction time;
  // stability: percent of the day connected; modelMB: FP32 size; int8: boolean; device: index into DEVICES.
  function assess(x) {
    const mbps = x.kbps * 8 / 1000;
    const saturated = mbps >= UPLINK_MBPS;
    const sendMs = x.kbps * 8 / (UPLINK_MBPS * 1000) * 1000;   // time to upload one second of data
    const rttMs = 2 * x.oneWayMs + sendMs;
    const perDayGB = x.kbps * 86400 / 1e6;
    const downMin = (100 - x.stability) / 100 * 1440;
    const modelMB = x.int8 ? quantize(x.modelMB) : x.modelMB;
    const cap = DEVICES[x.device].cap;
    const fits = modelMB <= cap;
    const tooSlow = saturated || rttMs > x.limitMs;
    const heavy = perDayGB >= SOFT_VOLUME_GB;
    const shaky = x.stability < SOFT_STABILITY;
    let verdict;
    if (tooSlow && !fits) verdict = 'stuck';
    else if (tooSlow) verdict = 'edge';
    else if (!fits) verdict = 'cloud';
    else if (heavy || shaky) verdict = 'lean-edge';
    else verdict = 'either';
    return {mbps, saturated, sendMs, rttMs, perDayGB, downMin, modelMB, cap, fits, tooSlow, heavy, shaky, verdict};
  }

  function fmtVolume(gb) {
    if (gb >= 1) return (gb >= 100 ? gb.toFixed(0) : gb.toFixed(1)) + ' GB';
    const mb = gb * 1000;
    return (mb >= 100 ? mb.toFixed(0) : mb.toFixed(1)) + ' MB';
  }
  function fmtMs(ms) { return ms >= 1000 ? +(ms / 1000).toFixed(2) + ' 秒' : Math.round(ms) + ' ms'; }
  function fmtMB(mb) { return mb >= 1000 ? +(mb / 1000).toFixed(2) + ' GB' : +mb.toFixed(2) + ' MB'; }

  const api = {UPLINK_MBPS, DEVICES, quantize, assess, fmtVolume, fmtMs, fmtMB};
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof document === 'undefined') return;

  // ----- DOM -----
  const {esc, $$, radios, slider} = root.AIOTLab;

  const STOPS = {
    kbps: [0.01, 0.1, 1, 5, 10, 20, 50, 100, 200, 500, 1000, 2000],
    oneWayMs: [5, 10, 20, 30, 40, 50, 80, 100, 150, 200, 300, 500],
    limitMs: [10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 60000],
    stability: [90, 95, 97, 98, 99, 99.5, 99.9, 99.99],
    modelMB: [0.5, 1, 2, 3, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 4000, 8000],
  };
  const FIELDS = [
    ['kbps', '每秒資料量', v => v + ' KB/秒'],
    ['oneWayMs', '網路延遲（單程）', v => v + ' ms'],
    ['limitMs', '延遲上限（多久內要反應）', fmtMs],
    ['stability', '連線穩定度', v => v + '%'],
    ['modelMB', '模型大小（FP32）', fmtMB],
  ];
  const PRESETS = [
    {name: '壓縮機振動保護', v: {kbps: 20, oneWayMs: 50, limitMs: 100, stability: 99, modelMB: 20, device: 1}},
    {name: '貨車車廂影像', v: {kbps: 500, oneWayMs: 80, limitMs: 1000, stability: 95, modelMB: 200, device: 1}},
    {name: '冷藏庫溫度趨勢', v: {kbps: 0.01, oneWayMs: 20, limitMs: 5000, stability: 99.9, modelMB: 5, device: 0}},
    {name: '探頭上的小模型', v: {kbps: 1, oneWayMs: 50, limitMs: 100, stability: 98, modelMB: 3, device: 0}},
  ];
  const VERDICT = {
    stuck: '兩邊都卡住：雲端來不及，模型也放不進這個裝置。可以試試量化、換較大的裝置，或重新檢視延遲上限。',
    edge: '判斷放邊緣：雲端趕不上要求，而模型放得進現場裝置。',
    cloud: '判斷放雲端：來得及，但模型放不進現場裝置。若要改放邊緣，就得先縮小模型或換硬體。',
    'lean-edge': '兩邊都可行，但偏向邊緣：雲端來得及，不過資料量或斷線會帶來成本與風險。',
    either: '兩邊都可行：這時看成本與管理方便，雲端通常較容易集中維護與更新。',
  };

  function labEdgeCloud(el) {
    const state = Object.assign({int8: false}, PRESETS[0].v);
    let active = 0;
    el.innerHTML = '<h3>實驗：判斷放邊緣還是雲端</h3><p class="small">看哪個條件決定了答案。要看量化的效果，選「探頭上的小模型」再把模型格式切成 INT8，結論會改變；再試「冷藏庫溫度趨勢」，INT8 後仍放不進 MCU。</p>'
      + '<div class="chips" role="group" aria-label="情境">' + PRESETS.map((p, i) => '<button type="button" data-p="' + i + '">' + esc(p.name) + '</button>').join('') + '</div>'
      + '<div class="lab-form">' + FIELDS.map(([k, label]) => slider('ec-' + k, label, 0, STOPS[k].length - 1, 1, 0, '')).join('')
      + '<div class="ec-radios"></div></div>'
      + '<p class="lab-say" aria-live="polite"></p><ul class="rank"></ul><div class="lab-viz"></div>'
      + '<p class="small muted">這是簡化模型：假設上行頻寬固定 ' + UPLINK_MBPS + ' Mbps、每次判斷上傳一秒的資料；往返時間＝單程延遲 × 2＋上傳時間，不含雲端計算與排隊。裝置可放的模型大小（MCU 1 MB、閘道器 256 MB、工業電腦 4 GB）與門檻都是示意值。</p>'
      + '<p class="small muted">量化估算也是簡化：FP32 每個權重 4 位元組、INT8 1 位元組，所以約為 1/4，而且只算權重。準確率可能下降，下降多少要用現場資料實測，這裡無法算出。</p>';
    const say = el.querySelector('.lab-say'), rank = el.querySelector('.rank'), viz = el.querySelector('.lab-viz'), radioBox = el.querySelector('.ec-radios');

    function drawRadios() {
      radioBox.innerHTML = radios('ec-device', '現場裝置', DEVICES.map(d => d.name), state.device) + radios('ec-int8', '模型格式', ['FP32（未量化）', 'INT8（量化）'], state.int8 ? 1 : 0);
      $$('input', radioBox).forEach(i => i.onchange = () => {
        if (i.name === 'ec-device') state.device = +i.value; else state.int8 = i.value === '1';
        active = -1; draw();
      });
    }
    function syncSliders() {
      FIELDS.forEach(([k]) => { el.querySelector('#ec-' + k).value = STOPS[k].indexOf(state[k]); });
    }
    function drawViz(r) {
      const scale = Math.max(r.rttMs, state.limitMs) * 1.1;
      const w = Math.min(340, r.rttMs / scale * 340), lim = state.limitMs / scale * 340;
      const fp = fmtMB(state.modelMB), q = fmtMB(quantize(state.modelMB));
      viz.innerHTML = '<svg viewBox="0 0 360 150" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="雲端往返時間與延遲上限的比較，以及 FP32 與 INT8 的模型大小">'
        + '<text x="0" y="17" class="ts">雲端往返 ' + esc(r.saturated ? '傳不及' : fmtMs(r.rttMs)) + '／上限 ' + esc(fmtMs(state.limitMs)) + '</text>'
        + '<rect x="0" y="24" width="' + (r.saturated ? 340 : w.toFixed(1)) + '" height="18" rx="3" class="' + (r.tooSlow ? 'bad' : 'ok') + '"/>'
        + '<line x1="' + lim.toFixed(1) + '" y1="20" x2="' + lim.toFixed(1) + '" y2="46" class="la"/>'
        + '<text x="0" y="74" class="ts">模型大小（INT8 約為 FP32 的 1/4）</text>'
        + '<rect x="0" y="84" width="240" height="20" rx="3" class="' + (state.int8 ? 'soft' : 'acc') + '"/><text x="246" y="99" class="ts">FP32 ' + esc(fp) + '</text>'
        + '<rect x="0" y="112" width="60" height="20" rx="3" class="' + (state.int8 ? 'acc' : 'soft') + '"/><text x="66" y="127" class="ts">INT8 約 ' + esc(q) + '</text></svg>';
    }
    function draw() {
      $$('[data-p]', el).forEach((b, i) => b.setAttribute('aria-pressed', String(i === active)));
      FIELDS.forEach(([k, , fmt]) => {
        const text = fmt(state[k]);
        const input = el.querySelector('#ec-' + k);
        input.closest('label').querySelector('output').textContent = text;
        input.setAttribute('aria-valuetext', text);
      });
      const r = assess(state), dev = DEVICES[state.device];
      say.textContent = VERDICT[r.verdict];
      const rows = [
        [r.tooSlow ? 'bad' : 'ok', '往返時間', r.saturated
          ? '上傳需要 ' + r.mbps.toFixed(1) + ' Mbps，超過頻寬，資料會越積越多，雲端傳不及'
          : fmtMs(r.rttMs) + '，' + (r.tooSlow ? '超過' : '在') + '上限 ' + fmtMs(state.limitMs) + (r.tooSlow ? '，雲端來不及' : '內，雲端來得及')],
        [r.heavy ? 'maybe' : 'ok', '傳輸量', '全上傳每天約 ' + fmtVolume(r.perDayGB) + '，占上行 ' + (r.mbps < 0.005 ? '不到 0.01' : +r.mbps.toFixed(2)) + ' Mbps' + (r.heavy ? '，流量費用值得算一下' : '')],
        [r.shaky ? 'maybe' : 'ok', '連線', '每天約斷線 ' + +r.downMin.toFixed(1) + ' 分鐘' + (r.shaky ? '，這段時間雲端無法判斷' : '')],
        [r.fits ? 'ok' : 'bad', '模型', (state.int8 ? 'INT8 約 ' : 'FP32 ') + fmtMB(r.modelMB) + '，' + dev.name + '可放 ' + fmtMB(r.cap) + (r.fits ? '，放得進去' : '，放不進去')],
      ];
      const label = {ok: '沒問題', maybe: '留意', bad: '卡關'};
      rank.innerHTML = rows.map(([s, name, why]) => '<li class="' + s + '"><span class="st">' + label[s] + '</span><b>' + esc(name) + '</b><span class="why">' + esc(why) + '</span></li>').join('');
      drawViz(r);
    }
    FIELDS.forEach(([k]) => {
      el.querySelector('#ec-' + k).oninput = e => { state[k] = STOPS[k][+e.target.value]; active = -1; draw(); };
    });
    $$('[data-p]', el).forEach(b => b.onclick = () => {
      active = +b.dataset.p;
      Object.assign(state, PRESETS[active].v, {int8: false});
      syncSliders(); drawRadios(); draw();
    });
    syncSliders(); drawRadios(); draw();
  }

  root.AIOTLab.register('s1-11-edge-cloud', labEdgeCloud);
})(this);
