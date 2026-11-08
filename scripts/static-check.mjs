// Checks that need no browser. Run after build: node scripts/static-check.mjs
import {readFileSync, readdirSync, statSync, existsSync} from 'node:fs';
import {join, extname} from 'node:path';

const DIST = 'dist', problems = [];
const walk = d => readdirSync(d).flatMap(n => { const p = join(d, n); return statSync(p).isDirectory() ? walk(p) : [p]; });
const files = walk(DIST), pages = readdirSync(DIST).filter(f => f.endsWith('.html'));
const read = n => readFileSync(join(DIST, n), 'utf8');
const anchors = {};
for (const n of pages) anchors[n] = new Set([...read(n).matchAll(/\sid="([^"]+)"/g)].map(m => m[1]));

for (const n of pages) {
  const h = read(n);
  // Zero external resources: every script, stylesheet, image and media file ships with the site.
  for (const m of h.matchAll(/<(script|link|img|video|source|iframe)\b[^>]*?\b(?:src|href)="(https?:)?\/\/[^"]+"[^>]*>/g)) {
    if (!/rel="canonical"/.test(m[0])) problems.push(`${n}: external resource ${m[0].slice(0, 90)}`);
  }
  if (n !== '404.html') {
    for (const [, href] of h.matchAll(/href="([^"#:]+\.[a-z]+)?(#[^"]*)?"/g)) if (href && !existsSync(join(DIST, href))) problems.push(`${n}: broken link ${href}`);
    for (const [, page, frag] of h.matchAll(/href="([^"#:]+\.html)?#([^"]+)"/g)) {
      const t = page || n;
      if (anchors[t] && !anchors[t].has(frag) && !(t === 'practice.html')) problems.push(`${n}: missing anchor ${t}#${frag}`);
    }
  }
  for (const tag of ['<title>', 'name="description"', 'lang="zh-Hant"', 'property="og:title"', 'application/ld+json']) if (!h.includes(tag)) problems.push(`${n}: missing ${tag}`);
  if (n !== '404.html' && !h.includes('rel="canonical"')) problems.push(`${n}: missing canonical`);
  const ids = [...h.matchAll(/\sid="([^"]+)"/g)].map(m => m[1]);
  const dup = ids.filter((x, i) => ids.indexOf(x) !== i && !x.endsWith('-arr'));
  if (dup.length) problems.push(`${n}: duplicate id ${[...new Set(dup)].slice(0, 5)}`);
  for (const m of h.matchAll(/<svg\b[^>]*>/g)) if (!/aria-label|aria-hidden/.test(m[0])) problems.push(`${n}: svg without label`);
  for (const [, ld] of h.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/gs)) { try { JSON.parse(ld.replace(/<\\\//g, '</')); } catch { problems.push(`${n}: invalid JSON-LD`); } }
  const text = h.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<[^>]+>/g, ' ');
  for (const w of ['考古', '抱佛腳', '衝刺', '最常考', '出題最多']) if (text.includes(w)) problems.push(`${n}: banned wording ${w}`);
}

// Readable text is a requirement: contrast floors for every theme, on page and card backgrounds.
const css = readFileSync(join(DIST, 'assets/site.css'), 'utf8');
const tokens = block => Object.fromEntries([...block.matchAll(/--([\w-]+):(#[0-9A-Fa-f]{6})/g)].map(m => [m[1], m[2]]));
const lum = hex => { const c = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).map(v => v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
const light = tokens(css.match(/:root\{[\s\S]*?\n\}/)[0]);
const dark = {...light, ...tokens(css.match(/:root\[data-theme="dark"\]\{[\s\S]*?\n\}/)[0])};
for (const [name, T] of [['light', light], ['dark', dark]]) {
  for (const [fg, min] of [['text', 7], ['muted', 5.5], ['accent', 4.5], ['s1', 4.5], ['s2', 4.5], ['ok', 4.5], ['bad', 4.5], ['warn', 4.5]]) {
    for (const bg of ['bg', 'surface']) {
      const r = ratio(T[fg], T[bg]);
      if (r < min) problems.push(`contrast ${name}: --${fg} on --${bg} is ${r.toFixed(2)}, need ${min}`);
    }
  }
  for (const [fg, bg] of [['ok', 'ok-soft'], ['bad', 'bad-soft'], ['warn', 'warn-soft'], ['accent', 'accent-soft'], ['s2', 's2-soft'], ['s1', 's1-soft']]) {
    const r = ratio(T[fg], T[bg]);
    if (r < 4.5) problems.push(`contrast ${name}: --${fg} on --${bg} is ${r.toFixed(2)}, need 4.5`);
  }
}

// Asset budget: a learning site on a phone connection.
const KB = 1024, size = f => statSync(f).size;
const budget = [[f => extname(f) === '.mp4', 2.0 * KB * KB, 'video'], [f => extname(f) === '.jpg', 200 * KB, 'poster'], [f => extname(f) === '.png', 300 * KB, 'image'], [f => extname(f) === '.html', 120 * KB, 'page'], [f => extname(f) === '.js' && !f.endsWith('questions.js'), 60 * KB, 'script'], [f => f.endsWith('questions.js'), 250 * KB, 'question bank'], [f => extname(f) === '.css', 48 * KB, 'stylesheet']];
for (const f of files) for (const [test, max, label] of budget) if (test(f) && size(f) > max) problems.push(`${label} over budget: ${f} ${(size(f) / KB).toFixed(0)} KB > ${(max / KB).toFixed(0)} KB`);
const total = files.reduce((a, f) => a + size(f), 0);
if (total > 20 * KB * KB) problems.push(`site over 20 MB: ${(total / KB / KB).toFixed(1)} MB`);
for (const n of pages) for (const m of read(n).matchAll(/<video\b[^>]*>/g)) if (/autoplay/.test(m[0]) || !/preload="none"/.test(m[0])) problems.push(`${n}: video must not autoplay or preload`);

// Discovery files
const sm = read('sitemap.xml');
for (const n of pages) if (n !== '404.html' && n !== 'index.html' && !sm.includes(n)) problems.push(`sitemap missing ${n}`);
for (const f of ['robots.txt', 'llms.txt', '.nojekyll', 'favicon.svg', 'assets/og-card.png']) if (!existsSync(join(DIST, f))) problems.push(`missing ${f}`);

if (problems.length) { console.error(problems.join('\n')); console.error(`\n${problems.length} problem(s)`); process.exit(1); }
console.log(`static check passed: ${pages.length} pages, ${files.length} files, ${(total / KB / KB).toFixed(1)} MB`);
