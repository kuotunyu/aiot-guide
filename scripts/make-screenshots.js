// Regenerates the README screenshot from a built dist/. Needs: node scripts/serve.mjs 8799 running
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
  await b.close();
  console.log('screenshots written');
})();
