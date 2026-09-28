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
  /*
    **A text leaf's extent is its glyphs, not its box.** The year figure's
    box bleeds into the cell's padding by design (margin-inline -18,
    padding-inline 18) and in §36's band fractional columns put that box a
    sub-pixel past the clip while the glyphs sit inside with room to spare
    -- a check one layer off its claim, reported as "cut by 0.7px". Marks
    and fields without text keep their boxes.
  */
  const extent = (el: HTMLElement) => {
    const own = Array.from(el.childNodes).filter((n) => n.nodeType === Node.TEXT_NODE && (n.textContent ?? '').trim() !== '');
    if (own.length === 0) return box(el);
    let l = Infinity, tp = Infinity, r = -Infinity, bt = -Infinity;
    for (const n of own) { const rg = document.createRange(); rg.selectNodeContents(n); for (const rc of Array.from(rg.getClientRects())) { if (rc.width === 0) continue; l = Math.min(l, rc.left); tp = Math.min(tp, rc.top); r = Math.max(r, rc.right); bt = Math.max(bt, rc.bottom); } }
    if (!Number.isFinite(l)) return box(el);
    return { x: px(l + window.scrollX), y: px(tp + window.scrollY), w: px(r - l), h: px(bt - tp) };
  };
  /* Pairs test BOXES: lines of display type at 0.94 leading overlap as glyphs by design. Escapes and cuts test glyphs: leaving a cell is the type leaving it. */
  const ib = leaves.map((el) => ({ el, name: name(el), b: box(el), g: extent(el), cell: el.closest('[data-cell], [data-section]') }));
  const pairs: string[] = [];
  for (let i = 0; i < ib.length; i += 1) for (let j = i + 1; j < ib.length; j += 1) {
    if (ib[i].el.contains(ib[j].el) || ib[j].el.contains(ib[i].el)) continue;
    if (intersects(ib[i].b, ib[j].b)) pairs.push(`${ib[i].name} ∩ ${ib[j].name}`);
  }
  const escapes: string[] = [];
  for (const l of ib) {
    if (l.cell === null) continue;
    const c = box(l.cell);
    if (l.g.x < c.x - 1 || l.g.y < c.y - 1 || l.g.x + l.g.w > c.x + c.w + 1 || l.g.y + l.g.h > c.y + c.h + 1) escapes.push(`${l.name} leaves ${name(l.cell)}`);
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
    if (!own || R(el).width <= 0 || R(el).height <= 0) return false;
    /* Screen-reader-only text is clipped to a pixel by design (sr-only: 1x1, overflow hidden -- and `position: relative` here, since the sections' hit-area rule overrides sr-only's absolute on labels); its glyphs are not type a reader sees cut. Enumerated by the properties, not the class. */
    if (el.offsetWidth <= 1 && el.offsetHeight <= 1 && getComputedStyle(el).overflow === 'hidden') return false;
    return true;
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
    /* §42: the About scrolls inside its region, so its last visible line is cut at the region's foot by rule. */
    if (clip === null || ((getComputedStyle(clip).overflowY === 'auto' || getComputedStyle(clip).overflowY === 'scroll') && clip.scrollHeight > clip.clientHeight)) continue;
    const c = R(clip); const e = extent(tx); const b = { top: e.y - window.scrollY, bottom: e.y + e.h - window.scrollY, left: e.x - window.scrollX, right: e.x + e.w - window.scrollX };
    const by = Math.max(0, b.bottom - (c.top + clip.clientHeight + 1), b.right - (c.left + clip.clientWidth + 1), c.top - 1 - b.top, c.left - 1 - b.left);
    if (by > 0.5) cut.push(`"${(tx.textContent ?? '').trim().slice(0, 24)}" cut by ${px(by)}px in ${name(clip)}`);
  }

  /* §42 withdrew the clamp; nothing squeezes an About now, and the measure stays so the judge's shape does not change. */
  const squeezed: string[] = [];
  const upper = ['identity', 'still', 'sleeve'].map((n) => { const el = document.querySelector<HTMLElement>(`[data-cell="${n}"]`); return { n, display: el === null ? 'absent' : getComputedStyle(el).display, w: el === null ? 0 : px(R(el).width), h: el === null ? 0 : px(R(el).height), x: el === null ? 0 : px(R(el).left + window.scrollX), y: el === null ? 0 : px(R(el).top + window.scrollY) }; });
  const upperAir = (() => { const el = document.querySelector<HTMLElement>('[data-upper-air]'); if (el === null) return null; const b = box(el); const flat = el.querySelector<HTMLElement>('[data-ornament="flat"]'); const fb = flat === null ? null : flat.getBoundingClientRect(); return { display: getComputedStyle(el).display, ...b, section: el.dataset.section ?? null, figure: el.querySelector('[data-ornament="figure"]') !== null, flat: flat !== null, flatBleed: fb === null || fb.width === 0 ? null : Math.max(0, -fb.left) / fb.width }; })();
  /* §37: the region's own triangle, "moved, not added" -- visible means displayed with a box. */
  const regionTriangle = Array.from(document.querySelectorAll<HTMLElement>('[data-region="extended-grid"] [data-cell="air"] [data-ornament="flat"][data-flat="triangle"]')).some((f) => getComputedStyle(f).display !== 'none' && f.getBoundingClientRect().width > 0);
  const cover = document.querySelector<HTMLElement>('[data-cover]');
  /* §30's terms below the fork (§41): the construction's own empty width once height binds, and the cover cell's width beside its square. */
  const constructionEmpty = (() => { const svg = document.querySelector<SVGSVGElement>('[data-testid="construction-still"]'); const still = document.querySelector<HTMLElement>('[data-cell="still"]'); if (svg === null || still === null) return 0; const vb = (svg.getAttribute('viewBox') ?? '0 0 1 1').split(' ').map(Number); const sb = R(svg); const cs = getComputedStyle(still); const innerW = still.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight); const widthBound = sb.width / vb[2] < sb.height / vb[3]; return widthBound ? 0 : px(innerW - Math.min(sb.width / vb[2], sb.height / vb[3]) * vb[2]); })();
  /* §44: the identity's right rule (a hairline against its air when the air renders) and each upper row's ground, which must be paper. */
  const identityRule = (() => { const el = document.querySelector<HTMLElement>('[data-band="identity"] > [data-cell="identity"]'); return el === null ? 0 : parseFloat(getComputedStyle(el).borderRightWidth); })();
  const groundGrey = ['identity', 'still', 'sleeve'].flatMap((n) => { const el = document.querySelector<HTMLElement>(`[data-band="identity"] > [data-cell="${n}"]`); if (el === null) return []; const bg = getComputedStyle(el).backgroundColor; return bg === 'rgba(0, 0, 0, 0)' || bg === 'transparent' ? [] : [`${n} ${bg}`]; });
  const coverBeside = (() => { const sleeve = document.querySelector<HTMLElement>('[data-cell="sleeve"]'); return sleeve === null || cover === null ? 0 : px(R(sleeve).width - R(cover).width); })();
  return { vw: window.innerWidth, vh: window.innerHeight, squeezed, upperAir, regionTriangle, constructionEmpty, coverBeside, identityRule, groundGrey, cols: { identity: cols(identity), lower: cols(lower), region: cols(region) }, bandH: identity === null ? null : px(R(identity).height), lowerH: lower === null ? null : px(R(lower).height), cells, pairs, escapes, inFront, behindCount: behind.length, cut, upper, coverW: cover === null ? 0 : px(R(cover).width), paintKinds: [...new Set(paints.map(name))] };
};

/** What every viewport must satisfy; returns what failed. Paint in front of type is judged by its own test. */
const judge = (m: ReturnType<typeof MEASURE>) => {
  const bad: string[] = [];
  if (m.pairs.length) bad.push(`pairs: ${m.pairs.join(' | ')}`);
  if (m.escapes.length) bad.push(`escapes: ${m.escapes.join(' | ')}`);
  if (m.cut.length) bad.push(`CUT (§18): ${m.cut.slice(0, 3).join(' | ')}${m.cut.length > 3 ? ` …${m.cut.length}` : ''}`);
  if (m.squeezed.length) bad.push(`SQUEEZED: ${m.squeezed.join(' | ')}`);
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
  /*
    A Discogs release, so the market section (§34's subject) renders; its
    endpoint is mocked per test, never live. Unique per seed: the id is a
    unique key on pressings, which are shared and outlive the record's
    cleanup, so a fixed id collided with the previous run's pressing.
  */
  await db.execute(sql`UPDATE pressings SET discogs_release_id = ${900_000_000 + Math.floor(Math.random() * 90_000_000)} WHERE id = ${pressing.id}::uuid AND discogs_release_id IS NULL`);
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
    /*
      §41 (step 46): from 960 to 1439 each upper track is half the page and
      the band stays 547, so no width is unassigned. §28's 480 tracks held
      there before, and the page's gain sat unassigned right of the
      construction: 40 at 1000, 240 at 1200, 479 at 1439. Below 960 the one
      480 track stands.
    */
    /*
      §44 (step 52): from 480 to 959 each upper cell fills its row -- the
      identity keeps its 480 and the air takes the rest, the cover and the
      construction take the row. §28's stacking left every cell at 480 with
      paper to its right (28/cells-never-reshape, 28/never-reshape-above-480).
    */
    const widthOf = (n: string) => (w >= 960 ? w / 2 : w >= 480 ? (n === 'identity' ? 480 : w) : w);
    for (const u of m.upper) {
      if (u.display === 'none' || u.display === 'absent') j.push(`upper cell ${u.n} is ${u.display} (§28: the upper cells wrap, they do not hide)`);
      else if (w >= 480 && Math.abs(u.w - widthOf(u.n)) > 1) j.push(`upper cell ${u.n} is ${u.w} wide, not ${widthOf(u.n)} (§41 from 960; §44 from 480)`);
    }
    if (w > 480 && w < 960) {
      const identity = m.upper.find((u) => u.n === 'identity');
      if (m.upperAir === null || m.upperAir.display === 'none') j.push('the air beside the identity is missing (§44)');
      else {
        if (Math.abs(m.upperAir.w - (w - 480)) > 1) j.push(`the air is ${m.upperAir.w} wide, not the row's rest ${w - 480} (§44)`);
        if (identity !== undefined && (Math.abs(m.upperAir.y - identity.y) > 1 || Math.abs(m.upperAir.x - 480) > 1)) j.push(`the air is not beside the identity on its row (air ${m.upperAir.x},${m.upperAir.y})`);
        if (m.identityRule !== 1) j.push(`no hairline between the identity and its air (identity right rule ${m.identityRule}px; §44: 1px at 0.72 when the air renders)`);
      }
    }
    if (w === 480 && m.upperAir !== null && m.upperAir.display !== 'none') j.push('at 480 there is no air (§44), yet the air cell shows');
    if (w < 960 && w >= 480 && m.groundGrey.length) j.push(`a row's ground is not paper (§44): ${m.groundGrey.join(', ')}`);
    if (w >= 960) {
      const identity = m.upper.find((u) => u.n === 'identity'); const still = m.upper.find((u) => u.n === 'still');
      if (identity !== undefined && still !== undefined && Math.abs(w - identity.w - still.w) > 1) j.push(`${w - identity.w - still.w}px of the first row is unassigned (§41: none)`);
      /* §30's ceiling holds on both sides of the fork: empty width in the upper band is always narrower than one upper cell. */
      const empty = (identity !== undefined && still !== undefined ? w - identity.w - still.w : 0) + m.constructionEmpty + m.coverBeside;
      if (empty >= 480) j.push(`empty width ${empty} (unassigned + construction ${m.constructionEmpty} + beside the square ${m.coverBeside}) is not under one upper cell`);
    }
    if (m.coverW < 1) j.push('no cover drawn');
    /*
      §28 at 8 columns: "the third takes a second row, with 480 of air beside
      it." §37 makes that air a section carrying the tint field and no
      figure (`28/upper-air-figure`). Shown from 960 to 1439 only: beside
      the sleeve on the second row, half the page (§41), with a flat inside;
      hidden where the cells sit three abreast or stack.
    */
    const eight = w >= 960;
    if (eight) {
      if (m.upperAir === null || m.upperAir.display === 'none') j.push('the upper air is missing at 8 columns (§28)');
      else {
        const sleeve = m.upper.find((u) => u.n === 'sleeve');
        if (Math.abs(m.upperAir.w - w / 2) > 1) j.push(`the upper air is ${m.upperAir.w} wide, not half the page (§41)`);
        if (sleeve !== undefined && Math.abs(w - m.upperAir.w - sleeve.w) > 1) j.push(`${w - m.upperAir.w - sleeve.w}px of the second row is unassigned (§41: none)`);
        /* Step 39 (§37): the air LEFT of the sleeve in the second row, by grid order only -- markup and reading order stay -- so the tint triangle bleeds off the page's left edge, a third or more outside (§21). */
        if (sleeve !== undefined && (Math.abs(m.upperAir.y - sleeve.y) > 1 || m.upperAir.x > 1 || sleeve.x < m.upperAir.x + m.upperAir.w - 1)) j.push(`the upper air is not left of the sleeve on the second row (air ${m.upperAir.x},${m.upperAir.y}; sleeve ${sleeve.x},${sleeve.y})`);
        if (m.upperAir.flatBleed === null) j.push('the upper air carries no tint triangle');
        else if (m.upperAir.flatBleed < 1 / 3) j.push(`the tint triangle bleeds ${(m.upperAir.flatBleed * 100).toFixed(0)}% off the page's left edge, less than §21's third`);
        /* §37, step 40: a section carrying the tint field and NO figure; the region's triangle is moved, not added. */
        if (m.upperAir.section === null) j.push('the upper air is not a section (§37)');
        if (m.upperAir.figure) j.push('the upper air carries a figure (§37: the construction is the only figure above the fold)');
        if (!m.upperAir.flat) j.push('the upper air carries no tint field');
        if (m.regionTriangle) j.push('the region draws its own triangle as well as the upper air’s (§37: moved, not added)');
      }
    }
    if (j.length) bad.push(`${w}: ${j.join(' ; ')}`);
    for (const f of m.inFront) front.push(`${w}: ${f}`);
  }
  /*
    §42 (step 48): from 960 to 1439 the band takes the viewport's height as
    §40 rules above the fork -- 547 / 900 of it, never less than 547 -- and
    every upper cell takes it. Two rows here, so the band is twice the row.
    §41 held it at 547 and painted the rest of the window as paper; swept on
    the height axis, where every earlier below-fork sweep ran at 900.
  */
  const rows: string[] = [];
  for (const w of [960, 1000, 1200, GRID_FORK - 1]) for (const h of HEIGHTS) {
    await page.setViewportSize({ width: w, height: h });
    await page.waitForTimeout(400);
    const m = await page.evaluate(MEASURE);
    checked += 1;
    const row = bandHeightAt(h);
    rows.push(`${w}x${h}: band ${m.bandH}, cells ${m.upper.map((u) => u.h).join('/')}`);
    if (m.bandH === null || Math.abs(m.bandH - 2 * row) > 2) bad.push(`${w}x${h}: identity band ${m.bandH}, §42 rules two rows of ${row}`);
    for (const u of m.upper) if (Math.abs(u.h - (row - 1)) > 1) bad.push(`${w}x${h}: ${u.n} is ${u.h} tall, not the row's ${row - 1} (§42: every upper cell takes it)`);
    const j = judge(m);
    if (j.length) bad.push(`${w}x${h}: ${j.join(' ; ')}`);
    for (const f of m.inFront) front.push(`${w}x${h}: ${f}`);
  }
  console.log(`  HEIGHT AXIS below the fork -- ${rows.join(', ')}`);
  console.log(`  PAINT IN FRONT OF TYPE below the fork: ${front.length} (judged by its own test)`);
  expect(checked, 'widths measured').toBeGreaterThan(100);
  expect(sawAutoBand, 'the record band is sized by its rows below the fork, not held at 1440’s 300').toBe(true);
  expect(bad, `widths failing:\n  ${failLines(bad)}`).toEqual([]);
});

/**
 * **§34's measure rule, the one that outranks every grouping.** "The general
 * rule, which governs span wherever it conflicts with a grouping: every
 * content cell's measure holds its longest label on one line. For the market
 * that is about 152px... Code measures it." Asserted for every label in every
 * section at every width from 480 to 1920, enumerated by what a label IS --
 * the label register, monospace and uppercase -- not by a list of cells.
 */
test('§34: every label in every section sets on one line, at every width from 480 to 1920', async ({ page }) => {
  test.setTimeout(600_000);
  await login(page);
  await page.route('**/api/discogs/market/**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ numForSale: 11, lowestPrice: { value: 47.28, currency: 'USD' }, conditions: [{ grade: 'Near Mint (NM or M-)', value: 130.45 }, { grade: 'Very Good Plus (VG+)', value: 99.76 }], range: { low: 69.06, high: 130.45 }, currency: 'USD' }) }));
  const id = await seedRich(page);
  await page.setViewportSize({ width: 1920, height: NO_SCROLL_HEIGHT });
  await page.goto(`/records/${id}`);
  await expect(page.locator('[data-field="eyebrow"]')).toBeVisible();
  await expect(page.locator('[data-section="market"]'), 'the market section renders, or the rule has no subject').toBeVisible();
  await page.waitForTimeout(750);
  const bad: string[] = [];
  let labelsSeen = 0; let marketAt1000 = '';
  for (const w of sweepWidths(480, 1920)) {
    await page.setViewportSize({ width: w, height: w <= 480 ? 844 : NO_SCROLL_HEIGHT });
    await page.waitForTimeout(w % 6 === 0 ? 120 : 400);
    const m = await page.evaluate(() => {
      const out: Array<{ section: string; text: string; lines: number; width: number; measure: number }> = [];
      for (const section of Array.from(document.querySelectorAll<HTMLElement>('[data-section]'))) {
        if (getComputedStyle(section).display === 'none') continue;
        for (const el of Array.from(section.querySelectorAll<HTMLElement>('*'))) {
          const s = getComputedStyle(el);
          if (s.textTransform !== 'uppercase' || !/mono/i.test(s.fontFamily) || s.display === 'none') continue;
          if (el.offsetWidth <= 1 && el.offsetHeight <= 1) continue;
          const text = (el.textContent ?? '').trim(); if (text === '') continue;
          if (Array.from(el.children).some((c) => getComputedStyle(c as HTMLElement).textTransform === 'uppercase')) continue;
          const range = document.createRange(); range.selectNodeContents(el);
          const tops = new Set(Array.from(range.getClientRects()).filter((r) => r.width > 0).map((r) => Math.round(r.top)));
          const cell = el.closest<HTMLElement>('[data-cell], [data-section]');
          const cs = cell === null ? null : getComputedStyle(cell);
          const measure = cell === null || cs === null ? 0 : cell.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
          out.push({ section: section.dataset.section ?? '?', text: text.slice(0, 32), lines: tops.size, width: Math.round(range.getBoundingClientRect().width), measure: Math.round(measure) });
        }
      }
      return out;
    });
    labelsSeen += m.length;
    const market = m.find((l) => l.section === 'market' && /goes for now/i.test(l.text));
    if (w === 1002 && market !== undefined) marketAt1000 = `${market.width}px wide in a ${market.measure}px measure`;
    for (const l of m.filter((l) => l.lines > 1)) bad.push(`${w}: ${l.section} "${l.text}" sets on ${l.lines} lines (${l.width}px in a ${l.measure}px measure)`);
  }
  console.log(`  §34 LABELS: ${labelsSeen} label instances measured; the market’s label at 1002 (the sweep step nearest 1000) is ${marketAt1000 || 'not found'}`);
  expect(labelsSeen, 'the rule has subjects').toBeGreaterThan(100);
  expect(bad, `labels breaking their line:\n  ${bad.slice(0, 40).join('\n  ')}${bad.length > 40 ? `\n  … ${bad.length - 40} more` : ''}`).toEqual([]);
});

/**
 * **No structural vertical stands on the page's edge, at any fork.** §3 puts
 * a rule on "every structural edge" and §33 on the boundary between two
 * cells; a rule whose neighbour is the page's edge divides nothing. Measured
 * before this test: at 1000 pressing-detail's inline 1px rule for its 1440
 * placement beat the stylesheet's 0 and ran down the page's right edge, and
 * the record band's stacked cells kept the rules they carry side by side.
 *
 * Enumerated by what a thing IS -- any element painting a left or right
 * border whose painted edge is the composition's edge -- not by a list of
 * cells. Form controls carry their own borders and are not rules.
 * `journalEdge` is excluded and named: §3's 2px derived edge sits "at the
 * band's right end", which is the page's edge at 1440 by its own ruling.
 */
test('no structural vertical rule stands on the page’s left or right edge, at any fork (§3, §33)', async ({ page }) => {
  test.setTimeout(300_000);
  await login(page);
  const id = await seedRich(page);
  const bad: string[] = [];
  for (const w of [390, 480, 960, 1000, 1439, 1440, 1680, 1920]) {
    await page.setViewportSize({ width: w, height: w <= 480 ? 844 : NO_SCROLL_HEIGHT });
    await page.goto(`/records/${id}`);
    await expect(page.locator('[data-field="eyebrow"]')).toBeVisible();
    await page.waitForTimeout(500);
    const edge = await page.evaluate(() => {
      const root = document.querySelector<HTMLElement>('[data-testid="record-page-8a"]');
      if (root === null) return ['no composition root'];
      const rr = root.getBoundingClientRect();
      const name = (el: Element) => ['data-cell', 'data-section', 'data-mark', 'data-band', 'data-field'].map((k) => (el.getAttribute(k) === null ? '' : `${k.slice(5)}=${el.getAttribute(k)}`)).filter(Boolean).join(' ') || el.tagName.toLowerCase();
      const out: string[] = [];
      for (const el of Array.from(root.querySelectorAll<HTMLElement>('*'))) {
        if (el.closest('a, button, input, select, textarea') !== null) continue;
        if (el.getAttribute('data-mark') === 'journalEdge') continue;
        const s = getComputedStyle(el);
        if (s.display === 'none') continue;
        const b = el.getBoundingClientRect();
        if (b.width === 0 || b.height === 0) continue;
        const right = parseFloat(s.borderRightWidth); const left = parseFloat(s.borderLeftWidth);
        if (right > 0 && s.borderRightStyle !== 'none' && Math.abs(b.right - rr.right) <= 1) out.push(`${name(el)} right rule ${right}px on the page's right edge (${Math.round(b.height)}px tall)`);
        if (left > 0 && s.borderLeftStyle !== 'none' && Math.abs(b.left - rr.left) <= 1) out.push(`${name(el)} left rule ${left}px on the page's left edge (${Math.round(b.height)}px tall)`);
      }
      return out;
    });
    for (const e of edge) bad.push(`${w}: ${e}`);
    console.log(`  EDGE @${w}: ${edge.length === 0 ? 'none' : edge.join(' ; ')}`);
  }
  expect(bad, `rules on the page's edge:\n  ${bad.join('\n  ')}`).toEqual([]);
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
