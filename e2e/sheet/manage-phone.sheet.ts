import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from '@playwright/test';
import { login } from './login';

/**
 * For Design, who is laying manage out for a phone and "cannot design that
 * layout without them": every section of manage at 390 and 320, as built,
 * on the real collection. Each section twice: the first view, and the
 * whole page as wide as it scrolls, so what is past the window's edge is
 * in the picture.
 *
 * Read-only. Only the section names are pressed, which change what is
 * shown and write nothing.
 */
const OUT = process.env.SHEET_OUT ?? join('docs', 'captures', 'manage-phone');
const r1 = (n: number) => String(Math.round(n * 10) / 10);

test('every section of manage at 390 and 320', async ({ page }) => {
  mkdirSync(OUT, { recursive: true });
  await login(page);
  const md = ['# Manage on a phone, as built, on the real collection', '', 'Read-only, desktop Chromium at a phone’s widths, 664 tall. “Page” is how wide the page scrolls; “table” how wide the section’s table is and how wide it scrolls inside itself; “past the edge” counts the controls whose box ends beyond the window.', '',
    '| section | window | page | table, and its own scroll | section names’ row | controls | past the edge | rows | first view | whole page |', '|---|---|---|---|---|---|---|---|---|---|'];
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 664 });
    await page.goto('/manage');
    await page.locator('h1').first().waitFor({ timeout: 60_000 });
    await page.addStyleTag({ content: 'nextjs-portal{display:none!important}' });
    await page.evaluate(() => document.fonts.ready);
    const names = page.locator('nav[aria-label="Resource"] button');
    const count = await names.count();
    for (let i = 0; i < count; i += 1) {
      await names.nth(i).click();
      await page.waitForTimeout(400);
      const name = ((await names.nth(i).textContent()) ?? String(i)).trim();
      const m = await page.evaluate(() => {
        const frame = document.querySelector('[data-screen-frame]') as HTMLElement;
        const table = frame.querySelector('table');
        const scroller = table?.parentElement ?? null;
        const nav = document.querySelector('nav[aria-label="Resource"]') as HTMLElement;
        const controls = Array.from(frame.querySelectorAll<HTMLElement>('a, button, input, select, textarea')).filter((el) => el.getClientRects().length > 0);
        return { page: document.documentElement.scrollWidth, table: table?.getBoundingClientRect().width ?? null, inner: scroller === null ? null : scroller.scrollWidth, innerBox: scroller === null ? null : scroller.clientWidth, nav: nav.scrollWidth, navBox: nav.clientWidth, controls: controls.length, past: controls.filter((el) => el.getBoundingClientRect().right > window.innerWidth + 0.5).length, rows: frame.querySelectorAll('tbody tr').length };
      });
      const slug = name.toLowerCase().replace(/[^a-z]+/g, '-');
      const first = `manage-${slug}-w${width}-page${m.page}-first-view.png`;
      const whole = `manage-${slug}-w${width}-page${m.page}-whole.png`;
      await page.screenshot({ path: join(OUT, first) });
      /* The whole page at the width it scrolls to, so nothing is cut at the window's edge. */
      await page.setViewportSize({ width: Math.max(width, m.page), height: 664 });
      await page.screenshot({ path: join(OUT, whole), fullPage: true });
      await page.setViewportSize({ width, height: 664 });
      md.push(`| ${name} | ${width} | **${m.page}** | ${m.table === null ? 'no table' : `${r1(m.table)}; ${m.inner} in ${m.innerBox}`} | ${m.nav} in ${m.navBox} | ${m.controls} | ${m.past} | ${m.rows} | ${first} | ${whole} |`);
    }
  }
  writeFileSync(join(OUT, 'manage-phone.md'), `${md.join('\n')}\n`);
});
