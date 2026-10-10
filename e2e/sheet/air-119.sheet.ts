import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from '@playwright/test';
import { NO_SCROLL_HEIGHT } from '../../src/app/records/[id]/band-geometry';
import { measure } from './air-measure';
import { login } from './login';

/**
 * Step 119, a measurement for Design and nothing built: **the five
 * screens' air against the source as it is now.** §T.6 reasoned about that
 * air against "the collection's smallest clearing height of 172.4"; since
 * step 115 the source is the record that first draws at the narrowest
 * window, and its clearing height is read here from the head figure the
 * table draws, not assumed.
 *
 * Two things are read. The air beside each heading, by step 103d's
 * measure (`air-measure.ts`), with §T.6's 24 margin. And the one empty
 * state the real collection shows, the want list's Acquired view, whose
 * figure is drawn at the clearing height: its size, where it stands, and
 * whether the window and the first view hold it. Look up's empty state
 * needs a search, which is a live call to Discogs, so it is not opened.
 *
 * Read-only. Nothing is pressed and no record's page is opened.
 */
const OUT = process.env.SHEET_OUT ?? join('docs', 'captures', 'air-119');
const MARGIN = 24;
const r1 = (n: number) => String(Math.round(n * 10) / 10);

test('the five screens’ air and the want list’s empty figure, against the source’s clearing height', async ({ page }) => {
  mkdirSync(OUT, { recursive: true });
  await login(page);
  await page.setViewportSize({ width: 1440, height: NO_SCROLL_HEIGHT });
  await page.goto('/?view=table');
  const head = page.locator('[data-head-figure]');
  await head.waitFor({ state: 'attached', timeout: 60_000 });
  const source = await head.evaluate((el) => { const d = (el as HTMLElement).dataset; return { clearing: Number(d.clearing), aspect: Number(d.aspect) }; });
  const title = ((await page.locator(`main table tbody tr a[href$="${await head.getAttribute('data-record')}"]`).first().textContent()) ?? '').trim();
  const href = (await page.locator('main table tbody tr a').first().getAttribute('href')) ?? '';
  const need = { height: source.clearing, width: source.clearing * source.aspect };

  const md = ['# Step 119: the five screens’ air against the source’s clearing height, on the real collection', '', 'Read-only, desktop Chromium. Nothing was built.', '',
    `**The source is ${title}**: clearing height ${r1(source.clearing)}, aspect ${source.aspect}, so its figure at that height is **${r1(need.width)} × ${r1(need.height)}**. §T.6’s 172.4 was the old source’s.`, '',
    '## The air beside each heading', '', `The first view at each width × ${NO_SCROLL_HEIGHT}. The air is the largest empty rectangle right of the heading’s type that begins no lower than its top, after §T.6’s ${MARGIN} margin against type, controls and the header. The rectangle is dashed onto each capture.`, '',
    '| screen | window | the air | its height against 193.2 | its width against the figure’s | holds the figure | capture |', '|---|---|---|---|---|---|---|'];
  const screens = [
    { name: 'stats', path: '/stats' }, { name: 'want-list', path: '/want-list' }, { name: 'look-up', path: '/lookup' },
    { name: 'record-form-new', path: '/records/new' }, { name: 'record-form-edit', path: `${href.split('?')[0]}/edit` }, { name: 'manage', path: '/manage' },
  ];
  for (const screen of screens) for (const width of [1920, 1440, 1024, 768]) {
    await page.setViewportSize({ width, height: NO_SCROLL_HEIGHT });
    await page.goto(screen.path);
    await page.locator('h1').first().waitFor({ timeout: 60_000 });
    await page.waitForLoadState('load');
    await page.addStyleTag({ content: 'nextjs-portal{display:none!important}' });
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(600);
    const air = (await measure(page, MARGIN)).best;
    if (air !== null) await page.evaluate((r) => { const d = document.createElement('div'); d.style.cssText = `position:fixed;left:${r.left}px;top:${r.top}px;width:${r.width}px;height:${r.height}px;outline:1px dashed #000;outline-offset:-1px;z-index:99999;pointer-events:none`; document.body.appendChild(d); }, air);
    const file = `air-${screen.name}-w${width}-${air === null ? 'none' : `${air.width}x${air.height}`}.png`;
    await page.screenshot({ path: join(OUT, file) });
    const holds = air !== null && air.height >= need.height && air.width >= need.width;
    md.push(`| ${screen.name} | ${width} | ${air === null ? 'none' : `${air.width} × ${air.height}`} | ${air === null ? '' : r1(air.height - need.height)} | ${air === null ? '' : r1(air.width - need.width)} | ${holds ? 'yes' : '**no**'} | ${file} |`);
  }

  md.push('', '## The want list’s empty state (the Acquired view), whose figure is drawn at the clearing height', '', 'Step 112 read this figure at 205.1 × 172.3, with the old source.', '',
    '| window | the column | figure drawn | against the source’s | its left and right | inside the column | figure’s top | sentence’s foot | first view’s foot | the sentence is in the first view | page scrolls sideways by | capture |', '|---|---|---|---|---|---|---|---|---|---|---|---|');
  for (const [width, height] of [[1920, 1000], [1440, 900], [1054, 900], [1024, 900], [390, 664], [320, 664]] as const) {
    await page.setViewportSize({ width, height });
    await page.goto('/want-list?acquired=true');
    await page.locator('h1').first().waitFor({ timeout: 60_000 });
    await page.addStyleTag({ content: 'nextjs-portal{display:none!important}' });
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(400);
    const m = await page.evaluate(() => {
      const empty = document.querySelector<HTMLElement>('[data-want-list-empty]');
      const svg = empty?.querySelector('svg')?.getBoundingClientRect();
      const p = empty?.querySelector('p')?.getBoundingClientRect();
      if (empty === null || svg === undefined || p === undefined) return null;
      const e = empty.getBoundingClientRect();
      return { column: e.width, left: e.left, right: e.right, svg: { width: svg.width, height: svg.height, left: svg.left, right: svg.right, top: svg.top, bottom: svg.bottom }, sentenceFoot: p.bottom, scrolls: document.documentElement.scrollWidth - document.documentElement.clientWidth };
    });
    if (m === null) { md.push(`| ${width} × ${height} | the Acquired view is not empty, or draws no figure | | | | | | | | | | |`); continue; }
    const file = `want-list-acquired-w${width}-figure-${Math.round(m.svg.width)}x${Math.round(m.svg.height)}.png`;
    await page.screenshot({ path: join(OUT, file) });
    md.push(`| ${width} × ${height} | ${r1(m.column)} | **${r1(m.svg.width)} × ${r1(m.svg.height)}** | ${r1(m.svg.width - need.width)} × ${r1(m.svg.height - need.height)} | ${r1(m.svg.left)} to ${r1(m.svg.right)} | ${m.svg.left >= m.left - 0.5 && m.svg.right <= m.right + 0.5 ? `yes, by ${r1(m.column - m.svg.width)}` : '**no**'} | ${r1(m.svg.top)} | ${r1(m.sentenceFoot)} | ${height} | ${m.sentenceFoot <= height ? `yes, by ${r1(height - m.sentenceFoot)}` : `**no, by ${r1(m.sentenceFoot - height)}**`} | ${r1(m.scrolls)} | ${file} |`);
  }
  writeFileSync(join(OUT, 'air-119.md'), `${md.join('\n')}\n`);
});
