const {test, expect} = require('@playwright/test');
const {default: AxeBuilder} = require('@axe-core/playwright');

const CHAPTERS = ['s1-11', 's1-12', 's1-21', 's1-22', 's1-23', 's1-24', 's1-25', 's1-31', 's1-32', 's2-11', 's2-12', 's2-13', 's2-21', 's2-22', 's2-23'];
const OTHERS = ['index', 'practice', 'glossary', 'reference', 'exam', 'about'];

function watchErrors(page) {
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('requestfailed', r => { if (!r.url().endsWith('.mp4')) errors.push('failed ' + r.url()); });
  page.on('request', r => { if (!r.url().startsWith('http://127.0.0.1:8799')) errors.push('external ' + r.url()); });
  return errors;
}
const overflow = page => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

for (const name of [...OTHERS, ...CHAPTERS]) {
  test(`${name}: loads clean, fits the screen, passes axe`, async ({page}) => {
    const errors = watchErrors(page);
    await page.goto(`/${name}.html`);
    await page.waitForLoadState('networkidle');
    expect(errors).toEqual([]);
    expect(await overflow(page)).toBeLessThanOrEqual(0);
    const axe = await new AxeBuilder({page}).analyze();
    const bad = axe.violations.filter(v => ['critical', 'serious'].includes(v.impact)).map(v => `${v.id}: ${v.nodes.slice(0, 3).map(n => n.target).join(' | ')}`);
    expect(bad).toEqual([]);
  });
}

for (const id of CHAPTERS) {
  test(`${id}: every lab renders and survives real use`, async ({page}) => {
    const errors = watchErrors(page);
    await page.goto(`/${id}.html`);
    const labs = page.locator('[data-lab]');
    const n = await labs.count();
    expect(n).toBeGreaterThan(0);
    for (let i = 0; i < n; i++) {
      const lab = labs.nth(i);
      await expect(lab.locator('h3').first()).toBeVisible();
      // Walk the lab like a person: pick a visible control, re-query after each change.
      for (let step = 0; step < 40; step++) {
        const did = await lab.evaluate((el, step) => {
          const list = [...el.querySelectorAll('button:not([disabled]),input[type=radio],input[type=range]')].filter(c => c.offsetParent !== null || c.type === 'radio');
          if (!list.length) return false;
          const c = list[(step * 7 + 3) % list.length];
          if (c.type === 'range') { c.value = step % 2 ? c.max : c.min; c.dispatchEvent(new Event('input', {bubbles: true})); c.dispatchEvent(new Event('change', {bubbles: true})); }
          else c.click();
          return true;
        }, step);
        if (!did) break;
        const text = await lab.innerText();
        expect(text).not.toMatch(/NaN|undefined|\[object/);
      }
    }
    expect(errors).toEqual([]);
    expect(await overflow(page)).toBeLessThanOrEqual(0);
  });

  test(`${id}: predictions reveal, sources listed, pager works`, async ({page}) => {
    await page.goto(`/${id}.html`);
    const pr = page.locator('details.pr').first();
    await pr.locator('summary').click();
    await expect(pr.locator('p')).toBeVisible();
    expect(await page.locator('.srcs a').count()).toBeGreaterThanOrEqual(3);
    await expect(page.locator('.case')).toBeVisible();
    await expect(page.locator('.pager a').first()).toBeVisible();
  });
}

test('practice: learn mode gives feedback, wrong answers can be redone', async ({page}) => {
  await page.goto('/practice.html#s1-22');
  await expect(page.locator('#fSubject')).toHaveValue('s1');
  await expect(page.locator('#fChapter')).toHaveValue('s1-22');
  await expect(page.locator('#fCount')).toHaveValue('0');
  await page.selectOption('#fCount', '10');
  await page.click('#qStart');
  for (let i = 0; i < 10; i++) {
    const q = await page.locator('.qtext').innerText();
    const a = await page.evaluate(t => window.AIOT_QUESTIONS.find(x => x.q === t).a, q);
    // Options are shuffled on screen; data-k keeps the original index.
    await page.locator(`.opt[data-k="${i % 2 ? a : (a + 1) % 4}"]`).click();
    await expect(page.locator('.why')).toBeVisible();
    await expect(page.locator('.opt.correct')).toHaveAttribute('data-k', String(a));
    await page.click('#qNext');
  }
  await expect(page.locator('.score')).toHaveText('5 / 10');
  await page.click('#qRedo');
  await expect(page.locator('.qhead span').first()).toContainText('/ 5');
});

// Reader request: the site must not remember which questions someone got wrong.
test('practice: wrong answers are not remembered between visits', async ({page}) => {
  await page.goto('/practice.html#s2-23');
  await page.evaluate(() => localStorage.setItem('aiot-guide-wrong', JSON.stringify(['legacy-s2-18'])));
  await page.reload();
  expect(await page.evaluate(() => localStorage.getItem('aiot-guide-wrong'))).toBeNull();
  await page.click('#qStart');
  const a = await page.evaluate(t => window.AIOT_QUESTIONS.find(x => x.q === t).a, await page.locator('.qtext').innerText());
  await page.locator(`.opt[data-k="${(a + 1) % 4}"]`).click();
  const keys = await page.evaluate(() => Object.keys(localStorage));
  expect(keys.filter(k => /wrong|ans/.test(k))).toEqual([]);
  await page.reload();
  await expect(page.getByText(/曾答錯/)).toHaveCount(0);
});

test('practice: timed mode hides answers until submitted', async ({page}) => {
  await page.goto('/practice.html');
  await page.selectOption('#fCount', '25');
  await page.selectOption('#fMode', 'exam');
  await page.click('#qStart');
  await expect(page.locator('#timer')).toBeVisible();
  await page.locator('.opt').first().click();
  await expect(page.locator('.why')).toHaveCount(0);
  await expect(page.locator('.qhead span').first()).toContainText('第 1 /');
  await page.click('#qSubmit');
  await expect(page.locator('#qSubmit')).toContainText('還有 24 題未作答');
  await page.click('#qSubmit');
  await expect(page.locator('.score')).toContainText('/ 25');
});

// Reader feedback: on a phone the explanation sat below the screen, and focus fell back to the page after each tap.
test('practice: the explanation comes into view and focus follows each step', async ({page}) => {
  await page.goto('/practice.html#s1-22');
  await page.selectOption('#fCount', '10');
  await page.click('#qStart');
  await expect(page.locator('#quizSetup')).toBeHidden();
  await page.locator('.opt').first().click();
  await expect(page.locator('.why')).toBeInViewport();
  expect(await page.evaluate(() => document.activeElement.classList.contains('why'))).toBe(true);
  await page.click('#qNext');
  await expect(page.locator('.qtext')).toBeInViewport();
  expect(await page.evaluate(() => document.activeElement.classList.contains('qtext'))).toBe(true);
  await page.click('#qEnd');
  expect(await page.evaluate(() => document.activeElement.classList.contains('score'))).toBe(true);
});

test('practice: a one-chapter drill points back to the summary and on to the next chapter', async ({page}) => {
  await page.goto('/practice.html#s1-21');
  await page.selectOption('#fCount', '10');
  await page.click('#qStart');
  await page.click('#qEnd');
  await expect(page.locator('.panel a[href="s1-21.html#keypoints"]')).toBeVisible();
  const next = await page.evaluate(() => window.AIOT_CHAPTERS.find(c => c.id === 's1-21').next);
  await expect(page.locator(`.panel a[href="${next}.html"]`)).toContainText('下一章');
});

test('practice: wrong and unanswered are offered separately after a timed run', async ({page}) => {
  await page.goto('/practice.html');
  await page.selectOption('#fCount', '10');
  await page.selectOption('#fMode', 'exam');
  await page.click('#qStart');
  const a = await page.evaluate(t => window.AIOT_QUESTIONS.find(x => x.q === t).a, await page.locator('.qtext').innerText());
  await page.locator(`.opt[data-k="${(a + 1) % 4}"]`).click();
  await page.click('#qSubmit');
  await page.click('#qSubmit');
  await expect(page.locator('#qRedo')).toHaveText('重做答錯的 1 題');
  await expect(page.locator('#qRest')).toHaveText('做完沒作答的 9 題');
});

test('skip link: first Tab offers it and it lands past the chapter list', async ({page, isMobile}) => {
  test.skip(isMobile, 'keyboard path');
  await page.goto('/s1-11.html');
  await page.keyboard.press('Tab');
  await expect(page.locator('.skip')).toBeFocused();
  await page.keyboard.press('Enter');
  await page.keyboard.press('Tab');
  expect(await page.evaluate(() => !!document.activeElement.closest('#main') && !document.activeElement.closest('.side'))).toBe(true);
});

test('glossary: search handles plain-keyboard spellings', async ({page}) => {
  await page.goto('/glossary.html');
  await page.fill('#gq', 'i2c');
  await expect(page.locator('.gitem:visible b').first()).toContainText('I²C');
  await page.fill('#gq', 'zzzz');
  await expect(page.locator('#gcount')).toHaveText('0 個關鍵字');
  await expect(page.locator('.gsec:visible')).toHaveCount(0);
});

test('glossary: grouped by chapter by default, name order puts acronyms first', async ({page}) => {
  await page.goto('/glossary.html');
  await expect(page.locator('#gch')).toBeVisible();
  await expect(page.locator('.gsec').first()).toHaveAttribute('id', 'g-s1-21');
  await page.click('[data-v="az"]');
  await expect(page.locator('#gch')).toBeHidden();
  await expect(page.locator('#gaz .gitem b').first()).toHaveText(/^[A-Za-z0-9]/);
  await expect(page.locator('#gcount')).toHaveText(/^\d+ 個關鍵字$/);
});

// Owner feedback: the repeated 「也在」 lines were noise. Grouped by chapter, a term carries no chapter links; by name, it ends with chapter codes.
// Some groups open with one picture of how their terms fit together, out of the way while searching.
test('glossary: no repeated chapter lines, codes in the name view, pictures only while browsing by chapter', async ({page}) => {
  await page.goto('/glossary.html');
  await expect(page.locator('main')).not.toContainText('也在');
  await expect(page.locator('#g-s1-21 .gfig figure.dg')).toBeVisible();
  await expect(page.locator('#g-s1-21 .gfig a[href="s1-21.html#three-layers"]')).toHaveText('看詳解');
  await expect(page.locator('#gch .gitem:visible .gw').first()).toBeHidden();
  await page.fill('#gq', 'mqtt');
  await expect(page.locator('.gfig:visible')).toHaveCount(0);
  await page.fill('#gq', '');
  await page.click('[data-v="az"]');
  await expect(page.locator('#gaz .gitem', {hasText: 'MQTT'}).first().locator('.gw a').first()).toHaveAttribute('href', 's1-22.html');
});

// Reader feedback: someone looking for a chapter must not have to hunt for the list.
test('home: chapter lists are reachable at once', async ({page}) => {
  await page.goto('/index.html');
  const vh = page.viewportSize().height;
  const top = await page.locator('#chapters .subject h2').first().evaluate(el => el.getBoundingClientRect().top);
  expect(top).toBeLessThan(vh);
  await page.locator('.nav a', {hasText: '章節'}).click();
  await expect(page).toHaveURL(/#chapters$/);
  await expect(page.locator('#chapters .subject h2').first()).toBeInViewport();
});

test('loop figure: plays on screen, shows the still picture when motion is reduced', async ({page}) => {
  await page.goto('/s2-11.html#message-queue');
  const f = page.locator('#message-queue figure.loop');
  await f.scrollIntoViewIfNeeded();
  await expect(f).toHaveClass(/anim/);
  await expect(f).toHaveClass(/run/);
  await expect(f.locator('svg:visible .lp-move')).toBeVisible();
  await page.emulateMedia({reducedMotion: 'reduce'});
  await expect(f.locator('svg:visible .lp-still')).toBeVisible();
  await expect(f.locator('svg:visible .lp-move')).toBeHidden();
});

test('step figure: starts at step 1 and walks forward and back', async ({page}) => {
  await page.goto('/s1-23.html');
  const f = page.locator('#network-layers .stepfig');
  await expect(f).toHaveAttribute('data-cur', '1');
  await expect(f.locator('.stepn')).toHaveText('1 / 7');
  await f.locator('[data-d="1"]').click();
  await f.locator('[data-d="1"]').click();
  await expect(f).toHaveAttribute('data-cur', '3');
  await expect(f.locator('.stepcap li:visible')).toHaveCount(1);
  await expect(f.locator('.stepcap li:visible')).toContainText('TCP');
  await f.locator('[data-d="-1"]').click();
  await expect(f.locator('.stepn')).toHaveText('2 / 7');
});

test('loop figure: a pause button shows the still picture; reduced motion hides the button', async ({page}) => {
  await page.goto('/s1-11.html');
  const f = page.locator('figure.loop').first(), b = f.locator('.lp-tog');
  await f.scrollIntoViewIfNeeded();
  await expect(b).toHaveText('暫停動畫');
  await b.click();
  await expect(b).toHaveText('播放動畫');
  await expect(f.locator('svg:visible .lp-still')).toBeVisible();
  await expect(f.locator('svg:visible .lp-move')).toBeHidden();
  await expect(page.locator('.zoom')).toHaveCount(0);
  await page.emulateMedia({reducedMotion: 'reduce'});
  await expect(b).toBeHidden();
});

test('step figure: zooming keeps the current step and leaves the buttons out', async ({page}) => {
  await page.goto('/s2-23.html');
  const f = page.locator('.stepfig').first();
  await f.locator('[data-d="1"]').click();
  await f.locator('[data-d="1"]').click();
  await expect(page.locator('.zoom')).toHaveCount(0);
  await f.locator('svg:visible').click();
  const z = page.locator('.zoom figure');
  await expect(z).toHaveAttribute('data-cur', '3');
  await expect(z.locator('.stepctl')).toHaveCount(0);
  await expect(z.locator('.stepcap li:visible')).toHaveText(await f.locator('.stepcap li:visible').innerText());
});

// A figure with an upright phone drawing (svgm): phones show v-m at full width with no sideways scroll; desktops, zoom and print show the original v-d.
test('phone drawing: v-m on phones, v-d on desktops; zoom and print show the original', async ({page}, info) => {
  await page.goto('/s1-22.html#mqtt');
  const f = page.locator('#mqtt .dg.has-m').first();
  await f.scrollIntoViewIfNeeded();
  const phone = info.project.name === 'mobile';
  await expect(f.locator('svg.v-m')).toBeVisible({visible: phone});
  await expect(f.locator('svg.v-d')).toBeVisible({visible: !phone});
  expect(await f.locator('.dgs').evaluate(el => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(1);
  await expect(f.locator('.tblhint')).toHaveCount(0);
  await f.locator('svg:visible').click();
  await expect(page.locator('.zoom svg.v-d')).toBeVisible();
  await expect(page.locator('.zoom svg.v-m')).toBeHidden();
  await page.keyboard.press('Escape');
  await page.emulateMedia({media: 'print'});
  await expect(f.locator('svg.v-d')).toBeVisible();
  await expect(f.locator('svg.v-m')).toBeHidden();
});

// Reader request: the site must not remember where someone stopped reading.
test('home: no reading position is kept between visits', async ({page}) => {
  await page.goto('/s1-23.html#opc-ua');
  await page.evaluate(() => scrollTo(0, document.documentElement.scrollHeight / 2));
  await page.goto('/index.html');
  expect(await page.evaluate(() => localStorage.getItem('aiot-guide-last'))).toBeNull();
  await expect(page.locator('.hero [data-start]')).toHaveAttribute('href', 's1-21.html');
  await expect(page.getByText('接著讀')).toHaveCount(0);
});

test('chapter on a phone: contents stay pinned under the header, name the section, and close after a jump', async ({page, isMobile}) => {
  test.skip(!isMobile, 'narrow screens only');
  await page.goto('/s1-11.html');
  await page.evaluate(() => scrollTo(0, document.documentElement.scrollHeight / 2));
  const menu = page.locator('.tocmenu'), sum = menu.locator('summary');
  await expect(sum).toHaveText(/^本章目錄・〈/);
  // Only the contents bar stays pinned: it sits at the top, and the header with the site navigation has scrolled away.
  const nav = await page.locator('.nav').boundingBox(), box = await menu.boundingBox();
  expect(box.y).toBeLessThan(8);
  expect(nav.y + nav.height).toBeLessThanOrEqual(0);
  await sum.click();
  await expect(menu.locator('.in a.on')).toHaveCount(1);
  await expect(menu.locator('.in a').first()).toHaveAttribute('href', '#main');
  await expect(menu.locator('.tmx a[href="index.html#map"]')).toHaveCount(1);
  await menu.locator('.in a').nth(2).click();
  await expect(menu).not.toHaveAttribute('open', '');
  const id = await page.evaluate(() => location.hash.slice(1));
  const h2 = await page.locator('#' + id + ' h2').boundingBox(), bar = await menu.boundingBox();
  expect(h2.y).toBeGreaterThanOrEqual(bar.y + bar.height);
});

test('chapter: terms from other chapters open a definition in place', async ({page}) => {
  await page.goto('/s2-22.html');
  const term = page.locator('.gl').first();
  await term.scrollIntoViewIfNeeded();
  await term.click();
  await expect(page.locator('.glpop')).toBeVisible();
  await expect(term).toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator('.glpop a')).toHaveAttribute('href', /^s[12]-\d\d\.html$/);
  await page.keyboard.press('Escape');
  await expect(page.locator('.glpop')).toBeHidden();
});

test('reader: reads a chapter and collapsed Q&A, can jump and stop', async ({page}) => {
  await page.goto('/s1-22.html');
  await page.locator('[data-read-all]').first().click();
  await expect(page.locator('#reader')).toBeVisible();
  expect(await page.locator('[data-seg]').count()).toBeGreaterThan(50);
  expect(await page.locator('.pr[data-seg]').count()).toBeGreaterThan(0);
  expect(await page.locator('.lab [data-seg]').count()).toBe(0);
  await page.click('#rdStop');
  await expect(page.locator('#reader')).toBeHidden();
});

// Phones and tablets fold the background note, terms and sources; wide screens show them. A jump to one opens it, and reading the chapter covers them either way.
test('chapter: parts folded on small screens open from 901px, on a jump, and are read aloud', async ({page, isMobile}) => {
  await page.addInitScript(() => { const S = window.speechSynthesis; if (S) { S.speak = () => {}; S.cancel = () => {}; } });
  await page.goto('/s1-22.html');
  const folds = page.locator('details[data-wide]');
  expect(await folds.count()).toBe(3);
  expect(await folds.evaluateAll(ds => ds.map(d => d.open))).toEqual([!isMobile, !isMobile, !isMobile]);
  await expect(page.locator('#terms summary')).toContainText(/本章關鍵字（\d+ 個）/);
  await page.click('[data-read-all]');
  const segs = await page.locator('[data-seg]').count();
  expect(await page.locator('#terms .termgrid [data-seg]').count()).toBeGreaterThan(5);
  await page.click('#rdStop');
  await page.setViewportSize({width: isMobile ? 1000 : 400, height: 800});
  await page.click('[data-read-all]');
  expect(await page.locator('[data-seg]').count()).toBe(segs);
  await page.click('#rdStop');
  await page.setViewportSize({width: 400, height: 800});
  await page.goto('/s1-21.html#terms');
  await expect(page.locator('#terms details')).toHaveAttribute('open', '');
  await expect(page.locator('#terms .termgrid')).toBeVisible();
});

test('theme: toggle survives reload', async ({page}) => {
  await page.goto('/index.html');
  const before = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  await page.click('#themeBtn');
  const after = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  expect(after).not.toBe(before);
  await page.reload();
  expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe(after);
});

test('404 page keeps working links', async ({page}) => {
  await page.goto('/404.html');
  await expect(page.locator('h1')).toHaveText('找不到這一頁');
  await expect(page.locator('meta[name=robots]')).toHaveAttribute('content', 'noindex');
});

test('reference: guide differences gathered in one place, jump chips resolve, nothing listed twice', async ({page}) => {
  await page.goto('/reference.html');
  const diffs = page.locator('#guide + .gdiff li');
  expect(await diffs.count()).toBeGreaterThan(10);
  for (const t of await diffs.allTextContents()) expect(t).toMatch(/指引 p\.|考題可能採教材說法/);
  expect(await page.locator('.refgrid details.more li', {hasText: '指引 p.'}).count()).toBe(0);
  for (const href of await page.locator('.gchips a').evaluateAll(as => as.map(a => a.getAttribute('href')))) {
    expect(await page.locator(href).count()).toBe(1);
  }
  await expect(page.locator('.intro a[href="glossary.html#conf"]')).toHaveCount(1);
});

// Review page shows one part at a time; the address picks it, and print shows all three.
test('reference: the address opens the right part; print shows every part', async ({page}) => {
  await page.goto('/reference.html#guide');
  await expect(page.locator('.rtabs a[aria-current]')).toHaveText('指引差異');
  await expect(page.locator('.gdiff')).toBeVisible();
  await expect(page.locator('.formula').first()).toBeHidden();
  await expect(page.locator('.gchips')).toBeHidden();
  await page.goto('/reference.html#r-s1-22');
  await expect(page.locator('#r-s1-22')).toBeInViewport();
  await page.locator('.rtabs a', {hasText: '公式'}).click();
  await expect(page).toHaveURL(/#formulas$/);
  await expect(page.locator('.formula').first()).toBeVisible();
  await page.emulateMedia({media: 'print'});
  for (const sel of ['.formula', '.gdiff', '#r-s2-23']) await expect(page.locator(sel).first()).toBeVisible();
});

test('print: collapsed extras open for printing and close again afterwards', async ({page}) => {
  await page.goto('/reference.html');
  const closed = await page.locator('details.more:not([open])').count();
  expect(closed).toBeGreaterThan(0);
  await page.evaluate(() => dispatchEvent(new Event('beforeprint')));
  await expect(page.locator('details.more:not([open])')).toHaveCount(0);
  await page.evaluate(() => dispatchEvent(new Event('afterprint')));
  await expect(page.locator('details.more:not([open])')).toHaveCount(closed);
});

test('glossary: a link to #conf opens the confusables without overwriting the saved view', async ({page}) => {
  await page.goto('/glossary.html#conf');
  await expect(page.locator('#gconf')).toBeVisible();
  await page.goto('/glossary.html');
  await expect(page.locator('#gch')).toBeVisible();
});

// Right and wrong must read without colour: the options say which is the answer and which was picked.
test('practice: options name the right answer and the pick; unanswered is said in a timed review', async ({page}) => {
  await page.goto('/practice.html');
  await page.selectOption('#fCount', '10');
  await page.click('#qStart');
  const a = await page.evaluate(t => window.AIOT_QUESTIONS.find(x => x.q === t).a, await page.locator('.qtext').innerText());
  await page.locator(`.opt[data-k="${(a + 1) % 4}"]`).click();
  await expect(page.locator('.opt.wrong .mk')).toHaveText('✕ 你的答案');
  await expect(page.locator('.opt.correct .mk')).toHaveText('✓ 正解');
  await page.goto('/practice.html');
  await page.selectOption('#fCount', '10');
  await page.selectOption('#fMode', 'exam');
  await page.click('#qStart');
  await page.click('#qSubmit');
  await page.click('#qSubmit');
  await expect(page.locator('.ex .why b').first()).toContainText('未作答');
  await expect(page.locator('.ex .why.bad')).toHaveCount(0);
});

test('worked example: answering by keyboard says right or wrong and moves focus to the explanation', async ({page}) => {
  await page.goto('/s1-11.html');
  const ex = page.locator('.ex[data-a]').first();
  const a = +(await ex.getAttribute('data-a'));
  await ex.locator('.opt').nth((a + 1) % 4).focus();
  await page.keyboard.press('Enter');
  await expect(ex.locator('.why b')).toHaveText(/^答錯了，正解是 [ABCD]$/);
  await expect(ex.locator('.opt.wrong .mk')).toHaveText('✕ 你的答案');
  expect(await page.evaluate(() => document.activeElement.classList.contains('why'))).toBe(true);
});

test('theme: the button names the theme it switches to', async ({page}) => {
  await page.emulateMedia({colorScheme: 'light'});
  await page.goto('/index.html');
  await expect(page.locator('#themeBtn')).toHaveText('深色');
  await expect(page.locator('#themeBtn')).toHaveAttribute('aria-label', '切換為深色模式');
  await page.click('#themeBtn');
  await expect(page.locator('#themeBtn')).toHaveText('淺色');
  await expect(page.locator('#themeBtn')).toHaveAttribute('aria-label', '切換為淺色模式');
});

test('timed grid: each number says its state, the current one is marked for screen readers', async ({page}) => {
  await page.goto('/practice.html');
  await page.selectOption('#fCount', '10');
  await page.selectOption('#fMode', 'exam');
  await page.click('#qStart');
  await page.locator('.opt').first().click();
  await expect(page.locator('.grid button').first()).toHaveAttribute('aria-label', '第 1 題，已作答');
  await expect(page.locator('.grid button').first()).toHaveAttribute('aria-current', 'step');
  await expect(page.locator('.grid button').nth(1)).toHaveAttribute('aria-label', '第 2 題');
});

// One way to write right and wrong across figures and labs: ✓ and ✕.
test('symbols: no stray check or cross variants in pages or labs', async () => {
  const fs = require('fs'), path = require('path');
  const files = [...fs.readdirSync('dist').filter(f => f.endsWith('.html')).map(f => path.join('dist', f)),
    ...fs.readdirSync('static/assets/labs').filter(f => f.endsWith('.js')).map(f => path.join('static/assets/labs', f))];
  const bad = files.filter(f => /[✔✘✗]/.test(fs.readFileSync(f, 'utf8')));
  expect(bad).toEqual([]);
});

test('glossary: a chapter link lands on its group even when the reader keeps the name order', async ({page}) => {
  await page.goto('/s1-21.html');
  await expect(page.locator('#keypoints a[href="reference.html#r-s1-21"]')).toHaveCount(1);
  await page.evaluate(() => localStorage.setItem('aiot-guide-gview', 'az'));
  await page.goto('/glossary.html#g-s1-21');
  await expect(page.locator('#g-s1-21')).toBeInViewport();
  expect(await page.evaluate(() => localStorage.getItem('aiot-guide-gview'))).toBe('az');
});

test('glossary: nothing found says so in the page and hides the empty chapter chips', async ({page}) => {
  await page.goto('/glossary.html');
  await page.fill('#gq', 'zzzz');
  await expect(page.locator('#gempty')).toContainText('找不到「zzzz」');
  await expect(page.locator('.gchips')).toBeHidden();
  // An acronym that is not there is not told to try an acronym.
  await expect(page.locator('#gempty')).not.toContainText('英文縮寫');
  await page.fill('#gq', '查無此詞');
  await expect(page.locator('#gempty')).toContainText('英文縮寫');
});

// Reader feedback: searching MQTT while the confusables were shown said nothing was found.
test('glossary: a search with no confusable match shows the matching keywords instead', async ({page}) => {
  await page.goto('/glossary.html');
  await page.locator('.gview button[data-v="conf"]').click();
  await page.fill('#gq', 'MQTT');
  await expect(page.locator('.gview button[data-v="ch"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#gempty')).toContainText('易混淆裡沒有「MQTT」');
  await expect(page.locator('#gch .gitem:visible').first()).toContainText('MQTT');
  // The view switched by itself, so the reader's own choice is not overwritten.
  expect(await page.evaluate(() => localStorage.getItem('aiot-guide-gview'))).toBe('conf');
});

test('practice: a run in progress is still there after visiting a chapter and going back', async ({page}) => {
  await page.goto('/practice.html#s1-24');
  await page.click('#qStart');
  for (let k = 0; k < 3; k++) { await page.locator('.opt').first().click(); if (k < 2) await page.click('#qNext'); }
  await page.locator('.why a').first().click();
  await page.goBack({waitUntil: 'commit'});
  await expect(page.locator('.qhead span').first()).toContainText('第 3 /');
  await expect(page.locator('.why')).toBeVisible();
  await expect(page.locator('#quizSetup')).toBeHidden();
});

test('practice: the timed run keeps its clock in view while scrolling', async ({page}) => {
  await page.goto('/practice.html');
  await page.selectOption('#fMode', 'exam');
  await page.click('#qStart');
  await page.evaluate(() => scrollBy(0, 400));
  await expect(page.locator('#timer')).toBeInViewport();
});

test('glossary pop: opened by keyboard, Tab reaches its link next, Tab again closes it and leaves the paragraph as built', async ({page}) => {
  await page.goto('/s1-11.html');
  const gl = page.locator('.gl').first();
  await gl.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#glpop')).toBeVisible();
  await page.keyboard.press('Tab');
  expect(await page.evaluate(() => document.getElementById('glpop').contains(document.activeElement))).toBe(true);
  await page.keyboard.press('Tab');
  await expect(page.locator('#glpop')).toBeHidden();
  await expect(gl).toHaveAttribute('aria-expanded', 'false');
  expect(await page.evaluate(() => document.getElementById('glpop').parentElement === document.body)).toBe(true);
});

test('read aloud: the player keeps page end and Tab focus clear of itself, and lets go when stopped', async ({page}) => {
  await page.addInitScript(() => { const S = window.speechSynthesis; if (S) { S.speak = u => setTimeout(() => u.onstart && u.onstart(), 10); S.cancel = () => {}; } });
  await page.goto('/s1-21.html');
  await page.click('[data-read-all]');
  const h = await page.evaluate(() => document.getElementById('reader').offsetHeight + 16 + 'px');
  expect(await page.evaluate(() => [document.documentElement.style.scrollPaddingBottom, document.body.style.paddingBottom])).toEqual([h, h]);
  await expect(page.locator('#rdPrev')).toHaveAttribute('title', '上一段');
  await page.click('#rdStop');
  expect(await page.evaluate(() => document.documentElement.style.scrollPaddingBottom + document.body.style.paddingBottom)).toBe('');
});

// Explanations: once answered, each option says why it is right or wrong (w, in the original option order), plus a clue and a confusable link.
test('practice: option notes follow their options through the shuffle; clue and confusable link show', async ({page}) => {
  await page.goto('/practice.html?q=legacy-s1-6');
  const q = await page.evaluate(() => window.AIOT_QUESTIONS.find(x => x.id === 'legacy-s1-6'));
  expect(q.w).toHaveLength(4);
  await expect(page.locator('.wn')).toHaveCount(0);
  const k = (q.a + 1) % 4;
  await page.locator(`.opt[data-k="${k}"]`).click();
  await expect(page.locator('.opt.wrong .wn')).toBeVisible();
  await expect(page.locator('.opt.wrong .wn')).toHaveText(q.w[k]);
  await expect(page.locator('.opt.correct .wn')).toHaveText(q.w[q.a]);
  for (let j = 0; j < 4; j++) {
    const o = page.locator(`.opt[data-k="${j}"]`);
    await expect(o.locator('.ot')).toHaveText(q.o[j]);
    await expect(o.locator('.wn')).toHaveText(q.w[j]);
  }
  await expect(page.locator('.why .clue')).toContainText(q.tip);
  expect(await page.evaluate(() => document.activeElement.classList.contains('why'))).toBe(true);
  const conf = page.locator(`.why a[href="glossary.html#conf-${q.conf}"]`);
  await expect(conf).toContainText('易混淆：');
  await conf.click();
  await expect(page.locator(`#conf-${q.conf}`)).toBeInViewport();
  await expect(page.locator('.gview button[data-v="conf"]')).toHaveAttribute('aria-pressed', 'true');
});

test('practice: every question has option notes, a clue only when it has one; a timed review shows the notes too', async ({page}) => {
  await page.goto('/practice.html');
  expect(await page.evaluate(() => window.AIOT_QUESTIONS.every(x => x.w && x.w.length === 4))).toBe(true);
  const id = await page.evaluate(() => window.AIOT_QUESTIONS.find(x => !x.tip).id);
  await page.goto('/practice.html?q=' + id);
  await page.locator('.opt').first().click();
  await expect(page.locator('.why')).toBeVisible();
  await expect(page.locator('.why p').first()).toBeVisible();
  await expect(page.locator('.wn')).toHaveCount(4);
  await expect(page.locator('.why .clue')).toHaveCount(0);
  // Only the hash changes here, so load the page afresh for a new run.
  await page.goto('/practice.html#s2-23');
  await page.reload();
  await page.selectOption('#fMode', 'exam');
  await page.click('#qStart');
  await page.click('#qSubmit');
  await page.click('#qSubmit');
  const q = await page.evaluate(() => window.AIOT_QUESTIONS.find(x => x.id === 'legacy-s2-18'));
  const ex = page.locator('.ex').filter({hasText: q.q});
  await expect(ex.locator('.wn')).toHaveCount(4);
  await expect(ex.locator('.opt.correct .wn')).toHaveText(q.w[q.a]);
  await expect(ex.locator('.why .clue')).toContainText(q.tip);
});

// A question's own figure: after the core idea and before the clue, in learn mode, wrong-answer redo and a timed review.
const FIGQ = 'reserved-s1-31-1';
test('practice: a question figure shows in the explanation, zooms, and shows in a timed review', async ({page}) => {
  await page.goto('/practice.html?q=' + FIGQ);
  const q = await page.evaluate(i => window.AIOT_QUESTIONS.find(x => x.id === i), FIGQ);
  expect(q.fig).toMatch(/^<svg viewBox="0 0 \d+ \d+"/);
  await expect(page.locator('.qfig')).toHaveCount(0);
  await page.locator(`.opt[data-k="${(q.a + 1) % 4}"]`).click();
  const f = page.locator('.why figure.qfig');
  await expect(f.locator('svg')).toBeVisible();
  await expect(f.locator('figcaption')).toHaveText(q.figcap);
  // Order inside the box: core idea, figure, clue.
  expect(await page.evaluate(() => [...document.querySelector('.why').children].map(x => x.tagName + '.' + x.className).slice(1, 4))).toEqual(['P.', 'FIGURE.dg qfig', 'P.clue']);
  const w = await f.evaluate(x => x.getBoundingClientRect().width);
  expect(w).toBeLessThanOrEqual(441);
  expect(w).toBeGreaterThan(260);
  await f.locator('svg').click();
  await expect(page.locator('.zoom figure.qfig svg')).toBeVisible();
  await page.locator('.zoom').click();
  await expect(page.locator('.zoom')).toHaveCount(0);
  await page.goto('/practice.html#s1-31');
  await page.reload();
  await page.selectOption('#fMode', 'exam');
  await page.click('#qStart');
  await page.click('#qSubmit');
  await page.click('#qSubmit');
  const ex = page.locator('.ex').filter({hasText: q.q});
  await ex.locator('.qfig').scrollIntoViewIfNeeded();
  await expect(ex.locator('.why .qfig svg')).toBeVisible();
});

test('practice: a looping question figure plays, and shows its still picture when motion is reduced', async ({page}) => {
  // No question loops yet, so turn the sample figure into a loop as the page loads to exercise the mechanism.
  await page.addInitScript(i => {
    let v;
    Object.defineProperty(window, 'AIOT_QUESTIONS', {configurable: true, get: () => v, set: x => {
      v = x; const q = x.find(y => y.id === i); q.loop = true;
      q.fig = q.fig.replace(/<\/svg>$/, '<style>.lp-t{animation:lp-t 4s linear infinite}@keyframes lp-t{to{opacity:.3}}</style><g class="lp-move"><circle class="acc lp-t" cx="30" cy="70" r="8"/></g><g class="lp-still"><circle class="bad" cx="30" cy="70" r="8"/></g></svg>');
    }});
  }, FIGQ);
  await page.goto('/practice.html?q=' + FIGQ);
  const a = await page.evaluate(i => window.AIOT_QUESTIONS.find(x => x.id === i).a, FIGQ), wrong = `.opt[data-k="${(a + 1) % 4}"]`;
  await page.locator(wrong).click();
  const f = page.locator('.why figure.qfig.loop'), b = f.locator('.lp-tog');
  await f.scrollIntoViewIfNeeded();
  await expect(f).toHaveClass(/anim/);
  await expect(f).toHaveClass(/run/);
  await expect(f.locator('.lp-move')).toBeVisible();
  await expect(f.locator('.lp-still')).toBeHidden();
  await b.click();
  await expect(b).toHaveText('播放動畫');
  await expect(f.locator('.lp-still')).toBeVisible();
  await b.click();
  await expect(f.locator('.lp-move')).toBeVisible();
  await page.emulateMedia({reducedMotion: 'reduce'});
  await expect(f.locator('.lp-still')).toBeVisible();
  await expect(f.locator('.lp-move')).toBeHidden();
  await expect(b).toBeHidden();
  // A figure rendered while motion is already reduced starts as the still picture.
  // One question: its 「看結果」 is the next button, not a separate end button.
  await page.click('#qNext');
  await page.click('#qRedo');
  await page.locator(wrong).click();
  await expect(page.locator('.why .qfig .lp-still')).toBeVisible();
  await expect(page.locator('.why .qfig .lp-move')).toBeHidden();
});

// Desktop layout: setup and question share one grid (question left, pinned column right), so nothing jumps on 「開始」; phones keep one column.
test('practice: from 901px setup and question share two columns; the end button sits in the right column', async ({page, isMobile}) => {
  await page.goto('/practice.html');
  const cols = sel => page.locator(sel).evaluateAll(xs => xs.map(x => { const r = x.getBoundingClientRect(); return [Math.round(r.left), Math.round(r.width)]; }));
  const before = await cols('#quizSetup .qmain, #quizSetup .qside');
  await page.selectOption('#fCount', '10');
  await page.selectOption('#fMode', 'exam');
  await page.click('#qStart');
  if (isMobile) {
    await expect(page.locator('.quiz.two')).toHaveCount(0);
    await expect(page.locator('.qnav #qSubmit')).toBeVisible();
    await expect(page.locator('.keyhint')).toHaveCount(0);
    return;
  }
  expect(await cols('.quiz .qmain, .quiz .qside')).toEqual(before);
  await expect(page.locator('.qside #qSubmit')).toBeVisible();
  await expect(page.locator('.qside .grid')).toBeVisible();
  await expect(page.locator('.qnav button')).toHaveCount(2);
  await expect(page.locator('.qside .keyhint')).toBeVisible();
  await page.evaluate(() => scrollBy(0, 400));
  await expect(page.locator('#qSubmit')).toBeInViewport();
  // Crossing 901px redraws the question in the one-column layout, answers kept.
  await page.locator('.opt').first().click();
  await page.setViewportSize({width: 800, height: 900});
  await expect(page.locator('.qnav #qSubmit')).toBeVisible();
  await expect(page.locator('.opt.picked')).toHaveCount(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBe(0);
});

test('practice: keys pick options and move between questions, but not while typing', async ({page, isMobile}) => {
  test.skip(isMobile, 'keyboard');
  await page.goto('/practice.html');
  await page.focus('#fCount');
  await page.keyboard.press('2');
  await expect(page.locator('.quiz')).toHaveCount(0);
  await page.selectOption('#fCount', '10');
  await page.selectOption('#fMode', 'exam');
  await page.click('#qStart');
  await expect(page.locator('.opt').nth(2)).toHaveAttribute('aria-keyshortcuts', 'C 3');
  await page.keyboard.press('c');
  await expect(page.locator('.opt').nth(2)).toHaveClass(/picked/);
  await page.keyboard.press('1');
  await expect(page.locator('.opt').nth(0)).toHaveClass(/picked/);
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('.qhead span').first()).toContainText('第 2 /');
  await page.keyboard.press('Enter');
  await expect(page.locator('.qhead span').first()).toContainText('第 3 /');
  await page.keyboard.press('ArrowLeft');
  await expect(page.locator('.qhead span').first()).toContainText('第 2 /');
  await page.keyboard.press('g');
  expect(await page.evaluate(() => document.activeElement.getAttribute('aria-current'))).toBe('step');
  // Enter on a button keeps its own meaning: here it opens question 2 again rather than moving on.
  await page.keyboard.press('Enter');
  await expect(page.locator('.qhead span').first()).toContainText('第 2 /');
});

test('practice results: right answers fold below 901px, wrong ones stay open, the buttons repeat under the review', async ({page, isMobile}) => {
  await page.goto('/practice.html#s1-22');
  await page.selectOption('#fCount', '10');
  await page.click('#qStart');
  for (let i = 0; i < 3; i++) {
    const a = await page.evaluate(t => window.AIOT_QUESTIONS.find(x => x.q === t).a, await page.locator('.qtext').innerText());
    await page.locator(`.opt[data-k="${i === 1 ? (a + 1) % 4 : a}"]`).click();
    await page.click('#qNext');
  }
  await page.click('#qEnd');
  const ok = page.locator('details.okq[data-wide]');
  await expect(ok).toHaveCount(2);
  expect(await ok.evaluateAll(ds => ds.map(d => d.open))).toEqual([!isMobile, !isMobile]);
  await expect(ok.first().locator('summary')).toContainText('第 1 題');
  await expect(page.locator('div.ex .why.bad')).toHaveCount(1);
  const again = page.locator('.qacts [data-act]');
  // 2 of 3 is below 70%: redoing the wrong one leads, and the repeated row is all quiet buttons.
  await expect(again).toHaveText(['重做答錯的 1 題', '做完沒作答的 7 題', '重新設定']);
  await expect(page.locator('.qacts .btn:not(.ghost)')).toHaveCount(0);
  await expect(page.locator('.qacts [id]')).toHaveCount(0);
  await again.nth(0).click();
  await expect(page.locator('.qhead span').first()).toContainText('/ 1');
});

test('chapter contents column: short topics with the full heading as title; the phone menu keeps full headings', async ({page}) => {
  await page.goto('/s1-21.html');
  const h = await page.locator('article section[id] h2').first().innerText();
  const a = page.locator('.toc a').first();
  expect(await a.getAttribute('title')).toContain('：');
  expect(await a.innerText()).toBe((await a.getAttribute('title')).split('：')[0]);
  await expect(page.locator('.tocmenu .in a').nth(1)).toHaveText(await a.getAttribute('title'));
  expect(h).toContain(await a.innerText());
});

// Glossary and review page: phones and tablets pin one row of chapter chips under the header; from 1241px the chips become a pinned side list with chapter names.
test('glossary and review: chapter jump list pinned on both layouts and marks the chapter in view', async ({page, isMobile}) => {
  for (const [url, id, chip] of [['/glossary.html', 'g-s2-12', 'a[href="#g-s2-12"]'], ['/reference.html#chapters', 'r-s2-12', 'a[href="#r-s2-12"]']]) {
    await page.goto(url);
    const nav = page.locator('.gchips');
    await nav.locator(chip).click();
    await expect(page.locator('#' + id)).toBeInViewport();
    await expect(nav.locator(chip)).toHaveAttribute('aria-current', 'true');
    await expect(nav.locator('a[aria-current]')).toHaveCount(1);
    await expect(nav.locator(chip)).toBeInViewport();
    const box = await nav.boundingBox();
    expect(box.y).toBeGreaterThanOrEqual(0);
    if (isMobile) {
      // One row: the strip scrolls sideways instead of wrapping, and its height is what headings keep clear of.
      expect(box.y).toBeLessThan(120);
      expect(box.height).toBeLessThan(70);
      expect(await page.evaluate(() => parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--chiph')))).toBeCloseTo(box.height, 0);
      await expect(nav.locator('.n').first()).toBeHidden();
      if (url === '/glossary.html') {
        const h = await page.locator('#g-s2-12 h2').boundingBox();
        expect(h.y).toBeGreaterThanOrEqual(box.y + box.height - 1);
      }
    } else {
      await expect(nav.locator(chip + ' .n')).toBeVisible();
      expect(box.x + box.width).toBeLessThanOrEqual(box.x + 200.5);
    }
  }
  // The glossary's search and view switch stay at hand on the left from 1241px.
  await page.goto('/glossary.html');
  await page.mouse.wheel(0, 3000);
  await page.waitForTimeout(300);
  if (!isMobile) await expect(page.locator('#gq')).toBeInViewport();
});

test('reading pages: exam and about keep a narrow column from the header\'s left edge', async ({page, isMobile}) => {
  test.skip(isMobile, 'phones use the full width');
  for (const url of ['/exam.html', '/about.html']) {
    await page.goto(url);
    const left = await page.locator('.top .brand').evaluate(b => b.getBoundingClientRect().left);
    const p = await page.locator('main.read p').first().boundingBox();
    expect(Math.abs(p.x - left)).toBeLessThan(2);
    expect(p.width).toBeLessThanOrEqual(800);
    if (url === '/exam.html') expect((await page.locator('.tblwrap.facts').first().boundingBox()).width).toBeLessThanOrEqual(960);
  }
});

// Chapters are listed in the reading order everywhere (章號 keep the official numbers), like the home page.
test('chapter order: practice list and review page follow the home page order', async ({page}) => {
  await page.goto('/index.html');
  await expect(page.locator('#chapters .chnote')).toHaveText('章號沿用官方編號，依建議順序排列。');
  const home = await page.locator('#chapters .chlist a').evaluateAll(as => as.map(a => a.getAttribute('href').replace('.html', '')));
  // Each home entry says how long it reads and how many questions it has.
  await expect(page.locator('#chapters .chlist .m').first()).toHaveText(/^約 \d+ 分鐘・\d+ 題$/);
  await page.goto('/practice.html');
  expect(await page.locator('#fChapter option').evaluateAll(os => os.map(o => o.value).filter(Boolean))).toEqual(home);
  await page.goto('/reference.html#chapters');
  expect(await page.locator('.refgrid .panel').evaluateAll(ps => ps.map(p => p.id.slice(2)))).toEqual(home);
  expect(await page.locator('.gchips a').evaluateAll(as => as.map(a => a.hash.slice(3)))).toEqual(home);
});

test('chapter: the address follows the section being read, without new history entries', async ({page}) => {
  await page.goto('/s1-23.html');
  const n = await page.evaluate(() => history.length);
  const id = await page.locator('article section[id]').nth(2).getAttribute('id');
  await page.locator('#' + id).evaluate(s => scrollTo(0, scrollY + s.getBoundingClientRect().top - 20));
  await expect(page).toHaveURL(new RegExp('#' + id + '$'));
  await page.evaluate(() => scrollTo(0, 0));
  await expect(page).toHaveURL(/s1-23\.html$/);
  expect(await page.evaluate(() => history.length)).toBe(n);
  expect(await page.evaluate(() => Object.keys(localStorage).filter(k => !/theme|gview/.test(k)))).toEqual([]);
});

// Reader feedback: reloading in the middle of a run lost it. Same tab only: a finished run does not come back on reload.
test('practice: a reload in the middle of a run picks it up again; a finished run starts over', async ({page}) => {
  await page.goto('/practice.html#s1-24');
  await page.selectOption('#fCount', '10');
  await page.click('#qStart');
  await page.locator('.opt').first().click();
  await page.click('#qNext');
  await page.reload();
  await expect(page.locator('#quizSetup')).toBeHidden();
  await expect(page.locator('.qhead span').first()).toContainText('第 2 / 10');
  await page.click('#qPrev');
  await expect(page.locator('.why')).toBeVisible();
  await page.click('#qEnd');
  await expect(page.locator('.score')).toBeVisible();
  await page.reload();
  await expect(page.locator('#quizSetup')).toBeVisible();
  await expect(page.locator('.quiz')).toHaveCount(0);
  expect(await page.evaluate(() => Object.keys(localStorage).filter(k => /run|ans|wrong/.test(k)))).toEqual([]);
});

// Reader feedback: 「看結果」 sat between 上一題 and 下一題, easy to tap by mistake on a phone.
test('practice: learn mode keeps the early finish out of the previous / next row', async ({page}) => {
  await page.goto('/practice.html#s1-21');
  await page.selectOption('#fCount', '10');
  await page.click('#qStart');
  await expect(page.locator('.qnav button')).toHaveText(['上一題', '下一題']);
  await expect(page.locator('.qtop #qEnd')).toHaveText('提早看結果');
  for (let i = 0; i < 9; i++) await page.click('#qNext');
  await expect(page.locator('#qEnd')).toHaveCount(0);
  await expect(page.locator('#qNext')).toHaveText('看結果');
});

test('practice results: one solid button chosen by the score; each chapter row starts that chapter', async ({page}) => {
  await page.goto('/practice.html');
  await page.selectOption('#fCount', '10');
  await page.click('#qStart');
  for (let i = 0; i < 10; i++) {
    const a = await page.evaluate(t => window.AIOT_QUESTIONS.find(x => x.q === t).a, await page.locator('.qtext').innerText());
    await page.locator(`.opt[data-k="${i < 4 ? (a + 1) % 4 : a}"]`).click();
    await page.click('#qNext');
  }
  await expect(page.locator('.res .panel')).toContainText('及格參考 70%');
  // 6 of 10 is below 70%: redo leads.
  await expect(page.locator('.res .btn:not(.ghost)')).toHaveText(['重做答錯的 4 題']);
  const row = page.locator('.res tbody tr').first();
  const id = (await row.locator('a').getAttribute('href')).replace('.html', '');
  const n = await page.evaluate(c => window.AIOT_QUESTIONS.filter(q => q.lesson === c).length, id);
  await row.locator('[data-drill]').click();
  await expect(page.locator('.qhead span').first()).toContainText(`/ ${n} 題`);
  const t = await page.locator('.qtext').innerText();
  expect(await page.evaluate(x => window.AIOT_QUESTIONS.find(q => q.q === x).lesson, t)).toBe(id);
  // All right on a one-chapter drill: the next chapter leads; 重新設定 goes back to the setup.
  await page.goto('/practice.html#s1-21');
  await page.selectOption('#fCount', '10');
  await page.click('#qStart');
  for (let i = 0; i < 10; i++) {
    const a = await page.evaluate(t => window.AIOT_QUESTIONS.find(x => x.q === t).a, await page.locator('.qtext').innerText());
    await page.locator(`.opt[data-k="${a}"]`).click();
    await page.click('#qNext');
  }
  await expect(page.locator('.res .btn:not(.ghost)')).toHaveCount(1);
  await expect(page.locator('.res .btn:not(.ghost)')).toContainText('下一章');
  await page.click('#qAgain');
  await expect(page.locator('#quizSetup')).toBeVisible();
});

test('practice: a link to another chapter on the page preselects it', async ({page}) => {
  await page.goto('/practice.html#s1-21');
  await expect(page.locator('#fChapter')).toHaveValue('s1-21');
  await page.evaluate(() => { location.hash = 's2-12'; });
  await expect(page.locator('#fSubject')).toHaveValue('s2');
  await expect(page.locator('#fChapter')).toHaveValue('s2-12');
  await expect(page.locator('#fCount')).toHaveValue('0');
});

// Paper is always dark text on white, whatever theme the screen uses; the chapter head prints as plain text, and the extras open.
test('print: dark text on white in both themes, chapter head included', async ({page}) => {
  const lum = c => { const [r, g, b] = c.match(/[\d.]+/g).slice(0, 3).map(v => +v / 255).map(v => v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
  const vsWhite = c => 1.05 / (lum(c) + 0.05);
  for (const theme of ['light', 'dark']) {
    await page.emulateMedia({media: 'screen', colorScheme: theme});
    await page.goto('/s1-22.html');
    await page.evaluate(t => { document.documentElement.dataset.theme = t; }, theme);
    await page.emulateMedia({media: 'print', colorScheme: theme});
    for (const sel of ['.chead h1', '.chead .sub', 'article section p', '.chead .tag']) {
      const c = await page.locator(sel).first().evaluate(el => getComputedStyle(el).color);
      expect(vsWhite(c), `${theme} ${sel} ${c}`).toBeGreaterThanOrEqual(4.5);
    }
    expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe('rgb(255, 255, 255)');
    expect(await page.locator('.chead').evaluate(el => getComputedStyle(el).backgroundColor)).toMatch(/rgb\(255, 255, 255\)|rgba\(0, 0, 0, 0\)/);
    await expect(page.locator('[data-read-all]')).toBeHidden();
  }
  await page.evaluate(() => dispatchEvent(new Event('beforeprint')));
  await expect(page.locator('details.pr:not([open]), details.fl:not([open])')).toHaveCount(0);
  await page.evaluate(() => dispatchEvent(new Event('afterprint')));
  await expect(page.locator('details.pr[open]')).toHaveCount(0);
});

// Without JavaScript nothing promises a control that cannot work: the theme button, the glossary views and the practice setup hide, the confusables show.
test('no JavaScript: pages say what needs it and hide controls that cannot work', async ({browser}) => {
  const ctx = await browser.newContext({javaScriptEnabled: false});
  const page = await ctx.newPage();
  await page.goto('/practice.html');
  await expect(page.locator('main')).toContainText('練習需要 JavaScript');
  await expect(page.locator('#quizSetup')).toBeHidden();
  await expect(page.locator('#themeBtn')).toBeHidden();
  await page.goto('/glossary.html');
  await expect(page.locator('.gview')).toBeHidden();
  await expect(page.locator('#gconf')).toBeVisible();
  await expect(page.locator('#gch')).toBeVisible();
  await page.goto('/s1-22.html');
  await expect(page.locator('.lab').first()).toContainText('需要 JavaScript');
  await expect(page.locator('.lab-wait').first()).toBeHidden();
  await ctx.close();
});

test('labs: the loading placeholder is replaced when the lab draws; a missing question bank says so', async ({page}) => {
  await page.goto('/s1-22.html');
  await expect(page.locator('.lab h3').first()).toBeVisible();
  await expect(page.locator('.lab-wait')).toHaveCount(0);
  await expect(page.locator('.nojs').first()).toBeHidden();
  await page.route('**/questions.js*', r => r.abort());
  await page.goto('/practice.html');
  await expect(page.locator('#quizApp')).toContainText('題庫沒有載入');
  await expect(page.locator('#quizSetup')).toBeHidden();
});

// Zoom works without a mouse: each figure has a 放大 button; the copy is a modal dialog that takes focus and gives it back.
test('zoom: keyboard opens a figure as a dialog and Escape returns focus', async ({page, isMobile}) => {
  test.skip(isMobile, 'keyboard');
  await page.goto('/s1-21.html');
  const f = page.locator('article figure.dg:not(.loop)').first();
  const b = f.locator('.zbtn');
  await b.focus();
  await expect(b).toBeVisible();
  await page.keyboard.press('Enter');
  const z = page.locator('.zoom');
  await expect(z).toHaveAttribute('role', 'dialog');
  await expect(z).toHaveAttribute('aria-modal', 'true');
  await expect(z.locator('.zbtn')).toHaveCount(0);
  expect(await page.evaluate(() => document.activeElement.classList.contains('zx'))).toBe(true);
  await page.keyboard.press('Tab');
  expect(await page.evaluate(() => document.activeElement.classList.contains('zx'))).toBe(true);
  await page.keyboard.press('Escape');
  await expect(z).toHaveCount(0);
  expect(await page.evaluate(() => document.activeElement.classList.contains('zbtn'))).toBe(true);
  await expect(page.locator('figure.loop .zbtn')).toHaveCount(0);
});

// A phone's address bar folding away changes only the height; the definition stays open until the width changes.
test('glossary pop: stays open when only the height changes', async ({page}) => {
  await page.goto('/s2-22.html');
  const term = page.locator('.gl').first();
  await term.scrollIntoViewIfNeeded();
  await term.click();
  await expect(page.locator('.glpop')).toBeVisible();
  const vp = page.viewportSize();
  await page.setViewportSize({width: vp.width, height: vp.height - 60});
  await page.waitForTimeout(100);
  await expect(page.locator('.glpop')).toBeVisible();
  await page.setViewportSize({width: vp.width - 40, height: vp.height - 60});
  await expect(page.locator('.glpop')).toBeHidden();
});

test('video: the poster loads only once the video is opened', async ({page}) => {
  const posters = [];
  page.on('request', r => { if (r.url().includes('-poster.jpg')) posters.push(r.url()); });
  await page.goto('/index.html');
  await page.waitForLoadState('networkidle');
  expect(posters).toEqual([]);
  await page.locator('details.vid summary').first().click();
  await expect(page.locator('details.vid video').first()).toHaveAttribute('poster', /-poster\.jpg$/);
});
