/* Lab for s2-11: pure logic is exported for tests; the DOM part runs only in a browser. */
(function (root) {
  'use strict';

  // Simplification shown in the UI: during replay, every 10th record's ACK is lost, so it is sent once more.
  const RESEND_EVERY = 10;

  // Pushes each record through the gateway buffer, replays what is left, then writes it to the platform database.
  // Records are numbered 1..total in the order they were measured. policy: 'old' or 'new'. dedupe: boolean.
  function simulateOutage({minutes, perMinute, capacity, policy, dedupe}) {
    const total = minutes * perMinute;
    const buf = [];
    let head = 0;
    for (let id = 1; id <= total; id++) {
      if (buf.length - head < capacity) buf.push(id);
      else if (policy === 'old') { head++; buf.push(id); }
    }
    const kept = buf.slice(head);

    const received = [], dupIds = [];
    kept.forEach((id, i) => {
      received.push(id);
      if ((i + 1) % RESEND_EVERY === 0) { received.push(id); dupIds.push(id); }
    });

    const seen = new Set();
    let dbRows = 0;
    received.forEach(id => {
      if (dedupe && seen.has(id)) return;
      seen.add(id);
      dbRows++;
    });

    const keptCount = kept.length;
    return {
      total,
      kept: keptCount,
      lost: total - keptCount,
      keptFrom: keptCount ? kept[0] : null,
      keptTo: keptCount ? kept[keptCount - 1] : null,
      keptStartMin: keptCount ? (kept[0] - 1) / perMinute : null,
      keptEndMin: keptCount ? kept[keptCount - 1] / perMinute : null,
      fullAtMin: capacity < total ? capacity / perMinute : null,
      peak: Math.min(capacity, total),
      dupIds,
      dups: dupIds.length,
      removed: received.length - dbRows,
      dbRows,
      excess: dbRows - keptCount,
    };
  }

  function fmt(x) { return String(Math.round(x * 10) / 10); }

  function lesson(r, input) {
    const parts = [];
    if (!r.lost) {
      parts.push('暫存夠用，' + input.minutes + ' 分鐘的資料全部留住。這個容量可撐 ' + fmt(input.capacity / input.perMinute) + ' 分鐘（容量 ÷ 每分鐘筆數）。');
    } else if (input.policy === 'old') {
      parts.push('第 ' + fmt(r.fullAtMin) + ' 分鐘暫存滿後，每來一筆新的就擠掉最舊的。留下後段，最前面 ' + fmt(r.keptStartMin) + ' 分鐘沒了；若超溫發生在前段就查不到。');
    } else {
      parts.push('第 ' + fmt(r.fullAtMin) + ' 分鐘暫存滿後，新資料不再寫入。留下前段，最後 ' + fmt(input.minutes - r.keptEndMin) + ' 分鐘沒了；斷線結束前的狀態反而查不到。');
    }
    if (input.dedupe) {
      parts.push('重送的 ' + r.removed + ' 筆靠事件編號略過，資料庫沒有重複。' + (r.lost ? '但去重救不回遺失的 ' + r.lost + ' 筆。' : ''));
    } else {
      parts.push('沒有編號就分不出哪筆是重送，資料庫多了 ' + r.excess + ' 筆，統計與圖表都會偏。');
    }
    return parts.join('');
  }

  const api = {RESEND_EVERY, simulateOutage, lesson, fmt};
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof document === 'undefined') return;

  // ----- DOM -----
  const {esc, $$, radios, slider} = root.AIOTLab;

  function timeline(r, input) {
    const X0 = 50, X1 = 390, XEND = 472;
    const xAt = min => X0 + (X1 - X0) * min / input.minutes;
    const yBase = 112, yTop = 62;
    const yAt = level => yBase - (yBase - yTop) * level / input.capacity;
    const rect = (x, y, w, h, cls) => '<rect x="' + x.toFixed(1) + '" y="' + y + '" width="' + Math.max(w, 0).toFixed(1) + '" height="' + h + '" class="' + cls + '"/>';
    const text = (x, y, cls, s) => '<text x="' + x.toFixed(1) + '" y="' + y + '" class="' + cls + '">' + esc(s) + '</text>';

    // Phase band
    let s = rect(8, 6, X0 - 8, 28, 'ok') + text((8 + X0) / 2, 26, 'ts tc', '連線');
    s += rect(X0, 6, X1 - X0, 28, 'bad') + text((X0 + X1) / 2, 26, 'tb tc', '斷線 ' + input.minutes + ' 分鐘');
    s += rect(X1, 6, XEND - X1, 28, 'ok') + text((X1 + XEND) / 2, 26, 'tb tc', '補傳');

    // Buffer level
    s += text(8, 54, 't', '閘道暫存用量（上限 ' + input.capacity + ' 筆）');
    s += '<line x1="' + X0 + '" y1="' + yTop + '" x2="' + X1 + '" y2="' + yTop + '" class="ln dash"/>';
    s += '<line x1="8" y1="' + yBase + '" x2="' + XEND + '" y2="' + yBase + '" class="ln"/>';
    const pts = [[8, yBase], [X0, yBase]];
    if (r.fullAtMin !== null) pts.push([xAt(r.fullAtMin), yTop]);
    pts.push([X1, yAt(r.peak)], [XEND, yBase]);
    s += '<polyline points="' + pts.map(p => p[0].toFixed(1) + ',' + p[1].toFixed(1)).join(' ') + '" class="la"/>';

    // Fate of the data measured during the outage
    s += text(8, 134, 't', '斷線期間量到的資料');
    const kx0 = xAt(r.keptStartMin), kx1 = xAt(r.keptEndMin);
    s += rect(kx0, 142, kx1 - kx0, 30, 'ok');
    if (kx1 - kx0 >= 44) s += text((kx0 + kx1) / 2, 163, 'ts tc', '保留');
    if (r.lost) {
      const lx0 = input.policy === 'old' ? X0 : kx1, lx1 = input.policy === 'old' ? kx0 : X1;
      s += rect(lx0, 142, lx1 - lx0, 30, 'bad');
      if (lx1 - lx0 >= 44) s += text((lx0 + lx1) / 2, 163, 'ts tc', '遺失');
    }

    // Moment the buffer filled up
    if (r.fullAtMin !== null) {
      const fx = xAt(r.fullAtMin), label = '第 ' + fmt(r.fullAtMin) + ' 分滿';
      [[yTop, yBase], [142, 172]].forEach(([y1, y2]) => { s += '<line x1="' + fx.toFixed(1) + '" y1="' + y1 + '" x2="' + fx.toFixed(1) + '" y2="' + y2 + '" class="ln dash"/>'; });
      const w = 96;
      s += text(fx + 6 + w <= X1 ? fx + 6 : fx - w - 6, 104, 'ts ta', label);
    }

    // Resent duplicates, placed at the time each record was measured
    s += text(8, 194, 't', '重送 ' + r.dups + ' 筆：' + (input.dedupe ? '依編號略過' : '重複存入資料庫'));
    s += rect(X0, 202, X1 - X0, 22, 'soft');
    r.dupIds.forEach(id => { s += rect(xAt((id - 0.5) / input.perMinute) - 1, 204, 2, 18, input.dedupe ? 'ok' : 'warn'); });

    // Axis
    s += text(X0 - 4, 242, 'ts', '0') + text(X1 - 36, 242, 'ts', input.minutes + ' 分');

    const label = '時間軸：斷線 ' + input.minutes + ' 分鐘，共產生 ' + r.total + ' 筆，保留 ' + r.kept + ' 筆，遺失 ' + r.lost + ' 筆，重送 ' + r.dups + ' 筆，資料庫 ' + r.dbRows + ' 筆';
    return '<svg viewBox="0 0 480 250" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="' + esc(label) + '">' + s + '</svg>';
  }

  function outageLab(el) {
    const input = {minutes: 20, perMinute: 30, capacity: 450, policy: 'old', dedupe: false};
    const POLICIES = ['old', 'new'];
    el.innerHTML = '<h3>實驗：貨車進隧道斷線</h3><p class="small">調整斷線長度、資料量與閘道暫存容量，看哪一段資料留下、哪一段遺失，以及重送的重複有沒有被去除。</p><div class="lab-form"><div>' +
      slider('o-minutes', '斷線長度', 5, 120, 5, input.minutes, ' 分鐘') +
      slider('o-rate', '每分鐘產生', 5, 60, 5, input.perMinute, ' 筆') +
      slider('o-capacity', '閘道暫存容量', 50, 2000, 50, input.capacity, ' 筆') +
      '</div><div>' + radios('o-policy', '暫存滿時', ['丟最舊的', '丟最新的'], 0) + radios('o-dedupe', '平台用事件編號去重', ['沒有', '有'], 0) +
      '</div></div><div class="lab-viz"></div><ul class="rank"></ul><p class="lab-say" aria-live="polite"></p><p class="small muted">簡化模型：補傳時假設每 10 筆有 1 筆的 ACK 遺失、再送一次；不計補傳速度與恢復後的新資料，容量只算筆數。</p>';
    const viz = el.querySelector('.lab-viz'), rank = el.querySelector('.rank'), say = el.querySelector('.lab-say');

    function row(cls, st, value, why) {
      return '<li class="' + cls + '"><span class="st">' + esc(st) + '</span><b>' + esc(value) + '</b><span class="why">' + esc(why) + '</span></li>';
    }
    function draw() {
      const r = simulateOutage(input);
      viz.innerHTML = timeline(r, input);
      rank.innerHTML =
        row('ok', '保留', r.kept + ' 筆', '第 ' + fmt(r.keptStartMin) + '–' + fmt(r.keptEndMin) + ' 分鐘量到的資料') +
        row(r.lost ? 'maybe' : 'ok', '遺失', r.lost + ' 筆', r.lost ? '共產生 ' + r.total + ' 筆，放不下的補不回來' : '共產生 ' + r.total + ' 筆，全部放得下') +
        row(input.dedupe ? 'ok' : 'maybe', '重複', r.dups + ' 筆', input.dedupe ? '重送的筆數已全部去除' : '重送的筆數全部留在資料庫') +
        row(r.excess ? 'maybe' : 'ok', '資料庫', r.dbRows + ' 筆', r.excess ? '比實際保留的多 ' + r.excess + ' 筆' : '每筆資料只有一列');
      say.textContent = lesson(r, input);
    }
    [['o-minutes', 'minutes', ' 分鐘'], ['o-rate', 'perMinute', ' 筆'], ['o-capacity', 'capacity', ' 筆']].forEach(([id, key, unit]) => {
      const range = el.querySelector('#' + id), output = el.querySelector('output[for="' + id + '"]');
      range.oninput = () => { input[key] = +range.value; output.textContent = range.value + unit; draw(); };
    });
    $$('input[type="radio"]', el).forEach(i => i.onchange = () => {
      if (i.name === 'o-policy') input.policy = POLICIES[+i.value]; else input.dedupe = i.value === '1';
      draw();
    });
    draw();
  }

  root.AIOTLab.register('s2-11-outage', outageLab);
})(this);
