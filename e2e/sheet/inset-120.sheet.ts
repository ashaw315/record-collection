import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from '@playwright/test';
import { SCREEN } from '../../src/app/screen-frame';
import { FORK, SIDEBAR, gridColumns } from '../../src/app/sidebar-layout';
import { login } from './login';

/**
 * Step 120, §T.1: "Content starts at the wordmark's 18 on every screen and
 * at every width, phones included." For Design and Adam: every framed
 * screen's left, measure and sideways scroll; the table and grid above and
 * below the fork, with what the sidebar takes from the window; and the
 * grid's cover counts either side of each window where one changes below
 * the fork.
 *
 * Read-only. Nothing is pressed and no record's page is opened.
 */
const OUT = process.env.SHEET_OUT ?? join('docs', 'captures', 'inset-120');
const WIDTHS = [1920, 1440, 1081, 1080, FORK, FORK - 1, 1024, 390];
const r1 = (n: number) => String(Math.round(n * 10) / 10);

test('every content inset at the wordmark’s 18: the framed screens, the table and grid, and the grid’s changes', async ({ page }) => {
  mkdirSync(OUT, { recursive: true });
  await login(page);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/?view=table');
  await page.locator('main table tbody tr a').first().waitFor({ timeout: 60_000 });
  const href = (await page.locator('main table tbody tr a').first().getAttribute('href')) ?? '';
  await page.goto('/want-list');
  const item = ((await page.locator('main a[href$="/edit"]').first().getAttribute('href')) ?? '').replace(/\/edit$/, '');

  const screens = [
    { name: 'stats', path: '/stats' }, { name: 'want-list', path: '/want-list' }, { name: 'look-up', path: '/lookup' },
    { name: 'record-form-new', path: '/records/new' }, { name: 'record-form-edit', path: `${href.split('?')[0]}/edit` }, { name: 'manage', path: '/manage' },
    { name: 'suggestions', path: '/suggestions' }, { name: 'want-list-new', path: '/want-list/new' },
    ...(item === '' ? [] : [{ name: 'want-list-item', path: item }, { name: 'want-list-item-edit', path: `${item}/edit` }]),
    { name: 'not-found', path: '/no-such-screen' },
  ];
  const md = ['# Step 120: every content inset at the wordmark’s 18, on the real collection', '', 'Read-only, desktop Chromium, windows 1000 tall.', '',
    '## The framed screens', '', '| screen | window | content’s left | first line’s left | wordmark’s left | measure | paper to its right | scrolls sideways by | capture |', '|---|---|---|---|---|---|---|---|---|'];
  for (const screen of screens) for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto(screen.path);
    await page.locator('h1, [data-testid="not-found-line"]').first().waitFor({ timeout: 60_000 });
    await page.waitForLoadState('load');
    await page.evaluate(() => document.fonts.ready);
    await page.addStyleTag({ content: 'nextjs-portal{display:none!important}' });
    await page.waitForTimeout(400);
    const m = await page.evaluate(() => {
      const frame = document.querySelector<HTMLElement>('[data-screen-frame]');
      const first = document.querySelector('h1, [data-testid="not-found-line"]');
      const wordmark = document.querySelector('[data-wordmark]');
      if (frame === null || first === null || wordmark === null) return null;
      const style = getComputedStyle(frame);
      const box = frame.getBoundingClientRect();
      const left = box.left + Number.parseFloat(style.paddingLeft);
      const right = box.right - Number.parseFloat(style.paddingRight);
      return { left, right, first: first.getBoundingClientRect().left, wordmark: wordmark.getBoundingClientRect().left, scrolls: document.documentElement.scrollWidth - document.documentElement.clientWidth, client: document.documentElement.clientWidth };
    });
    if (m === null) throw new Error(`${screen.name} at ${width}: no frame, first line or wordmark`);
    const file = `${screen.name}-w${width}-left${Math.round(m.left)}-measure${Math.round(m.right - m.left)}.png`;
    await page.screenshot({ path: join(OUT, file) });
    md.push(`| ${screen.name} | ${width} | **${r1(m.left)}** | ${r1(m.first)} | ${r1(m.wordmark)} | **${r1(m.right - m.left)}** | ${r1(m.client - m.right)} | ${r1(m.scrolls)} | ${file} |`);
  }

  const collection = async (view: string, width: number) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto(`/?view=${view}`);
    await page.locator('[data-collection-filters][data-hydrated="true"]').waitFor({ timeout: 60_000 });
    await page.evaluate(() => document.fonts.ready);
    await page.addStyleTag({ content: 'nextjs-portal{display:none!important}' });
    await page.waitForTimeout(600);
    return page.evaluate(() => {
      const shown = (el: Element | null) => (el !== null && el.getClientRects().length > 0 ? el.getBoundingClientRect() : null);
      const list = shown(document.querySelector('main [data-collection-table] table, main [data-collection-grid]'));
      const rule = shown(document.querySelector('[data-collection-sidebar]'));
      const head = shown(document.querySelector('[data-head-figure]'));
      const search = shown(document.querySelector('[data-collection-band] #rail-search'));
      const covers = Array.from(document.querySelectorAll<HTMLElement>('main [data-collection-grid] [data-grid-cover]')).map((el) => el.getBoundingClientRect());
      const firstRow = covers.filter((b) => Math.abs(b.top - covers[0].top) < 1);
      return { window: document.documentElement.clientWidth, left: list?.left ?? 0, right: list?.right ?? 0, top: list?.top ?? 0, /* Below the fork the same element is the band's block, as wide as the window: it is a sidebar only where the list stands beside it. */
      sidebar: rule !== null && list !== null && list.left >= rule.right ? rule.right : null, head: head === null ? null : { width: head.width, height: head.height }, search: search === null ? null : { left: search.left, width: search.width }, columns: firstRow.length, cover: covers[0]?.width ?? 0, scrolls: document.documentElement.scrollWidth - document.documentElement.clientWidth };
    });
  };
  md.push('', '## The table and grid', '', `“Taken” is the window (to the cap) less the list’s width, where the sidebar stands: §T.5’s ${SIDEBAR.taken}.`, '',
    '| view | window | sidebar | list’s left | list’s right, from the window’s | list’s width | taken | head figure | list’s top | search’s left and width | covers | capture |', '|---|---|---|---|---|---|---|---|---|---|---|---|');
  for (const view of ['table', 'grid']) for (const width of [...WIDTHS, 320]) {
    const m = await collection(view, width);
    const file = `${view}-w${width}-left${Math.round(m.left)}-width${Math.round(m.right - m.left)}.png`;
    await page.screenshot({ path: join(OUT, file) });
    md.push(`| ${view} | ${width} | ${m.sidebar === null ? 'no' : `yes, its rule ends at ${r1(m.sidebar)}`} | **${r1(m.left)}** | ${r1(m.window - m.right)} | **${r1(m.right - m.left)}** | ${m.sidebar === null ? '' : r1(Math.min(width, 1440) - (m.right - m.left))} | ${m.head === null ? 'none' : `${r1(m.head.width)} × ${r1(m.head.height)}`} | ${r1(m.top)} | ${m.search === null ? '' : `${r1(m.search.left)}, ${r1(m.search.width)}`} | ${view === 'grid' ? `${m.columns} of ${r1(m.cover)}` : ''} | ${file} |`);
  }

  md.push('', '## The grid below the fork, either side of each window where a cover joins the row', '', `A row holds n covers of 160 with their 24s when the window less ${2 * SCREEN.inset} holds 184n − 24, so the changes are at 184n + ${2 * SCREEN.inset - 24}; they were at 184n + 16.`, '',
    '| window | grid’s width | covers to a row | by 184n − 24 | cover | capture |', '|---|---|---|---|---|---|');
  for (const n of [3, 4, 5]) for (const width of [184 * n - 24 + 2 * SCREEN.inset - 1, 184 * n - 24 + 2 * SCREEN.inset, 184 * n + 15, 184 * n + 16]) {
    const m = await collection('grid', width);
    const file = `grid-w${width}-${m.columns}-covers-of-${Math.round(m.cover)}.png`;
    await page.screenshot({ path: join(OUT, file) });
    md.push(`| ${width} | ${r1(m.right - m.left)} | **${m.columns}** | ${gridColumns(m.right - m.left)} | **${r1(m.cover)}** | ${file} |`);
  }
  writeFileSync(join(OUT, 'inset-120.md'), `${md.join('\n')}\n`);
});
