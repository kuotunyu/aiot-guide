/* Lab for s2-13: replay protection on a cold-room door lock. Pure logic is exported for tests; the DOM part runs only in a browser. */
(function (root) {
  'use strict';

  const MODES = [
    {id: 'sig', name: '只有簽章', fields: []},
    {id: 'window', name: '簽章＋時間窗', fields: ['ts']},
    {id: 'seq', name: '簽章＋序號', fields: ['seq']},
    {id: 'nonce', name: '簽章＋nonce', fields: ['nonce']},
    {id: 'both', name: '簽章＋時間窗＋nonce', fields: ['ts', 'nonce']},
  ];
  const CMD = {open: '開門', lock: '上鎖', status: '查電量'};
  const NONCE_CAP = 3;
  const DEFAULT_WINDOW = 30;

  const at = (h, m, s) => h * 3600 + m * 60 + (s || 0);
  function fmt(t) {
    const p = n => String(n).padStart(2, '0');
    return p(Math.floor(t / 3600) % 24) + ':' + p(Math.floor(t / 60) % 60) + ':' + p(t % 60);
  }

  function newLock(skew) {
    return {door: 'locked', last: 40, used: [], skew: skew || 0, clock: at(8, 0) + (skew || 0)};
  }

  // Checks run in order: signature, time window, sequence, nonce. Returns a new lock state.
  function receive(lock, mode, msg, win) {
    const m = MODES.find(x => x.id === mode);
    if (!m) throw new Error('unknown mode ' + mode);
    const w = win == null ? DEFAULT_WINDOW : win;
    const now = msg.arrive + lock.skew;
    const after = Object.assign({}, lock, {used: lock.used.slice(), clock: now});
    const no = (code, reason) => ({accepted: false, code, reason, after});
    if (!msg.sig) return no('signature', '簽章驗不過：內容被改過，而攻擊者沒有金鑰，算不出新的簽章。');
    const notes = [];
    if (m.fields.includes('ts')) {
      const diff = Math.abs(now - msg.ts);
      if (diff > w) return no('expired', '訊息時間 ' + fmt(msg.ts) + '，門鎖時鐘 ' + fmt(now) + '，相差 ' + diff + ' 秒，超過 ' + w + ' 秒的時間窗。');
      notes.push('時間相差 ' + diff + ' 秒，在時間窗內');
    }
    if (m.fields.includes('seq')) {
      if (msg.seq <= lock.last) return no('seq', '序號 ' + msg.seq + ' 不大於記住的 ' + lock.last + '。');
      notes.push('序號 ' + msg.seq + ' 大於記住的 ' + lock.last);
      after.last = msg.seq;
    }
    if (m.fields.includes('nonce')) {
      if (lock.used.includes(msg.nonce)) return no('nonce', 'nonce ' + msg.nonce + ' 已經用過。');
      notes.push('nonce ' + msg.nonce + ' 不在記憶中');
      after.used.push(msg.nonce);
      while (after.used.length > NONCE_CAP) after.used.shift();
    }
    if (msg.cmd === 'open') after.door = 'open';
    if (msg.cmd === 'lock') after.door = 'locked';
    return {accepted: true, code: 'ok', reason: '簽章正確' + (notes.length ? '，' + notes.join('，') : '，門鎖沒有其他檢查') + '。', after};
  }

  // staleOk: a legitimate message that arrives after a newer command, so rejecting it is the right call.
  function outcome(from, accepted, staleOk) {
    if (from === 'attacker') return accepted ? 'breach' : 'stopped';
    if (accepted) return 'pass';
    return staleOk ? 'right-reject' : 'false-reject';
  }
  const OUTCOME = {pass: '通過', 'false-reject': '誤擋', 'right-reject': '擋對了', stopped: '擋下', breach: '得逞'};

  function msg(from, cmd, seq, nonce, ts, arrive, label, extra) {
    return Object.assign({kind: 'msg', from, cmd, seq, nonce, ts, arrive, sig: true, label}, extra);
  }
  const OPEN41 = msg('app', 'open', 41, 'a7f3', at(8, 0), at(8, 0, 1), '手機開門');
  const LOCK42 = msg('app', 'lock', 42, '9c20', at(8, 0, 15), at(8, 0, 16), '手機上鎖');
  const replay41 = (arrive, label) => Object.assign({}, OPEN41, {from: 'attacker', arrive, label});

  const SCENARIOS = [
    {id: 'replay', group: 'attack', name: '錄下再重送', desc: '攻擊者在倉庫附近錄下一則合法的開門訊息，先在幾秒後、再到晚上各送一次。', steps: [
      OPEN41, LOCK42, replay41(at(8, 0, 25), '攻擊者馬上重送'), replay41(at(20, 0), '攻擊者晚上重送'),
    ], lesson: '簽章只證明「是真的」，不證明「是新的」。時間窗只縮短可重放的時間，窗內仍擋不住；序號與 nonce 認得出用過的訊息。'},
    {id: 'hold', group: 'attack', name: '扣住晚點才送', desc: '這次攻擊者不是重送，而是干擾訊號，讓門鎖收不到合法訊息，再留到晚上才放出去。', steps: [
      {kind: 'event', act: 'none', at: at(8, 0, 1), label: '手機送出開門，訊號被干擾，門鎖沒有收到'},
      Object.assign({}, OPEN41, {from: 'attacker', arrive: at(20, 0), label: '攻擊者放出扣住的訊息'}),
    ], lesson: '這則訊息門鎖從沒看過，所以序號與 nonce 都放行：它們只分辨「用過沒」，不分辨「多久以前」。要限制時效得靠時間，因此實務常把時間窗和 nonce 搭配使用。'},
    {id: 'tamper', group: 'attack', name: '改掉新鮮度欄位', desc: '攻擊者把錄到的訊息改成新時間、大序號、新 nonce，想騙過檢查。', steps: [
      OPEN41, LOCK42,
      msg('attacker', 'open', 99, 'ffff', at(8, 0, 40), at(8, 0, 40), '攻擊者改欄位再送', {sig: false}),
    ], lesson: '因為這些欄位在簽章保護範圍內，一改就驗不過。如果它們放在簽章之外，攻擊者就能隨意改寫，所有新鮮度檢查都會失效。'},
    {id: 'reboot', group: 'attack', name: '斷電重開機', desc: '門鎖只把序號與 nonce 放在 RAM（斷電就清空的記憶體）。時鐘有電池備援，不受影響。', steps: [
      OPEN41, LOCK42,
      {kind: 'event', act: 'reboot', at: at(8, 4), label: '門鎖斷電重開，RAM 內容清空'},
      replay41(at(8, 5), '攻擊者重送舊訊息'),
    ], lesson: '記憶一清空，舊訊息又變成「沒看過」。序號與防重放狀態要存進斷電不會消失的記憶體（如 flash）；時間窗不靠記憶，所以不受影響，前提是時鐘還準。'},
    {id: 'full', group: 'attack', name: 'nonce 記憶滿了', desc: '門鎖只能記住最近 3 個 nonce。開門之後又來了三則合法訊息，最舊的 nonce 就被擠掉。', steps: [
      OPEN41,
      msg('app', 'lock', 42, '9c20', at(8, 10), at(8, 10, 1), '手機上鎖'),
      msg('app', 'status', 43, '51be', at(8, 20), at(8, 20, 1), '手機查電量'),
      msg('app', 'status', 44, 'd04c', at(8, 30), at(8, 30, 1), '手機查電量'),
      replay41(at(8, 31), '攻擊者重送開門'),
    ], lesson: 'nonce 要記得用過的值，而小裝置的記憶體有限。加上時間窗後，只需記住窗內的 nonce，更舊的訊息直接以過期拒絕；容量要足以涵蓋窗內的訊息量。'},
    {id: 'delay', group: 'legit', name: '合法訊息延遲', desc: '倉庫訊號不好，員工按下開門後，訊息在路上卡了 45 秒，於是他又按了一次。', steps: [
      msg('app', 'open', 41, 'a7f3', at(8, 0), at(8, 0, 45), '手機開門（路上卡 45 秒）'),
      msg('app', 'open', 42, '3e88', at(8, 0, 46), at(8, 0, 47), '手機再按一次'),
    ], lesson: '時間窗太短會擋掉遲到的真訊息；拉長雖然不再誤擋，但可重放的時間也變長。可以動滑桿試試，再回「錄下再重送」比較。'},
    {id: 'reorder', group: 'legit', name: '亂序：開門被擋', desc: '手機連送開門（序號 41）與查電量（序號 42），但走不同路徑，查電量先到。', steps: [
      msg('app', 'status', 42, '51be', at(8, 0, 2), at(8, 0, 3), '查電量先到'),
      msg('app', 'open', 41, 'a7f3', at(8, 0), at(8, 0, 6), '開門後到'),
      msg('app', 'open', 43, '3e88', at(8, 0, 10), at(8, 0, 11), '手機再按一次'),
    ], lesson: '「不大於上次就拒絕」的嚴格序號會誤擋後到的合法訊息，使用者只能重按。UDP 這類不保證順序的傳輸常改用滑動視窗：容許小範圍亂序，並記住窗內哪些序號收過。'},
    {id: 'swap', group: 'legit', name: '亂序：上鎖先到', desc: '員工先按開門、再按上鎖，兩則訊息卻對調抵達。他的本意是門最後鎖著。', steps: [
      msg('app', 'lock', 42, '9c20', at(8, 0, 2), at(8, 0, 3), '上鎖先到'),
      msg('app', 'open', 41, 'a7f3', at(8, 0), at(8, 0, 6), '開門後到', {staleOk: true}),
    ], lesson: '同樣是亂序，這次拒絕反而是對的：序號能保住指令順序，時間窗與 nonce 不看順序，門最後開著。門鎖這類有狀態的控制，順序本身也重要。'},
    {id: 'clock', group: 'legit', name: '門鎖時鐘不準', desc: '門鎖時鐘快了 2 分鐘，員工送出的訊息一到就顯得太舊。之後用 NTP（網路校時）校正。', skew: 120, steps: [
      OPEN41,
      {kind: 'event', act: 'sync', at: at(8, 1), label: '門鎖以 NTP 校時，誤差歸零'},
      msg('app', 'open', 42, '3e88', at(8, 1, 10), at(8, 1, 11), '手機再按一次'),
    ], lesson: '時間窗要靠雙方時鐘一致。沒有電池時鐘、又連不上校時服務的小裝置，序號或 nonce 會比較實際。'},
  ];

  function runScenario(id, mode, win) {
    const s = SCENARIOS.find(x => x.id === id);
    if (!s) throw new Error('unknown scenario ' + id);
    let lock = newLock(s.skew);
    const rows = s.steps.map(step => {
      if (step.kind === 'event') {
        const after = Object.assign({}, lock, {used: lock.used.slice()});
        if (step.act === 'reboot') { after.last = 0; after.used = []; }
        if (step.act === 'sync') after.skew = 0;
        after.clock = step.at + after.skew;
        lock = after;
        return {step, after};
      }
      const r = receive(lock, mode, step, win);
      lock = r.after;
      return {step, accepted: r.accepted, code: r.code, reason: r.reason, outcome: outcome(step.from, r.accepted, step.staleOk), after: r.after};
    });
    return {rows, initial: newLock(s.skew), final: lock};
  }

  function compare(id, win) {
    return MODES.map(m => {
      const r = runScenario(id, m.id, win);
      return {mode: m.id, name: m.name, outcomes: r.rows.map(x => x.outcome || null), door: r.final.door};
    });
  }

  // The packet as seen on the wire under one protection mode.
  function packetText(step, mode) {
    const m = MODES.find(x => x.id === mode);
    const parts = [CMD[step.cmd]];
    if (m.fields.includes('ts')) parts.push('ts=' + fmt(step.ts));
    if (m.fields.includes('seq')) parts.push('seq=' + step.seq);
    if (m.fields.includes('nonce')) parts.push('nonce=' + step.nonce);
    parts.push(step.sig ? '簽章對' : '簽章錯');
    return parts.join(' · ');
  }

  const api = {MODES, SCENARIOS, NONCE_CAP, DEFAULT_WINDOW, at, fmt, newLock, receive, outcome, runScenario, compare, packetText};
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof document === 'undefined') return;

  // ----- DOM -----
  const {esc, $$, radios, slider} = root.AIOTLab;

  function replayLab(el) {
    let scen = SCENARIOS[0], modeIdx = 0, win = DEFAULT_WINDOW, idx = 0, last = '';
    const chips = g => SCENARIOS.map((s, i) => s.group === g ? '<button type="button" data-s="' + i + '">' + esc(s.name) + '</button>' : '').join('');
    el.innerHTML = '<h3>實驗：冷藏庫門鎖擋得住重放嗎？</h3><p class="small">選防護與情境，一步步把訊息送到門鎖。可以先猜接受或拒絕；中途換防護，前面的步驟會用新防護重算。</p>' +
      '<div class="lab-form">' + radios('rp-mode', '門鎖的防護', MODES.map(m => m.name), modeIdx) + slider('rp-win', '時間窗（只有含時間窗的防護會用到）', 10, 120, 5, win, ' 秒') + '</div>' +
      '<p class="small muted">攻擊與裝置限制</p><div class="chips" role="group" aria-label="攻擊與裝置限制的情境">' + chips('attack') + '</div>' +
      '<p class="small muted">合法訊息出狀況</p><div class="chips" role="group" aria-label="合法訊息出狀況的情境">' + chips('legit') + '</div>' +
      '<p class="rp-desc"></p><ul class="rank rp-state"></ul><div class="rp-log"></div><p class="lab-say rp-say" aria-live="polite" hidden></p>' +
      '<div class="guess rp-next"><p class="rp-preview"></p><div class="rp-gs"><div class="row"><button type="button" class="btn ghost" data-g="1">猜接受</button><button type="button" class="btn ghost" data-g="0">猜拒絕</button><button type="button" class="btn ghost" data-g="">直接送出</button></div></div><div class="rp-ev"><div class="row"><button type="button" class="btn ghost" data-go>繼續</button></div></div></div>' +
      '<div class="rp-end" hidden></div><p><button type="button" class="linkbtn" data-reset>這個情境重來</button></p>' +
      '<p class="small muted">簡化模型：簽章只分對或錯；nonce 由傳送端產生，門鎖記最近 ' + NONCE_CAP + ' 個；嚴格序號不容許亂序。實機還有重試、回覆確認與金鑰管理。</p>';
    const q = s => el.querySelector(s);
    const desc = q('.rp-desc'), state = q('.rp-state'), log = q('.rp-log'), say = q('.rp-say'), next = q('.rp-next'), preview = q('.rp-preview'), end = q('.rp-end'), reset = q('[data-reset]'), go = q('[data-go]'), gs = q('.rp-gs'), ev = q('.rp-ev');
    const guessBtns = $$('[data-g]', el);

    function memoryText(mode, lock) {
      if (mode === 'seq') return ['序號 ' + lock.last, '收過的最大序號'];
      if (mode === 'nonce' || mode === 'both') return [lock.used.length + ' 個 nonce', lock.used.join('、') || '還沒有紀錄'];
      return ['無', '這種防護不記訊息'];
    }
    function draw() {
      const mode = MODES[modeIdx].id;
      const run = runScenario(scen.id, mode, win);
      const lock = idx ? run.rows[idx - 1].after : run.initial;
      $$('[data-s]', el).forEach(b => b.setAttribute('aria-pressed', String(SCENARIOS[+b.dataset.s] === scen)));
      desc.textContent = scen.desc;
      const mem = memoryText(mode, lock);
      state.innerHTML = '<li class="' + (lock.door === 'open' ? 'maybe' : 'ok') + '"><span class="st">門</span><b>' + (lock.door === 'open' ? '開著' : '上鎖') + '</b><span class="why">目前狀態</span></li>' +
        '<li class="ok"><span class="st">時鐘</span><b>' + fmt(lock.clock) + '</b><span class="why">' + (lock.skew ? '比標準時間快 ' + lock.skew + ' 秒' : '與手機一致') + '</span></li>' +
        '<li class="ok"><span class="st">記憶</span><b>' + esc(mem[0]) + '</b><span class="why">' + esc(mem[1]) + '</span></li>';
      const shown = run.rows.slice(0, idx);
      log.innerHTML = shown.length ? '<div class="lanes"><div class="lane-h"><span>傳送方</span><span>門鎖</span></div>' + shown.map((r, i) => {
        if (r.step.kind === 'event') return '<div class="lane"><span class="note">' + (i + 1) + '. ' + esc(r.step.label) + '</span></div>';
        const bad = r.outcome === 'breach' || r.outcome === 'false-reject';
        return '<div class="lane out' + (bad ? ' lost' : '') + '"><span class="pkt">' + esc(packetText(r.step, mode)) + (r.accepted ? ' ✓' : ' ✕') + '</span><span class="note">' + (i + 1) + '. ' + esc(r.step.label) + '，' + fmt(r.step.arrive) + ' 抵達。<b>' + (r.accepted ? '接受' : '拒絕') + '（' + OUTCOME[r.outcome] + '）</b>：' + esc(r.reason) + '</span></div>';
      }).join('') + '</div>' : '';
      say.textContent = last; say.hidden = !last;
      const step = scen.steps[idx];
      next.hidden = !step;
      if (step) {
        const isEvent = step.kind === 'event';
        preview.innerHTML = isEvent ? '<b>下一步：</b>' + esc(step.label) : '<b>下一則：</b>' + esc(step.label) + '，' + fmt(step.arrive) + ' 抵達<br><code>' + esc(packetText(step, mode)) + '</code>';
        // .btn and .row set display, which would override [hidden]; toggle the plain wrappers instead.
        gs.hidden = isEvent;
        ev.hidden = !isEvent;
      }
      end.hidden = !!step;
      if (!step) {
        const cmp = compare(scen.id, win);
        const heads = scen.steps.map((s, i) => '<th>' + (i + 1) + '</th>').join('');
        end.innerHTML = '<p class="lab-say"><b>這個情境的重點：</b>' + esc(scen.lesson) + '</p><p class="small">同一情境換成其他防護（時間窗 ' + win + ' 秒）：</p><div class="tblwrap" tabindex="0" role="region" aria-label="表格，可左右捲動"><table><thead><tr><th>防護</th>' + heads + '<th>門最後</th></tr></thead><tbody>' +
          cmp.map(c => '<tr><th>' + esc(c.name) + '</th>' + c.outcomes.map(o => '<td>' + (o ? OUTCOME[o] : '—') + '</td>').join('') + '<td>' + (c.door === 'open' ? '開著' : '上鎖') + '</td></tr>').join('') + '</tbody></table></div>';
      }
    }
    function advance(g) {
      const mode = MODES[modeIdx].id;
      const r = runScenario(scen.id, mode, win).rows[idx];
      idx++;
      last = '';
      if (g !== '' && g != null && r.step.kind === 'msg') last = (+g === (r.accepted ? 1 : 0) ? '猜對了：' : '和你猜的不同：') + '門鎖' + (r.accepted ? '接受' : '拒絕') + '。' + r.reason;
      draw();
      if (idx >= scen.steps.length) reset.focus();
      else if (scen.steps[idx].kind === 'event') go.focus();
      else if (r.step.kind === 'event') guessBtns[0].focus();
    }
    function restart(s) { if (s) scen = s; idx = 0; last = ''; draw(); }
    guessBtns.forEach(b => b.onclick = () => advance(b.dataset.g));
    go.onclick = () => advance(null);
    reset.onclick = () => { restart(); guessBtns[0].focus(); };
    $$('[data-s]', el).forEach(b => b.onclick = () => restart(SCENARIOS[+b.dataset.s]));
    $$('input[name="rp-mode"]', el).forEach(i => i.onchange = () => { modeIdx = +i.value; last = ''; draw(); });
    const range = q('#rp-win'), out = q('output[for="rp-win"]');
    range.oninput = () => { win = +range.value; out.textContent = win + ' 秒'; last = ''; draw(); };
    draw();
  }

  root.AIOTLab.register('s2-13-replay', replayLab);
})(this);
