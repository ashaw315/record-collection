import { expect, test, type Page } from '@playwright/test';
import { registerCleanup, trackArtist } from './cleanup';
import { getTestDb } from '../test/helpers/db';
import { seedImage } from './seed';
import { sql } from 'drizzle-orm';
import { GRID_FORK, NO_SCROLL_HEIGHT } from '../src/app/records/[id]/band-geometry';
import { fillRows, packRecordBand, packedRows, packedRules, RECORD_BAND_QUARTERS } from '../src/app/records/[id]/record-band-41';

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

/** A record whose five frame cells all carry content: pressing, matrix, year, a market figure and an About. */
async function seedFrame(page: Page): Promise<string> {
  const suffix = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;
  const artist = await post(page, '/api/artists', { name: `r41-${suffix}` });
  trackArtist(artist.id);
  const label = await post(page, '/api/labels', { name: `Mom + Pop ${suffix}` });
  const pressing = await post(page, '/api/pressings', { catalogNumber: `MP-${suffix}`, matrixRunout: '269346E1 1701690 MP731-A JN-H STERLING', yearPressed: 2024, countryPressed: 'UK, Europe & US', pressingPlant: 'GZ Media' });
  const record = await post(page, '/api/records', { title: `Frame ${suffix}`, artistId: artist.id, labelId: label.id, pressingId: pressing.id, releaseYear: 2024, notes: 'Bought on the Saturday.' });
  await seedImage({ recordId: record.id, imageType: 'cover' });
  const db = getTestDb();
  await db.execute(sql`UPDATE records SET spine_colour = ${'#a25829'}, purchase_price = 12.99, snippet = ${'Her last album for the label, and the one where the machinery starts to sound like a band. The long version of the title track runs past seventeen minutes without repeating itself.'}, snippet_edited_at = NOW() WHERE id = ${record.id}::uuid`);
  await db.execute(sql`INSERT INTO price_history (record_id, price, price_type, source) VALUES (${record.id}::uuid, 12.99, 'used', 'discogs'), (${record.id}::uuid, 13.42, 'used', 'discogs')`);
  return record.id;
}

/**
 * Every frame cell, in reading order, with the width its content needs --
 * the widest line of its text and non-ornament visuals -- and its longest
 * label, both read off the page, plus the width it was given.
 */
const cellsOf = (page: Page) =>
  page.evaluate(() => {
    const band = document.querySelector<HTMLElement>('[data-band="record"]')!;
    const bb = band.getBoundingClientRect();
    const tracks = getComputedStyle(band).gridTemplateColumns.split(' ').filter(Boolean);
    const lines = (root: Element, filter: (el: Element) => boolean) => {
      const byTop = new Map<number, number>();
      const walk = (n: Node) => {
        if (n.nodeType === 3 && (n.textContent ?? '').trim()) { const r = document.createRange(); r.selectNodeContents(n); for (const x of Array.from(r.getClientRects())) { if (x.width === 0) continue; const k = Math.round(x.top); byTop.set(k, (byTop.get(k) ?? 0) + x.width); } }
        else if (n.nodeType === 1) { const el = n as HTMLElement; const s = getComputedStyle(el); if (s.display === 'none' || s.visibility === 'hidden' || !filter(el)) return; if (el.matches('img, svg')) { const x = el.getBoundingClientRect(); byTop.set(Math.round(x.top), (byTop.get(Math.round(x.top)) ?? 0) + x.width); return; } for (const c of Array.from(n.childNodes)) walk(c); }
      };
      walk(root);
      return Math.max(0, ...byTop.values());
    };
    return {
      width: bb.width, tracks: tracks.length, trackWidth: parseFloat(tracks[0]),
      cells: Array.from(band.querySelectorAll<HTMLElement>(':scope > [data-cell]')).map((cell) => {
        const b = cell.getBoundingClientRect(); const cs = getComputedStyle(cell);
        const ink = lines(cell, (el) => el === cell || !el.matches('[data-mark], [data-ornament], [data-plane]'));
        const label = Math.max(0, ...Array.from(cell.querySelectorAll<HTMLElement>('*')).filter((el) => { const s = getComputedStyle(el); return s.textTransform === 'uppercase' && /mono/i.test(s.fontFamily) && el.children.length === 0 && (el.textContent ?? '').trim() !== ''; }).map((el) => { const r = document.createRange(); r.selectNodeContents(el); return r.getBoundingClientRect().width; }));
        return { name: cell.dataset.cell ?? '?', mark: cell.dataset.mark ?? null, x: b.left - bb.left, y: b.top - bb.top, w: b.width, h: b.height, padding: parseFloat(cs.paddingLeft), ink, label, packed: cs.getPropertyValue('--packed').trim(), ruleRight: parseFloat(cs.borderRightWidth), ruleTop: parseFloat(cs.borderTopWidth), ruleColour: cs.borderRightColor, topColour: cs.borderTopColor };
      }),
    };
  });

test('§41: from 960 to 1439 the record band packs its cells by content, a quarter at a time, in reading order, never under a label', async ({ page }) => {
  await login(page);
  const id = await seedFrame(page);
  const report: string[] = [];
  for (const width of [1000, GRID_FORK - 1]) {
    await page.setViewportSize({ width, height: NO_SCROLL_HEIGHT });
    await page.goto(`/records/${id}`);
    await page.locator('[data-band="record"] [data-cell="note"]').waitFor({ timeout: 20_000 });
    await page.waitForTimeout(700);
    const m = await cellsOf(page);
    expect(m.tracks, `${width}: four quarters of the band`).toBe(RECORD_BAND_QUARTERS);
    const quarter = m.width / RECORD_BAND_QUARTERS;
    expect(m.trackWidth, 'each a quarter').toBeCloseTo(quarter, 0);
    /* §42 (step 49): the last cell in a row takes the row's remaining width. */
    const expected = fillRows(packRecordBand({ quarter, padding: m.cells[0].padding, cells: m.cells.map((c) => ({ ink: c.ink, label: c.label })) }));
    const actual = m.cells.map((c) => Math.round(c.w / quarter));
    expect(actual, `${width}: spans from the measured content (${m.cells.map((c) => `${c.name} ink ${Math.round(c.ink)} label ${Math.round(c.label)}`).join(', ')})`).toEqual(expected);
    /* Reading order fills left to right: each row's cells sit in DOM order at rising x, and a new row starts at x 0. */
    const rows = packedRows(actual);
    rows.forEach((row) => {
      expect(m.cells[row[0]].x, `${width}: row starting with ${m.cells[row[0]].name} starts at the band's left`).toBeCloseTo(0, 0);
      for (let k = 1; k < row.length; k += 1) expect(m.cells[row[k]].x, `${m.cells[row[k]].name} follows ${m.cells[row[k - 1]].name}`).toBeCloseTo(m.cells[row[k - 1]].x + m.cells[row[k - 1]].w, 0);
      const tops = new Set(row.map((k) => Math.round(m.cells[k].y)));
      expect(tops.size, `${width}: one row`).toBe(1);
    });
    for (const c of m.cells) expect(c.w - 2 * c.padding, `${width}: ${c.name} is never narrower than its longest label (${Math.round(c.label)})`).toBeGreaterThanOrEqual(c.label - 0.5);
    /* §42 (step 49): a 1px hairline at 0.72 between packed cells in a row and across the band between rows, only between rendered cells. */
    const rules = packedRules(actual);
    m.cells.forEach((c, k) => {
      /* The note cell's right border is §5.1's journal edge, a 2px derived mark in the record's colour, not a structural rule; it is ruled to stay. */
      if (c.mark === 'journalEdge') expect(c.ruleRight, `${width}: the journal edge keeps its 2px`).toBe(2);
      else expect(c.ruleRight, `${width}: ${c.name} right rule ${rules[k].right ? 'between it and the next cell' : 'absent at the row’s end'}`).toBe(rules[k].right);
      expect(c.ruleTop, `${width}: ${c.name} top rule ${rules[k].top ? 'across the band above its row' : 'absent on the first row'}`).toBe(rules[k].top);
      if (rules[k].right) expect(c.ruleColour, 'the hairline is §W.31’s 0.72').toBe('oklch(0.72 0.004 80)');
      if (rules[k].top) expect(c.topColour, 'so is the row rule').toBe('oklch(0.72 0.004 80)');
    });
    expect(m.cells.reduce((s, c) => s + c.w, 0) / quarter, `${width}: the rows are filled, no empty grid`).toBeCloseTo(rows.length * RECORD_BAND_QUARTERS, 0);
    report.push(`${width}: ` + m.cells.map((c) => `${c.name} ${Math.round(c.w)}w ink ${Math.round(c.ink)} (${(c.ink / c.w * 100).toFixed(0)}%)`).join(' · '));
  }
  console.log(`  §41 RECORD BAND ink-to-width: ${report.join(' | ')}`);
});
