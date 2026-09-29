import { expect, test, type Page } from '@playwright/test';
import { GRID_FORK, NO_SCROLL_HEIGHT } from '../src/app/records/[id]/band-geometry';
import { TITLE_STEPS, artistStep } from '../src/app/records/[id]/title-steps';
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
