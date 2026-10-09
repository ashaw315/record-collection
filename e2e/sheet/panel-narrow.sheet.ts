import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium, devices, test, webkit, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { login } from './login';

/**
 * The open filter panel at 390 and 320, read-only on the real collection:
 * what Adam called "wonky" on his phone (9 Oct), turned into figures.
 *
 * §T.3 gives the panel §G.8's mechanics: opaque paper from beneath the last
 * filter line to the viewport's bottom, full width, "the page beneath does
 * not move", the page held in both directions, and a list longer than the
 * panel scrolling within it. This reads each of those, and what moves on
 * open and on close.
 *
 * **Two engines, and neither is his phone.** Playwright's WebKit is the
 * phone's engine but has no touch drag and no wheel, so there the hold is
 * read by a scripted scroll and by the keyboard, and whether a finger's
 * drag takes the page is NOT read. Chromium with a touch screen has a real
 * touch stream (CDP), so there a drag is a drag, in another engine. Mobile
 * Safari's own behaviours (the toolbar that collapses, the rubber band,
 * how it treats a held root) are in neither.
 *
 * Nothing is chosen and no record is opened: lines are pressed, the paper
 * is pressed, and the page is dragged.
 */
const OUT = process.env.SHEET_OUT ?? join('docs', 'captures', 'panel-narrow');
const WIDTHS = [390, 320];
/* The iPhone 13 descriptor's own window. */
const HEIGHT = 664;
const baseURL = process.env.SHEET_BASE_URL ?? `http://localhost:${process.env.SHEET_PORT ?? '3200'}`;

const read = (page: Page) =>
  page.evaluate(() => {
    const r1 = (n: number) => Math.round(n * 10) / 10;
    const root = document.documentElement;
    const lines = Array.from(document.querySelectorAll<HTMLElement>('[data-filter-trigger]')).map((b) => { const r = b.getBoundingClientRect(); return { name: (b.querySelector('[data-filter-label]')?.textContent ?? '').trim(), top: r1(r.top), bottom: r1(r.bottom), left: r1(r.left) }; });
    const panel = document.querySelector<HTMLElement>('[data-filter-panel]');
    const list = panel?.querySelector<HTMLElement>('[data-filter-list]') ?? null;
    const p = panel?.getBoundingClientRect();
    const l = list?.getBoundingClientRect();
    const first = document.querySelector<HTMLElement>('main table tbody tr, main [data-collection-grid] li');
    return {
      scrollY: r1(window.scrollY), scrollX: r1(window.scrollX), pageHeight: root.scrollHeight, pageWidth: root.scrollWidth, clientWidth: root.clientWidth, innerHeight: window.innerHeight, innerWidth: window.innerWidth,
      rootOverflow: root.style.overflow, rootPaddingRight: root.style.paddingRight,
      lines, lastLineBottom: lines.length === 0 ? null : lines[lines.length - 1].bottom,
      firstRowTop: first === null ? null : r1(first.getBoundingClientRect().top),
      panel: p === undefined || panel === null ? null : { top: r1(p.top), bottom: r1(p.bottom), left: r1(p.left), width: r1(p.width), height: r1(p.height), scrollTop: r1(panel.scrollTop), scrollHeight: panel.scrollHeight, clientHeight: panel.clientHeight, options: panel.querySelectorAll('[data-filter-option]').length, listTop: l === undefined ? null : r1(l.top), listHeight: l === undefined ? null : r1(l.height), listWidth: l === undefined ? null : r1(l.width), listLeft: l === undefined ? null : r1(l.left) },
    };
  });

type Reading = Awaited<ReturnType<typeof read>>;
type Step = { what: string; staged: boolean; note?: string } & Reading;

/** A finger's drag, by CDP: Chromium only. From (x, y), `dy` up the screen (a drag up scrolls down). */
async function drag(context: BrowserContext, page: Page, x: number, y: number, dy: number) {
  const cdp = await context.newCDPSession(page);
  const point = (py: number) => [{ x, y: py, id: 1, radiusX: 4, radiusY: 4, force: 1 }];
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: point(y) });
  for (let i = 1; i <= 12; i += 1) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: point(y - (dy * i) / 12) }); await page.waitForTimeout(16); }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await page.waitForTimeout(700);
  await cdp.detach();
}

async function readOne(engine: 'webkit' | 'chromium-touch', browser: Browser, width: number, view: 'table' | 'grid', filter: string, startScroll: number) {
  const context = await browser.newContext({ ...(engine === 'webkit' ? devices['iPhone 13'] : { hasTouch: true, isMobile: true, deviceScaleFactor: 2 }), viewport: { width, height: HEIGHT }, baseURL });
  const page = await context.newPage();
  const steps: Step[] = [];
  const name = `${engine}-${view}-${String(width).padStart(4, '0')}x${HEIGHT}-${filter}-from${startScroll}`;
  const shot = (tag: string) => page.screenshot({ path: join(OUT, `panel-${name}-${tag}.png`) });
  const note = async (what: string, staged = true, extra?: string) => { steps.push({ what, staged, note: extra, ...(await read(page)) }); };
  try {
    await login(page);
    await page.goto(`/?view=${view}`);
    await page.locator('[data-collection-filters][data-hydrated="true"]').waitFor({ timeout: 60_000 });
    await page.addStyleTag({ content: 'nextjs-portal{display:none!important}' });
    await page.evaluate(() => document.fonts.ready);
    if (startScroll > 0) await page.evaluate((y) => window.scrollTo(0, y), startScroll);
    await page.waitForTimeout(400);
    await note('closed');
    await shot('1-closed');

    const line = page.locator(`[data-filter="${filter}"] [data-filter-trigger]`);
    await line.tap();
    await page.locator('[data-filter-panel]').waitFor({ timeout: 15_000 });
    await page.waitForTimeout(400);
    await note('open');
    await shot('2-open');
    const open = steps[steps.length - 1];
    const p = open.panel;
    if (p === null) throw new Error('no panel');

    /* The page behind, asked to move four ways. */
    await page.evaluate(() => window.scrollBy(0, 300));
    await page.waitForTimeout(300);
    await note('page asked down 300 by script');
    await page.evaluate(() => window.scrollBy(0, -300));
    await page.waitForTimeout(300);
    await note('page asked up 300 by script');
    await page.evaluate(() => window.scrollBy(120, 0));
    await page.waitForTimeout(300);
    await note('page asked sideways 120 by script');
    await page.evaluate(() => window.scrollTo(0, window.scrollY));
    await page.keyboard.press('End');
    await page.waitForTimeout(400);
    await note('End key');
    await page.keyboard.press('Home');
    await page.waitForTimeout(400);
    await note('Home key');

    if (engine === 'chromium-touch') {
      const mid = p.top + Math.min(p.height, 300) / 2;
      await drag(context, page, width / 2, mid, 160);
      await note('finger dragged up 160 on the list');
      await shot('3-dragged-list');
      await drag(context, page, width / 2, mid, -400);
      await note('finger dragged down 400 on the list (past its top)');
      await drag(context, page, 8, mid, 160);
      await note('finger dragged up 160 on the 20 inset beside the list');
      await drag(context, page, 8, mid, -400);
      await note('finger dragged down 400 on the inset');
      if (open.lines.length > 0 && open.lines[0].top > 20) {
        await drag(context, page, width - 30, Math.max(60, open.lines[0].top - 30), 160);
        await note('finger dragged up 160 above the filter lines, off the panel');
        await drag(context, page, width - 30, Math.max(60, open.lines[0].top - 30), -160);
        await note('finger dragged down 160 above the filter lines');
      }
    } else {
      steps.push({ ...(await read(page)), what: 'a finger’s drag', staged: false, note: 'not staged: Playwright’s WebKit has no touch drag and no wheel' });
    }

    /* The list inside the panel, by script, in either engine: can the panel scroll at all, and does the page follow. */
    await page.locator('[data-filter-panel]').evaluate((el) => { el.scrollTop = 200; });
    await page.waitForTimeout(300);
    await note('panel asked to scroll its list to 200 by script');
    await shot('4-list-scrolled');
    await page.locator('[data-filter-panel]').evaluate((el) => { el.scrollTop = 0; });

    /* Close by the line itself, which is never under the panel. */
    await line.tap();
    await page.locator('[data-filter-panel]').waitFor({ state: 'detached', timeout: 15_000 });
    await page.waitForTimeout(500);
    await note('closed again');
    await shot('5-closed-again');
  } finally {
    await context.close();
  }
  return { engine, width, view, filter, startScroll, name, steps };
}

test('the open filter panel at 390 and 320: what holds and what moves', async () => {
  mkdirSync(OUT, { recursive: true });
  const runs: Awaited<ReturnType<typeof readOne>>[] = [];
  for (const [engine, launcher] of [['webkit', webkit], ['chromium-touch', chromium]] as const) {
    const browser = await launcher.launch();
    try {
      for (const width of WIDTHS) {
        runs.push(await readOne(engine, browser, width, 'table', 'genreId', 0));
        runs.push(await readOne(engine, browser, width, 'table', 'storeId', 0));
        runs.push(await readOne(engine, browser, width, 'table', 'genreId', 150));
        runs.push(await readOne(engine, browser, width, 'grid', 'genreId', 0));
      }
    } finally {
      await browser.close();
    }
  }
  writeFileSync(join(OUT, 'panel-narrow.json'), `${JSON.stringify(runs, null, 1)}\n`);

  const md: string[] = ['# The open filter panel at 390 and 320', '', `Read-only on the real collection, window ${HEIGHT} tall. Generated by \`e2e/sheet/panel-narrow.sheet.ts\`; every figure is in \`panel-narrow.json\`, and each run has five captures named for it.`, '',
    '**Neither engine is the phone.** WebKit here is Playwright’s: the phone’s engine with no touch drag and no wheel, so a finger’s drag is not read there. Chromium with a touch screen has a real touch stream, in another engine. Mobile Safari’s collapsing toolbar and rubber band are in neither.', ''];
  md.push('## The panel against steps 101 and 102', '', 'Ruled: top at the last filter line’s foot, bottom at the viewport’s, the window’s full width, the list at the 20 inset.', '',
    '| engine | view | window | filter | page at | last line’s foot | panel top | panel bottom | window height | panel width | window width | list left, width | options | list height | panel’s own scroll range |', '|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|');
  for (const r of runs) { const o = r.steps.find((s) => s.what === 'open'); const p = o?.panel; if (o === undefined || p === null || p === undefined) continue; md.push(`| ${r.engine} | ${r.view} | ${r.width} | ${r.filter} | ${o.scrollY} | ${o.lastLineBottom} | ${p.top} | ${p.bottom} | ${o.innerHeight} | ${p.width} | ${o.innerWidth} | ${p.listLeft}, ${p.listWidth} | ${p.options} | ${p.listHeight} | ${p.scrollHeight - p.clientHeight} |`); }
  md.push('', '## What moves on open and on close', '', 'Each cell is closed → open → closed again.', '',
    '| engine | view | window | filter | page’s scroll | page’s length | page’s width / window’s | first line’s top | last line’s foot | first row’s top | root’s overflow while open |', '|---|---|---|---|---|---|---|---|---|---|---|');
  for (const r of runs) { const [a, b, c] = ['closed', 'open', 'closed again'].map((w) => r.steps.find((s) => s.what === w)); if (a === undefined || b === undefined || c === undefined) continue; const t = (f: (s: Step) => unknown) => `${f(a)} → ${f(b)} → ${f(c)}`; md.push(`| ${r.engine} | ${r.view} | ${r.width} | ${r.filter} | ${t((s) => s.scrollY)} | ${t((s) => s.pageHeight)} | ${t((s) => `${s.pageWidth}/${s.clientWidth}`)} | ${t((s) => s.lines[0]?.top)} | ${t((s) => s.lastLineBottom)} | ${t((s) => s.firstRowTop)} | "${b.rootOverflow}" |`); }
  md.push('', '## Whether the page behind holds, and whether the list scrolls', '', 'Each row is one thing asked of the page with the panel open, and where the page and the panel’s list were afterwards. The page’s scroll before it is the "open" row’s.', '',
    '| engine | view | window | filter | asked | page’s scroll (y, x) | panel’s list scrolled to | panel still open | first line’s top |', '|---|---|---|---|---|---|---|---|---|');
  for (const r of runs) for (const s of r.steps) { if (['closed', 'closed again'].includes(s.what)) continue; md.push(`| ${r.engine} | ${r.view} | ${r.width} | ${r.filter} | ${s.what}${s.staged ? '' : ` — ${s.note}`} | ${s.staged ? `${s.scrollY}, ${s.scrollX}` : ''} | ${s.staged ? s.panel?.scrollTop ?? '' : ''} | ${s.staged ? (s.panel === null ? 'NO' : 'yes') : ''} | ${s.staged ? s.lines[0]?.top ?? '' : ''} |`); }
  writeFileSync(join(OUT, 'panel-narrow.md'), `${md.join('\n')}\n`);
});
