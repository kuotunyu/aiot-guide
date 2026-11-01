/* Labs for 1.2: pure logic is exported for tests; the DOM part runs only in a browser. */
(function (root) {
  'use strict';

  // ----- compressor alert threshold -----
  // Hand-written demo data, not real measurements. Vibration in mm/s. The two groups overlap from 3.7 to 5.2 on purpose.
  const HEALTHY = [1.6, 1.9, 2.1, 2.3, 2.4, 2.6, 2.7, 2.9, 3.0, 3.2, 3.3, 3.5, 3.6, 3.8, 4.0, 4.3, 4.7, 5.2];
  const FAILING = [3.7, 4.4, 4.9, 5.5, 6.2, 7.1];
  const T_MIN = 1.5, T_MAX = 7.5;
  // Preventive maintenance is assumed to reach this many failing machines in time; the rest fail between services.
  const SCHEDULED_CATCH = 3;

  // Costs in made-up points. falseAlarm: one wasted trip. repair: one planned repair.
  // miss: one sudden failure. service: one routine service. platform: sensors, data and model.
  const SCENARIOS = [
    {name: '一般冷藏庫', falseAlarm: 3, repair: 2, miss: 10, service: 0.5, platform: 6, say: '誤報與漏報都有代價，但漏報比較痛。'},
    {name: '存放疫苗', falseAlarm: 3, repair: 2, miss: 60, service: 0.5, platform: 6, say: '一次突然故障就可能報廢整庫，漏報的代價遠高於白跑一趟。'},
    {name: '偏遠外站', falseAlarm: 10, repair: 2, miss: 10, service: 3, platform: 6, say: '派人一趟要半天，每次誤報和每次定期保養都很貴。'},
    {name: '便宜又有備機', falseAlarm: 3, repair: 2, miss: 3, service: 0.5, platform: 6, say: '壞了馬上換備機，貨也不受影響，故障的代價很低。'},
  ];

  // An alert fires when the reading is at or above the threshold.
  function confusion(threshold) {
    const falseAlarms = HEALTHY.filter(v => v >= threshold).length;
    const caught = FAILING.filter(v => v >= threshold).length;
    return {falseAlarms, caught, missed: FAILING.length - caught};
  }
  function strategyCosts(threshold, s) {
    const c = confusion(threshold), total = HEALTHY.length + FAILING.length;
    const lateScheduled = FAILING.length - SCHEDULED_CATCH;
    return {
      reactive: FAILING.length * s.miss,
      scheduled: total * s.service + SCHEDULED_CATCH * s.repair + lateScheduled * s.miss,
      predictive: s.platform + c.falseAlarms * s.falseAlarm + c.caught * s.repair + c.missed * s.miss,
    };
  }
  // Searches in 0.1 steps (the slider's step) and returns the cheapest range of thresholds.
  function bestThreshold(s) {
    let cost = Infinity, lo = 0, hi = 0;
    for (let i = Math.round(T_MIN * 10); i <= Math.round(T_MAX * 10); i++) {
      const t = i / 10, p = strategyCosts(t, s).predictive;
      if (p < cost) { cost = p; lo = t; hi = t; } else if (p === cost) hi = t;
    }
    return {cost, lo, hi};
  }
  function tradeoffSay(c) {
    if (c.caught === 0) return '門檻高過所有讀值，系統完全不告警：花了監測平台的錢，實際上還是事後維修。';
    if (c.missed === 0 && c.falseAlarms === HEALTHY.length) return '每一台都在告警，等於沒有判斷。';
    if (c.missed === 0) return '即將故障的都抓到了，代價是 ' + c.falseAlarms + ' 台健康機台白跑一趟。告警太多時，人也會開始忽略它。';
    if (c.falseAlarms === 0) return '沒有誤報，每次告警都是真的，代價是漏掉 ' + c.missed + ' 台。';
    return '門檻往左，漏報變少、誤報變多；門檻往右則相反。';
  }

  const api = {HEALTHY, FAILING, SCENARIOS, SCHEDULED_CATCH, T_MIN, T_MAX, confusion, strategyCosts, bestThreshold, tradeoffSay};
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof document === 'undefined') return;

  // ----- DOM -----
  const {esc, $$, radios, slider} = root.AIOTLab;
  const X = v => 20 + (v - T_MIN) * 320 / (T_MAX - T_MIN);
  const dot = (v, y, id) => '<circle cx="' + X(v).toFixed(1) + '" cy="' + y + '" r="5" data-' + id + '="' + v + '"/>';

  function thresholdLab(el) {
    let t = 5.0, sc = 0;
    const ticks = [2, 3, 4, 5, 6, 7].map(v => '<line x1="' + X(v) + '" y1="118" x2="' + X(v) + '" y2="123" class="ln"/><text x="' + X(v) + '" y="137" class="ts tc">' + v + '</text>').join('');
    const legend = [[26, 'box', '未告警'], [92, 'warn', '誤報'], [146, 'ok', '抓到'], [200, 'bad dash', '漏報']].map(a => '<circle cx="' + a[0] + '" cy="168" r="5" class="' + a[1] + '"/><text x="' + (a[0] + 9) + '" y="172" class="ts">' + a[2] + '</text>').join('');
    el.innerHTML = '<h3>實驗：壓縮機告警門檻要設多少？</h3><p class="small">拖動門檻，振動值達到門檻就告警。再換情境，看最省的門檻怎麼移動。下面 24 台的數值是寫死的示範資料，不是真實量測。</p>' +
      slider('s1-12-t', '告警門檻', T_MIN, T_MAX, 0.1, t.toFixed(1), ' mm/s') +
      '<div class="lab-viz"><svg viewBox="0 0 360 180" xmlns="http://www.w3.org/2000/svg" role="img">' +
      '<rect data-zone x="0" y="20" width="0" height="98" class="soft"/>' +
      '<text x="20" y="34" class="ts">健康 18 台</text>' + HEALTHY.map((v, i) => dot(v, i % 2 ? 60 : 46, 'h')).join('') +
      '<text x="20" y="84" class="ts">即將故障 6 台</text>' + FAILING.map(v => dot(v, 100, 'f')).join('') +
      '<line x1="20" y1="118" x2="340" y2="118" class="ln"/>' + ticks + '<text x="180" y="153" class="ts tc">振動值 mm/s（示範資料）</text>' +
      '<line data-line x1="0" y1="20" x2="0" y2="118" class="la"/><text data-label x="0" y="14" class="ts tc"></text>' + legend + '</svg></div>' +
      '<ul class="rank" data-counts></ul><p class="lab-say" aria-live="polite"></p><p class="small muted">從 3.7 到 5.2，健康與即將故障的機台讀值重疊，所以沒有任何門檻能讓誤報和漏報同時歸零。</p>' +
      '<div class="lab-form">' + radios('s1-12-sc', '這批壓縮機的情境', SCENARIOS.map(s => s.name), sc) + '</div><p class="small" data-prices></p><ul class="rank" data-costs></ul><p class="lab-say" data-win aria-live="polite"></p>' +
      '<button type="button" class="linkbtn" data-best>把門檻移到這個情境最省的位置</button>' +
      '<p class="small muted">成本點數是虛構的簡化模型，只比較一段期間內這 24 台。定期保養假設剛好趕上 ' + SCHEDULED_CATCH + ' 台，其餘在兩次保養之間故障。</p>';
    const input = el.querySelector('input[type=range]'), output = el.querySelector('output');
    const svg = el.querySelector('svg'), zone = el.querySelector('[data-zone]'), line = el.querySelector('[data-line]'), label = el.querySelector('[data-label]');
    const counts = el.querySelector('[data-counts]'), say = el.querySelector('.lab-say'), prices = el.querySelector('[data-prices]');
    const costs = el.querySelector('[data-costs]'), win = el.querySelector('[data-win]');
    function draw() {
      const c = confusion(t), s = SCENARIOS[sc], k = strategyCosts(t, s), x = X(t);
      output.textContent = t.toFixed(1) + ' mm/s';
      zone.setAttribute('x', x); zone.setAttribute('width', 340 - x);
      line.setAttribute('x1', x); line.setAttribute('x2', x);
      label.setAttribute('x', Math.min(285, Math.max(75, x)));
      label.textContent = '門檻 ' + t.toFixed(1) + '，右邊告警';
      $$('[data-h]', svg).forEach(n => n.setAttribute('class', +n.dataset.h >= t ? 'warn' : 'box'));
      $$('[data-f]', svg).forEach(n => n.setAttribute('class', +n.dataset.f >= t ? 'ok' : 'bad dash'));
      svg.setAttribute('aria-label', '門檻 ' + t.toFixed(1) + ' mm/s：抓到 ' + c.caught + ' 台，誤報 ' + c.falseAlarms + ' 台，漏報 ' + c.missed + ' 台');
      const row = (cls, st, b, why) => '<li class="' + cls + '"><span class="st">' + esc(st) + '</span><b>' + esc(b) + '</b><span class="why">' + esc(why) + '</span></li>';
      counts.innerHTML =
        row(c.missed ? 'maybe' : 'ok', '抓到', c.caught + '／' + FAILING.length + ' 台', '故障前就排好維修') +
        row(c.falseAlarms ? 'maybe' : 'ok', '誤報', c.falseAlarms + ' 台', '機器沒事卻告警，白跑一趟') +
        row(c.missed ? 'maybe' : 'ok', '漏報', c.missed + ' 台', '沒有告警就突然壞掉');
      say.textContent = tradeoffSay(c);
      prices.textContent = s.say + '誤報一次 ' + s.falseAlarm + ' 點、提前維修一台 ' + s.repair + ' 點、突然故障一台 ' + s.miss + ' 點、定期保養一台 ' + s.service + ' 點、監測平台 ' + s.platform + ' 點。';
      const low = Math.min(k.reactive, k.scheduled, k.predictive), tag = v => v === low ? 'ok' : 'no';
      const late = FAILING.length - SCHEDULED_CATCH;
      costs.innerHTML =
        row(tag(k.reactive), k.reactive + ' 點', '事後維修', FAILING.length + ' 台全部突然故障') +
        row(tag(k.scheduled), k.scheduled + ' 點', '定期保養', '預防性維護：保養 24 台，趕上 ' + SCHEDULED_CATCH + ' 台，' + late + ' 台仍故障') +
        row(tag(k.predictive), k.predictive + ' 點', '預測性維護', '目前門檻：平台、誤報 ' + c.falseAlarms + '、提前修 ' + c.caught + '、漏報 ' + c.missed);
      const best = bestThreshold(s), range = best.lo === best.hi ? best.lo.toFixed(1) : best.lo.toFixed(1) + '–' + best.hi.toFixed(1);
      const bestAll = Math.min(k.reactive, k.scheduled, best.cost);
      let msg = k.predictive === best.cost ? '目前已是預測性維護在這個情境最省的門檻（' + range + ' mm/s）。' : '目前的門檻比最省的設定多花 ' + (k.predictive - best.cost) + ' 點。';
      if (bestAll === k.reactive && k.reactive < best.cost) msg += '這個情境連最好的門檻都輸給事後維修：監測的投入回收不了。';
      else if (k.predictive > k.scheduled || k.predictive > k.reactive) msg += '門檻設不好，預測性維護也可能比較貴。';
      win.textContent = msg;
    }
    input.oninput = () => { t = +input.value; draw(); };
    $$('input[type=radio]', el).forEach(i => i.onchange = () => { sc = +i.value; draw(); });
    el.querySelector('[data-best]').onclick = () => { t = bestThreshold(SCENARIOS[sc]).lo; input.value = t; draw(); };
    draw();
  }

  root.AIOTLab.register('s1-12-threshold', thresholdLab);
})(this);
