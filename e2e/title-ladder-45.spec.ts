import { expect, test, type Page } from '@playwright/test';
import { GRID_FORK, NO_SCROLL_HEIGHT } from '../src/app/records/[id]/band-geometry';
import { TITLE_MEASURE, TITLE_STEPS, artistStep } from '../src/app/records/[id]/title-steps';
import { readSeventeen } from './seventeen';

/**
 * **§45 (step 53): the title fits the identity cell on both axes, per record,
 * at the windows the step names.**
 *
 * Asserted, because they are §45's rules: the chosen pair is one of the four;
 * the ladder's supply is the rendered track's inner height and its measure the
 * track's width; no line of the rendered title exceeds the measure at any pair
 * above the smallest; the artist sets on one line at every pair above the
 * smallest. Reported per record: the pair, whether a word breaks (a line wider
 * than the measure, possible only at 72), the artist's line count, and whether
 * the artist lowered the title. Then §18's fork: the cell's width and the
 * chosen pair at 1439 and 1440.
 *
 * On 29 Sep, before this, Gaucho set 512 wide at 144 in a 412 box and every
 * one-word title took 144 whatever the cell was; the ladder read a constant
 * 510 for supply at every window height.
 */
const PASSWORD = process.env.E2E_PASSWORD ?? 'test-password-for-e2e';
async function login(page: Page) {
  await page.goto('/login');
  await page.locator('form[data-hydrated="true"]').waitFor({ timeout: 15_000 });
  await page.getByLabel('Password').pressSequentially(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL('/');
}

const WINDOWS: Array<[number, number]> = [[393, 844], [768, NO_SCROLL_HEIGHT], [1000, NO_SCROLL_HEIGHT], [1435, NO_SCROLL_HEIGHT], [GRID_FORK, NO_SCROLL_HEIGHT], [GRID_FORK, 1200], [1480, NO_SCROLL_HEIGHT]];
/* Derived here from the steps, so the spec reads against the ladder that existed before §45 too. */
const TITLE_PAIRS = TITLE_STEPS.map((title) => ({ title, artist: artistStep(title) }));
const SMALLEST = TITLE_PAIRS[TITLE_PAIRS.length - 1];

type Reading = {
  ladder: { supply: number; measure: number; chosen: number; pair: { title: number; artist: number }; artistLowered: boolean; steps: Array<{ size: number; widest: number; artistLines: number }> };
  trackH: number; trackW: number; cellW: number; titleWidest: number; titleLines: number; artistLines: number; artistSize: number;
};

const READ = () => {
  const R = (el: Element) => el.getBoundingClientRect();
  const holder = document.querySelector<HTMLElement>('[data-title-step][data-ladder]');
  const cell = document.querySelector<HTMLElement>('[data-cell="identity-content"]');
  const track = document.querySelector<HTMLElement>('[data-track="content"]');
  const title = document.querySelector<HTMLElement>('[data-field="title"]');
  const artist = document.querySelector<HTMLElement>('[data-field="artist"]');
  if (!holder || !cell || !track || !title || !artist) return null;
  const cs = getComputedStyle(cell);
  const lineRects = (el: Element) => { const out: DOMRect[] = []; const walk = (n: Node) => { if (n.nodeType === 3) { const rg = document.createRange(); rg.selectNodeContents(n); for (const x of rg.getClientRects()) if (x.width > 0) out.push(x); } else n.childNodes.forEach(walk); }; walk(el); return out; };
  const rects = lineRects(title);
  return {
    ladder: JSON.parse(holder.getAttribute('data-ladder') ?? '{}'),
    trackH: Math.round((cell.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom)) * 10) / 10,
    trackW: track.clientWidth,
    cellW: Math.round(R(cell).width * 10) / 10,
    titleWidest: Math.round(Math.max(0, ...rects.map((x) => x.width)) * 10) / 10,
    titleLines: new Set(rects.map((x) => Math.round(x.top))).size,
    artistLines: new Set(lineRects(artist).map((x) => Math.round(x.top))).size,
    artistSize: parseFloat(getComputedStyle(artist).fontSize),
  };
};

test('§45: the title fits the identity cell on both axes on every record at every named window, and the fork is re-measured', async ({ page }) => {
  test.setTimeout(900_000);
  await login(page);
  const rows = readSeventeen();
  const bad: string[] = [];
  const report: string[] = [];
  let lowered = 0; let breaks = 0; let readings = 0;
  for (const [w, h] of WINDOWS) {
    await page.setViewportSize({ width: w, height: h });
    const line: string[] = [];
    for (const r of rows) {
      await page.goto(`/records/${r.id}`);
      await page.locator('[data-title-step][data-ladder]').waitFor({ timeout: 20_000 });
      await page.evaluate(() => document.fonts.ready);
      await page.waitForTimeout(400);
      const m = (await page.evaluate(READ)) as Reading | null;
      if (m === null) { bad.push(`${r.title} @${w}x${h}: no ladder`); continue; }
      readings += 1;
      const where = `${r.title.split(':')[0]} @${w}x${h}`;
      const pair = m.ladder.pair;
      if (!TITLE_PAIRS.some((p) => p.title === pair?.title && p.artist === pair?.artist)) bad.push(`${where}: pair ${JSON.stringify(pair)} is not one of the four`);
      if (Math.abs(m.ladder.supply - m.trackH) > 1) bad.push(`${where}: supply ${m.ladder.supply} is not the rendered track's inner height ${m.trackH}`);
      if (Math.abs(m.ladder.measure - m.trackW) > 1) bad.push(`${where}: measure ${m.ladder.measure} is not the rendered track's width ${m.trackW}`);
      if (Math.abs(m.artistSize - pair.artist) > 0.5) bad.push(`${where}: the artist renders at ${m.artistSize}, not the pair's ${pair.artist}`);
      const atSmallest = pair.title === SMALLEST.title;
      const wordBreaks = m.titleWidest > m.trackW + 0.5;
      if (wordBreaks) { breaks += 1; if (!atSmallest) bad.push(`${where}: a line sets ${m.titleWidest} wide in a ${m.trackW} measure at ${pair.title} (§45: refused whatever its height)`); }
      if (m.artistLines > 1 && !atSmallest) bad.push(`${where}: the artist sets on ${m.artistLines} lines at ${pair.artist} (§45: one line at every pair above 72/40)`);
      if (m.ladder.artistLowered) lowered += 1;
      line.push(`${r.title.split(':')[0]} ${pair.title}/${pair.artist}${pair.title === SMALLEST.title ? ' FLOOR' : ''}${wordBreaks ? ' BREAKS' : ''}${m.artistLines > 1 ? ` artist×${m.artistLines}` : ''}${m.ladder.artistLowered ? ' lowered' : ''}`);
    }
    report.push(`${w} × ${h}: ${line.join(' · ')}`);
  }
  /*
    §48 (step 56): the identity is 520 from 960 to 1439 with padding taking the
    extra 40, so the measure is 443 at every width from 480 to 1440 and the pair
    does not change across 959 → 960 or 1439 → 1440. "A record whose pair
    changes across either is a build defect, not a decision." Asserted. The
    upper forks, 1679 → 1680 and 1919 → 1920, are measured and reported only:
    §49 ruled them from the nine and four measured at step 56.
  */
  const FORKS: Array<[number, number]> = [[959, 960], [GRID_FORK - 1, GRID_FORK], [1679, 1680], [1919, 1920]];
  /* §49 (step 57): the padding absorbs the stretch above the fork too, so the upper forks are asserted as well; before the build nine records changed pair across 1679 → 1680 and four across 1919 → 1920. */
  const ASSERTED = new Set([959, 960, GRID_FORK - 1, GRID_FORK, 1679, 1680, 1919, 1920]);
  const pairAt = new Map<number, Map<string, { pair: string; cell: number; measure: number }>>();
  for (const w of [...new Set(FORKS.flat())]) {
    await page.setViewportSize({ width: w, height: NO_SCROLL_HEIGHT });
    const at = new Map<string, { pair: string; cell: number; measure: number }>();
    for (const r of rows) {
      await page.goto(`/records/${r.id}`);
      await page.locator('[data-title-step][data-ladder]').waitFor({ timeout: 20_000 });
      await page.evaluate(() => document.fonts.ready);
      await page.waitForTimeout(400);
      const m = (await page.evaluate(READ)) as Reading | null;
      if (m !== null) at.set(r.title, { pair: `${m.ladder.pair.title}/${m.ladder.pair.artist}`, cell: m.cellW, measure: m.trackW });
    }
    pairAt.set(w, at);
  }
  const fork: string[] = [];
  for (const [a, b] of FORKS) {
    const A = pairAt.get(a); const B = pairAt.get(b);
    if (!A || !B) continue;
    const any = [...A.values()][0]; const anyB = [...B.values()][0];
    const changed = rows.filter((r) => A.get(r.title)?.pair !== B.get(r.title)?.pair).map((r) => `${r.title.split(':')[0]} ${A.get(r.title)?.pair} → ${B.get(r.title)?.pair}`);
    const atFloor = rows.filter((r) => A.get(r.title)?.pair === '72/40' && B.get(r.title)?.pair === '72/40').length;
    fork.push(`${a} → ${b} (cell ${any?.cell} → ${anyB?.cell}, measure ${any?.measure} → ${anyB?.measure}): ${changed.length ? changed.join(', ') : 'no record changes pair'}; ${atFloor} at the 72/40 floor on both sides`);
    if (ASSERTED.has(a) && ASSERTED.has(b)) for (const c of changed) bad.push(`§48: a pair changes across ${a} → ${b}: ${c}`);
  }
  console.log(`  §45 LADDER on the seventeen (${readings} readings): artist lowered the title on ${lowered}; word breaks on ${breaks}\n  ${report.join('\n  ')}\n  FORKS:\n  ${fork.join('\n  ')}`);
  expect(readings, 'the report has subjects').toBe(rows.length * WINDOWS.length);
  expect(bad, `§45 not met:\n  ${bad.join('\n  ')}`).toEqual([]);
});

/**
 * **§45's field, rendered: it fills the height the ladder leaves, between the
 * title and the pressing block, at 1440 × 900 and 1440 × 1200.** The ladder
 * is quantised, so a leftover always remains; at 1440 × 1200 it is large.
 * Provisional until Adam's capture rules on it; this holds the geometry.
 */
/**
 * §50 and §52 (step 58): the tint field's height is the smallest of the gap,
 * the title stack and the construction's MINIMUM ink over the field's width,
 * and a field past 4 : 1 is not drawn. "The tint field is drawn only where it
 * can be both a plane and lighter than the construction: its area is at most
 * the construction's ink, and its aspect at most 4 : 1; where either fails,
 * the gap is paper." The floor is judged on the RENDERED height (step 58's
 * wording), which this holds on the three records where the cap's own aspect
 * would say the same thing for a different reason, and on the three where it
 * would say the opposite.
 *
 * Ink is counted at alpha 0.5: the page's figure is a point sample at the
 * viewBox's pixel centres (`ink.ts`), and this test rasterises the same SVG
 * on a canvas and holds the two to half a point. The cap is served on the
 * field by the server, from the record's own scene.
 */
const FIELD_WIDTH = TITLE_MEASURE;
type FieldReading = { pair: { title: number; artist: number }; state: string | null; term: string | null; gap: number; stack: number; cap: number; ink: number; aspect: number; height: number; width: number; bottom: number; pressingTop: number; trackW: number; runPresent: boolean; canvasInk: number; minInkArea: number };
const readField = (page: Page) => page.evaluate(async (): Promise<FieldReading | null> => {
  const R = (el: Element) => el.getBoundingClientRect();
  const track = document.querySelector<HTMLElement>('[data-track="content"]');
  const host = document.querySelector<HTMLElement>('[data-title-step]');
  const pressing = document.querySelector<HTMLElement>('[data-block="pressing"]');
  const field = document.querySelector<HTMLElement>('[data-mark="identityField"]');
  const svg = document.querySelector<SVGSVGElement>('[data-testid="construction-still"]');
  if (!track || !host || !pressing || !field || !svg) return null;
  const ladder = JSON.parse(host.getAttribute('data-ladder') ?? '{}') as { pair: { title: number; artist: number } };
  const num = (name: string) => Number(field.getAttribute(name));
  /* The same SVG, at its viewBox's own size, on a transparent canvas: a pixel with alpha >= 128 carries a form. */
  const vb = (svg.getAttribute('viewBox') ?? '0 0 1 1').split(' ').map(Number);
  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg'); clone.setAttribute('width', String(vb[2])); clone.setAttribute('height', String(vb[3])); clone.removeAttribute('class');
  const img = new Image(); img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(new XMLSerializer().serializeToString(clone));
  await new Promise((res, rej) => { img.onload = res; img.onerror = rej; });
  const cv = document.createElement('canvas'); cv.width = vb[2]; cv.height = vb[3];
  const ctx = cv.getContext('2d'); if (!ctx) return null;
  ctx.drawImage(img, 0, 0);
  const d = ctx.getImageData(0, 0, cv.width, cv.height).data; let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i] >= 128) n += 1;
  return { pair: ladder.pair, state: field.getAttribute('data-field-state'), term: field.getAttribute('data-field-term'), gap: num('data-field-gap'), stack: num('data-field-stack'), cap: num('data-field-cap'), ink: num('data-field-ink'), aspect: num('data-field-aspect'), height: Math.round(R(field).height * 10) / 10, width: R(field).width, bottom: R(field).bottom, pressingTop: R(pressing).top, trackW: track.clientWidth, runPresent: document.querySelector('[data-field="genres"]') !== null, canvasInk: n / (cv.width * cv.height), minInkArea: num('data-field-min-ink') };
});
/** What §50 says the field should be, from the terms the page published. */
const ruled = (m: FieldReading) => {
  const terms = [['gap', m.gap], ['stack', m.stack], ['cap', m.cap]] as const;
  let term: string = terms[0][0]; let height = terms[0][1];
  for (const [t, v] of terms) if (v < height) { term = t; height = v; }
  const drawn = height > 0 && FIELD_WIDTH / height <= 4;
  return { term, height, drawn };
};

test('§50/§52: the tint field is the smallest of gap, title stack and minimum ink over its width, suppressed past 4 : 1, judged on the rendered height -- at 1440 × 900, 1440 × 1200 and 1200 × 1200', async ({ page }) => {
  test.setTimeout(900_000);
  await login(page);
  const rows = readSeventeen();
  const bad: string[] = [];
  const report: string[] = [];
  /* Step 58: the three where the gap binds below a cap that passes, and the three where the gap fails a cap that passes. */
  const GAP_UNDER_CAP: Record<string, ReadonlyArray<string>> = { 'The Best Of The Blues Project': ['1440x900', '1440x1200', '1200x1200'], 'Bitches Brew': ['1440x900'], 'Mind Games': ['1440x900'] };
  const GAP_FAILS_CAP: Record<string, ReadonlyArray<string>> = { 'The Hurdy Gurdy Man': ['1440x1200', '1200x1200'], 'Grave New World': ['1440x1200', '1200x1200'], 'On The Radio': ['1440x900', '1440x1200', '1200x1200'] };
  let readings = 0;
  for (const [w, h] of [[GRID_FORK, NO_SCROLL_HEIGHT], [GRID_FORK, 1200], [1200, 1200]] as const) {
    await page.setViewportSize({ width: w, height: h });
    const line: string[] = [];
    for (const r of rows) {
      await page.goto(`/records/${r.id}`);
      await page.locator('[data-title-step][data-ladder]').waitFor({ timeout: 20_000 });
      await page.evaluate(() => document.fonts.ready);
      await page.waitForTimeout(400);
      const m = await readField(page);
      const title = r.title.split(':')[0];
      const where = `${title} @${w}x${h}`;
      if (m === null) { bad.push(`${where}: no identity cell`); continue; }
      readings += 1;
      const want = ruled(m);
      const shown = m.state === 'drawn';
      if (shown !== want.drawn) bad.push(`${where}: field ${m.state} where the rule says ${want.drawn ? 'drawn' : 'suppressed'} (gap ${m.gap}, stack ${m.stack}, cap ${m.cap})`);
      if (m.term !== want.term) bad.push(`${where}: the page names ${m.term} as the binding term, the rule says ${want.term}`);
      if (Math.abs(m.ink - m.canvasInk) > 0.005) bad.push(`${where}: the page's ink ${m.ink} is not the rasterised ${m.canvasInk.toFixed(4)}`);
      if (shown) {
        if (Math.abs(m.height - want.height) > 0.6) bad.push(`${where}: the field is ${m.height} tall, the rule gives ${want.height.toFixed(1)}`);
        if (FIELD_WIDTH / m.height > 4) bad.push(`${where}: drawn at ${(FIELD_WIDTH / m.height).toFixed(2)} : 1, past the floor`);
        if (m.height * m.width > m.minInkArea + 1) bad.push(`${where}: the field (${Math.round(m.height * m.width)}) is larger than the construction's minimum ink (${Math.round(m.minInkArea)})`);
        if (Math.abs(m.bottom - m.pressingTop) > 1) bad.push(`${where}: the field ends ${m.bottom.toFixed(1)}, the pressing block starts ${m.pressingTop.toFixed(1)} (anchored to it until step 59)`);
        if (Math.abs(m.width - m.trackW) > 1) bad.push(`${where}: the field is ${m.width} wide, the track ${m.trackW}`);
      } else if (m.height !== 0) bad.push(`${where}: suppressed but ${m.height} tall`);
      const key = `${w}x${h}`;
      if (GAP_UNDER_CAP[title]?.includes(key)) {
        if (!(m.state === 'drawn' && m.term === 'gap' && m.height < m.cap)) bad.push(`${where}: expected drawn at its gap under a cap that does not bind (state ${m.state}, term ${m.term}, height ${m.height}, cap ${m.cap})`);
      }
      if (GAP_FAILS_CAP[title]?.includes(key)) {
        if (!(m.state === 'suppressed' && m.term === 'gap' && FIELD_WIDTH / m.cap <= 4)) bad.push(`${where}: expected suppressed by its gap under a cap that would pass (state ${m.state}, term ${m.term}, gap ${m.gap}, cap ${m.cap})`);
      }
      if (!m.runPresent) bad.push(`${where}: the genres run collapsed under the field`);
      line.push(`${title} ${m.pair.title}/${m.pair.artist}: ${shown ? `field ${m.height} (${(FIELD_WIDTH / m.height).toFixed(1)}:1, ${m.term})` : `SUPPRESSED by ${m.term} (${(FIELD_WIDTH / Math.max(want.height, 0.1)).toFixed(1)}:1)`} -- gap ${m.gap}, stack ${m.stack}, cap ${m.cap}, ink ${(m.ink * 100).toFixed(1)}%, field/min-ink ${shown ? (m.height * m.width / m.minInkArea).toFixed(2) : '--'}`);
    }
    report.push(`${w} × ${h}:\n    ${line.join('\n    ')}`);
  }
  console.log(`  §50 TINT FIELD (ink at alpha 0.5, cap at the construction's minimum):\n  ${report.join('\n  ')}`);
  expect(readings, 'the report has subjects').toBe(rows.length * 3);
  expect(bad, `§50's field not met:\n  ${bad.join('\n  ')}`).toEqual([]);
});

/**
 * §52: "the field is the same at every width and never outweighs the mark at
 * any of them." Step 58: assert every record draws or is suppressed
 * identically at 959, 960, 1439, 1440, 1679, 1680, 1919 and 1920; if any
 * differs, stop and report. Asserted at the reference height like §45's fork
 * test; the 1200 readings are reported.
 */
test('§52: every record draws or is suppressed identically at the eight fork widths', async ({ page }) => {
  test.setTimeout(900_000);
  await login(page);
  const rows = readSeventeen();
  const WIDTHS = [959, 960, GRID_FORK - 1, GRID_FORK, 1679, 1680, 1919, 1920];
  const bad: string[] = [];
  const report: string[] = [];
  for (const h of [NO_SCROLL_HEIGHT, 1200]) {
    for (const r of rows) {
      const title = r.title.split(':')[0];
      const seen: Array<{ w: number; state: string | null; term: string | null; height: number; cap: number }> = [];
      await page.setViewportSize({ width: WIDTHS[0], height: h });
      await page.goto(`/records/${r.id}`);
      await page.locator('[data-title-step][data-ladder]').waitFor({ timeout: 20_000 });
      await page.evaluate(() => document.fonts.ready);
      for (const w of WIDTHS) {
        await page.setViewportSize({ width: w, height: h });
        await page.waitForTimeout(250);
        const m = await page.evaluate(() => { const f = document.querySelector<HTMLElement>('[data-mark="identityField"]'); if (!f) return null; return { state: f.getAttribute('data-field-state'), term: f.getAttribute('data-field-term'), height: Math.round(f.getBoundingClientRect().height * 10) / 10, cap: Number(f.getAttribute('data-field-cap')) }; });
        if (m === null) { bad.push(`${title} @${w}x${h}: no field`); continue; }
        seen.push({ w, ...m });
      }
      const states = new Set(seen.map((s) => s.state));
      const caps = new Set(seen.map((s) => s.cap));
      if (caps.size !== 1) bad.push(`${title} @${h}: the cap changed with width: ${seen.map((s) => `${s.w}:${s.cap}`).join(' ')}`);
      if (h === NO_SCROLL_HEIGHT && states.size !== 1) bad.push(`${title} @${h}: STOP -- ${seen.map((s) => `${s.w}:${s.state}`).join(' ')}`);
      report.push(`${title} @${h}: ${seen.map((s) => `${s.w}:${s.state === 'drawn' ? s.height : 'supp.'}/${s.term}`).join(' ')}`);
    }
  }
  console.log(`  §52 FORK WIDTHS:\n    ${report.join('\n    ')}`);
  expect(report.length).toBe(rows.length * 2);
  expect(bad, `§52 forks:\n  ${bad.join('\n  ')}`).toEqual([]);
});
