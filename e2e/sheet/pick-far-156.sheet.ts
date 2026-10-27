import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test, type Page } from '@playwright/test';
import { nearViewMinWidth, shelfOfferedMinWidth } from '../../src/app/wall/view-fork';
import { login } from './login';

/**
 * Step 156 unit 3b, for Adam: the far view where the rail draws as a band,
 * with and without SURPRISE ME's answer, on the real collection and its real
 * covers. Read-only: the press is the page's own state and writes nothing.
 *
 * The coordinator, 26 Oct: the fixture's captures could not be sent, since
 * their covers are one-pixel stand-ins and the question is whether what is
 * left of the shelf reads as a shelf beside a real cover. The figures are
 * taken again here because a figure measured on a fixture has been wrong on
 * the collection before (52/counts-on-fixture, 50/twelve-outweighed).
 *
 * Each file is named by the figure that differs, the drawing's height
 * (`-d387`), and the answer's cell height where there is one.
 */
const OUT = process.env.SHEET_OUT ?? join('docs', 'captures', 'pick-far-156');
const WIDTHS = [shelfOfferedMinWidth(), nearViewMinWidth() - 1];
/*
  Above the fork the far view is the one the reader zooms out to, and since
  the far-view step (27 Oct) its answer is the same cell (§P.1, §P.4); before
  it, a press there answered nothing, so this width could not be captured.
*/
const ZOOMED = 1440;

/** The far drawing's ink, as pick-answer-156 measures it: `meet` fits the drawing inside the svg's box. */
const ink = (page: Page) =>
  page.evaluate(() => {
    const marks = Array.from(document.querySelectorAll('[data-region="far"] svg[data-wall="overview"] :is([data-furniture], [data-far-seat])')).map((el) => el.getBoundingClientRect());
    const [top, bottom] = [Math.min(...marks.map((b) => b.top)), Math.max(...marks.map((b) => b.bottom))];
    return { top, bottom, height: bottom - top };
  });

const cell = (page: Page) =>
  page.evaluate(() => {
    const drawn = (el: Element) => (el as HTMLElement).getClientRects().length > 0;
    const answer = Array.from(document.querySelectorAll('[data-pick-answer]')).find(drawn) ?? null;
    if (answer === null) return null;
    const img = answer.querySelector('img');
    const title = answer.querySelector('[data-grid-title]');
    const lh = title === null ? 0 : parseFloat(getComputedStyle(title).lineHeight);
    return {
      height: answer.getBoundingClientRect().height,
      title: title?.textContent ?? '',
      artist: answer.querySelector('[data-grid-artist]')?.textContent ?? '',
      titleLines: title === null || lh === 0 ? 0 : Math.round(title.getBoundingClientRect().height / lh),
      cover: img === null ? 'none' : `${img.naturalWidth}×${img.naturalHeight}`,
    };
  });

test('the far view in the band and zoomed out at 1440, with and without an answer, on the real collection', async ({ page }) => {
  mkdirSync(OUT, { recursive: true });
  await login(page);
  const md = [
    '# Step 156: the far view\'s answer, on the real collection: in the band at 1044 and 1273, and zoomed out at 1440',
    '',
    'A bare `/`, unfiltered, read-only, desktop Chromium. The drawing is the far view\'s ink, measured as `e2e/pick-answer-156.spec.ts` measures it.',
    '',
    '| window | drawing without | drawing with | cell | answer | title lines | cover (natural) | files |',
    '|---|---|---|---|---|---|---|---|',
  ];
  for (const width of [...WIDTHS, ZOOMED]) {
    for (const height of [768, 900]) {
      await page.setViewportSize({ width, height });
      await page.goto('/');
      await page.locator('[data-wall-container]:not([data-unmeasured])').waitFor({ timeout: 30_000 });
      if (width === ZOOMED) {
        await page.getByTestId('wall-zoom-out').click();
        await page.locator('[data-wall="overview"]').filter({ visible: true }).waitFor({ timeout: 30_000 });
      }
      await page.addStyleTag({ content: 'nextjs-portal{display:none!important}' });
      await page.evaluate(() => document.fonts.ready);
      await page.waitForTimeout(1500);
      const before = await ink(page);
      const without = `pick-far-${width}x${height}-no-answer-d${Math.round(before.height)}.png`;
      await page.screenshot({ path: join(OUT, without) });
      await page.locator('[data-pick-control] button').filter({ visible: true }).click();
      await page.locator('[data-pick-answer]').filter({ visible: true }).waitFor({ timeout: 10_000 });
      /* The cover is what Adam judges, so it must have arrived, not its box. */
      await page.waitForFunction(() => {
        const img = Array.from(document.querySelectorAll('[data-pick-answer] img')).find((el) => (el as HTMLElement).getClientRects().length > 0) as HTMLImageElement | undefined;
        return img === undefined || (img.complete && img.naturalWidth > 0);
      }, undefined, { timeout: 20_000 });
      await page.waitForTimeout(500);
      const after = await ink(page);
      const c = await cell(page);
      if (c === null) throw new Error(`no answer drew at ${width}×${height}`);
      const withFile = `pick-far-${width}x${height}-answer-d${Math.round(after.height)}-c${Math.round(c.height)}.png`;
      await page.screenshot({ path: join(OUT, withFile) });
      md.push(`| ${width}×${height} | ${before.height.toFixed(1)} | ${after.height.toFixed(1)} (foot ${after.bottom.toFixed(1)}) | ${c.height.toFixed(1)} | ${c.title}, ${c.artist} | ${c.titleLines} | ${c.cover} | ${without}, ${withFile} |`);
    }
  }
  writeFileSync(join(OUT, 'pick-far-156.md'), `${md.join('\n')}\n`);
});

/*
  The figures above are for whatever title was served, and a title that sets
  in two lines makes the cell taller and what follows moves (§P.4), so the
  drawing is least for the collection's tallest cell. Asked until every
  record has been served or the asks run out, at the band's narrowest and
  shortest window, keeping each title's cell height and the tallest's picture.
*/
test('the tallest answer the real collection gives, and what it leaves the drawing', async ({ page }) => {
  mkdirSync(OUT, { recursive: true });
  await login(page);
  const [width, height] = [WIDTHS[0], 768];
  await page.setViewportSize({ width, height });
  await page.goto('/');
  await page.locator('[data-wall-container]:not([data-unmeasured])').waitFor({ timeout: 30_000 });
  await page.addStyleTag({ content: 'nextjs-portal{display:none!important}' });
  await page.evaluate(() => document.fonts.ready);
  const pool = await page.locator('[data-collection-count]').first().textContent().catch(() => null);
  const seen = new Map<string, { height: number; lines: number; drawing: number; cover: string }>();
  for (let i = 0; i < 150 && seen.size < 22; i++) {
    await page.locator('[data-pick-control] button').filter({ visible: true }).click();
    await page.waitForTimeout(80);
    const c = await cell(page);
    if (c === null) continue;
    if (!seen.has(c.title)) seen.set(c.title, { height: c.height, lines: c.titleLines, drawing: (await ink(page)).height, cover: c.cover });
  }
  const rows = [...seen.entries()].sort((a, b) => b[1].height - a[1].height);
  const md = ['# The tallest answer on the real collection', '', `${width}×${height}, unfiltered. ${seen.size} titles served (count text: ${pool ?? 'not read'}).`, '', '| title | cell | title lines | drawing | cover (natural) |', '|---|---|---|---|---|', ...rows.map(([t, r]) => `| ${t} | ${r.height.toFixed(1)} | ${r.lines} | ${r.drawing.toFixed(1)} | ${r.cover} |`)];
  writeFileSync(join(OUT, 'pick-far-156-tallest.md'), `${md.join('\n')}\n`);
  /* Ask until the tallest is the one shown, then picture it with its cover arrived. */
  /* All twenty-two measured one line on the first run, the 38-character title among them, so the longest title by characters is pictured too, with its box. */
  const longest = [...seen.keys()].sort((a, b) => b.length - a.length)[0];
  for (let i = 0; i < 300 && longest !== undefined && (await cell(page))?.title !== longest; i++) {
    await page.locator('[data-pick-control] button').filter({ visible: true }).click();
    await page.waitForTimeout(40);
  }
  const box = await page.evaluate(() => {
    const t = Array.from(document.querySelectorAll('[data-pick-answer] [data-grid-title]')).find((el) => (el as HTMLElement).getClientRects().length > 0) as HTMLElement | undefined;
    if (t === undefined) return null;
    const r = t.getBoundingClientRect();
    const cs = getComputedStyle(t);
    return { width: r.width, height: r.height, scrollWidth: t.scrollWidth, whiteSpace: cs.whiteSpace, lineHeight: cs.lineHeight, fontSize: cs.fontSize };
  });
  writeFileSync(join(OUT, 'pick-far-156-longest.json'), `${JSON.stringify({ longest, box }, null, 2)}\n`);
  await page.screenshot({ path: join(OUT, `pick-far-${width}x${height}-longest-title-answer.png`) });
  /* A record with no cover draws the grid's empty box, and the question is the shelf beside a real cover, so the tallest that has one. */
  const tallest = (rows.find(([, r]) => r.cover !== 'none' && r.height === rows[0]?.[1].height) ?? rows[0])?.[0];
  for (let i = 0; i < 300 && tallest !== undefined && (await cell(page))?.title !== tallest; i++) {
    await page.locator('[data-pick-control] button').filter({ visible: true }).click();
    await page.waitForTimeout(40);
  }
  await page.waitForFunction(() => {
    const img = Array.from(document.querySelectorAll('[data-pick-answer] img')).find((el) => (el as HTMLElement).getClientRects().length > 0) as HTMLImageElement | undefined;
    return img === undefined || (img.complete && img.naturalWidth > 0);
  }, undefined, { timeout: 20_000 });
  const after = await ink(page);
  const c = await cell(page);
  await page.screenshot({ path: join(OUT, `pick-far-${width}x${height}-tallest-answer-d${Math.round(after.height)}-c${Math.round(c?.height ?? 0)}.png`) });
});
