import { expect, test, type Page } from '@playwright/test';
import { login } from './sign-in';

/**
 * Step 105: a table row's link box is the row's, in a browser that does not
 * make a `<tr>` a containing block.
 *
 * Found by Adam on a phone, 9 Oct: pressing "any buttons or area" on the
 * table opened Wired. §T.4's row is one link, an empty box laid over the row
 * by `position: absolute; inset: 0` against the row's `position: relative`.
 * Safari did not treat a positioned `<tr>` as a containing block (WebKit
 * bug 240961), so there every row's box was laid over the first screenful
 * instead, the last row's on top: the header, the band, the filter lines
 * and the rows all opened the last record. Wired is the last by title.
 *
 * **The staged tests name a proxy and say so.** No browser this suite runs
 * has the defect, Playwright's WebKit included, so the condition is staged:
 * the row's `position` is forced static, which is what that Safari computes.
 * They prove the box does not depend on the row's position. They do not
 * prove the page on Adam's phone; that check is his.
 *
 * The unstaged tests are the ones no spec had: presses inside an open
 * panel, option rows included, asserting the address and what happened.
 * They pass against the build before the fix in these browsers, and are
 * here because nothing pressed inside an open panel off Chromium.
 */
const STAGE = '[data-collection-table] tr{position:static!important}';

async function open(page: Page, width: number, staged: boolean) {
  await page.setViewportSize({ width, height: 844 });
  await page.goto('/?view=table');
  await page.locator('[data-collection-filters][data-hydrated="true"]').waitFor({ timeout: 30_000 });
  await page.addStyleTag({ content: `nextjs-portal{display:none!important}${staged ? STAGE : ''}` });
  if (staged) expect(await page.locator('[data-collection-table] tbody tr').first().evaluate((tr) => getComputedStyle(tr).position), 'the staging took').toBe('static');
}

/** The record link a press at this point would follow, if any. */
const recordAt = (page: Page, x: number, y: number) =>
  page.evaluate(([px, py]) => {
    const href = document.elementFromPoint(px, py)?.closest('a')?.getAttribute('href') ?? null;
    /* A record's own page; Add record's link is under /records too and is not one. */
    return href !== null && href.startsWith('/records/') && href !== '/records/new' ? href : null;
  }, [x, y]);

const trigger = (page: Page) => page.locator('[data-filter="genreId"] [data-filter-trigger]');
const panel = (page: Page) => page.locator('[data-filter-panel]');

test.beforeEach(async ({ page }) => login(page));

for (const staged of [true, false]) {
  for (const width of [390, 1440]) {
    const where = `at ${width}${staged ? ', with the row not a containing block' : ''}`;

    /* Staged, fails against a link box placed by the row's position alone: 390 by 844 on every row, not the row's own. */
    test(`${where}: every row's link box is its own row, and no point above the rows opens a record`, async ({ page }) => {
      await open(page, width, staged);
      const rows = await page.evaluate(() => Array.from(document.querySelectorAll<HTMLElement>('[data-collection-table] tbody tr')).map((tr) => {
        const a = tr.querySelector('a') as HTMLElement;
        const r = tr.getBoundingClientRect();
        const after = getComputedStyle(a, '::after');
        return { title: a.textContent, href: a.getAttribute('href'), row: [r.width, r.height], box: [Number.parseFloat(after.width), Number.parseFloat(after.height)], x: r.left + r.width / 2, y: r.top + r.height / 2 };
      }));
      expect(rows.length).toBeGreaterThan(3);
      for (const r of rows) {
        expect(r.box[0], `${r.title}: the box's width is the row's`).toBeCloseTo(r.row[0], 0);
        expect(r.box[1], `${r.title}: the box's height is the row's`).toBeCloseTo(r.row[1], 0);
      }
      /* What a press reaches, on the rows in view and on everything above them. */
      for (const r of rows.filter((row) => row.y < 844)) expect(await recordAt(page, r.x, r.y), `a press on ${r.title}`).toBe(r.href);
      const top = await page.locator('[data-collection-table] tbody tr').first().evaluate((tr) => tr.getBoundingClientRect().top);
      const reached: string[] = [];
      for (let y = 10; y < top - 2; y += 20) for (const x of [30, width / 2, width - 30]) { const href = await recordAt(page, x, y); if (href !== null) reached.push(`${x},${y} → ${href}`); }
      expect(reached, 'points above the rows that open a record').toEqual([]);
    });

    /* Staged, fails against the same build: the press on Genre's line lands on the last row's link and opens its record. */
    test(`${where}: presses inside the open panel apply, or close, and none leaves the collection`, async ({ page }) => {
      await open(page, width, staged);
      const url = page.url();

      await trigger(page).click();
      await expect(trigger(page)).toHaveAttribute('aria-expanded', 'true');
      expect(page.url(), 'opening the filter').toBe(url);
      const p = await panel(page).evaluate((el) => { const r = el.getBoundingClientRect(); const l = (el.querySelector('[data-filter-list]') as HTMLElement).getBoundingClientRect(); return { top: r.top, right: r.right, listRight: l.right }; });

      /* The paper off the list: the inset beside it at 390; at 1440, far right, where the table's rows lie beneath. */
      const papers: [number, number][] = width === 390 ? [[8, p.top + 66], [p.right - 6, p.top + 110]] : [[p.right - 200, p.top + 66], [p.listRight + 300, p.top + 200]];
      for (const [x, y] of papers) {
        if ((await panel(page).count()) === 0) { await trigger(page).click(); await expect(panel(page)).toHaveCount(1); }
        expect(await recordAt(page, x, y), `no record link at ${x},${y}`).toBeNull();
        await page.mouse.click(x, y);
        await expect(panel(page), `the paper at ${x},${y} closes the panel`).toHaveCount(0);
        await expect(page, 'and the address is where it was').toHaveURL(url);
      }

      /* Two option rows: each applies its own genre and stays on the table. */
      for (const index of [0, 2]) {
        await trigger(page).click();
        const option = panel(page).locator('[data-filter-option]').nth(index);
        const name = (await option.locator('[data-filter-name]').textContent()) ?? '';
        await option.click();
        await expect(panel(page)).toHaveCount(0);
        await expect(page).toHaveURL(/[?&]genreId=/, { timeout: 15_000 });
        await expect(page).toHaveURL(/view=table/);
        expect(new URL(page.url()).pathname, 'still the collection').toBe('/');
        await expect(page.locator('[data-filter="genreId"] [data-filter-chosen]'), 'the line names the genre pressed').toHaveText(name, { timeout: 15_000 });
      }
    });
  }
}
