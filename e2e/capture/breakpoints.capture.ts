import { test, expect, type Page } from '@playwright/test';
import { registerCleanup, trackArtist } from '../cleanup';
import { getTestDb } from '../../test/helpers/db';
import { seedImage } from '../seed';
import { sql } from 'drizzle-orm';
import { NO_SCROLL_HEIGHT } from '../../src/app/records/[id]/band-geometry';

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
 * **The widths worth looking at, measured rather than guessed.** Every pixel
 * from 390 to 1920 is read for the three column counts, the record band's
 * height and any escape; every width where a count changes is a transition,
 * and a capture is taken at each transition and its neighbours, plus the
 * named references. Run with CAPTURE=1 --project=capture.
 */
const READ = () => {
  const px = (n: number) => Math.round(n * 10) / 10;
  const cols = (el: Element | null) => (el === null ? 0 : getComputedStyle(el).gridTemplateColumns.split(' ').filter((s) => s !== '').length);
  const lower = document.querySelector('[data-cell="matrix"]')?.parentElement ?? null;
  const leaves = Array.from(document.querySelectorAll<HTMLElement>('[data-field], [data-mark]')).filter((el) => el.getAttribute('data-diagonal') === null && el.closest('[data-ornament]') === null && el.getAttribute('aria-hidden') !== 'true' && el.getBoundingClientRect().width > 0);
  let escapes = 0;
  for (const el of leaves) {
    const cell = el.closest('[data-cell], [data-section]');
    if (cell === null) continue;
    const c = cell.getBoundingClientRect(); const b = el.getBoundingClientRect();
    if (b.left < c.left - 1 || b.top < c.top - 1 || b.right > c.right + 1 || b.bottom > c.bottom + 1) escapes += 1;
  }
  return { identity: cols(document.querySelector('[data-band="identity"]')), record: cols(lower), region: cols(document.querySelector('[data-region="extended-grid"]')), recordH: lower === null ? 0 : px(lower.getBoundingClientRect().height), escapes };
};

test('measure every width, then capture the transitions and the references', async ({ page }) => {
  test.skip(process.env.CAPTURE !== '1', 'A capture tool: run with CAPTURE=1');
  test.setTimeout(900_000);
  await login(page);
  const artist = await post(page, '/api/artists', { name: 'MGMT' });
  trackArtist(artist.id);
  const label = await post(page, '/api/labels', { name: 'Mom + Pop' });
  const pressing = await post(page, '/api/pressings', { catalogNumber: 'MP731', matrixRunout: '269346E1 1701690 MP731-A JN-H STERLING', yearPressed: 2024, countryPressed: 'UK, Europe & US', pressingPlant: 'GZ Media', colorVariant: 'Orange [Tangerine]' });
  const genres: string[] = [];
  for (const g of ['Electronic', 'Indie Pop', 'Indie Rock', 'Pop', 'Psychedelic Rock', 'Rock']) genres.push((await post(page, '/api/genres', { name: g })).id);
  const record = await post(page, '/api/records', { title: 'Loss Of Life', artistId: artist.id, labelId: label.id, pressingId: pressing.id, genreIds: genres, releaseYear: 2024, notes: 'Bought on the Saturday.' });
  const id = record.id;
  await seedImage({ recordId: id, imageType: 'cover' });
  const db = getTestDb();
  await db.execute(sql`UPDATE records SET spine_colour = ${'#a25829'}, purchase_price = 12.99, snippet = ${'Her last album for the label, and the one where the machinery starts to sound like a band. The long version of the title track runs past seventeen minutes without repeating itself, and the second side is where the songwriting finally catches up with the production.'}, snippet_edited_at = NOW() WHERE id = ${id}::uuid`);
  await db.execute(sql`INSERT INTO price_history (record_id, price, price_type, source) VALUES (${id}::uuid, 12.99, 'used', 'discogs'), (${id}::uuid, 13.42, 'used', 'discogs')`);
  await page.request.post(`/api/records/${id}/journal`, { data: { entryDate: '2026-09-20', note: 'Played it right through.' } });

  await page.setViewportSize({ width: 1440, height: NO_SCROLL_HEIGHT });
  await page.goto(`/records/${id}`);
  await expect(page.locator('[data-field="eyebrow"]')).toBeVisible();
  await page.waitForTimeout(750);

  /* Every pixel. */
  const rows: Array<{ w: number } & ReturnType<typeof READ>> = [];
  for (let w = 390; w <= 1920; w += 1) {
    await page.setViewportSize({ width: w, height: NO_SCROLL_HEIGHT });
    rows.push({ w, ...(await page.evaluate(READ)) });
  }
  const transitions: number[] = [];
  for (let i = 1; i < rows.length; i += 1) {
    const a = rows[i - 1], b = rows[i];
    if (a.identity !== b.identity || a.record !== b.record || a.region !== b.region) transitions.push(b.w);
  }
  const named: Array<{ w: number; h: number; label: string }> = [{ w: 1920, h: NO_SCROLL_HEIGHT, label: '1920' }, { w: 1680, h: NO_SCROLL_HEIGHT, label: '1680' }, { w: 1440, h: NO_SCROLL_HEIGHT, label: '1440x900' }, { w: 1000, h: NO_SCROLL_HEIGHT, label: '1000' }, { w: 390, h: 844, label: '390x844' }];
  const wanted = new Set<number>();
  for (const t of transitions) for (const d of [-1, 0, 1]) wanted.add(t + d);
  for (const n of named) wanted.add(n.w);

  console.log('\nTRANSITIONS (widths where a column count changes): ' + transitions.join(', '));
  console.log('\n  width   identity/record/region   record band   escapes');
  for (const w of [...wanted].sort((a, b) => a - b)) {
    const r = rows.find((x) => x.w === w);
    if (r === undefined) continue;
    const tag = transitions.includes(w) ? ' <- transition' : named.some((n) => n.w === w) ? ' <- reference' : '';
    console.log(`  ${String(w).padStart(5)}   ${String(r.identity).padStart(2)} / ${String(r.record).padStart(2)} / ${String(r.region).padStart(2)}            ${String(r.recordH).padStart(6)}px      ${r.escapes}${tag}`);
  }

  /* Captures: each transition width and the references, full page. No device toolbar, no overlay: Playwright's own viewport. */
  for (const t of transitions) {
    await page.setViewportSize({ width: t, height: NO_SCROLL_HEIGHT });
    await page.waitForTimeout(750);
    await page.screenshot({ path: `docs/captures/breakpoint-${t}.png`, fullPage: true });
  }
  for (const n of named) {
    await page.setViewportSize({ width: n.w, height: n.h });
    await page.waitForTimeout(750);
    await page.screenshot({ path: `docs/captures/breakpoint-${n.label}.png`, fullPage: true });
  }
});
