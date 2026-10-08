import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from '@playwright/test';
import { login } from './login';

/**
 * Step 97's measurements, on the real collection, read-only: the band's
 * height and the page's length at 390 and 320, every control's hit area
 * against the 44 floor, and what each filter's list costs when open.
 * Counts that reach the target come from here and say so (the standing
 * rule of 8 Oct): the seeded seventeen have 6 genres, the collection 32.
 */
const OUT = process.env.SHEET_OUT ?? join('docs', 'captures', 'collection-97');

test('the table and grid’s band, length and hit areas on the real collection', async ({ page }) => {
  mkdirSync(OUT, { recursive: true });
  await login(page);
  const rows: unknown[] = [];
  for (const view of ['table', 'grid']) {
    for (const width of [390, 320, 1440]) {
      await page.setViewportSize({ width, height: 844 });
      await page.goto(`/?view=${view}`);
      await page.locator('[data-collection-filters][data-hydrated="true"]').waitFor({ timeout: 60_000 });
      await page.addStyleTag({ content: 'nextjs-portal{display:none!important}' });
      await page.evaluate(() => document.fonts.ready);
      const closed = await page.evaluate(() => {
        const height = (sel: string) => Math.round(((document.querySelector(sel) as HTMLElement | null)?.getBoundingClientRect().height ?? 0) * 10) / 10;
        const controls = Array.from(document.querySelectorAll<HTMLElement>('main a, main button, main input:not([type=hidden]), main select, main label[data-filter-undated]')).filter((el) => { const r = el.getBoundingClientRect(); return r.width > 1 && r.height > 1; }).map((el) => {
          const r = el.getBoundingClientRect();
          const x = r.left + Math.min(r.width / 2, 20);
          const mid = r.top + r.height / 2;
          let hit = 0;
          const before = window.scrollY;
          window.scrollTo(0, Math.max(0, mid + before - 400));
          const dy = window.scrollY - before;
          for (let y = Math.round(mid - dy - 30); y <= Math.round(mid - dy + 30); y += 1) { const at = document.elementFromPoint(x, y); if (at !== null && (at === el || el.contains(at) || at.contains(el) && at.tagName === 'A')) hit += 1; }
          window.scrollTo(0, before);
          return { what: `${el.tagName.toLowerCase()} ${(el.textContent ?? '').trim().slice(0, 28) || el.id}`, drawn: Math.round(r.height * 10) / 10, hit, inTable: el.closest('table, ul.grid') !== null };
        });
        const heights = Array.from(document.querySelectorAll<HTMLElement>('main table tbody tr')).map((r) => Math.round(r.getBoundingClientRect().height * 10) / 10);
        const tally: Record<string, number> = {};
        for (const h of heights) tally[String(h)] = (tally[String(h)] ?? 0) + 1;
        const columns = Array.from(document.querySelectorAll<HTMLElement>('main table thead th')).map((th) => ({ name: (th.textContent ?? '').trim(), width: Math.round(th.getBoundingClientRect().width * 10) / 10 }));
        return { rowHeights: tally, columns, band: height('[data-collection-band]'), filters: height('[data-collection-filters]'), page: document.documentElement.scrollHeight, client: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth, controls, options: Object.fromEntries(Array.from(document.querySelectorAll<HTMLElement>('[data-filter]')).map((f) => [f.dataset.filter, 0])) };
      });
      const lists: Record<string, { options: number; height: number; page: number }> = {};
      for (const key of Object.keys(closed.options)) {
        await page.locator(`[data-filter="${key}"] [data-filter-trigger]`).click();
        lists[key] = await page.evaluate((k) => { const list = document.querySelector(`[data-filter="${k}"] [data-filter-list]`) as HTMLElement; return { options: list.querySelectorAll('[data-filter-option]').length, height: Math.round(list.getBoundingClientRect().height), page: document.documentElement.scrollHeight }; }, key);
        await page.keyboard.press('Escape');
      }
      const chrome = closed.controls.filter((c) => !c.inTable);
      rows.push({ view, width, rowHeights: closed.rowHeights, columns: closed.columns, band: closed.band, filtersClosed: closed.filters, pageLength: closed.page, pageWidth: `${closed.scroll} in ${closed.client}`, controls: chrome.length, under44: chrome.filter((c) => c.hit < 44).map((c) => `${c.what}: drawn ${c.drawn}, hit ${c.hit}`), inRows: closed.controls.filter((c) => c.inTable).length, lists });
    }
  }
  writeFileSync(join(OUT, 'measures.json'), `${JSON.stringify(rows, null, 1)}\n`);
});
