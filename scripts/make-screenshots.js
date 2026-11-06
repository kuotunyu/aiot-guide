// Regenerates README screenshots from a built dist/. Needs: node scripts/serve.mjs 8799 running
// (or SHOT_BASE pointing at any server for dist/). Rerun after changing titles or layout.
const {chromium} = require('@playwright/test');
const {mkdirSync} = require('fs');
const BASE = process.env.SHOT_BASE || 'http://127.0.0.1:8799/';
mkdirSync('docs/assets', {recursive: true});
(async () => {
  const b = await chromium.launch(process.env.PW_CHANNEL ? {channel: process.env.PW_CHANNEL} : {});
  const shot = async (viewport, url, file, sel) => {
    const p = await b.newPage({viewport, colorScheme: 'light', deviceScaleFactor: 1});
    await p.goto(BASE + url);
    await p.waitForLoadState('networkidle');
    if (sel) { await p.locator(sel).first().scrollIntoViewIfNeeded(); await p.locator(sel).first().screenshot({path: 'docs/assets/' + file}); }
    else await p.screenshot({path: 'docs/assets/' + file});
    await p.close();
  };
  await shot({width: 1280, height: 760}, 'index.html', 'home.png');
  await shot({width: 900, height: 900}, 's1-22.html', 'lab-wireless.png', '[data-lab=wireless]');
  await shot({width: 900, height: 900}, 's1-32.html', 'lab-adc.png', '[data-lab=s1-32-adc]');
  await shot({width: 390, height: 780}, 's1-22.html', 'mobile-chapter.png');
  await shot({width: 390, height: 780}, 's2-21.html', 'mobile-lab.png', '[data-lab=s2-21-pin]');
  await b.close();
  console.log('screenshots written');
})();
