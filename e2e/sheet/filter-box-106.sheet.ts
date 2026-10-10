import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test, type Page } from '@playwright/test';
import { login } from './login';

/**
 * Step 106's two reports, read-only on the real collection: what the page
 * beside the box shows at 768, and the box's height against Genre's list
 * at short viewports.
 *
 * §T.3: "At 768 and up the open filter is a box: beneath the last filter
 * line, aligned with the filter lines, 443 wide, opaque paper in a 1px ink
 * box, as tall as its list up to the viewport's bottom less 24 and never
 * less than 176." "Where the space below the last filter line is less,
 * opening first scrolls the page by the shortfall, in one instant move."
 *
 * Nothing is chosen and no record is opened: a line is pressed, read,
 * photographed, and closed by Escape. Desktop Chromium, which is not
 * Adam's browser.
 */
const OUT = process.env.SHEET_OUT ?? join('docs', 'captures', 'filter-box-106');
/* 768 is the fork; 767 is the sheet beside it. The short windows are for the floor. */
const WINDOWS: [number, number][] = [[767, 800], [768, 800], [1024, 800], [1440, 900], [1024, 700], [1024, 640], [1024, 600], [1024, 560], [1024, 500], [768, 600]];

const read = (page: Page) =>
  page.evaluate(() => {
    const r1 = (n: number) => Math.round(n * 10) / 10;
    const lines = Array.from(document.querySelectorAll<HTMLElement>('[data-filter-trigger]')).map((b) => { const r = b.getBoundingClientRect(); return { top: r1(r.top), bottom: r1(r.bottom), left: r1(r.left) }; });
    const panel = document.querySelector<HTMLElement>('[data-filter-panel]');
    const p = panel?.getBoundingClientRect();
    let beside: { columns: string[]; rows: number; text: string[]; pageRight: number } | null = null;
    if (p !== undefined && panel !== null) {
      /* What is drawn right of the box, between its top and its foot. */
      const heads = Array.from(document.querySelectorAll<HTMLElement>('main table thead th')).filter((th) => { const r = th.getBoundingClientRect(); return r.width > 0 && r.right > p.right; }).map((th) => (th.textContent ?? '').trim());
      const rows = Array.from(document.querySelectorAll<HTMLElement>('main table tbody tr')).filter((tr) => { const r = tr.getBoundingClientRect(); return r.bottom > p.top && r.top < p.bottom; });
      const text = rows.slice(0, 4).map((tr) => Array.from(tr.querySelectorAll<HTMLElement>('td')).filter((td) => { const r = td.getBoundingClientRect(); return r.width > 0 && r.left >= p.right; }).map((td) => (td.textContent ?? '').trim()).join(' | '));
      const table = document.querySelector<HTMLElement>('main table')?.getBoundingClientRect();
      beside = { columns: heads, rows: rows.length, text, pageRight: r1(table?.right ?? 0) };
    }
    return {
      innerWidth: window.innerWidth, innerHeight: window.innerHeight, scrollY: r1(window.scrollY),
      lines, lastLineBottom: lines.length === 0 ? null : lines[lines.length - 1].bottom,
      panel: p === undefined || panel === null ? null : { top: r1(p.top), bottom: r1(p.bottom), left: r1(p.left), right: r1(p.right), width: r1(p.width), height: r1(p.height), content: panel.scrollHeight, options: panel.querySelectorAll('[data-filter-option]').length },
      beside,
    };
  });
type Reading = Awaited<ReturnType<typeof read>>;

test('the box at 768 and up, and at short windows', async ({ page }) => {
  mkdirSync(OUT, { recursive: true });
  await login(page);
  const rows: { window: string; closed: Reading; open: Reading }[] = [];
  for (const [width, height] of WINDOWS) {
    await page.setViewportSize({ width, height });
    await page.goto('/?view=table');
    await page.locator('[data-collection-filters][data-hydrated="true"]').waitFor({ timeout: 60_000 });
    await page.addStyleTag({ content: 'nextjs-portal{display:none!important}' });
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(300);
    const closed = await read(page);
    await page.locator('[data-filter="genreId"] [data-filter-trigger]').click();
    await page.locator('[data-filter-panel]').waitFor({ timeout: 15_000 });
    await page.waitForTimeout(300);
    const open = await read(page);
    const name = `${String(width).padStart(4, '0')}x${height}`;
    await page.screenshot({ path: join(OUT, `box-genre-${name}-h${Math.round(open.panel?.height ?? 0)}.png`) });
    rows.push({ window: `${width} x ${height}`, closed, open });
    await page.keyboard.press('Escape');
    await page.locator('[data-filter-panel]').waitFor({ state: 'detached', timeout: 15_000 });
  }

  const md: string[] = ['# The open filter as a box (step 106), on the real collection', '', 'Genre opened in the table view, desktop Chromium. Read-only: nothing chosen, no record opened.', '', '## The box against Genre’s list', '', '| window | last line’s foot, closed | room beneath, less 24 | page moved on open | box top | box height | box foot | list and CLOSE | of the list in view | lines in view |', '|---|---|---|---|---|---|---|---|---|---|'];
  for (const r of rows) {
    const p = r.open.panel;
    if (p === null || r.closed.lastLineBottom === null) continue;
    const room = Math.round((r.closed.innerHeight - 24 - r.closed.lastLineBottom) * 10) / 10;
    const inView = r.open.lines.every((l) => l.top >= 0 && l.bottom <= r.open.innerHeight);
    md.push(`| ${r.window} | ${r.closed.lastLineBottom} | ${room} | ${Math.round((r.open.scrollY - r.closed.scrollY) * 10) / 10} | ${p.top} | ${p.height} | ${p.bottom} | ${p.content} | ${Math.round((Math.min(p.height, p.content) / p.content) * 100)}% | ${inView ? 'all' : 'NOT ALL'} |`);
  }
  md.push('', '## What is beside the box', '', '| window | box left to right | page’s right | columns right of the box | rows crossing the box | their cells right of the box |', '|---|---|---|---|---|---|');
  for (const r of rows) {
    const p = r.open.panel;
    if (p === null || r.open.beside === null) continue;
    md.push(`| ${r.window} | ${p.left} to ${p.right} | ${r.open.beside.pageRight} | ${r.open.beside.columns.join(', ') || 'none'} | ${r.open.beside.rows} | ${r.open.beside.text.join(' / ') || 'none'} |`);
  }
  writeFileSync(join(OUT, 'filter-box-106.md'), `${md.join('\n')}\n`);
  writeFileSync(join(OUT, 'filter-box-106.json'), `${JSON.stringify(rows, null, 1)}\n`);
});
