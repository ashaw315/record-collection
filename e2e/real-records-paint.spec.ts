import { expect, test, type Page } from '@playwright/test';
import { existsSync, readFileSync } from 'node:fs';
import { registerCleanup, trackArtist } from './cleanup';
import { getTestDb } from '../test/helpers/db';
import { seedImage, seedRecordWithId } from './seed';
import { sql } from 'drizzle-orm';
import { REAL_RECORD_IDS } from '../src/app/records/[id]/real-records';
import { NO_SCROLL_HEIGHT } from '../src/app/records/[id]/band-geometry';

registerCleanup();

/**
 * **Every real record, at the seven reference widths: what paints in front
 * of type.** Ornament is a function of the record id (§21), so one fixture
 * says nothing about the ornament layer across the collection; the
 * seventeen ids in `real-records.ts` are rendered with one rich content
 * shape and, where the collection has one, the record's real About
 * (`docs/captures/abouts.json`; four records). Everything else on these rows
 * is a stand-in -- the ids and the About texts are the real part.
 *
 * Paint is enumerated by what it IS (a fill, no text), not by a list: the
 * first version enumerated `[data-ornament]` and could not see §5.1's arcs
 * (`docs/findings/a-check-whose-subject-is-a-list.md`). The hit test scrolls
 * each point into view, because elementFromPoint answers for the viewport
 * only.
 *
 * Asserted: §26's figures and flats are BEHIND type in every overlap, and
 * §5.1's planes -- sized against their host, then tested against type
 * (§34) -- are never in front. §34: "the planes survive below the fork
 * wherever a two-thirds-of-host plane clears the cell's text, and Code
 * reports how many do" -- the drawn count per width is printed.
 */
const PASSWORD = process.env.E2E_PASSWORD ?? 'test-password-for-e2e';
async function login(page: Page) {
  await page.goto('/login');
  await page.locator('form[data-hydrated="true"]').waitFor({ timeout: 15_000 });
  await page.getByLabel('Password').pressSequentially(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL('/');
}
async function post(page: Page, path: string, data: unknown) { const j = await (await page.request.post(path, { data })).json(); return { id: (j.id ?? j.error?.existingId) as string }; }

const READ = () => {
  const px = (n: number) => Math.round(n * 10) / 10;
  const R = (el: Element) => el.getBoundingClientRect();
  const hit = (a: DOMRect, b: DOMRect) => a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1;
  const name = (el: Element) => ['data-field', 'data-mark', 'data-cell', 'data-section'].map((k) => el.getAttribute(k)).filter(Boolean)[0] ?? el.tagName.toLowerCase();
  /* Text leaves: elements with direct text, no children with text -- what a reader reads. */
  const textLeaves = Array.from(document.querySelectorAll<HTMLElement>('main *')).filter((el) => {
    if (el.closest('[data-ornament]') !== null || el.getAttribute('aria-hidden') === 'true' || el.closest('[aria-hidden="true"]') !== null) return false;
    if (['SCRIPT', 'STYLE', 'SVG', 'POLYGON', 'CIRCLE', 'BUTTON', 'TEXTAREA', 'SELECT', 'INPUT'].includes(el.tagName)) return false;
    const own = Array.from(el.childNodes).some((n) => n.nodeType === Node.TEXT_NODE && (n.textContent ?? '').trim() !== '');
    return own && R(el).width > 0 && R(el).height > 0;
  });
  /*
    **Paint, enumerated by what it IS, not by a list.** `[data-ornament]`
    was the set before, and `aboutArc`/`provenanceArc` -- §5.1 marks with a
    fill and no such attribute -- were outside it. A painted element is any
    element under main that draws a fill (a background, an image, an SVG)
    and carries no text of its own.
  */
  const paints = Array.from(document.querySelectorAll<HTMLElement>('main *')).filter((el) => {
    if (R(el).width <= 0 || R(el).height <= 0) return false;
    if ((el.textContent ?? '').trim() !== '') return false;
    if (el.closest('svg') !== null && el.tagName !== 'svg') return false;
    const cs = getComputedStyle(el);
    return el.tagName === 'IMG' || el.tagName === 'svg' || (cs.backgroundColor !== 'rgba(0, 0, 0, 0)' && cs.backgroundColor !== 'transparent') || cs.backgroundImage !== 'none';
  });
  const kindOf = (o: HTMLElement) => o.getAttribute('data-diagonal') !== null ? `diagonal/${o.getAttribute('data-diagonal')}` : o.getAttribute('data-mark') !== null ? `mark/${o.getAttribute('data-mark')}` : o.getAttribute('data-ornament') !== null ? `${o.getAttribute('data-ornament')}${o.getAttribute('data-flat') ? '/' + o.getAttribute('data-flat') : ''}${o.getAttribute('data-figure') ? '/' + o.getAttribute('data-figure') : ''}` : o.getAttribute('data-cover') !== null ? 'cover' : o.getAttribute('data-line') !== null ? `line/${o.getAttribute('data-line')}` : o.tagName.toLowerCase();
  const allKinds = [...new Set(paints.map(kindOf))];
  /* Paint in FRONT of text: hit-test at the overlap's centre with EVERY paint's pointer events on. */
  const savedPE = paints.map((o) => o.style.pointerEvents);
  for (const o of paints) o.style.pointerEvents = 'auto';
  const over: string[] = [];
  for (const o of paints) {
    for (const t of textLeaves) {
      if (o.contains(t) || t.contains(o)) continue;
      window.scrollTo(0, 0);
      const ob = R(o); const tb = R(t);
      if (!hit(ob, tb)) continue;
      /* Scrolled into view first: elementFromPoint answers for the viewport only, and null read as "behind". */
      const px_ = Math.max(ob.left, tb.left) + (Math.min(ob.right, tb.right) - Math.max(ob.left, tb.left)) / 2 + window.scrollX;
      const py_ = Math.max(ob.top, tb.top) + (Math.min(ob.bottom, tb.bottom) - Math.max(ob.top, tb.top)) / 2 + window.scrollY;
      window.scrollTo(0, Math.max(0, py_ - window.innerHeight / 2));
      const topEl = document.elementFromPoint(px_ - window.scrollX, py_ - window.scrollY);
      const inFront = topEl !== null && (topEl === o || o.contains(topEl));
      over.push(`${kindOf(o)} ${inFront ? 'IN FRONT of' : 'behind'} "${(t.textContent ?? '').trim().slice(0, 28)}" (${name(t.closest('[data-cell],[data-section]') ?? t)})`);
    }
  }
  paints.forEach((o, i) => { o.style.pointerEvents = savedPE[i]; });
  window.scrollTo(0, 0);
  /* The specific items. */
  const about = document.querySelector('[data-field="about"]') as HTMLElement | null;
  const aboutLines = about === null ? null : Math.round(R(about).height / parseFloat(getComputedStyle(about).lineHeight));
  const more = document.querySelector('[data-field="about-more"]') !== null;
  const noteCell = document.querySelector('[data-cell="note"]') as HTMLElement | null;
  const foot = noteCell?.querySelector('[data-field="image-count"]') as HTMLElement | null;
  const footCut = noteCell !== null && foot !== null ? px(R(foot).bottom - (R(noteCell).top + noteCell.clientHeight)) : null;
  const marketLabel = document.querySelector('[data-section="market"] [data-cell="label"] > div') as HTMLElement | null;
  const marketSec = document.querySelector('[data-section="market"]') as HTMLElement | null;
  const still = document.querySelector('[data-cell="still"]') as HTMLElement | null;
  const sleeve = document.querySelector('[data-cell="sleeve"]') as HTMLElement | null;
  const cover = document.querySelector('[data-cover]') as HTMLElement | null;
  const planes = Array.from(document.querySelectorAll<HTMLElement>('[data-plane]')).map((p) => `${p.getAttribute('data-mark')}:${p.getAttribute('data-plane')}`);
  return {
    allKinds, planes, over, aboutLines, more,
    footCut,
    market: marketSec === null ? null : { sectionW: px(R(marketSec).width), col: getComputedStyle(marketSec).gridColumn, labelW: marketLabel === null ? null : px(R(marketLabel).width), labelLines: marketLabel === null ? null : Math.round(R(marketLabel).height / parseFloat(getComputedStyle(marketLabel).lineHeight)) },
    still: still === null ? 'absent' : getComputedStyle(still).display, sleeve: sleeve === null ? 'absent' : getComputedStyle(sleeve).display, cover: cover === null ? 'absent' : `${px(R(cover).width)}x${px(R(cover).height)} ${getComputedStyle(cover).display}`,
  };
};

test('every real record at seven widths: §26 ornaments behind type everywhere; §5.1 planes never in front, and how many are drawn (§34)', async ({ page }) => {
  test.setTimeout(900_000);
  /*
    **The real rows, from Adam's database.** `docs/captures/real-records.json`
    is the output of a read-only query on the collection: every record's id,
    title, About and journal entries. Those four fields are real here; the
    pressing, prices, genres and cover are one stand-in shape. Without the
    file the step §34/32 asks for -- aboutArc on the REAL no-About records --
    cannot run, and the test says so rather than measuring stand-ins as if
    they were the collection. (An earlier version mapped four About texts
    onto ids by a guessed title map, and three of the four ids were wrong:
    ornament is a function of the id, so those counts were of the right
    texts on the wrong records.)
  */
  const REAL = 'docs/captures/real-records.json';
  type RealRow = { id: string; title: string; about: string | null; entries: Array<{ entryDate: string; note: string }> };
  const rows: RealRow[] | null = existsSync(REAL) ? JSON.parse(readFileSync(REAL, 'utf8')) : null;
  if (rows === null) console.log(`\nSTEP 32 UNEXECUTABLE: ${REAL} is absent -- seeding REAL_RECORD_IDS with one stand-in shape and a journal entry on every row; the real no-About measurement did NOT run.`);
  const records: RealRow[] = rows ?? REAL_RECORD_IDS.map((id) => ({ id, title: 'Loss Of Life', about: null, entries: [{ entryDate: '2026-09-20', note: 'Played it right through.' }] }));
  const hasAbout = (r: RealRow) => r.about !== null && r.about.trim() !== '';
  const titleOf = new Map(records.map((r) => [r.id, r.title]));
  const aboutFor: Record<string, string> = Object.fromEntries(records.filter(hasAbout).map((r) => [r.id, r.title]));
  await login(page);
  const artist = await post(page, '/api/artists', { name: 'MGMT' });
  trackArtist(artist.id);
  const label = await post(page, '/api/labels', { name: 'Mom + Pop' });
  const pressing = await post(page, '/api/pressings', { catalogNumber: 'MP731', matrixRunout: '269346E1 1701690 MP731-A JN-H STERLING', yearPressed: 2024, countryPressed: 'UK, Europe & US', pressingPlant: 'GZ Media', colorVariant: 'Orange [Tangerine]' });
  const genres: string[] = [];
  for (const g of ['Electronic', 'Indie Pop', 'Indie Rock', 'Pop', 'Psychedelic Rock', 'Rock']) genres.push((await post(page, '/api/genres', { name: g })).id);
  const db = getTestDb();
  const ids: string[] = [];
  for (const r of records) {
    const existing = await db.execute<{ id: string }>(sql`SELECT id FROM records WHERE id = ${r.id}::uuid`);
    if (existing.rows.length === 0) {
      await seedRecordWithId({ id: r.id, artistId: artist.id, title: r.title, labelId: label.id, pressingId: pressing.id, releaseYear: 2024, genreIds: genres });
      await seedImage({ recordId: r.id, imageType: 'cover' });
      const aboutText = hasAbout(r) ? (r.about as string).trim() : null;
      await db.execute(sql`UPDATE records SET spine_colour = ${'#a25829'}, purchase_price = 12.99, notes = 'Bought on the Saturday.', snippet = ${aboutText}, snippet_edited_at = ${aboutText === null ? null : new Date()} WHERE id = ${r.id}::uuid`);
      await db.execute(sql`INSERT INTO price_history (record_id, price, price_type, source) VALUES (${r.id}::uuid, 12.99, 'used', 'discogs'), (${r.id}::uuid, 13.42, 'used', 'discogs')`);
      for (const e of r.entries) await page.request.post(`/api/records/${r.id}/journal`, { data: { entryDate: e.entryDate, note: e.note } });
    }
    ids.push(r.id);
  }
  const byRecord: string[] = [];
  const widths = (process.env.QA_WIDTHS ?? '390,480,960,1000,1440,1680,1920').split(',').map(Number);
  const kindsSeen = new Set<string>();
  let pairs = 0; const overCount: Record<string, number> = {}; const overSamples: string[] = [];
  const ornamentInFront: string[] = []; const arcsInFront: string[] = []; const diagonalInFront: string[] = [];
  const drawn: Record<string, number> = {};
  const specifics: string[] = [];
  for (const id of ids) {
    for (const w of widths) {
      await page.setViewportSize({ width: w, height: w <= 480 ? 844 : NO_SCROLL_HEIGHT });
      await page.goto(`/records/${id}`);
      await page.locator('[data-field="eyebrow"]').waitFor({ timeout: 20_000 });
      await page.waitForTimeout(650);
      const m = await page.evaluate(READ);
      pairs += 1;
      for (const k of m.allKinds) kindsSeen.add(`${w}: ${k}`);
      for (const pl of m.planes) drawn[`${w} ${pl}`] = (drawn[`${w} ${pl}`] ?? 0) + 1;
      if (w === 1440) { const r = records.find((x) => x.id === id); byRecord.push(`${(titleOf.get(id) ?? id).slice(0, 30).padEnd(30)} about=${r && hasAbout(r) ? 'yes' : 'no '} entries=${r ? r.entries.length : 0}  aboutArc=${m.planes.find((p) => p.startsWith('aboutArc:'))?.slice(9) ?? 'not rendered (cell empty)'}`); }
      for (const o of m.over) { const k = `${w}: ${o.replace(/"[^"]*"/, '"…"')}`; overCount[k] = (overCount[k] ?? 0) + 1; if (overSamples.length < 60 && !overSamples.some((s) => s.endsWith(`: ${o}`) && s.startsWith(`${w} `))) overSamples.push(`${w} ${id.slice(0, 8)}: ${o}`); }
      for (const o of m.over) if (o.includes(' IN FRONT of ')) (o.startsWith('mark/') ? arcsInFront : o.startsWith('diagonal/') ? diagonalInFront : ornamentInFront).push(`${w} ${id.slice(0, 8)}: ${o}`);
      if (aboutFor[id] && (w === 1000 || w === 1440 || w === 1680)) specifics.push(`ABOUT ${aboutFor[id]} @${w}: ${m.aboutLines} lines, more↓=${m.more}, foot past cell by ${m.footCut}`);
      if (id === ids[0] && (w === 1000 || w === 960 || w === 480 || w === 390 || w === 1440)) specifics.push(`BANDS @${w}: still=${m.still} sleeve=${m.sleeve} cover=${m.cover}; market=${JSON.stringify(m.market)}`);
    }
  }
  console.log(`\nRECORD-WIDTH PAIRS EXAMINED: ${pairs} (${ids.length} records x ${widths.length} widths)`);
  console.log(`\nPAINT KINDS ENUMERATED (by fill-and-no-text, per width):`); for (const w of widths) console.log(`  ${w}: ${[...kindsSeen].filter((k) => k.startsWith(`${w}: `)).map((k) => k.slice(String(w).length + 2)).sort().join(', ')}`);
  console.log(`\nPAINT OVER TEXT — occurrences by width and kind (count over the 17 records):`);
  for (const [k, n] of Object.entries(overCount).sort()) console.log(`  ${n.toString().padStart(3)}  ${k}`);
  console.log(`\nORNAMENT OVER TEXT — one sample per (width, ornament, cell):`); overSamples.forEach((s) => console.log('  ' + s));
  console.log(`\nSPECIFICS:`); specifics.forEach((s) => console.log('  ' + s));
  console.log(`\nSTEP 32 -- aboutArc on the real records at 1440 (${rows === null ? 'STAND-INS: not the real rows' : 'real id, title, About and journal entries; other fields one stand-in shape'}):`); byRecord.forEach((s) => console.log('  ' + s));
  console.log(`\nPLANES DRAWN vs NOT DRAWN (§34), per width over the ${ids.length} records (${rows === null ? 'stand-in rows' : 'real About and entries'}; real About on ${Object.keys(aboutFor).length}, journal entries on ${records.filter((r) => r.entries.length > 0).length}; a record with neither shows the diagonal and renders no arc):`); for (const [k, n] of Object.entries(drawn).sort()) console.log(`  ${String(n).padStart(3)}  ${k}`);
  console.log(`\nIN FRONT OF TYPE: §26 ornaments ${ornamentInFront.length}, §5.1 arcs ${arcsInFront.length}, §6 diagonals ${diagonalInFront.length} (box over the label; §6: 'Label persists, one diagonal fills the body box'), over ${pairs} record-width pairs`);
  expect(pairs, 'every record at every width').toBe(ids.length * widths.length);
  expect(ornamentInFront, '§26: figures and flats sit behind content').toEqual([]);
  expect(arcsInFront, '§34: a sized plane that still covers type is not drawn').toEqual([]);
  /* §6: "Label persists, one diagonal fills the body box" -- the diagonal's box holds no type. Measured on the real rows: 12 of 17 have neither About nor entry, and the diagonal was inset-0 of the cell, over the label. */
  expect(diagonalInFront, '§6: the diagonal fills the body box, not the label').toEqual([]);
});
