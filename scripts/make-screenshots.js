// Regenerates the README images (docs/assets/hero.png, docs/assets/features.png) from a built dist/.
// Needs: node scripts/serve.mjs 8799 running (or SHOT_BASE pointing at any server for dist/). Rerun after changing layout or colours.
// The pictures are real screenshots of the site, framed in a browser and phones on the site's own petrol-to-apricot band.
const {chromium} = require('@playwright/test');
const {mkdirSync} = require('fs');
const BASE = process.env.SHOT_BASE || 'http://127.0.0.1:8799/';
const FONT = 'font-family:"Microsoft JhengHei","Noto Sans TC","PingFang TC",system-ui,sans-serif';
mkdirSync('docs/assets', {recursive: true});

const theme = (p, t) => p.evaluate(t => { document.documentElement.dataset.theme = t; }, t);
const scrollToFigure = (p, sel, text) => p.evaluate(([sel, text]) => {
  const f = [...document.querySelectorAll(sel)].find(d => d.textContent.includes(text));
  window.scrollTo(0, f.getBoundingClientRect().top + scrollY - 70);
}, [sel, text]);
const png = buf => 'data:image/png;base64,' + buf.toString('base64');
const phone = (src, w) => `<div style="width:${w}px;border-radius:${w * 0.13}px;background:#0F1B1E;padding:${w * 0.035}px;box-shadow:0 24px 60px rgba(0,0,0,.35)"><img src="${src}" style="display:block;width:100%;border-radius:${w * 0.1}px"></div>`;
const browser = (src, w) => `<div style="width:${w}px;border-radius:12px;overflow:hidden;background:#FCFDFC;box-shadow:0 24px 60px rgba(0,0,0,.35)"><div style="height:34px;background:#E8EEED;display:flex;align-items:center;gap:8px;padding:0 14px"><i style="width:12px;height:12px;border-radius:50%;background:#E46A5E"></i><i style="width:12px;height:12px;border-radius:50%;background:#E8B64A"></i><i style="width:12px;height:12px;border-radius:50%;background:#5FB45B"></i><span style="margin-left:18px;font:15px monospace;color:#3A474C">kuotunyu.github.io/aiot-guide</span></div><img src="${src}" style="display:block;width:100%"></div>`;

(async () => {
  const b = await chromium.launch(process.env.PW_CHANNEL ? {channel: process.env.PW_CHANNEL} : {});
  const shot = {};
  // Desktop: the OEE lab in 2-3.
  let p = await b.newPage({viewport: {width: 1440, height: 900}, deviceScaleFactor: 2, colorScheme: 'light'});
  await p.goto(BASE + 's2-23.html#oee'); await theme(p, 'light'); await p.waitForTimeout(600);
  await p.evaluate(() => { const el = document.querySelector('.lab[data-lab="s2-23-oee"]'); window.scrollTo(0, el.getBoundingClientRect().top + scrollY - 110); });
  await p.waitForTimeout(400); shot.lab = await p.screenshot();
  await p.close();
  // Phones: a subject-2 chapter head, a figure's upright drawing, a wrong answer explained, and dark mode.
  p = await b.newPage({viewport: {width: 390, height: 844}, deviceScaleFactor: 3, colorScheme: 'light', isMobile: true, hasTouch: true});
  await p.goto(BASE + 's2-21.html'); await theme(p, 'light'); await p.waitForTimeout(600);
  shot.chapter = await p.screenshot();
  await p.goto(BASE + 's1-25.html#symmetric-asymmetric'); await theme(p, 'light'); await p.waitForTimeout(500);
  await scrollToFigure(p, '#symmetric-asymmetric .dg', '寄件人'); await p.waitForTimeout(400);
  shot.figure = await p.screenshot();
  await p.goto(BASE + 'practice.html?q=reserved-s1-22-1'); await theme(p, 'light'); await p.waitForTimeout(500);
  await p.locator('.opt:not([data-k="0"])').first().click(); await p.waitForTimeout(800);
  await p.evaluate(() => { const q = document.querySelector('.qtext'); window.scrollTo(0, q.getBoundingClientRect().top + scrollY - 60); });
  await p.waitForTimeout(300); shot.practice = await p.screenshot();
  await p.goto(BASE + 's2-21.html#adc-pwm'); await theme(p, 'dark'); await p.waitForTimeout(500);
  await scrollToFigure(p, '#adc-pwm .dg', '占空比'); await p.waitForTimeout(400);
  shot.dark = await p.screenshot();
  await p.close();

  const hero = `<body style="margin:0;${FONT}"><div style="width:1600px;height:880px;position:relative;overflow:hidden;background:linear-gradient(135deg,#1F5867 0%,#22434C 55%,#4E3424 100%)">
    <div style="position:absolute;left:72px;top:70px;color:#F5F8F7;width:560px">
      <div style="font-size:30px;letter-spacing:.08em;color:#F0A983;font-weight:700">AIoT 導讀</div>
      <div style="font-size:60px;font-weight:800;line-height:1.25;margin-top:18px">一筆感測資料，<br>從現場走到決策</div>
      <div style="font-size:25px;line-height:1.7;margin-top:26px;color:#BFD1D3">感測、通訊、平台、資安到智慧製造，<br>用互動實驗與圖解一路走完。</div>
      <div style="display:flex;gap:34px;margin-top:46px">${[['15', '章'], ['25', '互動實驗'], ['102', '張圖解'], ['224', '題練習']].map(([n, t]) => `<div><div style="font-size:52px;font-weight:800;line-height:1">${n}</div><div style="font-size:20px;color:#BFD1D3;margin-top:8px">${t}</div></div>`).join('')}</div>
    </div>
    <div style="position:absolute;left:640px;top:96px">${browser(png(shot.lab), 880)}</div>
    <div style="position:absolute;left:1290px;top:330px">${phone(png(shot.chapter), 250)}</div>
  </div></body>`;
  const strip = `<body style="margin:0;${FONT}"><div style="width:1600px;padding:56px 0 60px;background:#F3F5F4;display:flex;justify-content:center;gap:70px">
    ${[[shot.figure, '每張圖都有手機直式版'], [shot.practice, '每個選項都說明對錯原因'], [shot.dark, '深色模式也看得清楚']].map(([s, t]) => `<div style="display:flex;flex-direction:column;align-items:center;gap:26px">${phone(png(s), 360)}<div style="font-size:30px;font-weight:700;color:#1F2B2F">${t}</div></div>`).join('')}
  </div></body>`;
  for (const [name, html, h] of [['hero.png', hero, 880], ['features.png', strip, null]]) {
    const q = await b.newPage({viewport: {width: 1600, height: h || 1000}});
    await q.setContent(html); await q.waitForTimeout(400);
    await q.screenshot({path: 'docs/assets/' + name, fullPage: !h});
    await q.close();
  }
  await b.close();
  console.log('README images written');
})();
