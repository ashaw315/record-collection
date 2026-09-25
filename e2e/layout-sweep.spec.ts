import { expect, test, type Page } from '@playwright/test';
import { registerCleanup, trackArtist } from './cleanup';
import { getTestDb } from '../test/helpers/db';
import { seedImage } from './seed';
import { sql } from 'drizzle-orm';
import { BANDS, GRID_FORK, NO_SCROLL_HEIGHT } from '../src/app/records/[id]/band-geometry';

registerCleanup();
const PASSWORD = process.env.E2E_PASSWORD ?? 'test-password-for-e2e';
async function login(page: Page) {
  await page.goto('/login');
  await page.locator('form[data-hydrated="true"]').waitFor({ timeout: 15_000 });
  await page.getByLabel('Password').pressSequentially(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL('/');
}
async function post(page: Page, path: string, data: unknown) {
  const r = await page.request.post(path, { data });
  const j = await r.json();
  return { id: (j.id ?? j.error?.existingId) as string };
}

/** Everything measured in one pass, in page coordinates. */
const MEASURE = () => {
  const px = (n: number) => Math.round(n * 10) / 10;
  const box = (el: Element) => { const b = el.getBoundingClientRect(); return { x: px(b.left + window.scrollX), y: px(b.top + window.scrollY), w: px(b.width), h: px(b.height) }; };
  const name = (el: Element) => {
    const a = ['data-cell', 'data-section', 'data-field', 'data-mark', 'data-band', 'data-region', 'data-air'].map((k) => (el.getAttribute(k) === null ? null : `${k.slice(5)}=${el.getAttribute(k)}`)).filter(Boolean);
    return a.join(',') || el.tagName.toLowerCase();
  };
  const cols = (el: Element | null) => (el === null ? null : getComputedStyle(el).gridTemplateColumns.split(' ').filter((s) => s !== '').length);
  const identity = document.querySelector('[data-band="identity"]');
  const lower = document.querySelector('[data-cell="matrix"]')?.parentElement ?? null;
  const region = document.querySelector('[data-region="extended-grid"]');
  const cells = Array.from(document.querySelectorAll<HTMLElement>('[data-cell], [data-section]')).map((el) => ({ name: name(el), ...box(el), display: getComputedStyle(el).display, gridColumn: getComputedStyle(el).gridColumn, pos: getComputedStyle(el).position }));
  /* Leaves: text fields and marks, not ornaments, not the diagonal. */
  const leaves = Array.from(document.querySelectorAll<HTMLElement>('[data-field], [data-mark]')).filter((el) => el.getAttribute('data-diagonal') === null && el.closest('[data-ornament]') === null && el.getAttribute('aria-hidden') !== 'true' && el.getBoundingClientRect().width > 0);
  const ib = leaves.map((el) => ({ el, name: name(el), b: box(el), cell: el.closest('[data-cell], [data-section]') }));
  const intersects = (a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }) => a.x < b.x + b.w - 1 && b.x < a.x + a.w - 1 && a.y < b.y + b.h - 1 && b.y < a.y + a.h - 1;
  const pairs: string[] = [];
  for (let i = 0; i < ib.length; i += 1) for (let j = i + 1; j < ib.length; j += 1) {
    if (ib[i].el.contains(ib[j].el) || ib[j].el.contains(ib[i].el)) continue;
    if (intersects(ib[i].b, ib[j].b)) pairs.push(`${ib[i].name} ∩ ${ib[j].name}`);
  }
  const escapes: string[] = [];
  for (const l of ib) {
    if (l.cell === null) continue;
    const c = box(l.cell);
    const out = l.b.x < c.x - 1 || l.b.y < c.y - 1 || l.b.x + l.b.w > c.x + c.w + 1 || l.b.y + l.b.h > c.y + c.h + 1;
    if (out) escapes.push(`${l.name} leaves ${name(l.cell)} by (${px(Math.max(0, c.x - l.b.x, l.b.x + l.b.w - c.x - c.w))}x, ${px(Math.max(0, c.y - l.b.y, l.b.y + l.b.h - c.y - c.h))}y)`);
  }
  return { vw: window.innerWidth, cols: { identity: cols(identity), lower: cols(lower), region: cols(region) }, bandH: identity === null ? null : px(identity.getBoundingClientRect().height), lowerH: lower === null ? null : px(lower.getBoundingClientRect().height), cells, pairs, escapes, scrollW: document.documentElement.scrollWidth };
};


/**
 * **Every width, not the two named ones.**
 *
 * Step 20 measured "at the two named viewports (1440 × 900, 390 × 844)
 * only". Adam then QA'd at 1439, one pixel past §18's fork, and found the
 * lower band's five cells colliding. Measured: below 1440 the fork
 * stylesheet turns every `[data-band]` into one column, and the record band
 * keeps its inline `height: 300` -- §2.1's "whole no-scroll budget at 1440 ×
 * 900" -- so five stacked cells share 300px at 59.8 each. The 72px year
 * overflows its cell by 9.3, the About by 39.2, the Images foot by 83.2 into
 * the region. At 1440 nothing intersects. The same shape existed at this
 * round's start; nobody had measured between the two viewports.
 *
 * So the sweep is the assertion. Pairs are tested among text fields and
 * marks; ornaments are excluded because §26 puts them behind content by
 * design, and the diagonal because it covers its cell by design.
 */
const seedRich = async (page: Page) => {
  const suffix = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;
  const artist = await post(page, '/api/artists', { name: 'MGMT' });
  trackArtist(artist.id);
  const label = await post(page, '/api/labels', { name: 'Mom + Pop' });
  const pressing = await post(page, '/api/pressings', { catalogNumber: `MP731-${suffix}`, matrixRunout: '269346E1 1701690 MP731-A JN-H STERLING', yearPressed: 2024, countryPressed: 'UK, Europe & US', pressingPlant: 'GZ Media', colorVariant: 'Orange [Tangerine]' });
  const genres: string[] = [];
  for (const g of ['Electronic', 'Indie Pop', 'Indie Rock', 'Pop', 'Psychedelic Rock', 'Rock']) genres.push((await post(page, '/api/genres', { name: g })).id);
  const record = await post(page, '/api/records', { title: 'Loss Of Life', artistId: artist.id, labelId: label.id, pressingId: pressing.id, genreIds: genres, releaseYear: 2024, notes: 'Bought on the Saturday.' });
  const id = record.id;
  await seedImage({ recordId: id, imageType: 'cover' });
  const db = getTestDb();
  await db.execute(sql`UPDATE records SET spine_colour = ${'#a25829'}, purchase_price = 12.99,
    snippet = ${'Her last album for the label, and the one where the machinery starts to sound like a band. The long version of the title track runs past seventeen minutes without repeating itself, and the second side is where the songwriting finally catches up with the production. A pressing worth hunting for, not because it is rare but because the mastering is unusually generous with the low end, and the sleeve has survived better than most.'},
    snippet_edited_at = NOW() WHERE id = ${id}::uuid`);
  await db.execute(sql`INSERT INTO price_history (record_id, price, price_type, source) VALUES (${id}::uuid, 12.99, 'used', 'discogs'), (${id}::uuid, 13.42, 'used', 'discogs'), (${id}::uuid, 13.63, 'used', 'discogs')`);
  await page.request.post(`/api/records/${id}/journal`, { data: { entryDate: '2026-09-20', note: 'Played it right through.' } });
  return id;
};

const sweepWidths = (from: number, to: number) => {
  const forks = [390, 480, 960, 1440, 1680, 1920];
  const widths = new Set<number>();
  for (let w = from; w <= to; w += 6) widths.add(w);
  for (const f of forks) for (const d of [-1, 0, 1]) if (f + d >= from && f + d <= to) widths.add(f + d);
  return [...widths].sort((a, b) => a - b);
};

test('above the fork, no two boxes intersect and nothing leaves its cell at any width (§2.1, §18)', async ({ page }) => {
  test.setTimeout(600_000);
  await login(page);
  const id = await seedRich(page);
  await page.setViewportSize({ width: GRID_FORK, height: NO_SCROLL_HEIGHT });
  await page.goto(`/records/${id}`);
  await expect(page.locator('[data-field="eyebrow"]')).toBeVisible();
  /* 750, not 900: the repo guard reads a bare 900 in a record-screen spec as NO_SCROLL_HEIGHT typed inline. */
  await page.waitForTimeout(750);
  const bad: string[] = [];
  let checked = 0;
  for (const w of sweepWidths(GRID_FORK, 1920)) {
    await page.setViewportSize({ width: w, height: NO_SCROLL_HEIGHT });
    await page.waitForTimeout(w % 6 === 0 ? 120 : 400);
    const m = await page.evaluate(MEASURE);
    checked += 1;
    if (m.pairs.length > 0 || m.escapes.length > 0) bad.push(`${w}: ${[...m.pairs, ...m.escapes].join(' | ')}`);
  }
  expect(checked, 'widths measured').toBeGreaterThan(80);
  expect(bad, `widths with an intersection or an escape:\n  ${bad.slice(0, 10).join('\n  ')}`).toEqual([]);
});

/**
 * **KNOWN-FAILING against §2.1 below the fork, pinned at what is measured.**
 *
 * The record band's 300 is 1440's budget, and no section rules the band's
 * height below 1440: §18 turns the columns into one, §28 rules the identity
 * band's height and the region's rows, §2.1 states the 300 for 1440 × 900.
 * The build applied the identity band's fixed height to the record band by
 * the `[data-band]` selector. That is a ruling for Design -- what the record
 * band does in one column -- so this pins the measured interim rather than
 * asserting it clean: the same three fields escape and nothing else, at
 * every width from 480 to 1439. A new overlap fails now; the fix, when
 * ruled, turns this red for being unexpectedly clean.
 */
test('below the fork the record band keeps 1440’s 300px in one column, and exactly three fields escape [KNOWN-FAILING against §2.1]', async ({ page }) => {
  test.setTimeout(600_000);
  await login(page);
  const id = await seedRich(page);
  await page.setViewportSize({ width: GRID_FORK, height: NO_SCROLL_HEIGHT });
  await page.goto(`/records/${id}`);
  await expect(page.locator('[data-field="eyebrow"]')).toBeVisible();
  /* 750, not 900: the repo guard reads a bare 900 in a record-screen spec as NO_SCROLL_HEIGHT typed inline. */
  await page.waitForTimeout(750);
  const KNOWN_ESCAPES = ['field=year', 'field=about', 'field=image-count'];
  const KNOWN_PAIRS = ['field=image-count ∩ mark=section-bar', 'field=about ∩ mark=section-bar'];
  const unexpected: string[] = [];
  let checked = 0;
  for (const w of sweepWidths(480, GRID_FORK - 1)) {
    await page.setViewportSize({ width: w, height: NO_SCROLL_HEIGHT });
    await page.waitForTimeout(w % 6 === 0 ? 120 : 400);
    const m = await page.evaluate(MEASURE);
    checked += 1;
    expect(m.cols.lower, `${w}: the record band is one column`).toBe(1);
    expect(m.lowerH, `${w}: and keeps 1440’s ${BANDS.record}`).toBe(BANDS.record);
    const escaped = m.escapes.map((e) => e.split(' leaves ')[0]);
    for (const e of escaped) if (!KNOWN_ESCAPES.includes(e)) unexpected.push(`${w}: NEW escape ${e}`);
    for (const p of m.pairs) if (!KNOWN_PAIRS.includes(p)) unexpected.push(`${w}: NEW pair ${p}`);
    if (escaped.length === 0) unexpected.push(`${w}: CLEAN — the interim state has changed; if the record band was ruled and built, promote this to the clean assertion`);
  }
  expect(checked).toBeGreaterThan(100);
  expect(unexpected, `changes to the pinned state:\n  ${unexpected.slice(0, 10).join('\n  ')}`).toEqual([]);
});
