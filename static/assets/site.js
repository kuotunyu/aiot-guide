(function(){
'use strict';
const $ = (s, r) => (r || document).querySelector(s), $$ = (s, r) => [...(r || document).querySelectorAll(s)];
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const LET = 'ABCD';
// Right and wrong are said in words on the option itself, not by colour alone; .noread keeps the reader from saying it twice.
const MK = {correct:'<span class="mk noread">✓ 正解</span>', wrong:'<span class="mk noread">✕ 你的答案</span>'};
const store = {get(k){ try { return localStorage.getItem('aiot-guide-' + k); } catch(e){ return null; } }, set(k, v){ try { localStorage.setItem('aiot-guide-' + k, v); } catch(e){} }};

// ----- theme -----
const themeBtn = $('#themeBtn');
const curTheme = () => document.documentElement.dataset.theme || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
// The button names the theme it switches to; without JS it keeps the neutral "深淺色".
const labelTheme = () => { const to = curTheme() === 'dark' ? '淺色' : '深色'; themeBtn.textContent = to; themeBtn.setAttribute('aria-label', '切換為' + to + '模式'); };
if (themeBtn) {
  labelTheme();
  themeBtn.onclick = () => { const nx = curTheme() === 'dark' ? 'light' : 'dark'; document.documentElement.dataset.theme = nx; store.set('theme', nx); labelTheme(); };
  // Following the system: keep the label right when the system theme changes and no choice was saved.
  const mq = matchMedia('(prefers-color-scheme: dark)'); mq.addEventListener && mq.addEventListener('change', labelTheme);
}
// --hdr is what stays pinned at the top: the header (on phones without the brand row, --brandH, which scrolls away),
// or on chapter pages up to 900px only the chapter contents bar, since the header there scrolls with the page; on very short screens nothing.
// --toch is a contents bar pinned under a pinned header. Anchor jumps and the reader keep clear of both.
const cssPx = n => parseFloat(getComputedStyle(document.documentElement).getPropertyValue(n)) || 0;
const setHdr = () => {
  const t = $('.top'), r = document.documentElement.style; if (!t) return;
  const nav = $('.nav', t), brandH = nav ? nav.offsetTop : 0, slim = matchMedia('(max-width:760px)').matches;
  const tm = $('.tocmenu'), s = tm && $('summary', tm), tmH = s && getComputedStyle(tm).position === 'sticky' ? s.offsetHeight + tm.clientTop * 2 : 0;
  const fixed = getComputedStyle(t).position !== 'static';
  r.setProperty('--brandH', brandH + 'px');
  r.setProperty('--hdr', (fixed ? t.offsetHeight - (slim ? brandH : 0) : tmH) + 'px');
  r.setProperty('--toch', (fixed ? tmH : 0) + 'px');
};
setHdr(); addEventListener('resize', setHdr);

// ----- diagram zoom -----
// Step and loop figures zoom from the picture itself, so their buttons keep working; the copy shows the current step, and a loop as its still picture.
// The copy is a modal dialog: focus moves to its 關閉 button, stays there while it is open, and goes back where it came from.
const ZOOMABLE = 'article .dg, .ref .dg, .quiz .dg, .gloss .dg';
let zoomFrom = null;
const unzoom = () => { const z = $('.zoom'); if (!z) return; z.remove(); if (zoomFrom && zoomFrom.isConnected) zoomFrom.focus({preventScroll: true}); zoomFrom = null; };
const zoom = (f, from) => {
  unzoom();
  const z = document.createElement('div'); z.className = 'zoom';
  z.setAttribute('role', 'dialog'); z.setAttribute('aria-modal', 'true'); z.setAttribute('aria-label', '放大的圖');
  z.innerHTML = '<figure class="' + esc(f.className) + '" data-cur="' + esc(f.dataset.cur || '') + '">' + f.innerHTML + '</figure><button type="button" class="btn zx">關閉</button>';
  const c = z.firstChild; c.classList.remove('anim', 'run'); $$('.stepctl, .lp-tog, .tblhint, .zbtn', c).forEach(x => x.remove()); $$('[aria-live]', c).forEach(x => x.removeAttribute('aria-live'));
  $$('[tabindex]', c).forEach(x => x.removeAttribute('tabindex'));
  z.onclick = unzoom; document.body.appendChild(z);
  zoomFrom = from || (document.activeElement !== document.body ? document.activeElement : null); $('.zx', z).focus();
};
document.addEventListener('click', e => {
  const f = e.target.closest(ZOOMABLE); if (!f || document.body.classList.contains('reading')) return;
  if (e.target.closest('.zbtn')) return zoom(f, e.target.closest('.zbtn'));
  if (e.target.closest('button') || f.matches('.loop') || (f.matches('.stepfig') && !e.target.closest('svg'))) return;
  zoom(f);
});
addEventListener('keydown', e => {
  if (!$('.zoom')) return;
  if (e.key === 'Escape') unzoom();
  else if (e.key === 'Tab') { e.preventDefault(); $('.zoom .zx').focus(); }
});
// Every zoomable figure (loops excepted: they never zoom) gets a 放大 button for keyboards; the practice page calls this again for each explanation.
const addZoom = root => $$('.dg:not(.loop)', root).forEach(f => {
  if (!f.matches(ZOOMABLE) || $(':scope>.zbtn', f)) return;
  f.insertAdjacentHTML('afterbegin', '<button type="button" class="say zbtn noread noprint" aria-label="放大這張圖">放大</button>');
});
addZoom(document);

// ----- parts folded only on phones and tablets: details[data-wide] is open from 901px up and closed below -----
// Set on load and again only when the width crosses 901px, so a reader's own opening and closing is kept in between.
// A link or address pointing at one (or into one, or at a section that holds one) opens it first, so the jump lands on its content.
const wideMq = matchMedia('(min-width:901px)');
const syncWide = root => $$('details[data-wide]', root).forEach(d => { d.open = wideMq.matches; });
syncWide(); wideMq.addEventListener && wideMq.addEventListener('change', () => syncWide());
const openFor = hash => {
  let t = null; try { t = hash.length > 1 && document.getElementById(decodeURIComponent(hash.slice(1))); } catch(e){}
  const d = t && (t.closest('details[data-wide]') || $(':scope>details[data-wide]', t));
  if (d && !d.open) { d.open = true; return t; }
};
document.addEventListener('click', e => {
  const a = e.target.closest('a[href*="#"]'); if (!a || a.pathname !== location.pathname || a.origin !== location.origin) return;
  openFor(a.hash);
}, true);
addEventListener('hashchange', () => openFor(location.hash));
{ const t = openFor(location.hash); if (t) requestAnimationFrame(() => t.scrollIntoView()); }

// ----- print: collapsed extras would vanish from paper, so open them for printing and close them again afterwards -----
addEventListener('beforeprint', () => $$('details.more,details[data-wide],details.pr,details.fl').forEach(d => { if (!d.open) { d.open = true; d.dataset.po = '1'; } }));
addEventListener('afterprint', () => $$('details[data-po]').forEach(d => { d.open = false; d.removeAttribute('data-po'); }));

// ----- videos: the poster image is fetched only when the reader opens the video -----
$$('details.vid').forEach(d => d.addEventListener('toggle', () => { const v = $('video[data-poster]', d); if (d.open && v && !v.getAttribute('poster')) v.poster = v.dataset.poster; }));

// ----- labs: a lab script that never arrived leaves its placeholder; say so instead of 「載入中」 -----
addEventListener('load', () => $$('.lab .lab-wait').forEach(p => { p.textContent = '實驗沒有載入，請重新整理頁面。'; }));

// ----- loop figures: a short animation that only runs while on screen, and never when motion is reduced -----
// initLoops(root) wires the loops under root once; the practice page calls it again for the figures in each explanation it renders.
const initLoops = (function(){
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  const io = 'IntersectionObserver' in window ? new IntersectionObserver(es => es.forEach(x => x.target.classList.toggle('run', x.isIntersecting))) : null;
  const seen = new Set();
  // Anyone can pause a loop (it then shows the still picture); with reduced motion there is nothing to pause, so the button hides.
  const apply = f => {
    const b = $('.lp-tog', f), paused = !!f.dataset.paused;
    f.classList.toggle('anim', !reduce.matches && !paused); if (!io) f.classList.add('run');
    if (b) { b.hidden = reduce.matches; b.textContent = paused ? '播放動畫' : '暫停動畫'; }
  };
  reduce.addEventListener && reduce.addEventListener('change', () => seen.forEach(apply));
  return root => {
    // Figures replaced by a re-render are let go of.
    seen.forEach(f => { if (!f.isConnected) { seen.delete(f); if (io) io.unobserve(f); } });
    $$('.loop', root).forEach(f => {
      if (seen.has(f)) return; seen.add(f);
      if (io) io.observe(f);
      const b = $('.lp-tog', f); if (b) b.onclick = () => { if (f.dataset.paused) delete f.dataset.paused; else f.dataset.paused = '1'; apply(f); };
      apply(f);
    });
  };
})();
initLoops(document);

// ----- step figures: one diagram, a few states, previous/next -----
$$('.stepfig').forEach(f => {
  const n = +f.dataset.n, ctl = $('.stepctl', f), lis = $$('.stepcap li', f), num = $('.stepn', f), [prev, next] = $$('button', ctl);
  const go = k => {
    k = Math.max(1, Math.min(n, k)); f.dataset.cur = k;
    lis.forEach((li, i) => li.classList.toggle('on', i === k - 1));
    num.textContent = k + ' / ' + n; prev.disabled = k === 1; next.disabled = k === n;
  };
  prev.onclick = () => go(+f.dataset.cur - 1); next.onclick = () => go(+f.dataset.cur + 1);
  f.addEventListener('keydown', e => { if (e.key === 'ArrowRight') next.click(); if (e.key === 'ArrowLeft') prev.click(); });
  // Without JS (and in print) the figure shows its most telling step; with JS it starts from the beginning.
  f.classList.add('js'); ctl.hidden = false; go(1);
});

// ----- worked examples -----
$$('.ex[data-a]').forEach(ex => {
  const a = +ex.dataset.a, why = $('.why', ex);
  $$('.opt', ex).forEach((b, k) => b.onclick = () => {
    $$('.opt', ex).forEach((x, j) => { x.disabled = true; const c = j === a ? 'correct' : j === k ? 'wrong' : ''; if (c) { x.classList.add(c); x.insertAdjacentHTML('beforeend', MK[c]); } });
    const t = $('b', why); if (t) t.textContent = k === a ? '答對了' : '答錯了，正解是 ' + LET[a];
    // The options are now disabled, so focus moves to the explanation instead of dropping to the page.
    why.hidden = false; why.classList.add(k === a ? 'ok' : 'bad'); why.tabIndex = -1; why.focus();
  });
});

// ----- toc highlight; the section in view also goes into the address -----
// On narrow screens the pinned contents bar names the section in view, and closes once a section is picked.
const tocLinks = $$('.toc a'), menuLinks = $$('.tocmenu .in a'), menuSum = $('.tocmenu summary');
menuLinks.forEach(a => a.addEventListener('click', () => { a.closest('details').open = false; }));
if ((tocLinks.length || menuLinks.length) && window.IntersectionObserver) {
  const io = new IntersectionObserver(es => es.forEach(e => {
    if (!e.isIntersecting) return;
    const h = '#' + e.target.id, m = menuLinks.find(a => a.getAttribute('href') === h);
    tocLinks.concat(menuLinks).forEach(a => a.classList.toggle('on', a.getAttribute('href') === h));
    if (menuSum && m) menuSum.textContent = '本章目錄・〈' + m.textContent + '〉';
  }), {rootMargin:'-20% 0px -70% 0px'});
  $$('article section[id]').forEach(s => io.observe(s));
}
// The address follows the section being read (replaced, never added to history, never scrolled to), so a kept tab or a bookmark
// comes back to the same place; above the first section it is the bare address again, and a deeper anchor inside that section is kept. Nothing is stored.
{
  const secs = $$('article section[id]'); let queued = false;
  const sync = () => {
    queued = false; let cur = null, t = null;
    for (const s of secs) { if (s.getBoundingClientRect().top <= innerHeight * .25) cur = s; else break; }
    try { t = location.hash.length > 1 && document.getElementById(decodeURIComponent(location.hash.slice(1))); } catch(e){}
    // Keep an anchor that is at or above the reading line and inside or after the current section (a figure, 重點整理 after the last section).
    if (t ? t.getBoundingClientRect().top <= innerHeight * .25 && (!cur || cur.contains(t) || cur.compareDocumentPosition(t) & 4) : !cur) return;
    try { history.replaceState(history.state, '', location.pathname + location.search + (cur ? '#' + cur.id : '')); } catch(e){}
  };
  if (secs.length) addEventListener('scroll', () => { if (!queued) { queued = true; requestAnimationFrame(sync); } }, {passive: true});
}

// Where someone stopped reading is not kept; earlier versions kept it, so clear it.
try { localStorage.removeItem('aiot-guide-last'); } catch(e){}

// ----- review page: one part at a time (公式／指引差異／各章重點). The address picks the part, so #guide and #r-s1-21 open the right one. -----
const rtabs = $('.rtabs');
if (rtabs) {
  const ref = rtabs.closest('.ref'), parts = $$('.rpart', ref), tabs = $$('a', rtabs), rchips = $('.gchips', ref);
  const whole = h => tabs.some(a => a.hash === h);
  const partOf = hash => { let t = null; try { t = hash.length > 1 && document.getElementById(decodeURIComponent(hash.slice(1))); } catch(e){} const p = t && t.closest('.rpart'); return p ? {name: p.dataset.part, t} : null; };
  const show = name => {
    if (ref.dataset.part === name) return;
    ref.dataset.part = name;
    parts.forEach(p => { p.hidden = p.dataset.part !== name; });
    tabs.forEach(a => a.dataset.part === name ? a.setAttribute('aria-current', 'true') : a.removeAttribute('aria-current'));
    // The chapter list only belongs to 各章重點; resize lets the pinned strip re-measure itself.
    if (rchips) rchips.hidden = name !== 'chapters';
    dispatchEvent(new Event('resize'));
  };
  // A part name keeps the switch in view (the browser may already have jumped to the hidden part heading); anything inside a part is scrolled to once its part shows.
  const keepTabs = () => { const y = rtabs.getBoundingClientRect().top; if (y < cssPx('--hdr') || y > innerHeight / 2) rtabs.scrollIntoView({block: 'start'}); };
  const go = () => {
    const hit = partOf(location.hash); show(hit ? hit.name : 'formulas');
    if (hit) requestAnimationFrame(() => whole(location.hash) ? keepTabs() : hit.t.scrollIntoView());
  };
  ref.classList.add('tabbed');
  // On arrival with a part name, start from the top of the page like any other visit.
  const top = () => { if (whole(location.hash)) scrollTo(0, 0); };
  show((partOf(location.hash) || {name: 'formulas'}).name); top();
  if (location.hash && !whole(location.hash)) go();
  addEventListener('load', () => requestAnimationFrame(top), {once: true});
  document.addEventListener('click', e => {
    const a = e.target.closest('a[href*="#"]'); if (!a || a.pathname !== location.pathname || a.origin !== location.origin) return;
    const hit = partOf(a.hash); if (!hit) return;
    if (!rtabs.contains(a)) { show(hit.name); return; }
    // A tab switches in place: the switch stays where it is instead of the page jumping to a hidden heading.
    e.preventDefault();
    if (location.hash !== a.hash) history.pushState(null, '', a.hash);
    show(hit.name); keepTabs();
  }, true);
  addEventListener('hashchange', go); addEventListener('popstate', go);
}

// ----- jump chips (glossary, review page): pinned strip up to 1240px, side list from 1241px; both mark where the reader is -----
const chipNav = $('.gchips');
if (chipNav) {
  const links = $$('a', chipNav), wideL = matchMedia('(min-width:1241px)');
  // --chiph: the pinned strip's height, so group headings and anchor jumps sit below it. 0 when hidden or in the side column.
  const setChip = () => document.documentElement.style.setProperty('--chiph', (wideL.matches || chipNav.hidden ? 0 : chipNav.offsetHeight) + 'px');
  setChip(); addEventListener('resize', setChip); window.ResizeObserver && new ResizeObserver(setChip).observe(chipNav);
  // Each link owns its target; a heading target also owns the blocks after it, up to the next target or h2.
  const tg = links.map(a => document.getElementById(decodeURIComponent(a.hash.slice(1)))), own = new Map();
  tg.forEach((t, i) => { if (!t) return; own.set(t, i); if (t.tagName === 'H2') for (let n = t.nextElementSibling; n && !tg.includes(n) && n.tagName !== 'H2'; n = n.nextElementSibling) own.set(n, i); });
  if (window.IntersectionObserver) {
    const vis = new Set(); let cur = -1, want = -1;
    // Cards side by side (the review page's two columns) can share a row: the one just picked from the list wins while it is in view.
    links.forEach((a, i) => a.addEventListener('click', () => { want = i; }));
    const io = new IntersectionObserver(es => {
      es.forEach(x => x.isIntersecting ? vis.add(x.target) : vis.delete(x.target));
      let best = -1; vis.forEach(n => { const i = own.get(n); if (n.offsetParent && (best < 0 || i < best)) best = i; });
      if ([...vis].some(n => own.get(n) === want && n.offsetParent)) best = want; else want = -1;
      if (best < 0 || best === cur) return; cur = best;
      links.forEach((a, i) => i === cur ? a.setAttribute('aria-current', 'true') : a.removeAttribute('aria-current'));
      // Keep the marked link in sight inside the list or strip, without moving the page.
      const nr = chipNav.getBoundingClientRect(), ar = links[cur].getBoundingClientRect();
      if (ar.top < nr.top || ar.bottom > nr.bottom) chipNav.scrollTop += ar.top - nr.top - nr.height / 2;
      if (ar.left < nr.left || ar.right > nr.right) chipNav.scrollLeft += ar.left - nr.left - nr.width / 2;
    // The band starts below the header and the pinned strip, so the block above a jump target, ending just over it, is not marked.
    }, {rootMargin: -(cssPx('--hdr') + Math.max(60, cssPx('--chiph') + 24)) + 'px 0px -55% 0px'});
    own.forEach((i, n) => io.observe(n));
  }
}

// ----- glossary -----
const gq = $('#gq');
if (gq) {
  const items = $$('.gitem'), confs = $$('.conf'), subj = $('#gs'), count = $('#gcount');
  const byCh = $('#gch'), az = $('#gaz'), conf = $('#gconf'), chips = $('.gchips'), btns = $$('.gview button');
  const home = items.map(it => it.parentNode), figs = $$('.gfig');
  const norm = v => v.normalize('NFKC').toLowerCase();
  // Search reads the term, English name and definition only, taken before the chapter codes below are added.
  const text = new Map(items.map(it => [it, norm(it.textContent)]));
  // The name view takes each term out of its chapter group, so it ends with the codes of the chapters that teach it (data-s), linked.
  const code = c => { const a = $('a[href="#g-' + c + '"] .c', chips); return a ? a.textContent : c; };
  items.forEach(it => { const w = document.createElement('span'); w.className = 'gw'; w.innerHTML = it.dataset.s.split(' ').map(c => '<a href="' + c + '.html">' + esc(code(c)) + '</a>').join(''); it.append(w); });
  const coll = new Intl.Collator('zh-TW-u-co-zhuyin', {numeric: true, sensitivity: 'base'});
  // English and acronyms first (A–Z), then Chinese terms.
  const name = it => it.querySelector('b').textContent, latin = s => /^[A-Za-z0-9]/.test(s) ? 0 : 1;
  const sorted = items.slice().sort((a, b) => latin(name(a)) - latin(name(b)) || coll.compare(name(a), name(b)));
  let view = 'ch';
  function show(v, keep){
    view = v;
    btns.forEach(b => b.setAttribute('aria-pressed', String(b.dataset.v === v)));
    if (v === 'az') sorted.forEach(it => az.appendChild(it)); else items.forEach((it, i) => home[i].appendChild(it));
    byCh.hidden = v !== 'ch'; az.hidden = v !== 'az'; conf.hidden = v !== 'conf';
    if (keep !== false) store.set('gview', v); run();
  }
  // Nothing found: say so in the page, not only in the small count.
  const empty = document.createElement('p'); empty.className = 'muted'; empty.id = 'gempty'; empty.hidden = true;
  byCh.before(empty);
  function run(){
    const q = norm(gq.value.trim()), s = subj.value; let n = 0;
    const list = view === 'conf' ? confs : items;
    list.forEach(it => { const ok = (!q || (text.get(it) || norm(it.textContent)).includes(q)) && (!s || it.dataset.s.includes(s)); it.hidden = !ok; if (ok) n++; });
    figs.forEach(f => { f.hidden = !!q; });
    $$('.gsec').forEach(sec => { sec.hidden = !$$('.gitem', sec).some(it => !it.hidden); });
    $$('a', chips).forEach(a => { const sec = $(a.getAttribute('href')); a.hidden = !sec || sec.hidden; });
    chips.hidden = view !== 'ch' || !$$('a', chips).some(a => !a.hidden);
    count.textContent = n + (view === 'conf' ? ' 組' : ' 個關鍵字');
    empty.hidden = n > 0;
    if (!n) {
      const t = gq.value.trim();
      // Nothing among the confusables, but the term is a keyword: show it there, without changing the view this reader keeps.
      if (view === 'conf' && q && items.some(it => text.get(it).includes(q) && (!s || it.dataset.s.includes(s)))) {
        show('ch', false); empty.textContent = '易混淆裡沒有「' + t + '」，改列出全部關鍵字的結果。'; empty.hidden = false; return;
      }
      // An acronym that is not here will not turn up as another acronym; suggest the Chinese name instead.
      empty.textContent = t ? '找不到「' + t + '」，試試' + (/^[\x20-\x7e]+$/.test(t) ? '中文名稱' : '英文縮寫') + (s ? '或換科目。' : '。') : '這個科目沒有符合的項目，試試換科目。';
    }
  }
  btns.forEach(b => b.onclick = () => show(b.dataset.v));
  gq.oninput = run; subj.onchange = run;
  // The "搜尋" link in each chapter group heading jumps back up and puts the cursor in the box.
  $$('a[href="#gq"]').forEach(a => a.addEventListener('click', () => setTimeout(() => gq.focus({preventScroll:true}))));
  // A link to #conf, to one confusable group (#conf-...) or to one chapter's group (#g-...) opens that view without changing the view this reader chose before.
  const hv = /^#conf(-|$)/.test(location.hash) ? 'conf' : /^#g-/.test(location.hash) ? 'ch' : null;
  const want = hv || store.get('gview');
  show(btns.some(b => b.dataset.v === want) ? want : 'ch', !hv);
  // The browser may have tried the anchor before the view switched; go there again now that it is shown.
  const target = location.hash.length > 1 && document.getElementById(decodeURIComponent(location.hash.slice(1)));
  if (target && target.offsetParent) target.scrollIntoView();
}

// ----- terms taught in other chapters: tap to see the definition in place -----
const glData = $('#gldata');
if (glData) (function(){
  const data = JSON.parse(glData.textContent);
  const pop = document.createElement('div');
  pop.className = 'glpop noread'; pop.id = 'glpop'; pop.hidden = true; pop.setAttribute('role', 'region');
  document.body.appendChild(pop);
  let cur = null;
  // Open, the box sits right after its button, so Tab reaches its link next and screen readers meet it in order.
  // Closed, it goes back to the end of the page so the paragraph is as built (read aloud and copying see no extra text).
  function close(){ if (!cur) return; cur.setAttribute('aria-expanded', 'false'); cur = null; pop.hidden = true; document.body.appendChild(pop); }
  function open(b){
    const d = data[b.dataset.k]; if (!d) return;
    close(); cur = b; b.setAttribute('aria-expanded', 'true');
    pop.setAttribute('aria-label', d.t + '：說明');
    pop.innerHTML = '<b>' + esc(d.t) + '</b>' + (d.en ? ' <span class="en">' + esc(d.en) + '</span>' : '') + '<span class="d">' + esc(d.d) + '</span><a href="' + d.u + '">在 ' + esc(d.h) + ' 細講</a>';
    b.after(pop); pop.hidden = false;
    const r = b.getBoundingClientRect(), w = pop.offsetWidth;
    pop.style.left = Math.max(8, Math.min(scrollX + r.left, scrollX + document.documentElement.clientWidth - w - 8)) + 'px';
    pop.style.top = (scrollY + r.bottom + 6) + 'px';
  }
  document.addEventListener('click', ev => {
    const b = ev.target.closest('.gl');
    if (b) { ev.preventDefault(); if (b === cur) close(); else open(b); return; }
    if (!pop.contains(ev.target)) close();
  });
  document.addEventListener('keydown', ev => { if (ev.key === 'Escape' && cur){ const b = cur; close(); b.focus(); } });
  // Tabbing on past the box closes it. A click on the box's own text moves focus nowhere (no relatedTarget), so it stays open.
  document.addEventListener('focusout', ev => {
    const to = ev.relatedTarget;
    if (!cur || !to || to === cur || pop.contains(to)) return;
    if (ev.target === cur || pop.contains(ev.target)) close();
  });
  let w = innerWidth;
  addEventListener('resize', () => { if (innerWidth !== w) { w = innerWidth; close(); } });
})();

// ----- practice -----
const qa = $('#quizApp');
if (qa && !window.AIOT_QUESTIONS) { const su = $('#quizSetup'); if (su) su.hidden = true; qa.innerHTML = '<p class="lab-err">題庫沒有載入，請重新整理頁面。</p>'; }
if (qa && window.AIOT_QUESTIONS) (function(){
  const ALL = window.AIOT_QUESTIONS, CH = window.AIOT_CHAPTERS, CONF = window.AIOT_CONF || {};
  const fS = $('#fSubject'), fC = $('#fChapter'), fN = $('#fCount'), fM = $('#fMode'), avail = $('#fAvail');
  let run = null, tick = null;
  const UI = window.AIOT_UI || {keyHint:'A–D 選答、← → 換題', keyHintExam:'', redo:'重做答錯的 {n} 題', again:'重新設定', rest:'做完沒作答的 {n} 題'};
  function pool(){ return ALL.filter(q => (!fS.value || q.subject === fS.value) && (!fC.value || q.lesson === fC.value)); }
  function fillChapters(){
    const cur = fC.value;
    fC.innerHTML = '<option value="">全部章節</option>' + CH.filter(c => !fS.value || c.subject === fS.value).map(c => '<option value="' + c.id + '">' + esc(c.code + ' ' + c.title) + '</option>').join('');
    if ([...fC.options].some(o => o.value === cur)) fC.value = cur;
  }
  function updAvail(){ avail.textContent = '共 ' + pool().length + ' 題'; }
  // Nothing about the reader's answers is kept between visits; earlier versions kept a wrong-answer list, so clear it.
  try { localStorage.removeItem('aiot-guide-wrong'); } catch(e){}
  fS.onchange = () => { fillChapters(); updAvail(); }; fC.onchange = updAvail;
  const shuffle = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--){ const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const chName = id => { const c = CH.find(x => x.id === id); return c ? c.code + ' ' + c.title : ''; };
  // Point at the section that teaches the question when one is tagged; otherwise the chapter.
  const backLink = q => { const c = CH.find(x => x.id === q.lesson), h = q.sec && c && c.secs[q.sec];
    return h ? '<a href="' + q.lesson + '.html#' + q.sec + '">回到〈' + esc(h) + '〉</a>' : '<a href="' + q.lesson + '.html">讀〈' + esc(chName(q.lesson)) + '〉</a>'; };

  $('#qStart').onclick = () => start(shuffle(pool()).slice(0, +fN.value || 9999), fM.value);
  function start(qs, mode){
    if (!qs.length) { avail.textContent = '這個範圍沒有題目。'; return; }
    clearInterval(tick); say('');
    // Options are shown in a fresh order each run; answers are still stored as the original index.
    run = {qs, mode, i:0, ans:{}, perm:Object.fromEntries(qs.map(q => [q.id, shuffle([0, 1, 2, 3])])), t0:Date.now(), limit: qs.length * 90000};
    $('#quizSetup').hidden = true; render('moved');
    if (mode === 'exam') countdown();
  }
  function countdown(){ tick = setInterval(() => { const t = $('#timer'); if (!t) return; const ms = run.t0 + run.limit - Date.now(); t.textContent = fmt(ms); if (ms <= 0) finish(true); }, 1000); }
  const fmt = ms => { ms = Math.max(0, ms); return Math.floor(ms / 60000) + ':' + String(Math.floor(ms % 60000 / 1000)).padStart(2, '0'); };
  // The chapter code in its subject colour, so 2.2 and 2-2 tell apart at a glance; a review card adds its number and the verdict.
  const qcap = (q, num, v) => { const c = CH.find(x => x.id === q.lesson) || {};
    return (num != null ? '<span>第 ' + (num + 1) + ' 題</span>' : '') + '<span><span class="tag ' + c.subject + '">' + esc(c.code) + '</span> ' + esc(c.title) + '</span>' + (v || ''); };
  function qBlock(q, picked, reveal, head){
    const perm = run.perm[q.id] || [0, 1, 2, 3], live = !(reveal && picked != null);
    let h = (head === false ? '' : '<p class="qcap noread">' + qcap(q) + '</p>') + '<div class="qtext">' + esc(q.q) + '</div><div class="opts">';
    perm.forEach((k, pos) => {
      let c = ''; if (reveal && picked != null){ if (k === q.a) c = 'correct'; else if (k === picked) c = 'wrong'; } else if (picked === k) c = 'picked';
      // Once revealed, each option carries its own short note (w is in the original order, so it follows data-k through the shuffle).
      const note = reveal && picked != null && q.w ? '<span class="wn">' + esc(q.w[k]) + '</span>' : '';
      h += '<button type="button" class="opt ' + c + (note ? ' hasw' : '') + '" data-k="' + k + '"' + (live ? ' aria-keyshortcuts="' + LET[pos] + ' ' + (pos + 1) + '"' : ' disabled') + '><span class="k">' + LET[pos] + '</span><span class="ot">' + esc(q.o[k]) + '</span>' + (MK[c] || '') + note + '</button>';
    });
    h += '</div>';
    // A timed run reviews unanswered questions too (picked -1): say so, on a neutral background.
    // The box: the answer, the core idea, a clue for next time (when there is one), then where to read more.
    const conf = q.conf && CONF[q.conf] ? '<a href="glossary.html#conf-' + q.conf + '">易混淆：' + esc(CONF[q.conf]) + '</a>' : '';
    // A figure, when the question has one, sits right after the core idea it pictures (built and checked by build.py; a loop gets the usual pause button).
    const fig = q.fig ? '<figure class="dg qfig' + (q.loop ? ' loop' : '') + '"' + (q.loop ? '' : ' title="點圖放大"') + '>' + q.fig
      + (q.loop ? '<button type="button" class="btn ghost lp-tog noread noprint" hidden>暫停動畫</button>' : '') + (q.figcap ? '<figcaption>' + esc(q.figcap) + '</figcaption>' : '') + '</figure>' : '';
    if (reveal && picked != null) h += '<div class="why' + (picked === -1 ? '' : picked === q.a ? ' ok' : ' bad') + '"><b>' + (picked === q.a ? '答對了' : (picked === -1 ? '未作答・' : '') + '正解是 ' + LET[perm.indexOf(q.a)]) + '</b><p>' + esc(q.e) + '</p>' + fig
      + (q.tip ? '<p class="clue"><b>解題線索</b>' + esc(q.tip) + '</p>' : '') + '<p class="small qlinks">' + backLink(q) + conf + '</p></div>';
    return h;
  }
  // Move the reader (and focus) to what changed, so nobody has to scroll to find the explanation or the next question.
  const smooth = () => matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';
  const focusOn = el => { if (!el) return; if (!el.matches('button,a')) el.tabIndex = -1; el.focus({preventScroll:true}); };
  const say = m => { const s = $('#qStatus'); if (s) s.textContent = m; };
  function render(why){
    if (run.done) return result();
    const q = run.qs[run.i], picked = run.ans[q.id], done = Object.keys(run.ans).length, ex = run.mode === 'exam', left = run.qs.length - done;
    // Learn mode: ending early is a quiet text button in the progress row, away from 上一題／下一題; on the last question 下一題 itself becomes 看結果.
    const end = !ex && run.i + 1 < run.qs.length ? '<button type="button" class="linkbtn" id="qEnd">提早看結果</button>' : '';
    // 朗讀 sits at the end of the progress row in both modes; the clock or the early finish goes between (a line of its own in the narrow right column).
    const top = '<div class="qtop"><div class="qhead"><span>第 <b>' + (run.i + 1) + '</b> / ' + run.qs.length + ' 題</span><span class="qx">' + (ex ? '<span>剩餘 <b class="mono" id="timer">' + fmt(run.t0 + run.limit - Date.now()) + '</b></span>' : '') + end + '</span><button type="button" class="say" data-say-card>朗讀</button></div><div class="bar"><i style="width:' + (done / run.qs.length * 100) + '%"></i></div></div>';
    const prev = '<button type="button" class="btn ghost" id="qPrev" aria-keyshortcuts="ArrowLeft"' + (run.i ? '' : ' disabled') + '>上一題</button>';
    const act = ex ? '<button type="button" class="btn ghost" id="qSubmit">' + (run.confirm ? '還有 ' + left + ' 題未作答，再按一次交卷' : '交卷') + '</button>' : '';
    const next = '<button type="button" class="btn" id="qNext" aria-keyshortcuts="ArrowRight Enter">' + (run.i + 1 < run.qs.length ? '下一題' : '看結果') + '</button>';
    const grid = ex ? '<div class="grid noread">' + run.qs.map((x, k) => '<button type="button" data-j="' + k + '" class="' + (run.ans[x.id] != null ? 'ans ' : '') + (k === run.i ? 'cur' : '') + '" aria-label="第 ' + (k + 1) + ' 題' + (run.ans[x.id] != null ? '，已作答' : '') + '"' + (k === run.i ? ' aria-current="step"' : '') + '>' + (k + 1) + '</button>').join('') + '</div>' : '';
    // From 901px the question has the left column and a pinned right column holds progress, clock, number grid, the end button and the key hint;
    // below that one column as before, with previous / end / next in the bottom bar. The end button cannot move there by CSS alone, so the markup follows the width.
    const h = wideMq.matches
      ? '<div class="quiz two' + (ex ? ' exam' : '') + '" data-read><div class="qmain">' + qBlock(q, picked, !ex) + '<div class="qnav noread">' + prev + next + '</div></div>'
        + '<div class="qside noread">' + top + grid + (act ? '<div class="qact">' + act + '</div>' : '') + '<p class="keyhint">' + esc(UI.keyHint + (ex ? UI.keyHintExam : '')) + '</p></div>'
      : '<div class="quiz' + (ex ? ' exam' : '') + '" data-read>' + top + qBlock(q, picked, !ex) + '<div class="qnav noread">' + prev + act + next + '</div>' + grid;
    qa.innerHTML = h + '</div>';
    $$('.opt', qa).forEach(b => b.onclick = () => { run.ans[q.id] = +b.dataset.k; run.confirm = false; render('answered'); });
    $('#qPrev').onclick = () => { run.i--; run.confirm = false; render('moved'); };
    $('#qNext').onclick = () => { run.confirm = false; if (run.i + 1 < run.qs.length){ run.i++; render('moved'); } else finish(); };
    // Submitting with unanswered questions takes a second press, so a stray tap cannot end the test.
    if ($('#qEnd')) $('#qEnd').onclick = () => finish();
    if ($('#qSubmit')) $('#qSubmit').onclick = () => { if (left && !run.confirm){ run.confirm = true; render('confirm'); } else finish(); };
    $$('.grid button', qa).forEach(b => b.onclick = () => { run.i = +b.dataset.j; run.confirm = false; render('moved'); });
    // A long grid scrolls inside the right column: keep the current number in its view.
    const gr = $('.qside .grid', qa), gc = gr && $('.cur', gr);
    if (gc && gr.scrollHeight > gr.clientHeight) gr.scrollTop += gc.getBoundingClientRect().top - gr.getBoundingClientRect().top - gr.clientHeight / 2;
    initLoops(qa); addZoom(qa);
    if (why === 'answered' && !ex) { const w = $('.why', qa); focusOn(w); w.scrollIntoView({block:'nearest', behavior:smooth()}); }
    else if (why === 'answered') focusOn($('.opt[data-k="' + picked + '"]', qa));
    else if (why === 'moved') { qa.scrollIntoView({block:'start'}); focusOn($('.qtext', qa)); }
    else if (why === 'confirm') focusOn($('#qSubmit'));
  }
  function finish(timeUp){ clearInterval(tick); run.done = true; run.timeUp = !!timeUp; result(); qa.scrollIntoView({block:'start'}); focusOn($('.score', qa)); if (timeUp) say('時間到，已自動交卷'); }
  function result(){
    const answered = run.qs.filter(q => run.ans[q.id] != null), ok = answered.filter(q => run.ans[q.id] === q.a).length;
    const total = run.mode === 'exam' ? run.qs.length : answered.length;
    // Answered wrong and not answered are offered separately, so the numbers match what the reader did.
    const wr = answered.filter(q => run.ans[q.id] !== q.a), un = run.qs.filter(q => run.ans[q.id] == null);
    // A one-chapter drill ends with a way back to that chapter's summary and on to the next chapter.
    const one = new Set(run.qs.map(q => q.lesson)).size === 1 ? CH.find(c => c.id === run.qs[0].lesson) : null, nx = one && one.next && CH.find(c => c.id === one.next);
    // One solid button on the page, chosen by the score: below 70% redoing the wrong ones (and the chapter summary comes before the next chapter);
    // otherwise the next chapter of a one-chapter drill, or a new setup.
    const low = total > 0 && ok / total < .7, lead = low ? (wr.length ? 'redo' : un.length ? 'rest' : 'again') : nx ? 'next' : 'again';
    const cls = k => k === lead ? 'btn' : 'btn ghost';
    const onward = one ? '<div class="row onward"><a class="btn ghost" href="' + one.id + '.html#keypoints">本章重點整理</a>' + (nx ? '<a class="' + cls('next') + '" href="' + nx.id + '.html">下一章：' + esc(nx.code + ' ' + nx.title) + '</a>' : '') + '</div>' : '';
    const by = {}; run.qs.forEach(q => { if (run.mode !== 'exam' && run.ans[q.id] == null) return; const b = by[q.lesson] || (by[q.lesson] = {n:0, ok:0}); b.n++; if (run.ans[q.id] === q.a) b.ok++; });
    // The same buttons again under the review list (all quiet there), so nobody scrolls back up; data-act ties both rows to one handler (ids stay on the top row).
    const one1 = (k, text, top) => '<button type="button" class="' + (top ? cls(k) : 'btn ghost') + '" data-act="' + k + '"' + (top ? ' id="q' + k[0].toUpperCase() + k.slice(1) + '"' : '') + '>' + esc(text) + '</button>';
    const acts = top => [wr.length && ['redo', UI.redo.replace('{n}', wr.length)], un.length && ['rest', UI.rest.replace('{n}', un.length)], ['again', UI.again]]
      .filter(Boolean).sort((a, b) => (b[0] === lead) - (a[0] === lead)).map(([k, t]) => one1(k, t, top)).join('');
    const pct = '<p>' + (total ? '答對率 ' + Math.round(ok / total * 100) + '%<span class="muted">（及格參考 70%）</span>' : '還沒有作答') + '</p>';
    const row = '<div class="row">' + acts(true) + '</div>';
    let h = '<div class="quiz res"><div class="panel">' + (run.timeUp ? '<p><b>時間到，已自動交卷。</b></p>' : '') + '<div class="score">' + ok + ' / ' + total + '</div>' + pct + (lead === 'next' ? onward + row : row + onward) + '</div>';
    const rows = Object.keys(by).sort((a, b) => by[a].ok / by[a].n - by[b].ok / by[b].n);
    // Each chapter row can start a drill of that chapter's questions straight away.
    if (rows.length > 1) h += '<h2>各章表現</h2><div class="tblwrap facts" tabindex="0" role="region" aria-label="表格，可左右捲動"><table><thead><tr><th>章節</th><th>答對</th><th><span class="sr">練習</span></th></tr></thead><tbody>' + rows.map(k => { const c = CH.find(x => x.id === k) || {}; return '<tr><td><a href="' + k + '.html"><span class="tag ' + c.subject + '">' + esc(c.code) + '</span> ' + esc(c.title) + '</a></td><td class="mono nw">' + by[k].ok + ' / ' + by[k].n + '</td><td class="nw"><button type="button" class="btn ghost" data-drill="' + k + '" aria-label="練這章：' + esc(c.code + ' ' + c.title) + '">練這章</button></td></tr>'; }).join('') + '</tbody></table></div>';
    // Review in question order: wrong (and, timed, unanswered) ones stay open in full; right ones fold to their number and stem on phones and tablets (open from 901px).
    const rev = run.qs.map((q, n) => ({q, n})).filter(x => run.mode === 'exam' || run.ans[x.q.id] != null);
    if (rev.length) h += '<h2>檢討</h2>' + rev.map(({q, n}) => {
      const p = run.ans[q.id];
      if (p === q.a) return '<details class="ex okq" data-wide><summary><span class="qcap">' + qcap(q, n, '<span class="qv ok">✓ 答對</span>') + '</span><span class="st">' + esc(q.q) + '</span></summary>' + qBlock(q, p, true, false) + '</details>';
      return '<div class="ex"><p class="qcap noread">' + qcap(q, n, '<span class="qv">' + (p == null ? '未作答' : '✕ 答錯') + '</span>') + '</p>' + qBlock(q, p == null ? -1 : p, true, false) + '</div>';
    }).join('') + '<div class="row qacts noread">' + acts(false) + '</div>';
    qa.innerHTML = h + '</div>';
    $$('.opt', qa).forEach(b => b.disabled = true);
    syncWide(qa);
    initLoops(qa); addZoom(qa);
    const act = {
      again: () => { run = null; forget(); qa.innerHTML = ''; $('#quizSetup').hidden = false; say(''); focusOn($('#qStart')); },
      redo: () => start(shuffle(wr), 'learn'),
      rest: () => start(un, run.mode)
    };
    $$('[data-act]', qa).forEach(b => b.onclick = act[b.dataset.act]);
    $$('[data-drill]', qa).forEach(b => b.onclick = () => { pick(b.dataset.drill); start(shuffle(pool()), 'learn'); });
  }
  // Preselect one chapter (its subject, the chapter, all of its questions) in the setup.
  function pick(id){ const c = CH.find(x => x.id === id); if (!c) return false; fS.value = c.subject; fillChapters(); fC.value = id; fN.value = '0'; updAvail(); return true; }
  // Crossing 901px redraws the question in the other layout; focus inside it goes back to the question text.
  wideMq.addEventListener && wideMq.addEventListener('change', () => {
    if (!run || run.done || !$('.quiz', qa)) return;
    const had = qa.contains(document.activeElement); render(); if (had) focusOn($('.qtext', qa));
  });
  // Keyboard: 1–4 or A–D picks an option, → or Enter goes on, ← goes back, G (timed) jumps to the number grid.
  // Not while typing in a field, not with a modifier, and Enter on a button or link keeps its own meaning.
  document.addEventListener('keydown', e => {
    if (!run || run.done || e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey || !$('.quiz', qa) || $('.zoom')) return;
    const t = e.target instanceof Element ? e.target : document.body, k = e.key;
    if (t.closest('input,select,textarea,[contenteditable="true"],#reader')) return;
    const n = k.length === 1 ? ('1234'.indexOf(k) + 1 || 'abcd'.indexOf(k.toLowerCase()) + 1) - 1 : -1;
    const hit = b => { if (b && !b.disabled) { e.preventDefault(); b.click(); } };
    if (n >= 0) hit($$('.opt', qa)[n]);
    else if (k === 'ArrowRight' || (k === 'Enter' && !t.closest('button,a,summary'))) hit($('#qNext', qa));
    else if (k === 'ArrowLeft') hit($('#qPrev', qa));
    else if ((k === 'g' || k === 'G') && run.mode === 'exam') { const g = $('.grid button.cur', qa) || $('.grid button', qa); if (g) { e.preventDefault(); g.focus(); } }
  });
  fillChapters();
  // Coming from a chapter's "練習這一章": preselect that subject and chapter, and all of its questions.
  pick(location.hash.slice(1));
  updAvail();
  // A link to practice.html#<chapter> on this page (no reload) does the same and brings the setup back; only such a link changes the hash here.
  addEventListener('hashchange', () => {
    if (!pick(location.hash.slice(1))) return;
    clearInterval(tick); run = null; forget(); qa.innerHTML = ''; $('#quizSetup').hidden = false; say('');
    $('#quizSetup').scrollIntoView({block:'start'}); focusOn($('#qStart'));
  });
  // practice.html?q=<id>,<id> opens those questions directly (used to link a question and by the tests).
  const want = (new URLSearchParams(location.search).get('q') || '').split(',').map(id => ALL.find(q => q.id === id)).filter(Boolean);
  if (want.length) start(want, 'learn');
  // A run in progress survives a trip to a chapter and back. Browsers usually keep the page as it was (bfcache);
  // when they do not, the run is put back from this tab's session storage, with a timed run's clock still counting from its start.
  const KEY = 'aiot-guide-run';
  const forget = () => { try { sessionStorage.removeItem(KEY); } catch(e){} };
  addEventListener('pagehide', () => {
    try {
      if (!run) return sessionStorage.removeItem(KEY);
      sessionStorage.setItem(KEY, JSON.stringify({ids:run.qs.map(q => q.id), i:run.i, ans:run.ans, perm:run.perm, mode:run.mode, t0:run.t0, limit:run.limit, done:!!run.done, timeUp:!!run.timeUp}));
    } catch(e){}
  });
  const nav = performance.getEntriesByType && performance.getEntriesByType('navigation')[0];
  // Back and forward bring back the run as it was, results included; a reload brings back only a run still under way.
  // Session storage ends with the tab, so nothing outlives it; 「重新設定」 clears it at once.
  const back = nav && nav.type === 'back_forward';
  if (nav && (back || nav.type === 'reload') && !qa.children.length) (function(){
    let saved = null; try { saved = JSON.parse(sessionStorage.getItem(KEY)); } catch(e){}
    if (!saved || !Array.isArray(saved.ids)) return;
    if (saved.done && !back) return forget();
    const qs = saved.ids.map(id => ALL.find(q => q.id === id));
    if (!qs.length || qs.some(q => !q)) return forget();
    run = {qs, mode:saved.mode, i:Math.min(saved.i | 0, qs.length - 1), ans:saved.ans || {}, perm:saved.perm || {}, t0:saved.t0, limit:saved.limit, done:saved.done, timeUp:saved.timeUp};
    $('#quizSetup').hidden = true; render();
    if (run.mode === 'exam' && !run.done) countdown();
  })();
})();

// ----- wide tables and figures: say so when one is wider than the screen -----
// Lab pictures are drawn by the lab scripts, so each new one is fitted as it appears: at most 1.15 of its viewBox width (its text never outgrows the body text),
// and on a phone, when it has text, at least 0.8 of it (--minw in site.css), scrolling sideways inside .lab-viz rather than shrinking the text.
const fitLab = svg => { if (svg.dataset.fit) return; const w = svg.viewBox && svg.viewBox.baseVal && svg.viewBox.baseVal.width; if (!w) return;
  svg.dataset.fit = '1'; svg.style.maxWidth = Math.round(w * 1.15) + 'px'; if (svg.querySelector('text')) svg.style.setProperty('--minw', Math.round(w * .8) + 'px'); };
(function(){
  const check = () => $$('.tblwrap, article .dgs, .ref .dgs, .lab-viz').forEach(w => {
    let h = w.previousElementSibling; if (h && !h.classList.contains('tblhint')) h = null;
    const over = w.scrollWidth > w.clientWidth + 1;
    if (over && !h) { h = document.createElement('p'); h.className = 'tblhint small muted noread noprint'; h.textContent = w.classList.contains('tblwrap') ? '表格可左右滑動 →' : '圖可左右滑動 →'; w.before(h); }
    if (h) h.hidden = !over;
    // A figure that scrolls must be reachable by keyboard too (tables carry this in their markup).
    if (!w.classList.contains('tblwrap')) {
      if (over) { w.tabIndex = 0; w.setAttribute('role', 'region'); w.setAttribute('aria-label', '圖，可左右捲動'); }
      else if (w.hasAttribute('tabindex')) { w.removeAttribute('tabindex'); w.removeAttribute('role'); w.removeAttribute('aria-label'); }
    }
  });
  let queued = false;
  const later = () => { if (queued) return; queued = true; requestAnimationFrame(() => { queued = false; check(); }); };
  $$('.lab-viz svg').forEach(fitLab); check(); addEventListener('resize', later);
  // Watch for lab pictures drawn (or whole labs redrawn) after load: fit them before they are painted, then update the hints.
  if ('MutationObserver' in window) new MutationObserver(ms => { if (ms.some(m => [...m.addedNodes].some(n => n.nodeType === 1 && (n.matches('svg, .lab-viz') || n.querySelector('.lab-viz'))))) { $$('.lab-viz svg').forEach(fitLab); later(); } })
    .observe(document.querySelector('main') || document.body, {childList:true, subtree:true});
})();

// ----- read aloud -----
const reader = $('#reader');
if (reader) (function(){
  const synth = window.speechSynthesis, ok = !!(synth && window.SpeechSynthesisUtterance);
  const ios = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const FIX = ios ? '到 iOS 設定下載中文語音' : '改用 Edge 或 Chrome';
  const BLOCK = 'h1,h2,h3,p,li,tr,figcaption,.qtext,.opt,[data-say]';
  const SKIP = '.say,.noread,.side,.toc,.sidemenu,.pager,#reader,svg,video,.vid,.lab,.srcs,script,style';
  const now = $('#reader .now'), pos = $('#rdPos'), txt = $('#rdText'), play = $('#rdPlay'), rate = $('#rdRate'), voiceSel = $('#rdVoice');
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
      // A part folded only to save room on a small screen is read like the rest, so reading a chapter covers the same parts at any width.
      if (p.tagName === 'DETAILS' && !p.open && !p.hasAttribute('data-wide')) return true;
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
    const fold = s.el.closest('details[data-wide]'); if (fold && fold !== s.el) fold.open = true;
    s.el.classList.add('reading-on');
    const r = s.el.getBoundingClientRect(), top = cssPx('--hdr') + cssPx('--toch') + 12, bottom = innerHeight - reader.offsetHeight - 20;
    if (r.top < top || r.bottom > bottom) s.el.scrollIntoView({block:'center'});
    now.classList.remove('err'); pos.textContent = '朗讀中 ' + (idx + 1) + ' / ' + segs.length; txt.textContent = s.text;
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
    watchdog = setTimeout(() => { if (token === gen && playing) fail('語音沒有啟動，請換一個聲音，或' + FIX + '。'); }, 10000);
    synth.speak(u);
  }
  function fail(m){ playing = false; gen++; if (ok) synth.cancel(); play.textContent = '▶'; pos.textContent = '無法朗讀'; txt.textContent = m; now.classList.add('err'); }
  function go(i){ if (!segs.length) return; idx = Math.max(0, Math.min(segs.length - 1, i)); chunk = 0; gen++; synth.cancel(); playing = true; play.textContent = '⏸'; say(); }
  // The player covers the bottom of the screen: keep page end and Tab-focused elements clear of it, at whatever height it has now.
  function pad(){
    const on = document.body.classList.contains('reading'), h = on ? (reader.offsetHeight + 16) + 'px' : '';
    document.documentElement.style.scrollPaddingBottom = h; document.body.style.paddingBottom = h;
  }
  if (window.ResizeObserver) new ResizeObserver(pad).observe(reader);
  function start(root){
    document.body.classList.add('reading'); pad(); setHdr();
    if (!ok) return fail('這個瀏覽器不支援朗讀，請' + FIX + '。');
    segs = collect(root); if (!segs.length) return stop();
    segs.forEach(s => s.el.setAttribute('data-seg', '')); go(0);
  }
  function stop(){
    gen++; clearTimeout(watchdog); playing = false; if (ok) synth.cancel();
    $$('.reading-on').forEach(x => x.classList.remove('reading-on')); $$('[data-seg]').forEach(x => x.removeAttribute('data-seg'));
    segs = []; document.body.classList.remove('reading'); now.classList.remove('err'); pad(); setHdr();
  }
  // "Microsoft HsiaoChen Online (Natural) - Chinese (Taiwan)" -> "HsiaoChen"; voices outside Taiwan keep a short language tag.
  const voiceName = v => v.name.replace(/\s*-\s*Chinese.*$/, '').replace(/Microsoft |Online |\(Natural\)/g, '').replace(/\s+/g, ' ').trim() + (/zh[-_]TW/i.test(v.lang) ? '' : '（' + v.lang + '）');
  function loadVoices(){
    if (!ok) return;
    // Offer only the Taiwan voices that read this site well: Hanhan, Yating, and Google's Taiwan Mandarin.
    // A device without any of them falls back to its other Taiwan voices, then to any Chinese voice, so reading still works.
    const TW = /zh[-_]TW/i, PICK = [/Hanhan/i, /Yating/i, /Google/i];
    const all = synth.getVoices(), tw = all.filter(v => TW.test(v.lang));
    const picked = PICK.map(re => tw.find(v => re.test(v.name))).filter(Boolean);
    voices = picked.length ? picked : tw.length ? tw : all.filter(v => /^zh|^cmn/i.test(v.lang));
    const keep = store.get('voice') || voiceSel.value;
    voiceSel.innerHTML = voices.length ? voices.map(v => '<option value="' + esc(v.voiceURI) + '">' + esc(voiceName(v)) + '</option>').join('') : '<option value="">預設中文</option>';
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
    if (!document.body.classList.contains('reading') || e.target.closest('a,button,summary,select,input,label,#reader,.glpop')) return;
    const seg = e.target.closest('[data-seg]'); if (seg) { const j = segs.findIndex(s => s.el === seg); if (j >= 0) go(j); }
  });
  addEventListener('pagehide', stop);
})();
})();

// On narrow screens the first lab result box is pinned with a height cap and may scroll; keyboard users must be able to reach it.
(function(){
  const boxes = [...document.querySelectorAll('.lab')].filter(l => l.querySelector('.lab-slider')).map(l => l.querySelector('.lab-say')).filter(Boolean);
  if (!boxes.length) return;
  const mq = matchMedia('(max-width:900px)');
  const set = () => boxes.forEach(b => { if (mq.matches) { b.tabIndex = 0; b.setAttribute('aria-label', '實驗結果'); } else { b.removeAttribute('tabindex'); b.removeAttribute('aria-label'); } });
  set(); mq.addEventListener && mq.addEventListener('change', set);
})();
