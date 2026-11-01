(function(){
'use strict';
const $ = (s, r) => (r || document).querySelector(s), $$ = (s, r) => [...(r || document).querySelectorAll(s)];
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const LET = 'ABCD';
const store = {get(k){ try { return localStorage.getItem('aiot-guide-' + k); } catch(e){ return null; } }, set(k, v){ try { localStorage.setItem('aiot-guide-' + k, v); } catch(e){} }};

// ----- theme -----
const themeBtn = $('#themeBtn');
if (themeBtn) themeBtn.onclick = () => {
  const cur = document.documentElement.dataset.theme || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  const nx = cur === 'dark' ? 'light' : 'dark'; document.documentElement.dataset.theme = nx; store.set('theme', nx);
};
const setHdr = () => { const t = $('.top'); if (t) document.documentElement.style.setProperty('--hdr', t.offsetHeight + 'px'); };
setHdr(); addEventListener('resize', setHdr);

// ----- diagram zoom -----
document.addEventListener('click', e => {
  const f = e.target.closest('article .dg'); if (!f || document.body.classList.contains('reading')) return;
  const z = document.createElement('div'); z.className = 'zoom'; z.innerHTML = '<figure class="dg">' + f.innerHTML + '</figure>';
  z.onclick = () => z.remove(); document.body.appendChild(z);
});
addEventListener('keydown', e => { if (e.key === 'Escape') $$('.zoom').forEach(z => z.remove()); });

// ----- worked examples -----
$$('.ex[data-a]').forEach(ex => {
  const a = +ex.dataset.a, why = $('.why', ex);
  $$('.opt', ex).forEach((b, k) => b.onclick = () => {
    $$('.opt', ex).forEach((x, j) => { x.disabled = true; if (j === a) x.classList.add('correct'); else if (j === k) x.classList.add('wrong'); });
    why.hidden = false; why.classList.add(k === a ? 'ok' : 'bad');
  });
});

// ----- toc highlight -----
const tocLinks = $$('.toc a');
if (tocLinks.length && window.IntersectionObserver) {
  const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) tocLinks.forEach(a => a.classList.toggle('on', a.getAttribute('href') === '#' + e.target.id)); }), {rootMargin:'-20% 0px -70% 0px'});
  $$('article section[id]').forEach(s => io.observe(s));
}

// ----- glossary -----
const gq = $('#gq');
if (gq) {
  const items = $$('.gitem'), subj = $('#gs'), count = $('#gcount');
  const run = () => {
    const norm = v => v.normalize('NFKC').toLowerCase(), q = norm(gq.value.trim()), s = subj.value; let n = 0;
    items.forEach(it => { const ok = (!q || norm(it.textContent).includes(q)) && (!s || it.dataset.s.includes(s)); it.hidden = !ok; if (ok) n++; });
    count.textContent = n + ' 個名詞';
  };
  gq.oninput = run; subj.onchange = run; run();
}

// ----- practice -----
const qa = $('#quizApp');
if (qa && window.AIOT_QUESTIONS) (function(){
  const ALL = window.AIOT_QUESTIONS, CH = window.AIOT_CHAPTERS;
  const fS = $('#fSubject'), fC = $('#fChapter'), fN = $('#fCount'), fM = $('#fMode'), avail = $('#fAvail');
  let run = null, tick = null;
  function pool(){ return ALL.filter(q => (!fS.value || q.subject === fS.value) && (!fC.value || q.lesson === fC.value)); }
  function fillChapters(){
    const cur = fC.value;
    fC.innerHTML = '<option value="">全部章節</option>' + CH.filter(c => !fS.value || c.subject === fS.value).map(c => '<option value="' + c.id + '">' + esc(c.code + ' ' + c.title) + '</option>').join('');
    if ([...fC.options].some(o => o.value === cur)) fC.value = cur;
  }
  function updAvail(){ avail.textContent = '目前範圍共 ' + pool().length + ' 題'; }
  fS.onchange = () => { fillChapters(); updAvail(); }; fC.onchange = updAvail;
  const shuffle = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--){ const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const chName = id => { const c = CH.find(x => x.id === id); return c ? c.code + ' ' + c.title : ''; };

  $('#qStart').onclick = () => start(shuffle(pool()).slice(0, +fN.value || 9999), fM.value);
  function start(qs, mode){
    if (!qs.length) { avail.textContent = '這個範圍沒有題目，請換一個範圍。'; return; }
    clearInterval(tick);
    run = {qs, mode, i:0, ans:{}, t0:Date.now(), limit: qs.length * 90000};
    $('#quizSetup').hidden = true; render();
    if (mode === 'exam') tick = setInterval(() => { const t = $('#timer'); if (!t) return; const ms = run.t0 + run.limit - Date.now(); t.textContent = fmt(ms); if (ms <= 0) finish(); }, 1000);
  }
  const fmt = ms => { ms = Math.max(0, ms); return Math.floor(ms / 60000) + ':' + String(Math.floor(ms % 60000 / 1000)).padStart(2, '0'); };
  function qBlock(q, picked, reveal){
    let h = '<p class="small muted noread">' + esc(chName(q.lesson)) + '</p><div class="qtext">' + esc(q.q) + '</div><div class="opts">';
    q.o.forEach((o, k) => {
      let c = ''; if (reveal && picked != null){ if (k === q.a) c = 'correct'; else if (k === picked) c = 'wrong'; } else if (picked === k) c = 'picked';
      h += '<button type="button" class="opt ' + c + '" data-k="' + k + '"' + (reveal && picked != null ? ' disabled' : '') + '><span class="k">' + LET[k] + '</span><span>' + esc(o) + '</span></button>';
    });
    h += '</div>';
    if (reveal && picked != null) h += '<div class="why ' + (picked === q.a ? 'ok' : 'bad') + '"><b>' + (picked === q.a ? '答對了' : '正解是 ' + LET[q.a]) + '</b><p>' + esc(q.e) + '</p><p class="small"><a href="' + q.lesson + '.html">讀這一章：' + esc(chName(q.lesson)) + '</a></p></div>';
    return h;
  }
  function render(){
    if (run.done) return result();
    const q = run.qs[run.i], picked = run.ans[q.id], done = Object.keys(run.ans).length, ex = run.mode === 'exam';
    let h = '<div class="quiz" data-read><div class="qhead"><span>第 ' + (run.i + 1) + ' / ' + run.qs.length + ' 題</span><span class="row">' + (ex ? '<span>剩餘 <b class="mono" id="timer">' + fmt(run.t0 + run.limit - Date.now()) + '</b></span>' : '') + '<button type="button" class="say" data-say-card>朗讀題目</button></span></div><div class="bar"><i style="width:' + (done / run.qs.length * 100) + '%"></i></div>';
    h += qBlock(q, picked, !ex);
    h += '<div class="qnav noread"><button type="button" class="btn ghost" id="qPrev"' + (run.i ? '' : ' disabled') + '>上一題</button>';
    h += ex ? '<button type="button" class="btn ghost" id="qSubmit">交卷</button>' : '<button type="button" class="btn ghost" id="qEnd">結束並看結果</button>';
    h += '<button type="button" class="btn" id="qNext">' + (run.i + 1 < run.qs.length ? '下一題' : '看結果') + '</button></div>';
    if (ex) h += '<div class="grid noread">' + run.qs.map((x, k) => '<button type="button" data-j="' + k + '" class="' + (run.ans[x.id] != null ? 'ans ' : '') + (k === run.i ? 'cur' : '') + '">' + (k + 1) + '</button>').join('') + '</div>';
    qa.innerHTML = h + '</div>';
    $$('.opt', qa).forEach(b => b.onclick = () => { run.ans[q.id] = +b.dataset.k; if (ex && run.i + 1 < run.qs.length) run.i++; render(); });
    $('#qPrev').onclick = () => { run.i--; render(); };
    $('#qNext').onclick = () => { if (run.i + 1 < run.qs.length){ run.i++; render(); scrollTo(0, 0); } else finish(); };
    const end = $('#qEnd') || $('#qSubmit'); end.onclick = () => finish();
    $$('.grid button', qa).forEach(b => b.onclick = () => { run.i = +b.dataset.j; render(); });
  }
  function finish(){ clearInterval(tick); run.done = true; result(); scrollTo(0, 0); }
  function result(){
    const answered = run.qs.filter(q => run.ans[q.id] != null), ok = answered.filter(q => run.ans[q.id] === q.a).length;
    const total = run.mode === 'exam' ? run.qs.length : answered.length, wrong = run.qs.filter(q => run.ans[q.id] != null ? run.ans[q.id] !== q.a : run.mode === 'exam');
    const by = {}; run.qs.forEach(q => { if (run.mode !== 'exam' && run.ans[q.id] == null) return; const b = by[q.lesson] || (by[q.lesson] = {n:0, ok:0}); b.n++; if (run.ans[q.id] === q.a) b.ok++; });
    let h = '<div class="quiz"><div class="panel"><div class="score">' + ok + ' / ' + total + '</div><p>' + (total ? '答對率 ' + Math.round(ok / total * 100) + '%' : '還沒有作答') + '</p><div class="row"><button type="button" class="btn" id="qAgain">換一組題目</button>' + (wrong.length ? '<button type="button" class="btn ghost" id="qRedo">重做錯的 ' + wrong.length + ' 題</button>' : '') + '</div></div>';
    const rows = Object.keys(by).sort((a, b) => by[a].ok / by[a].n - by[b].ok / by[b].n);
    if (rows.length > 1) h += '<h2>各章表現</h2><div class="tblwrap" tabindex="0" role="region" aria-label="表格，可左右捲動"><table><thead><tr><th>章節</th><th>答對</th></tr></thead><tbody>' + rows.map(k => '<tr><td><a href="' + k + '.html">' + esc(chName(k)) + '</a></td><td class="mono">' + by[k].ok + ' / ' + by[k].n + '</td></tr>').join('') + '</tbody></table></div>';
    if (wrong.length) h += '<h2>檢討</h2>' + wrong.map(q => '<div class="ex">' + qBlock(q, run.ans[q.id] == null ? -1 : run.ans[q.id], true) + '</div>').join('');
    qa.innerHTML = h + '</div>';
    $$('.opt', qa).forEach(b => b.disabled = true);
    $('#qAgain').onclick = () => { run = null; qa.innerHTML = ''; $('#quizSetup').hidden = false; };
    if ($('#qRedo')) $('#qRedo').onclick = () => start(shuffle(wrong), 'learn');
  }
  fillChapters();
  const hash = location.hash.slice(1);
  if (CH.some(c => c.id === hash)) { fC.value = hash; }
  updAvail();
})();

// ----- read aloud -----
const reader = $('#reader');
if (reader) (function(){
  const synth = window.speechSynthesis, ok = !!(synth && window.SpeechSynthesisUtterance);
  const BLOCK = 'h1,h2,h3,p,li,tr,figcaption,.qtext,.opt,[data-say]';
  const SKIP = '.say,.noread,.side,.toc,.sidemenu,.pager,#reader,svg,video,.vid,.lab,.srcs,script,style';
  const pos = $('#rdPos'), txt = $('#rdText'), play = $('#rdPlay'), rate = $('#rdRate'), voiceSel = $('#rdVoice');
  let segs = [], idx = 0, chunk = 0, chunks = [], gen = 0, playing = false, voices = [], watchdog = null;
  const digits = {'⁰':'0','¹':'1','²':'2','³':'3','⁴':'4','⁵':'5','⁶':'6','⁷':'7','⁸':'8','⁹':'9','ⁿ':'n'};
  const speakable = t => String(t).replace(/I²C/g, 'I平方C')
    .replace(/([0-9A-Za-z]+)([⁰¹²³⁴⁵⁶⁷⁸⁹ⁿ]+)/g, (_, b, p) => b + ' 的 ' + [...p].map(x => digits[x]).join('') + ' 次方')
    .replace(/≠|!=/g, ' 不等於 ').replace(/≥|>=/g, ' 大於等於 ').replace(/≤|<=/g, ' 小於等於 ').replace(/>/g, ' 大於 ').replace(/</g, ' 小於 ')
    .replace(/(\d)\s*[–~～]\s*(\d)/g, '$1到$2').replace(/×/g, '乘').replace(/÷/g, '除以').replace(/≈/g, '約等於').replace(/[＝=]/g, '等於')
    .replace(/→|⇒|➜/g, '，到，').replace(/←/g, '，').replace(/°C|℃/g, '度C').replace(/Ω/g, '歐姆').replace(/(\d+(?:\.\d+)?)%/g, '百分之$1').replace(/°/g, '度')
    .replace(/\bvs\.?\s/gi, '對比 ').replace(/／/g, '、').replace(/\s+/g, ' ').trim();
  function textOf(n){
    if (n.dataset && n.dataset.say) return n.dataset.say;
    if (n.tagName === 'TR') return [...n.children].map(c => c.textContent.trim()).filter(Boolean).join('，');
    const c = n.cloneNode(true); c.querySelectorAll('.say,svg,.noread').forEach(x => x.remove());
    c.querySelectorAll('sup').forEach(x => x.textContent = ' 的 ' + x.textContent + ' 次方');
    if (n.classList.contains('opt')) { const k = c.querySelector('.k'); const l = k ? k.textContent : ''; if (k) k.remove(); return '選項' + l + '，' + c.textContent; }
    return c.textContent;
  }
  function hidden(n, root){
    for (let p = n.parentElement; p && p !== root.parentElement; p = p.parentElement){
      if (p.hasAttribute('hidden') || p.hasAttribute('data-say')) return true;
      if (p.tagName === 'DETAILS' && !p.open) return true;
    }
    return false;
  }
  function collect(root){
    const out = [];
    $$(BLOCK, root).forEach(n => {
      if (n.closest(SKIP) || hidden(n, root)) return;
      if (!n.hasAttribute('data-say') && n.querySelector(BLOCK)) return;
      const t = speakable(textOf(n)); if (t) out.push({el:n, text:t});
    });
    return out;
  }
  function split(t){
    const parts = t.match(/[^。！？；!?]+[。！？；!?]*/g) || [t], out = [];
    parts.forEach(p => { while (p.length > 140){ let cut = p.lastIndexOf('，', 140); if (cut < 40) cut = 140; out.push(p.slice(0, cut + 1)); p = p.slice(cut + 1); } if (p.trim()) out.push(p); });
    return out;
  }
  function mark(){
    $$('.reading-on').forEach(x => x.classList.remove('reading-on'));
    const s = segs[idx]; if (!s) return;
    s.el.classList.add('reading-on');
    const r = s.el.getBoundingClientRect(), top = $('.top').offsetHeight + 12, bottom = innerHeight - reader.offsetHeight - 20;
    if (r.top < top || r.bottom > bottom) s.el.scrollIntoView({block:'center'});
    pos.textContent = '朗讀中 ' + (idx + 1) + ' / ' + segs.length; txt.textContent = s.text;
  }
  function say(){
    clearTimeout(watchdog);
    if (idx >= segs.length) return stop();
    if (!segs[idx].el.isConnected) return stop();
    const token = ++gen;
    if (chunk === 0) { chunks = split(segs[idx].text); mark(); }
    const u = new SpeechSynthesisUtterance(chunks[chunk]), v = voices.find(x => x.voiceURI === voiceSel.value);
    u.lang = v ? v.lang : 'zh-TW'; if (v) u.voice = v; u.rate = Number(rate.value);
    u.onstart = () => clearTimeout(watchdog);
    u.onend = () => { if (token !== gen || !playing) return; chunk++; if (chunk >= chunks.length){ chunk = 0; idx++; } say(); };
    u.onerror = e => { if (token === gen && e.error !== 'interrupted' && e.error !== 'canceled') fail('這個聲音無法播放，請換一個聲音再試。'); };
    watchdog = setTimeout(() => { if (token === gen && playing) fail('語音沒有啟動，請換一個聲音，或改用 Edge／Chrome。'); }, 10000);
    synth.speak(u);
  }
  function fail(m){ playing = false; gen++; if (ok) synth.cancel(); play.textContent = '▶'; pos.textContent = '無法朗讀'; txt.textContent = m; }
  function go(i){ if (!segs.length) return; idx = Math.max(0, Math.min(segs.length - 1, i)); chunk = 0; gen++; synth.cancel(); playing = true; play.textContent = '⏸'; say(); }
  function start(root){
    document.body.classList.add('reading');
    if (!ok) return fail('這個瀏覽器不支援朗讀，請改用 Edge 或 Chrome。');
    segs = collect(root); if (!segs.length) return stop();
    segs.forEach(s => s.el.setAttribute('data-seg', '')); go(0);
  }
  function stop(){
    gen++; clearTimeout(watchdog); playing = false; if (ok) synth.cancel();
    $$('.reading-on').forEach(x => x.classList.remove('reading-on')); $$('[data-seg]').forEach(x => x.removeAttribute('data-seg'));
    segs = []; document.body.classList.remove('reading');
  }
  function loadVoices(){
    if (!ok) return;
    const rank = v => (/zh[-_]TW/i.test(v.lang) ? 0 : /zh[-_]HK/i.test(v.lang) ? 3 : 2) - (/natural|online/i.test(v.name) ? 1 : 0);
    voices = synth.getVoices().filter(v => /^zh|^cmn/i.test(v.lang)).sort((a, b) => rank(a) - rank(b));
    const keep = store.get('voice') || voiceSel.value;
    voiceSel.innerHTML = voices.length ? voices.map(v => '<option value="' + esc(v.voiceURI) + '">' + esc(v.name.replace(/Microsoft |Online |\(Natural\)/g, '').trim()) + '</option>').join('') : '<option value="">預設中文</option>';
    if (voices.some(v => v.voiceURI === keep)) voiceSel.value = keep;
  }
  if (store.get('rate')) rate.value = store.get('rate');
  loadVoices(); if (ok) synth.addEventListener('voiceschanged', loadVoices);
  play.onclick = () => { if (playing){ playing = false; gen++; synth.cancel(); play.textContent = '▶'; pos.textContent = '已暫停 ' + (idx + 1) + ' / ' + segs.length; } else if (segs.length) go(idx); };
  $('#rdStop').onclick = stop; $('#rdPrev').onclick = () => go(idx - 1); $('#rdNext').onclick = () => go(idx + 1);
  rate.onchange = () => { store.set('rate', rate.value); if (playing) go(idx); };
  voiceSel.onchange = () => { store.set('voice', voiceSel.value); if (playing) go(idx); };
  document.addEventListener('click', e => {
    if (e.target.closest('[data-read-all]')) { e.preventDefault(); return start($('article') || $('main')); }
    const c = e.target.closest('[data-say-card]');
    if (c) { e.preventDefault(); return start(c.closest('[data-read]') || $('main')); }
    if (!document.body.classList.contains('reading') || e.target.closest('a,button,summary,select,input,label,#reader')) return;
    const seg = e.target.closest('[data-seg]'); if (seg) { const j = segs.findIndex(s => s.el === seg); if (j >= 0) go(j); }
  });
  addEventListener('pagehide', stop);
})();
})();
