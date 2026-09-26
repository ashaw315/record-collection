import { expect, test, type Page } from '@playwright/test';
import { registerCleanup, trackArtist } from './cleanup';
import { getTestDb } from '../test/helpers/db';
import { seedImage } from './seed';
import { sql } from 'drizzle-orm';
import { BANDS, GRID_FORK, NO_SCROLL_HEIGHT } from '../src/app/records/[id]/band-geometry';
import { bandHeightAt } from '../src/app/records/[id]/region-rows';

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
  const R = (el: Element) => el.getBoundingClientRect();
  const box = (el: Element) => { const b = R(el); return { x: px(b.left + window.scrollX), y: px(b.top + window.scrollY), w: px(b.width), h: px(b.height) }; };
  const name = (el: Element) => {
    const a = ['data-cell', 'data-section', 'data-field', 'data-mark', 'data-band', 'data-region', 'data-air', 'data-ornament', 'data-flat', 'data-figure'].map((k) => (el.getAttribute(k) === null ? null : `${k.slice(5)}=${el.getAttribute(k)}`)).filter(Boolean);
    return a.join(',') || el.tagName.toLowerCase();
  };
  const cols = (el: Element | null) => (el === null ? null : getComputedStyle(el).gridTemplateColumns.split(' ').filter((s) => s !== '').length);
  const identity = document.querySelector('[data-band="identity"]');
  const lower = document.querySelector('[data-band="record"]');
  const region = document.querySelector('[data-region="extended-grid"]');
  const cells = Array.from(document.querySelectorAll<HTMLElement>('[data-cell], [data-section]')).map((el) => ({ name: name(el), ...box(el), display: getComputedStyle(el).display }));
  type B = { x: number; y: number; w: number; h: number };
  const intersects = (a: B, b: B) => a.x < b.x + b.w - 1 && b.x < a.x + a.w - 1 && a.y < b.y + b.h - 1 && b.y < a.y + a.h - 1;

  /* Leaves: text fields and marks, not ornaments, not the diagonal -- the box test. */
  const leaves = Array.from(document.querySelectorAll<HTMLElement>('[data-field], [data-mark]')).filter((el) => el.getAttribute('data-diagonal') === null && el.closest('[data-ornament]') === null && el.getAttribute('aria-hidden') !== 'true' && R(el).width > 0);
  const ib = leaves.map((el) => ({ el, name: name(el), b: box(el), cell: el.closest('[data-cell], [data-section]') }));
  const pairs: string[] = [];
  for (let i = 0; i < ib.length; i += 1) for (let j = i + 1; j < ib.length; j += 1) {
    if (ib[i].el.contains(ib[j].el) || ib[j].el.contains(ib[i].el)) continue;
    if (intersects(ib[i].b, ib[j].b)) pairs.push(`${ib[i].name} ∩ ${ib[j].name}`);
  }
  const escapes: string[] = [];
  for (const l of ib) {
    if (l.cell === null) continue;
    const c = box(l.cell);
    if (l.b.x < c.x - 1 || l.b.y < c.y - 1 || l.b.x + l.b.w > c.x + c.w + 1 || l.b.y + l.b.h > c.y + c.h + 1) escapes.push(`${l.name} leaves ${name(l.cell)}`);
  }

  /*
    **Type, and paint, each enumerated by what it IS.** Type is an element
    with text of its own. Paint is an element that draws a fill (background,
    image, SVG) and carries no text -- which finds §5.1's arcs, the section
    bars, the cover and the sleeve marks as well as §26's figures and flats.
    The first version of this enumerated `[data-ornament]` and reported
    "text on top in every overlap" on a set that did not contain the element
    on top (`docs/findings/a-check-whose-subject-is-a-list.md`).
  */
  const texts = Array.from(document.querySelectorAll<HTMLElement>('main *')).filter((el) => {
    if (el.closest('[aria-hidden="true"]') !== null) return false;
    if (['SCRIPT', 'STYLE', 'SVG', 'POLYGON', 'CIRCLE', 'BUTTON', 'TEXTAREA', 'SELECT', 'INPUT', 'OPTION'].includes(el.tagName)) return false;
    const own = Array.from(el.childNodes).some((n) => n.nodeType === Node.TEXT_NODE && (n.textContent ?? '').trim() !== '');
    return own && R(el).width > 0 && R(el).height > 0;
  });
  const paints = Array.from(document.querySelectorAll<HTMLElement>('main *')).filter((el) => {
    if (R(el).width <= 0 || R(el).height <= 0 || (el.textContent ?? '').trim() !== '') return false;
    if (el.closest('svg') !== null && el.tagName !== 'svg') return false;
    const cs = getComputedStyle(el);
    return el.tagName === 'IMG' || el.tagName === 'svg' || (cs.backgroundColor !== 'rgba(0, 0, 0, 0)' && cs.backgroundColor !== 'transparent') || cs.backgroundImage !== 'none';
  });
  const savedPE = paints.map((o) => o.style.pointerEvents);
  for (const o of paints) o.style.pointerEvents = 'auto';
  const inFront: string[] = [];
  const behind: string[] = [];
  for (const o of paints) {
    const ob = box(o);
    for (const tx of texts) {
      if (o.contains(tx) || tx.contains(o)) continue;
      const tb = box(tx);
      if (!intersects(ob, tb)) continue;
      /*
        **The point is scrolled into view first.** elementFromPoint answers
        for the viewport only; a point below the fold returns null, which
        read as "behind". With the identity band wrapping at 8 columns the
        provenance cell moved off the 900px screen and an in-front count of
        34 became 0 without the page changing there.
      */
      const px_ = Math.max(ob.x, tb.x) + (Math.min(ob.x + ob.w, tb.x + tb.w) - Math.max(ob.x, tb.x)) / 2;
      const py_ = Math.max(ob.y, tb.y) + (Math.min(ob.y + ob.h, tb.y + tb.h) - Math.max(ob.y, tb.y)) / 2;
      window.scrollTo(0, Math.max(0, py_ - window.innerHeight / 2));
      const top = document.elementFromPoint(px_ - window.scrollX, py_ - window.scrollY);
      const line = `${name(o)} over "${(tx.textContent ?? '').trim().slice(0, 24)}" in ${name(tx.closest('[data-cell],[data-section]') ?? tx)}`;
      (top !== null && (top === o || o.contains(top)) ? inFront : behind).push(line);
    }
  }
  paints.forEach((o, i) => { o.style.pointerEvents = savedPE[i]; });
  window.scrollTo(0, 0);

  /* §18: clipping a fact is never the answer. Every text lies inside the clip box of its nearest clipping ancestor. */
  const cut: string[] = [];
  for (const tx of texts) {
    let clip: HTMLElement | null = tx.parentElement;
    while (clip !== null && getComputedStyle(clip).overflowY === 'visible' && getComputedStyle(clip).overflowX === 'visible') clip = clip.parentElement;
    if (clip === null || clip.getAttribute('data-clamped') !== null || tx.getAttribute('data-clamped') !== null) continue;
    const c = R(clip); const b = R(tx);
    const by = Math.max(0, b.bottom - (c.top + clip.clientHeight + 1), b.right - (c.left + clip.clientWidth + 1), c.top - 1 - b.top, c.left - 1 - b.left);
    if (by > 0.5) cut.push(`"${(tx.textContent ?? '').trim().slice(0, 24)}" cut by ${px(by)}px in ${name(clip)}`);
  }

  const upper = ['identity', 'still', 'sleeve'].map((n) => { const el = document.querySelector<HTMLElement>(`[data-cell="${n}"]`); return { n, display: el === null ? 'absent' : getComputedStyle(el).display, w: el === null ? 0 : px(R(el).width), h: el === null ? 0 : px(R(el).height) }; });
  const cover = document.querySelector<HTMLElement>('[data-cover]');
  return { vw: window.innerWidth, vh: window.innerHeight, cols: { identity: cols(identity), lower: cols(lower), region: cols(region) }, bandH: identity === null ? null : px(R(identity).height), lowerH: lower === null ? null : px(R(lower).height), cells, pairs, escapes, inFront, behindCount: behind.length, cut, upper, coverW: cover === null ? 0 : px(R(cover).width), paintKinds: [...new Set(paints.map(name))] };
};

/** What every viewport must satisfy; returns what failed. Paint in front of type is judged by its own test. */
const judge = (m: ReturnType<typeof MEASURE>) => {
  const bad: string[] = [];
  if (m.pairs.length) bad.push(`pairs: ${m.pairs.join(' | ')}`);
  if (m.escapes.length) bad.push(`escapes: ${m.escapes.join(' | ')}`);
  if (m.cut.length) bad.push(`CUT (§18): ${m.cut.slice(0, 3).join(' | ')}${m.cut.length > 3 ? ` …${m.cut.length}` : ''}`);
  return bad;
};

/** §30's height axis above the fork, and the widths it is swept at. */
const HEIGHTS = [800, NO_SCROLL_HEIGHT, 1050, 1200, 1440, 2000] as const;
const HEIGHT_WIDTHS = [GRID_FORK + 1, 1680, 1920] as const;
const failLines = (bad: string[]) => `${bad.slice(0, 12).join('\n  ')}${bad.length > 12 ? `\n  … ${bad.length} in all` : ''}`;

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

test('above the fork, at every width and at six heights: no two boxes intersect, nothing leaves its cell, no type is cut (§2.1, §18, §30)', async ({ page }) => {
  test.setTimeout(600_000);
  await login(page);
  const id = await seedRich(page);
  await page.setViewportSize({ width: GRID_FORK, height: NO_SCROLL_HEIGHT });
  await page.goto(`/records/${id}`);
  await expect(page.locator('[data-field="eyebrow"]')).toBeVisible();
  await page.waitForTimeout(750);
  const bad: string[] = [];
  const front: string[] = [];
  let checked = 0;
  /* The width axis, at the one height every sweep before this ran at. */
  for (const w of sweepWidths(GRID_FORK, 1920)) {
    await page.setViewportSize({ width: w, height: NO_SCROLL_HEIGHT });
    await page.waitForTimeout(w % 6 === 0 ? 120 : 400);
    const m = await page.evaluate(MEASURE);
    checked += 1;
    const j = judge(m);
    if (j.length) bad.push(`${w}x${NO_SCROLL_HEIGHT}: ${j.join(' ; ')}`);
    for (const f of m.inFront) front.push(`${w}x${NO_SCROLL_HEIGHT}: ${f}`);
  }
  /*
    **The height axis.** §30: above 1440 the upper band is max(547, 547/900 ×
    viewport height), the extra going to the construction cell -- at 1680 ×
    2000 the band is 1216. A rule with two inputs is swept on both; every
    sweep before this one ran at 900.
  */
  const bands: string[] = [];
  for (const w of HEIGHT_WIDTHS) for (const h of HEIGHTS) {
    await page.setViewportSize({ width: w, height: h });
    await page.waitForTimeout(400);
    const m = await page.evaluate(MEASURE);
    checked += 1;
    bands.push(`${w}x${h}: band ${m.bandH}`);
    /* §30: "max(547, 547/900 × viewport height)" -- at 1680 × 2000 the band is 1216. */
    if (m.bandH === null || Math.abs(m.bandH - bandHeightAt(h)) > 1) bad.push(`${w}x${h}: identity band ${m.bandH}, §30 rules ${bandHeightAt(h)}`);
    const j = judge(m);
    if (j.length) bad.push(`${w}x${h}: ${j.join(' ; ')}`);
    for (const f of m.inFront) front.push(`${w}x${h}: ${f}`);
  }
  console.log(`  HEIGHT AXIS, identity band height -- ${bands.join(', ')}`);
  console.log(`  PAINT IN FRONT OF TYPE above the fork: ${front.length} (judged by its own test)`);
  expect(checked, 'viewports measured').toBeGreaterThan(90);
  expect(bad, `viewports failing:\n  ${failLines(bad)}`).toEqual([]);
});

/**
 * **Below the fork, at every width.** §28: "The upper cells keep their size
 * and wrap in order... At 8 columns, the first two cells sit side by side
 * and the third takes a second row, with 480 of air beside it... At 4
 * columns the three cells stack. Below 480 there is one fluid column." And
 * for the record band: "At every width from 480 to 1439 the band is as tall
 * as its rows, and each row is as tall as its tallest cell's content."
 *
 * The first build of the fork hid the still and the sleeve and collapsed
 * EVERY band to one column through the shared `[data-band]` selector --
 * the selector §28 names as the defect's route for height, taken again for
 * columns. Its provenance cell came out 72px tall under a 112px mark.
 */
test('below the fork, at every width: the upper cells wrap at their size, the cover is drawn, no box intersects, no type is cut (§28, steps 20 and 31)', async ({ page }) => {
  test.setTimeout(600_000);
  await login(page);
  const id = await seedRich(page);
  await page.setViewportSize({ width: GRID_FORK, height: NO_SCROLL_HEIGHT });
  await page.goto(`/records/${id}`);
  await expect(page.locator('[data-field="eyebrow"]')).toBeVisible();
  await page.waitForTimeout(750);
  const bad: string[] = [];
  const front: string[] = [];
  let checked = 0;
  let sawAutoBand = false;
  for (const w of sweepWidths(390, GRID_FORK - 1)) {
    await page.setViewportSize({ width: w, height: w <= 480 ? 844 : NO_SCROLL_HEIGHT });
    await page.waitForTimeout(w % 6 === 0 ? 120 : 400);
    const m = await page.evaluate(MEASURE);
    checked += 1;
    if (m.lowerH !== null && m.lowerH !== BANDS.record) sawAutoBand = true;
    const j = judge(m);
    for (const u of m.upper) {
      if (u.display === 'none' || u.display === 'absent') j.push(`upper cell ${u.n} is ${u.display} (§28: the upper cells wrap, they do not hide)`);
      else if (w >= 480 && Math.abs(u.w - 480) > 1) j.push(`upper cell ${u.n} is ${u.w} wide, not its own 480`);
    }
    if (m.coverW < 1) j.push('no cover drawn');
    if (j.length) bad.push(`${w}: ${j.join(' ; ')}`);
    for (const f of m.inFront) front.push(`${w}: ${f}`);
  }
  console.log(`  PAINT IN FRONT OF TYPE below the fork: ${front.length} (judged by its own test)`);
  expect(checked, 'widths measured').toBeGreaterThan(100);
  expect(sawAutoBand, 'the record band is sized by its rows below the fork, not held at 1440’s 300').toBe(true);
  expect(bad, `widths failing:\n  ${failLines(bad)}`).toEqual([]);
});

/**
 * **No paint in front of type, at any viewport.** §28 for §26's flats:
 * "never overlap type"; §26 puts figures behind content; §34 for §5.1's
 * planes: sized against the host, "and only then tested against type: if
 * the sized plane still covers type, it is not drawn." Every occurrence is
 * printed so the count is read, not the colour.
 */
test('no paint sits in front of type at any width or height (§26, §28, §34)', async ({ page }) => {
  test.setTimeout(600_000);
  await login(page);
  const id = await seedRich(page);
  await page.setViewportSize({ width: GRID_FORK, height: NO_SCROLL_HEIGHT });
  await page.goto(`/records/${id}`);
  await expect(page.locator('[data-field="eyebrow"]')).toBeVisible();
  await page.waitForTimeout(750);
  const front: string[] = [];
  let behind = 0;
  const kinds = new Set<string>();
  const views: Array<[number, number]> = [...sweepWidths(390, 1920).map((w): [number, number] => [w, w <= 480 ? 844 : NO_SCROLL_HEIGHT]), ...HEIGHT_WIDTHS.flatMap((w) => HEIGHTS.map((h): [number, number] => [w, h]))];
  for (const [w, h] of views) {
    await page.setViewportSize({ width: w, height: h });
    await page.waitForTimeout(w % 6 === 0 && h === NO_SCROLL_HEIGHT ? 120 : 400);
    const m = await page.evaluate(MEASURE);
    behind += m.behindCount;
    for (const k of m.paintKinds) kinds.add(k);
    for (const f of m.inFront) front.push(`${w}x${h}: ${f}`);
  }
  console.log(`  PAINT KINDS ENUMERATED: ${[...kinds].sort().join(', ')}`);
  console.log(`  PAINT BEHIND TYPE: ${behind} overlaps; IN FRONT: ${front.length}`);
  expect(front, `paint in front of type:\n  ${failLines(front)}`).toEqual([]);
});
