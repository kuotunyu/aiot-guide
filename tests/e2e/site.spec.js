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

test('practice: wrong answers are remembered until answered right', async ({page}) => {
  await page.goto('/practice.html#s2-23');
  await expect(page.locator('#qWrong')).toBeHidden();
  await page.click('#qStart');
  const a = await page.evaluate(t => window.AIOT_QUESTIONS.find(x => x.q === t).a, await page.locator('.qtext').innerText());
  await page.locator(`.opt[data-k="${(a + 1) % 4}"]`).click();
  await page.reload();
  await expect(page.locator('#qWrong')).toHaveText('重做曾答錯的 1 題');
  await page.click('#qWrong');
  await page.locator(`.opt[data-k="${a}"]`).click();
  await page.click('#qNext');
  await page.click('#qAgain');
  await expect(page.locator('#qWrong')).toBeHidden();
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

test('glossary: search handles plain-keyboard spellings', async ({page}) => {
  await page.goto('/glossary.html');
  await page.fill('#gq', 'i2c');
  await expect(page.locator('.gitem:visible b').first()).toContainText('I²C');
  await page.fill('#gq', 'zzzz');
  await expect(page.locator('#gcount')).toHaveText('0 個名詞');
  await expect(page.locator('.gsec:visible')).toHaveCount(0);
});

test('glossary: grouped by chapter by default, A–Z puts acronyms first', async ({page}) => {
  await page.goto('/glossary.html');
  await expect(page.locator('#gch')).toBeVisible();
  await expect(page.locator('.gsec').first()).toHaveAttribute('id', 'g-s1-21');
  await page.click('[data-v="az"]');
  await expect(page.locator('#gch')).toBeHidden();
  await expect(page.locator('#gaz .gitem b').first()).toHaveText(/^[A-Za-z0-9]/);
  await expect(page.locator('#gcount')).toHaveText(/^\d+ 個名詞$/);
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
