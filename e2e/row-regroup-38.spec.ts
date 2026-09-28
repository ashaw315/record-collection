import { expect, test, type Page } from '@playwright/test';
import { registerCleanup, trackArtist } from './cleanup';
import { getTestDb } from '../test/helpers/db';
import { sql } from 'drizzle-orm';
import { GRID_FORK, NO_SCROLL_HEIGHT } from '../src/app/records/[id]/band-geometry';
import { rowsAt } from '../src/app/records/[id]/region-rows';

registerCleanup();

const PASSWORD = process.env.E2E_PASSWORD ?? 'test-password-for-e2e';
async function login(page: Page) {
  await page.goto('/login');
  await page.locator('form[data-hydrated="true"]').waitFor({ timeout: 15_000 });
  await page.getByLabel('Password').pressSequentially(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL('/');
}
async function post(page: Page, path: string, data: unknown) { const j = await (await page.request.post(path, { data })).json(); return { id: (j.id ?? j.error?.existingId) as string }; }

/**
 * A record whose row 2 can render every section -- a latest price for
 * Acquisition, a Discogs release for the market -- with or without a tag.
 */
async function seedRow2(page: Page, tagged: boolean): Promise<string> {
  const suffix = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;
  const artist = await post(page, '/api/artists', { name: `r38-${suffix}` });
  trackArtist(artist.id);
  const pressing = await post(page, '/api/pressings', { catalogNumber: `R38-${suffix}`, pressingPlant: 'GZ Media', yearPressed: 2024 });
  const record = await post(page, '/api/records', { title: `Row two ${suffix}`, artistId: artist.id, pressingId: pressing.id, releaseYear: 2024 });
  const db = getTestDb();
  await db.execute(sql`UPDATE pressings SET discogs_release_id = ${900_000_000 + Math.floor(Math.random() * 90_000_000)} WHERE id = ${pressing.id}::uuid AND discogs_release_id IS NULL`);
  await db.execute(sql`UPDATE records SET spine_colour = ${'#a25829'} WHERE id = ${record.id}::uuid`);
  await db.execute(sql`INSERT INTO price_history (record_id, price, price_type, source) VALUES (${record.id}::uuid, 12.99, 'used', 'discogs')`);
  if (tagged) {
    const tag = await db.execute<{ id: string }>(sql`INSERT INTO tags (name) VALUES (${`r38-${suffix}`}) RETURNING id`);
    await db.execute(sql`INSERT INTO record_tags (record_id, tag_id) VALUES (${record.id}::uuid, ${tag.rows[0].id}::uuid)`);
  }
  return record.id;
}

/** Row 2's rendered sections, in reading order, with their column extents and whether each draws a right rule. */
const rowTwo = (page: Page) =>
  page.evaluate(() => {
    const region = document.querySelector('[data-region="extended-grid"]') as HTMLElement;
    const rr = region.getBoundingClientRect();
    const colW = parseFloat(getComputedStyle(region).gridTemplateColumns.split(' ')[0]);
    const columns = getComputedStyle(region).gridTemplateColumns.split(' ').length;
    const items = Array.from(region.querySelectorAll<HTMLElement>(':scope > [data-section], :scope > [data-cell="air"]'))
      .filter((el) => getComputedStyle(el).display !== 'none')
      .map((el) => { const b = el.getBoundingClientRect(); return { name: el.dataset.section ?? `air-${el.dataset.air}`, row: getComputedStyle(el).gridRowStart, start: Math.round((b.left - rr.left) / colW) + 1, span: Math.round(b.width / colW), rule: parseFloat(getComputedStyle(el).borderRightWidth) > 0 }; });
    const row2 = items.filter((i) => ['acquisition', 'tags', 'market'].includes(i.name)).sort((a, b) => a.start - b.start);
    /* Every grid row row 2's sections occupy, and what fills each: the row's spans must sum to the region's columns. */
    const rows = [...new Set(row2.map((i) => i.row))].map((row) => { const inRow = items.filter((i) => i.row === row).sort((a, b) => a.start - b.start); return { row, items: inRow.map((i) => `${i.name}@${i.start}+${i.span}${i.rule ? '|' : ''}`), filled: inRow.reduce((s, i) => s + i.span, 0), orphans: inRow.filter((i, k) => i.rule && (k === inRow.length - 1 || inRow[k + 1].start !== i.start + i.span)).map((i) => i.name) }; });
    return { columns, rows };
  });

test('§38: with Tags absent, row 2 regroups over the sections that render, and no rule stands against empty grid', async ({ page }) => {
  await login(page);
  const id = await seedRow2(page, false);
  for (const width of [1000, GRID_FORK]) {
    await page.setViewportSize({ width, height: NO_SCROLL_HEIGHT });
    await page.goto(`/records/${id}`);
    await page.locator('[data-section="acquisition"]').waitFor({ timeout: 20_000 });
    await page.waitForTimeout(400);
    const m = await rowTwo(page);
    console.log(`  §38 UNTAGGED @${width}: ${m.rows.map((r) => `row ${r.row}: ${r.items.join(' ')} (${r.filled} of ${m.columns})`).join(' · ')}`);
    for (const r of m.rows) {
      expect(r.filled, `${width}: grid row ${r.row} has no empty grid (${r.items.join(' ')})`).toBe(m.columns);
      expect(r.orphans, `${width}: no rule stands against empty grid in row ${r.row}`).toEqual([]);
    }
    /* §38's own figures: at twelve, acquisition takes 1 to 8 and the market keeps its 4; at eight, acquisition takes all 8. */
    const acq = m.rows.flatMap((r) => r.items).find((i) => i.startsWith('acquisition@'));
    expect(acq, `${width}: acquisition's placement`).toBe(width >= GRID_FORK ? 'acquisition@1+8|' : 'acquisition@1+8');
  }
});

test('§38, §28: with every section present, row 2 groups as §28 lists it', async ({ page }) => {
  await login(page);
  const id = await seedRow2(page, true);
  for (const width of [1000, GRID_FORK]) {
    await page.setViewportSize({ width, height: NO_SCROLL_HEIGHT });
    await page.goto(`/records/${id}`);
    await page.locator('[data-section="tags"]').waitFor({ timeout: 20_000 });
    await page.waitForTimeout(400);
    const m = await rowTwo(page);
    console.log(`  §38 TAGGED @${width}: ${m.rows.map((r) => `row ${r.row}: ${r.items.join(' ')} (${r.filled} of ${m.columns})`).join(' · ')}`);
    const listed = rowsAt(width >= GRID_FORK ? 1440 : 960).filter((r) => r.items.some((i) => i.kind === 'section' && ['acquisition', 'tags', 'market'].includes(i.section)));
    expect(m.rows.length, `${width}: the rows §28 lists for row 2's sections`).toBe(listed.length);
    listed.forEach((l, k) => {
      const spans = l.items.map((i) => i.span);
      expect(m.rows[k].items.map((i) => Number(/\+(\d+)/.exec(i)?.[1])), `${width}: row ${k + 1} spans as listed`).toEqual(spans);
      expect(m.rows[k].filled, 'and fills the row').toBe(m.columns);
      expect(m.rows[k].orphans).toEqual([]);
    });
  }
});
