import { expect, test, type Page } from '@playwright/test';
import { GRID_FORK, NO_SCROLL_HEIGHT } from '../src/app/records/[id]/band-geometry';
import { STEP_GAP, TITLE_STEPS, artistStep } from '../src/app/records/[id]/title-steps';
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
      line.push(`${r.title.split(':')[0]} ${pair.title}/${pair.artist}${wordBreaks ? ' BREAKS' : ''}${m.artistLines > 1 ? ` artist×${m.artistLines}` : ''}${m.ladder.artistLowered ? ' lowered' : ''}`);
    }
    report.push(`${w} × ${h}: ${line.join(' · ')}`);
  }
  const fork: string[] = [];
  for (const w of [GRID_FORK - 1, GRID_FORK]) {
    await page.setViewportSize({ width: w, height: NO_SCROLL_HEIGHT });
    const line: string[] = [];
    for (const r of rows) {
      await page.goto(`/records/${r.id}`);
      await page.locator('[data-title-step][data-ladder]').waitFor({ timeout: 20_000 });
      await page.evaluate(() => document.fonts.ready);
      await page.waitForTimeout(400);
      const m = (await page.evaluate(READ)) as Reading | null;
      if (m !== null) line.push(`${r.title.split(':')[0]} cell ${m.cellW} measure ${m.trackW} ${m.ladder.pair.title}/${m.ladder.pair.artist}`);
    }
    fork.push(`${w}: ${line.join(' · ')}`);
  }
  console.log(`  §45 LADDER on the seventeen (${readings} readings): artist lowered the title on ${lowered}; word breaks on ${breaks}\n  ${report.join('\n  ')}\n  §18 FORK:\n  ${fork.join('\n  ')}`);
  expect(readings, 'the report has subjects').toBe(rows.length * WINDOWS.length);
  expect(bad, `§45 not met:\n  ${bad.join('\n  ')}`).toEqual([]);
});

/**
 * **§45's field, rendered: it fills the height the ladder leaves, between the
 * title and the pressing block, at 1440 × 900 and 1440 × 1200.** The ladder
 * is quantised, so a leftover always remains; at 1440 × 1200 it is large.
 * Provisional until Adam's capture rules on it; this holds the geometry.
 */
test('§45: the tint field fills the leftover between the title and the pressing block, at 1440 × 900 and 1440 × 1200', async ({ page }) => {
  test.setTimeout(600_000);
  await login(page);
  const rows = readSeventeen();
  const bad: string[] = [];
  const seen: string[] = [];
  let readings = 0;
  for (const h of [NO_SCROLL_HEIGHT, 1200]) {
    await page.setViewportSize({ width: GRID_FORK, height: h });
    for (const r of rows) {
      await page.goto(`/records/${r.id}`);
      await page.locator('[data-title-step][data-ladder]').waitFor({ timeout: 20_000 });
      await page.waitForTimeout(300);
      const m = await page.evaluate(() => {
        const R = (el: Element) => el.getBoundingClientRect();
        const track = document.querySelector<HTMLElement>('[data-track="content"]');
        const title = document.querySelector<HTMLElement>('[data-block="title"]');
        const pressing = document.querySelector<HTMLElement>('[data-block="pressing"]');
        const field = document.querySelector<HTMLElement>('[data-mark="identityField"]');
        if (!track || !title || !pressing) return null;
        const f = field === null ? null : R(field);
        const outer = (el: Element) => { const b = R(el); const s = getComputedStyle(el); return b.height + parseFloat(s.marginTop) + parseFloat(s.marginBottom); };
        const eyebrow = document.querySelector<HTMLElement>('[data-field="eyebrow"]');
        const ladder = JSON.parse(document.querySelector('[data-title-step]')?.getAttribute('data-ladder') ?? '{}') as { below: number; pair: { title: number; artist: number } };
        const belowRendered = (eyebrow === null ? 0 : outer(eyebrow)) + outer(pressing);
        return { ladderBelow: ladder.below, belowRendered, titleBottom: R(title).bottom, pressingTop: R(pressing).top, trackW: track.clientWidth, runPresent: document.querySelector('[data-field="genres"]') !== null, field: f === null ? null : { top: f.top, bottom: f.bottom, width: f.width, height: f.height, bg: getComputedStyle(field as HTMLElement).backgroundColor } };
      });
      const where = `${r.title.split(':')[0]} @1440x${h}`;
      if (m === null) { bad.push(`${where}: no identity cell`); continue; }
      readings += 1;
      const leftover = m.pressingTop - m.titleBottom;
      if (m.field === null) { bad.push(`${where}: no tint field (leftover ${leftover.toFixed(1)})`); continue; }
      /* The field starts after the ladder's own gap, which its arithmetic reserves between the blocks; flush, it sat under the artist's inline box. */
      if (Math.abs(m.field.top - (m.titleBottom + STEP_GAP)) > 1) bad.push(`${where}: the field starts ${m.field.top.toFixed(1)}, the title block ends ${m.titleBottom.toFixed(1)} and the ladder's gap is ${STEP_GAP}`);
      if (Math.abs(m.field.bottom - m.pressingTop) > 1) bad.push(`${where}: the field ends ${m.field.bottom.toFixed(1)}, the pressing block starts ${m.pressingTop.toFixed(1)}`);
      if (Math.abs(m.field.width - m.trackW) > 1) bad.push(`${where}: the field is ${m.field.width} wide, the track ${m.trackW}`);
      if (m.field.bg === 'rgba(0, 0, 0, 0)') bad.push(`${where}: the field has no fill`);
      /* The field is the gap made visible, not demand: the genres run must not yield to it (found 29 Sep: the run's measure summed the grown field and collapsed on every record with room). */
      if (!m.runPresent) bad.push(`${where}: the genres run collapsed under the field`);
      /* And the ladder's demand does not count it either: `below` is the eyebrow plus the pressing block, not the field (found 29 Sep by the fork table: every record read 72/40 with the field summed in). */
      if (Math.abs(m.ladderBelow - m.belowRendered) > 1.5) bad.push(`${where}: the ladder's below is ${m.ladderBelow} where the eyebrow plus pressing block render ${m.belowRendered.toFixed(1)} -- the field is being counted as demand`);
      seen.push(`${r.title.split(':')[0]} ${Math.round(m.field.height)}`);
    }
  }
  console.log(`  §45 TINT FIELD heights (1440 × 900 then × 1200): ${seen.join(' · ')}`);
  expect(readings, 'the report has subjects').toBe(rows.length * 2);
  expect(bad, `§45's field not met:\n  ${bad.join('\n  ')}`).toEqual([]);
});
