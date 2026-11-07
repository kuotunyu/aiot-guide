// Screenshots of one figure (every step of a step figure) on desktop and phone, light and dark.
// A loop figure gets four frames across its cycle (-a1..-a4) plus the still picture shown when motion is reduced (-still).
// Usage: node scripts/figure-shots.js <page> <section-id> [out-dir]   (needs node scripts/serve.mjs 8799, or SHOT_BASE)
// Look at the images before shipping a new or changed diagram: text must stay readable at phone width.
const {chromium} = require('@playwright/test');
const {mkdirSync} = require('fs');
const [page, sec, out = 'test-results/figures'] = process.argv.slice(2);
const BASE = process.env.SHOT_BASE || 'http://127.0.0.1:8799/';
(async () => {
  mkdirSync(out, {recursive: true});
  const b = await chromium.launch(process.env.PW_CHANNEL ? {channel: process.env.PW_CHANNEL} : {});
  for (const [vw, tag] of [[1100, 'desk'], [375, 'phone']]) for (const scheme of ['light', 'dark']) {
    const p = await b.newPage({viewport: {width: vw, height: 900}, colorScheme: scheme, deviceScaleFactor: tag === 'phone' ? 2 : 1});
    await p.goto(BASE + page + '#' + sec);
    const figs = p.locator(`#${sec} figure.dg`);
    for (let fi = 0; fi < await figs.count(); fi++) {
      const f = figs.nth(fi), n = +(await f.getAttribute('data-n') || 1), name = `${out}/${page.replace('.html', '')}-${sec}-f${fi + 1}`;
      if ((await f.getAttribute('class')).includes('loop')) {
        await f.scrollIntoViewIfNeeded();
        for (let k = 1; k <= 4; k++) { await p.waitForTimeout(650); await f.screenshot({path: `${name}-a${k}-${tag}-${scheme}.png`}); }
        await p.emulateMedia({reducedMotion: 'reduce'});
        await f.screenshot({path: `${name}-still-${tag}-${scheme}.png`});
        await p.emulateMedia({reducedMotion: 'no-preference'});
        continue;
      }
      for (let k = 1; k <= n; k++) {
        if (n > 1) await f.evaluate((el, k) => { while (+el.dataset.cur < k) el.querySelector('[data-d="1"]').click(); }, k);
        await p.waitForTimeout(300);
        await f.screenshot({path: `${out}/${page.replace('.html', '')}-${sec}-f${fi + 1}-s${k}-${tag}-${scheme}.png`});
      }
    }
    await p.close();
  }
  await b.close();
  console.log('figures written to', out);
})();
