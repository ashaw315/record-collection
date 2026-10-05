import { expect, test, type Page } from '@playwright/test';
import { WRITE_CAPTURES } from './write-captures';
import { sql } from 'drizzle-orm';
import { getTestDb } from '../test/helpers/db';
import { registerCleanup, trackArtist } from './cleanup';
import { seedImage } from './seed';
import { GRID_FORK, NO_SCROLL_HEIGHT } from '../src/app/records/[id]/band-geometry';
import { VISIBLE_OF_HOST_HEIGHT, VISIBLE_OF_SECTION_WIDTH } from '../src/app/records/[id]/OrnamentMarks';
import { CELL_PADDING } from '../src/app/records/[id]/extended-grid';
import { DISC_REFERENCE_JS } from './disc-reading';

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
  const response = await page.request.post(path, { data, failOnStatusCode: false });
  expect(response.status(), `${path}`).toBe(201);
  return response.json();
}

/**
 * §56 (step 66): "The quarter-disc in Images is sized against the section as
 * it stands with one image, whatever the count, so it never grows because a
 * record gains a second... The images that are not the cover flow in one
 * grid in the fixed type order, each tile carrying its type badge, so a row
 * fills before it wraps; group labels are dropped."
 *
 * Step 65's four records -- one, two, three and six images, the first being
 * the cover -- at the four widths it reported, captured by section height.
 * The one-image record is the reference: its section is the host "as it
 * stands with one image", and the disc on every other record is measured
 * against that section's height at the same width.
 */
const COUNTS: ReadonlyArray<{ n: number; types: ReadonlyArray<'back' | 'label' | 'matrix' | 'other' | null> }> = [
  { n: 1, types: [] },
  { n: 2, types: ['back'] },
  { n: 3, types: ['back', 'label'] },
  { n: 6, types: ['back', 'label', 'matrix', 'other', null] },
];
const WIDTHS: ReadonlyArray<[number, number]> = [[390, 844], [1000, NO_SCROLL_HEIGHT], [GRID_FORK, NO_SCROLL_HEIGHT], [1920, NO_SCROLL_HEIGHT]];

async function seedWithImages(page: Page, types: ReadonlyArray<string | null>): Promise<string> {
  const suffix = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;
  const artist = await post(page, '/api/artists', { name: `Images ${suffix}` });
  trackArtist(artist.id as string);
  const record = await post(page, '/api/records', { title: `Row ${types.length + 1} ${suffix}`, artistId: artist.id });
  const id = record.id as string;
  await getTestDb().execute(sql`UPDATE records SET spine_colour = ${'#a25829'} WHERE id = ${id}::uuid`);
  await seedImage({ recordId: id, imageType: 'cover' });
  for (const t of types) await seedImage({ recordId: id, imageType: t as 'back' | 'label' | 'matrix' | 'other' | null });
  return id;
}

type Reading = { sectionHeight: number; sectionWidth: number; visibleRadius: number; discState: string | null; discReference: number | null; reference: { heading: number; tile: number; badge: number; caption: number; reference: number }; headings: number; grids: number; noteRows: number; tiles: Array<{ type: string | null; top: number; badge: string }>; typeOverDisc: string[]; glyphs: Array<{ right: number; bottom: number }> };
const READ = `(() => {
  const sec = document.querySelector('[data-section="images"]'); const s = sec.getBoundingClientRect();
  const disc = sec.querySelector('[data-flat="quarterDisc"]'); const d = disc ? disc.getBoundingClientRect() : null;
  const visibleRadius = d === null ? 0 : Math.max(0, Math.min(d.right, s.right) - Math.max(d.left, s.left));
  const tiles = Array.from(sec.querySelectorAll('[data-testid="gallery-image"]')).map((t) => ({ type: t.getAttribute('data-image-type'), top: Math.round(t.getBoundingClientRect().top - s.top), badge: (t.querySelector('[data-testid="image-badge"]') || { textContent: '' }).textContent.trim() }));
  /* §5.2: no 11px type sits on a base-step ground. The disc's visible quadrant, clipped to the section, against every glyph run in the section. */
  const quadrant = d === null ? null : { left: Math.max(d.left, s.left), top: Math.max(d.top, s.top), right: Math.min(d.right, s.right), bottom: Math.min(d.bottom, s.bottom) };
  const typeOverDisc = [];
  if (quadrant !== null) for (const el of Array.from(sec.querySelectorAll('*'))) {
    if (el.closest('[aria-hidden="true"]') !== null) continue;
    for (const n of Array.from(el.childNodes)) {
      if (n.nodeType !== Node.TEXT_NODE || (n.textContent || '').trim() === '') continue;
      const r = document.createRange(); r.selectNodeContents(n);
      for (const g of Array.from(r.getClientRects())) {
        if (g.width === 0) continue;
        const cx = Math.max(g.left, quadrant.left), cy = Math.max(g.top, quadrant.top);
        if (g.left < quadrant.right && quadrant.left < g.right && g.top < quadrant.bottom && quadrant.top < g.bottom) {
          /* Inside the box: is the glyph's near corner inside the circle? The disc's centre is the section's bottom-right corner. */
          const dx = s.right - Math.min(g.right, quadrant.right), dy = s.bottom - Math.min(g.bottom, quadrant.bottom);
          if (Math.hypot(dx, dy) < visibleRadius) typeOverDisc.push(getComputedStyle(el).fontSize + ' "' + (n.textContent || '').trim().slice(0, 24) + '"');
        }
      }
    }
  }
  /* §59: every visible glyph run in the host, by its right edge and bottom from the section's edges, so the free height below the caption in the disc's reach can be computed outside. */
  const glyphs = [];
  for (const el of Array.from(sec.querySelectorAll('*'))) {
    if (el.closest('[aria-hidden="true"]') !== null) continue;
    for (const n of Array.from(el.childNodes)) {
      if (n.nodeType !== Node.TEXT_NODE || (n.textContent || '').trim() === '') continue;
      const r = document.createRange(); r.selectNodeContents(n);
      for (const g of Array.from(r.getClientRects())) if (g.width > 0) glyphs.push({ right: g.right - s.left, bottom: g.bottom - s.top });
    }
  }
  const reference = (${DISC_REFERENCE_JS})(sec);
  return { sectionHeight: s.height, sectionWidth: s.width, visibleRadius, discState: disc ? disc.getAttribute('data-disc-state') : null, discReference: disc && disc.getAttribute('data-disc-reference') !== null ? Number(disc.getAttribute('data-disc-reference')) : null, reference, headings: sec.querySelectorAll('h3').length, grids: sec.querySelectorAll('[data-image-grid]').length, noteRows: sec.querySelectorAll('[data-testid="gallery-note-row"]').length, tiles, typeOverDisc, glyphs };
})()`;

test('§56, §59, §60: the quarter-disc is sized against the stated reference at every count and yields to its caption, the tiles flow in one badged grid with no blank row, and the section grows by tile rows only', async ({ page }) => {
  test.setTimeout(300_000);
  await login(page);
  const ids = new Map<number, string>();
  for (const c of COUNTS) ids.set(c.n, await seedWithImages(page, c.types));
  const bad: string[] = [];
  const lines: string[] = [];
  for (const [w, h] of WIDTHS) {
    let reference: Reading | null = null;
    for (const c of COUNTS) {
      await page.setViewportSize({ width: w, height: h });
      await page.goto(`/records/${ids.get(c.n)}`);
      await page.locator('[data-section="images"] [data-flat="quarterDisc"]').waitFor({ state: 'attached', timeout: 20_000 });
      await page.waitForFunction(`document.querySelector('[data-section="images"] [data-flat="quarterDisc"]')?.getAttribute('data-disc-state') !== 'measuring'`, undefined, { timeout: 10_000 });
      await page.waitForTimeout(400);
      const m = (await page.evaluate(READ)) as Reading;
      if (c.n === 1) reference = m;
      if (reference === null) throw new Error('the one-image record reads first');
      /* §60: §29's height term is taken against the stated reference -- heading, padding, one notional tile row -- not against any rendering. */
      const sized = Math.min(m.reference.reference * VISIBLE_OF_HOST_HEIGHT, m.sectionWidth * VISIBLE_OF_SECTION_WIDTH);
      if (m.discReference === null || Math.abs(m.discReference - m.reference.reference) > 1) bad.push(`${c.n} images @${w}: the disc states a reference of ${m.discReference}, the named parts give ${m.reference.reference.toFixed(1)} (heading ${Math.round(m.reference.heading)}, padding ${2 * CELL_PADDING}, tile ${Math.round(m.reference.tile)}, badge ${m.reference.badge.toFixed(1)}, caption ${m.reference.caption.toFixed(1)})`);
      if (m.noteRows !== 0) bad.push(`${c.n} images @${w}: a blank note row is still rendered; §60 removes it`);
      /* §59: the disc yields to its caption -- the free height below the lowest glyph within the disc's reach, drawn only where that is greater than zero. */
      const inReach = m.glyphs.filter((g) => g.right > m.sectionWidth - sized);
      const free = m.sectionHeight - Math.max(0, ...inReach.map((g) => g.bottom));
      const bound = Math.min(sized, free);
      const splits = [...new Set(m.tiles.map((t) => t.type))].filter((type) => new Set(m.tiles.filter((t) => t.type === type).map((t) => t.top)).size > 1);
      const rows = new Set(m.tiles.map((t) => t.top)).size;
      lines.push(`  §56 IMAGES ${c.n} @${w}: section ${Math.round(m.sectionHeight)} (+${Math.round(m.sectionHeight - reference.sectionHeight)} over one image), disc radius ${Math.round(m.visibleRadius * 10) / 10} against bound ${Math.round(bound * 10) / 10} (reference ${Math.round(m.reference.reference)}: heading ${Math.round(m.reference.heading)} + padding ${2 * CELL_PADDING} + tile ${Math.round(m.reference.tile)} + badge ${Math.round(m.reference.badge * 10) / 10} + caption ${Math.round(m.reference.caption * 10) / 10}; width term ${Math.round(m.sectionWidth * VISIBLE_OF_SECTION_WIDTH)}; ${Math.round(free)} free below the caption), ${m.tiles.length} tiles in ${rows} row${rows === 1 ? '' : 's'}${splits.length ? `, split across a wrap: ${splits.join(', ')}` : ''}`);
      if (bound > 0 && Math.abs(m.visibleRadius - bound) > 1.5) bad.push(`${c.n} images @${w}: disc radius ${m.visibleRadius.toFixed(1)}, §60 and §59 give ${bound.toFixed(1)} (sized ${sized.toFixed(1)} against the stated reference ${m.reference.reference.toFixed(1)}, ${free.toFixed(1)} free below the caption)`);
      if (bound <= 0 && (m.discState !== 'not-drawn' || m.visibleRadius > 0)) bad.push(`${c.n} images @${w}: no free height below the caption, so the disc is not drawn (§59); it is ${m.discState} at ${m.visibleRadius.toFixed(1)}`);
      if (bound > 0 && m.discState !== 'drawn') bad.push(`${c.n} images @${w}: the disc should be drawn at ${bound.toFixed(1)} and says ${m.discState}`);
      if (m.headings !== 0) bad.push(`${c.n} images @${w}: ${m.headings} group heading(s); §56 drops them`);
      if (c.n > 1 && m.grids !== 1) bad.push(`${c.n} images @${w}: ${m.grids} grids, not one`);
      if (m.tiles.length !== c.n - 1) bad.push(`${c.n} images @${w}: ${m.tiles.length} tiles for ${c.n - 1} non-cover images`);
      const order = ['back', 'label', 'matrix', 'other'];
      const seen = m.tiles.map((t) => order.indexOf(t.type ?? 'other'));
      if (seen.some((v, i) => i > 0 && v < seen[i - 1])) bad.push(`${c.n} images @${w}: tiles out of type order: ${m.tiles.map((t) => t.type).join(', ')}`);
      if (m.tiles.some((t) => t.badge === '')) bad.push(`${c.n} images @${w}: a tile without its badge`);
      /* §59: the disc gives way to its caption by size, so no glyph of any size sits on it. */
      for (const t of m.typeOverDisc) bad.push(`${c.n} images @${w}: type on the base-step disc, which §59 sizes below its caption: ${t}`);
      if (WRITE_CAPTURES) await page.screenshot({ path: `docs/captures/step70-images-${c.n}-${w}x${h}-h${Math.round(m.sectionHeight)}.png`, fullPage: true });
    }
  }
  for (const line of lines) console.log(line);
  expect(bad, `§56 not met:\n  ${bad.join('\n  ')}`).toEqual([]);
});
