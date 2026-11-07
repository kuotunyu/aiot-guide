/* Labs for 2-3: pure logic is exported for tests; the DOM part runs only in a browser. */
(function (root) {
  'use strict';

  const isNum = x => typeof x === 'number' && isFinite(x);

  // ----- OEE: minutes for planned/downtime, seconds per box for the ideal cycle -----
  function computeOee(input) {
    const {planned, downtime, cycle, total, good} = input;
    const errors = [];
    if (![planned, downtime, cycle, total, good].every(x => isNum(x) && x >= 0)) {
      return {ok: false, errors: ['每一項都要是不小於 0 的數字。']};
    }
    if (planned <= 0) errors.push('計畫時間要大於 0，否則沒有比較的基準。');
    if (cycle <= 0) errors.push('理想週期要大於 0，做一箱不可能完全不花時間。');
    if (downtime > planned) errors.push('停機時間不可能比計畫時間還長。請調低停機或調高計畫時間。');
    if (good > total) errors.push('良品數不可能多於實際產量，良品是產量的一部分。請調低良品數或調高產量。');
    const runMin = planned - downtime;
    const netMin = cycle * total / 60;
    if (!errors.length && netMin > runMin + 1e-9) {
      const most = Math.floor((runMin * 60 + 1e-9) / cycle);
      errors.push('運轉 ' + fmt(runMin) + ' 分鐘、每箱 ' + fmt(cycle) + ' 秒，最多只能做 ' + most + ' 箱，產量卻記了 ' + total + ' 箱。效能率超過 100% 通常代表產量記錯，或理想週期設得太慢。');
    }
    if (errors.length) return {ok: false, errors};

    const goodMin = cycle * good / 60;
    const avail = runMin / planned;
    const perf = runMin > 0 ? netMin / runMin : null;
    const quality = total > 0 ? good / total : null;
    const oee = goodMin / planned;
    const loss = {down: downtime, speed: runMin - netMin, defect: netMin - goodMin};

    // Which rate is lowest, and which loss costs the most minutes. These can disagree.
    const rates = [['avail', avail], ['perf', perf], ['quality', quality]].filter(r => r[1] !== null);
    const lowest = rates.reduce((a, b) => (b[1] < a[1] ? b : a))[0];
    // On a tie, name the loss that belongs to the lowest rate, so the two only disagree when they really do.
    const own = {avail: 'down', perf: 'speed', quality: 'defect'}[lowest];
    const largest = ['down', 'speed', 'defect'].reduce((a, b) => (loss[b] > loss[a] + 1e-9 ? b : a), own);
    const noLoss = loss.down + loss.speed + loss.defect < 1e-9;
    const average = rates.length === 3 ? (avail + perf + quality) / 3 : null;
    return {ok: true, errors: [], avail, perf, quality, oee, runMin, netMin, goodMin, loss, lowest, largest, noLoss, average};
  }

  // ----- Payback and first-year ROI -----
  function computePayback(input) {
    const {invest, saving, fee} = input;
    if (![invest, saving, fee].every(x => isNum(x) && x >= 0)) {
      return {ok: false, errors: ['每一項都要是不小於 0 的數字。']};
    }
    if (invest <= 0) return {ok: false, errors: ['一次投入要大於 0，否則沒有東西要回收。']};
    const net = saving - fee;
    const months = net > 0 ? invest / net : null;
    const naiveMonths = saving > 0 ? invest / saving : null; // the common mistake: dividing by the gross saving
    const roiNet = (net * 12 - invest) / invest;
    const yearCost = invest + fee * 12;
    const roiTco = (saving * 12 - yearCost) / yearCost;
    return {ok: true, errors: [], net, months, naiveMonths, roiNet, roiTco, recovers: net > 0, yearEnd: net * 12 - invest};
  }

  // Chart span in months: always shows the first year, leaves room past the payback point, stops at 5 years.
  function chartHorizon(months) {
    if (months === null) return 24;
    return Math.min(60, Math.max(12, Math.ceil(months * 1.2)));
  }

  function fmt(x) { return String(Math.round(x * 10) / 10); }
  function pct(x) { return (x * 100).toFixed(1) + '%'; }
  function money(x) { return (x < 0 ? '−' : '') + Math.round(Math.abs(x)).toLocaleString('en-US'); }

  // Payback chart coordinates (viewBox 440 wide): months to x, cash to y.
  function chartScale(r, v) {
    const H = chartHorizon(r.months), X0 = 62, X1 = 428, Y0 = 34, Y1 = 196;
    const end = -v.invest + r.net * H, top = Math.max(0, end), bottom = Math.min(-v.invest, end);
    return {H, X0, X1, Y0, Y1, end, x: m => X0 + (X1 - X0) * m / H, y: c => Y0 + (Y1 - Y0) * (top - c) / (top - bottom)};
  }

  // Rough width of 13px text: CJK and full-width characters are square, the rest about 0.6 em.
  function textWidth(s, size) {
    let w = 0;
    for (const ch of s) w += ch.charCodeAt(0) >= 0x2e80 ? size : size * 0.6;
    return w;
  }

  // The "forgot the fee" line: from the start straight to where the gross saving alone would cross zero.
  // Drawn only when there is a fee and that wrong month falls inside the chart; it never changes the scale.
  // The label sits under the zero line, in empty space left of the dashed line (or right of the true line);
  // lx is null when neither side has room, and the line is then drawn without a label.
  function naiveMark(r, v) {
    if (!r.ok || !(v.fee > 0) || r.naiveMonths === null) return null;
    const sc = chartScale(r, v);
    if (r.naiveMonths > sc.H) return null;
    const x0 = sc.x(0), y0 = sc.y(-v.invest), x1 = sc.x(r.naiveMonths), y1 = sc.y(0);
    const label = '忘了扣月費：第 ' + fmt(r.naiveMonths) + ' 個月（錯）', w = textWidth(label, 13);
    const ly = y1 + 18, bandTop = y1 + 5, bandBottom = y1 + 21;
    // x of a line from the start point (x0, y0) to (xa, y1) at height yy
    const at = (xa, yy) => xa - (yy - y1) * (xa - x0) / (y0 - y1);
    let lx = null, anchor = 'end';
    if (bandBottom <= sc.Y1 - 6) {
      const left = at(x1, bandBottom) - 6;
      if (left - w >= sc.X0 + 4) lx = left;
      else if (r.months !== null) {
        const xm = sc.x(r.months), right = Math.max(at(xm, bandTop) + 8, xm + 10); // clear the true line and its payback dot
        if (right + w <= sc.X1) { lx = right; anchor = 'start'; }
      }
    }
    return {x0, y0, x1, y1, label, w, lx, ly, anchor};
  }

  // The worked arithmetic under the payback chart, one line each: net saving, payback, first-year ROI.
  // Plain text; the page escapes it. "＝" when the shown number is exact, "≈" when it was rounded.
  function paybackLines(r, v) {
    const eq = (x, shown) => (Math.abs(x - shown) < 1e-9 ? '＝' : '≈');
    const signed = s => s.replace('-', '−');
    const net = '每月淨節省＝' + money(v.saving) + '－' + money(v.fee) + '＝' + money(r.net) + ' 元';
    let payback;
    if (!r.recovers) {
      payback = r.net === 0 ? '回不了本。節省剛好被費用抵銷，一次投入永遠收不回來。' : '回不了本。每月節省小於費用，用越久虧越多。';
    } else {
      payback = '回收期＝' + money(v.invest) + '÷' + money(r.net) + eq(r.months, +fmt(r.months)) + fmt(r.months) + ' 個月';
      if (v.fee > 0 && r.naiveMonths !== null) {
        payback += '（忘了扣月費：' + money(v.invest) + '÷' + money(v.saving) + eq(r.naiveMonths, +fmt(r.naiveMonths)) + fmt(r.naiveMonths) + ' 個月，錯）';
      }
      if (r.months > 60) payback += '。超過 5 年才回本，圖只畫到第 60 個月，還要考慮設備撐不撐得到那時候。';
    }
    const roiPct = r.roiNet * 100, tcoPct = r.roiTco * 100;
    const roi = '首年 ROI＝(' + money(r.net) + '×12－' + money(v.invest) + ')÷' + money(v.invest) + eq(roiPct, +fmt(roiPct)) + signed(fmt(roiPct)) + '%';
    const note = v.fee > 0 ? '若把首年持續費用也算進成本，首年 ROI ' + eq(tcoPct, +fmt(tcoPct)) + ' ' + signed(fmt(tcoPct)) + '%。比較方案時口徑要一致。' : null;
    return {lines: [net, payback, roi], note};
  }

  // On a phone the lines wrap: keep each operand ("120,000", "(12,000×12－120,000)÷") and "10 個月" in one piece,
  // so a line only breaks around "＝", after "÷", or before an aside. U+2060 is a zero-width word joiner, U+200B a zero-width break.
  function keepTogether(s) {
    return s.replace(/([0-9,.()×－−%])(?=[0-9,.()×÷－−%])/g, '$1\u2060')
      .replace(/ (個月|元)/g, (m, u) => '\u00a0' + u.split('').join('\u2060'))
      .replace(/，錯）/g, '\u2060，\u2060錯\u2060）')
      .replace(/÷/g, '÷\u200b'); // "÷" sticks to the number after it unless given a zero-width break
  }

  const api = {computeOee, computePayback, chartHorizon, chartScale, naiveMark, paybackLines, keepTogether, textWidth, fmt, pct, money};
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof document === 'undefined') return;

  // ----- DOM -----
  const {esc, $$, slider} = root.AIOTLab;

  function bindSliders(el, fields, read) {
    fields.forEach(f => {
      const input = el.querySelector('#' + f.id), output = el.querySelector('output[for="' + f.id + '"]');
      input.oninput = () => { output.textContent = (+input.value).toLocaleString('en-US') + f.unit; read(); };
    });
  }
  function setSliders(el, fields, values) {
    fields.forEach(f => {
      el.querySelector('#' + f.id).value = values[f.key];
      el.querySelector('output[for="' + f.id + '"]').textContent = values[f.key].toLocaleString('en-US') + f.unit;
    });
  }
  function readSliders(el, fields) {
    const v = {};
    fields.forEach(f => { v[f.key] = +el.querySelector('#' + f.id).value; });
    return v;
  }
  function chips(presets, label) {
    return '<div class="chips" role="group" aria-label="' + esc(label) + '">' + presets.map((p, i) => '<button type="button" data-p="' + i + '">' + esc(p.name) + '</button>').join('') + '</div>';
  }

  function oeeBars(r, v) {
    const W = 428, X = 6, s = W / v.planned;
    const rect = (x, w, y, cls) => (w * s > 0.05 ? '<rect x="' + (X + x * s).toFixed(1) + '" y="' + y + '" width="' + (w * s).toFixed(1) + '" height="26" class="' + cls + '"/>' : '');
    const row = (i, left, right, shapes) => {
      const y = 20 + i * 62;
      return '<text x="' + X + '" y="' + y + '" class="t">' + esc(left) + '</text>' + (right ? '<text x="' + (X + W) + '" y="' + y + '" class="ts" text-anchor="end">' + esc(right) + '</text>' : '') + shapes(y + 8);
    };
    const lost = (n, label) => (n > 0.05 ? label + ' −' + fmt(n) + ' 分' : label + ' 0 分');
    const na = x => (x === null ? '無法計算' : pct(x));
    return '<svg viewBox="0 0 440 256" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="OEE 損失長條：計畫 ' + fmt(v.planned) + ' 分鐘，扣掉停機、速度、不良後剩 ' + fmt(r.goodMin) + ' 分鐘在做良品">' +
      row(0, '計畫時間 ' + fmt(v.planned) + ' 分', '', y => rect(0, v.planned, y, 'box')) +
      row(1, '運轉 ' + fmt(r.runMin) + ' 分｜可用率 ' + pct(r.avail), lost(r.loss.down, '停機'), y => rect(0, r.runMin, y, 'acc') + rect(r.runMin, r.loss.down, y, 'bad')) +
      row(2, '淨運轉 ' + fmt(r.netMin) + ' 分｜效能率 ' + na(r.perf), lost(r.loss.speed, '速度'), y => rect(0, r.netMin, y, 'acc') + rect(r.netMin, r.loss.speed, y, 'bad') + rect(r.runMin, r.loss.down, y, 'soft')) +
      row(3, '良品 ' + fmt(r.goodMin) + ' 分｜良率 ' + na(r.quality), lost(r.loss.defect, '不良'), y => rect(0, r.goodMin, y, 'ok') + rect(r.goodMin, r.loss.defect, y, 'bad') + rect(r.netMin, v.planned - r.netMin, y, 'soft')) +
      '</svg>';
  }

  function oeeLab(el) {
    const FIELDS = [
      {key: 'planned', id: 'oee-planned', label: '計畫時間', min: 60, max: 600, step: 10, unit: ' 分'},
      {key: 'downtime', id: 'oee-down', label: '停機', min: 0, max: 300, step: 5, unit: ' 分'},
      {key: 'cycle', id: 'oee-cycle', label: '理想週期（每箱）', min: 1, max: 20, step: 1, unit: ' 秒'},
      {key: 'total', id: 'oee-total', label: '實際產量', min: 0, max: 6000, step: 20, unit: ' 箱'},
      {key: 'good', id: 'oee-good', label: '良品數', min: 0, max: 6000, step: 10, unit: ' 箱'},
    ];
    const PRESETS = [
      {name: '本節的例子', v: {planned: 500, downtime: 50, cycle: 6, total: 3600, good: 3420}},
      {name: '上游斷料停機多', v: {planned: 500, downtime: 150, cycle: 6, total: 3000, good: 2850}},
      {name: '常卡箱、跑不快', v: {planned: 500, downtime: 30, cycle: 6, total: 2600, good: 2470}},
      {name: '封口不良多', v: {planned: 500, downtime: 40, cycle: 6, total: 4000, good: 3300}},
      {name: '停機與速度差不多', v: {planned: 500, downtime: 75, cycle: 6, total: 3560, good: 3380}},
      {name: '一筆抄錯的紀錄', v: {planned: 500, downtime: 50, cycle: 6, total: 3400, good: 3600}},
    ];
    const RATE = {avail: '可用率', perf: '效能率', quality: '良率'};
    const LOSS = {down: '停機', speed: '速度', defect: '不良'};
    const MATCH = {avail: 'down', perf: 'speed', quality: 'defect'};
    let active = 0;
    el.innerHTML = '<h3>實驗：拆開一條分裝線的 OEE</h3><p class="small">選一班的狀況，或自己調滑桿。看計畫時間被哪種損失吃掉，以及改善該從哪裡下手。</p>' + chips(PRESETS, '班次情境') +
      '<div class="lab-form">' + FIELDS.map(f => slider(f.id, f.label, f.min, f.max, f.step, PRESETS[0].v[f.key], f.unit)).join('') + '</div>' +
      '<p class="lab-err" role="alert" hidden></p><div class="lab-viz"></div><p class="lab-say" aria-live="polite"></p>' +
      '<p class="small muted">簡化模型：一條線只做一種產品。業界常把 OEE 85% 當世界級參考值，實際水準依產業而異。</p>';
    const err = el.querySelector('.lab-err'), viz = el.querySelector('.lab-viz'), say = el.querySelector('.lab-say');
    function draw() {
      $$('[data-p]', el).forEach((b, i) => b.setAttribute('aria-pressed', String(i === active)));
      const v = readSliders(el, FIELDS), r = computeOee(v);
      err.textContent = r.errors.join(' '); err.hidden = r.ok;
      viz.hidden = !r.ok; say.hidden = !r.ok;
      if (!r.ok) { viz.innerHTML = ''; say.innerHTML = ''; return; }
      viz.innerHTML = oeeBars(r, v);
      let text = '<b>OEE ' + pct(r.oee) + '</b>（良品時間 ' + fmt(r.goodMin) + ' ÷ 計畫時間 ' + fmt(v.planned) + '）。';
      if (r.average !== null) text += '三率平均是 ' + pct(r.average) + '，但 OEE 要相乘，不是平均。';
      if (v.total === 0) text += '這班沒有產量，良率無從算起，OEE 為 0。';
      else if (r.noLoss) text += '三率都是 100%，沒有損失；現實中很難維持。';
      else {
        text += '最低的一率是' + RATE[r.lowest] + '，先從這裡找原因。';
        if (MATCH[r.lowest] !== r.largest) text += '不過損失分鐘最多的是' + LOSS[r.largest] + '，因為效能率與良率是打在已經縮小的時間上。比率與分鐘不一致時，兩邊都要看，再比較改善成本。';
      }
      say.innerHTML = text;
    }
    bindSliders(el, FIELDS, () => { active = -1; draw(); });
    setSliders(el, FIELDS, PRESETS[0].v);
    $$('[data-p]', el).forEach(b => b.onclick = () => { active = +b.dataset.p; setSliders(el, FIELDS, PRESETS[active].v); draw(); });
    draw();
  }

  function paybackChart(r, v) {
    const {H, X0, X1, end, x, y} = chartScale(r, v), nm = naiveMark(r, v);
    const wrong = nm ? '；紅色虛線是忘了扣月費的誤算，看起來第 ' + fmt(r.naiveMonths) + ' 個月就回本' : '';
    let s = '<svg viewBox="0 0 440 236" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="累積淨現金折線：從 ' + esc(money(-v.invest)) + ' 元開始，每月變動 ' + esc(money(r.net)) + ' 元' + wrong + '">';
    s += '<text x="' + X0 + '" y="18" class="ts">累積淨現金（元）</text>';
    s += '<line x1="' + X0 + '" y1="' + y(0).toFixed(1) + '" x2="' + X1 + '" y2="' + y(0).toFixed(1) + '" class="ln dash"/>';
    s += '<text x="' + (X0 - 8) + '" y="' + (y(0) + 4).toFixed(1) + '" class="ts" text-anchor="end">0</text>';
    s += '<text x="' + (X0 - 8) + '" y="' + (y(-v.invest) + 4).toFixed(1) + '" class="ts" text-anchor="end">−' + fmt(v.invest / 10000) + ' 萬</text>';
    if (nm) {
      s += '<line x1="' + nm.x0 + '" y1="' + nm.y0.toFixed(1) + '" x2="' + nm.x1.toFixed(1) + '" y2="' + nm.y1.toFixed(1) + '" class="bad dash"/>';
      if (nm.lx !== null) s += '<text x="' + nm.lx.toFixed(1) + '" y="' + nm.ly.toFixed(1) + '" class="ts" text-anchor="' + nm.anchor + '">' + esc(nm.label) + '</text>';
    }
    s += '<line x1="' + x(0) + '" y1="' + y(-v.invest).toFixed(1) + '" x2="' + x(H) + '" y2="' + y(end).toFixed(1) + '" class="la"/>';
    s += '<circle cx="' + x(0) + '" cy="' + y(-v.invest).toFixed(1) + '" r="5" class="bad"/>';
    if (r.months !== null && r.months <= H) {
      const mx = x(r.months), lx = Math.max(X0 + 100, mx - 8);
      s += '<circle cx="' + mx.toFixed(1) + '" cy="' + y(0).toFixed(1) + '" r="6" class="ok"/>';
      s += '<text x="' + lx.toFixed(1) + '" y="' + (y(0) - 10).toFixed(1) + '" class="ts ta" text-anchor="end">第 ' + fmt(r.months) + ' 個月回本</text>';
    }
    s += '<line x1="' + X0 + '" y1="206" x2="' + X1 + '" y2="206" class="ln"/>';
    s += '<text x="' + X0 + '" y="224" class="ts tc">0</text>';
    if (H > 14) s += '<text x="' + x(12).toFixed(1) + '" y="224" class="ts tc">12</text>';
    s += '<text x="' + X1 + '" y="224" class="ts tc">' + H + '</text><text x="' + ((X0 + X1) / 2 + (H > 14 ? 60 : 0)) + '" y="224" class="ts tc">月</text>';
    return s + '</svg>';
  }

  function paybackLab(el) {
    const FIELDS = [
      {key: 'invest', id: 'pay-invest', label: '一次投入（設備＋安裝＋訓練）', min: 10000, max: 600000, step: 10000, unit: ' 元'},
      {key: 'saving', id: 'pay-saving', label: '每月節省', min: 0, max: 60000, step: 1000, unit: ' 元'},
      {key: 'fee', id: 'pay-fee', label: '每月持續費用', min: 0, max: 30000, step: 1000, unit: ' 元'},
    ];
    const PRESETS = [
      {name: '本節的例子', v: {invest: 120000, saving: 15000, fee: 3000}},
      {name: '月費吃掉節省', v: {invest: 120000, saving: 4000, fee: 6000}},
      {name: '大額投入', v: {invest: 600000, saving: 30000, fee: 5000}},
    ];
    let active = 0;
    el.innerHTML = '<h3>實驗：這項投資多久回本？</h3><p class="small">調整三個數字。把每月持續費用調到比節省還高，看看會發生什麼。</p>' + chips(PRESETS, '投資情境') +
      '<div class="lab-form">' + FIELDS.map(f => slider(f.id, f.label, f.min, f.max, f.step, PRESETS[0].v[f.key], f.unit)).join('') + '</div>' +
      '<div class="lab-viz"></div><p class="lab-say" aria-live="polite"></p><p class="small muted lab-note" hidden></p>' +
      '<p class="small muted">簡化模型：每月節省與費用固定，不計利息、折舊與稅，也不考慮「今天的錢比明年值錢」；要考慮時改用 NPV（淨現值）。</p>';
    const viz = el.querySelector('.lab-viz'), say = el.querySelector('.lab-say'), note = el.querySelector('.lab-note');
    function draw() {
      $$('[data-p]', el).forEach((b, i) => b.setAttribute('aria-pressed', String(i === active)));
      const v = readSliders(el, FIELDS), r = computePayback(v), out = paybackLines(r, v);
      viz.innerHTML = paybackChart(r, v);
      // Bold the payback result, not the "forgot the fee" aside. One block per formula with a hanging indent,
      // so on a phone, where each formula wraps onto two or three rows, the three formulas still read apart.
      const LINE = '<span style="display:block;padding-left:1em;text-indent:-1em">', GAP = '<span style="display:block;padding-left:1em;text-indent:-1em;margin-top:.35em">';
      say.innerHTML = out.lines.map((t, i) => {
        let h;
        if (i !== 1) h = esc(keepTogether(t));
        else {
          const k = t.indexOf('（');
          h = k < 0 ? '<b>' + esc(keepTogether(t)) + '</b>' : '<b>' + esc(keepTogether(t.slice(0, k))) + '</b>' + esc(keepTogether(t.slice(k)));
        }
        return (i ? GAP : LINE) + h + '</span>';
      }).join('');
      note.textContent = out.note || '';
      note.hidden = !out.note;
    }
    bindSliders(el, FIELDS, () => { active = -1; draw(); });
    setSliders(el, FIELDS, PRESETS[0].v);
    $$('[data-p]', el).forEach(b => b.onclick = () => { active = +b.dataset.p; setSliders(el, FIELDS, PRESETS[active].v); draw(); });
    draw();
  }

  root.AIOTLab.register('s2-23-oee', oeeLab);
  root.AIOTLab.register('s2-23-payback', paybackLab);
})(this);
