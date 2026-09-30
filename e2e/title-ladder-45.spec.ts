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
test('§49: the tint field is anchored to the pressing block, no taller than the title stack, no shorter than one artist line, and never larger than the construction -- at 1440 × 900, 1440 × 1200 and 1200 × 1200', async ({ page }) => {
  test.setTimeout(900_000);
  await login(page);
  const rows = readSeventeen();
  const bad: string[] = [];
  const report: string[] = [];
  let readings = 0;
  for (const [w, h] of [[GRID_FORK, NO_SCROLL_HEIGHT], [GRID_FORK, 1200], [1200, 1200]] as const) {
    await page.setViewportSize({ width: w, height: h });
    const line: string[] = [];
    for (const r of rows) {
      await page.goto(`/records/${r.id}`);
      await page.locator('[data-title-step][data-ladder]').waitFor({ timeout: 20_000 });
      await page.evaluate(() => document.fonts.ready);
      await page.waitForTimeout(400);
      const m = await page.evaluate(() => {
        const R = (el: Element) => el.getBoundingClientRect();
        const track = document.querySelector<HTMLElement>('[data-track="content"]');
        const host = document.querySelector<HTMLElement>('[data-title-step]');
        const pressing = document.querySelector<HTMLElement>('[data-block="pressing"]');
        const ground = document.querySelector<HTMLElement>('[data-ground]');
        const field = document.querySelector<HTMLElement>('[data-mark="identityField"]');
        const svg = document.querySelector<SVGSVGElement>('[data-testid="construction-still"]');
        if (!track || !host || !pressing || !ground || !field || !svg) return null;
        const ladder = JSON.parse(host.getAttribute('data-ladder') ?? '{}') as { pair: { title: number; artist: number } };
        const sb = R(svg); const vb = (svg.getAttribute('viewBox') ?? '0 0 1 1').split(' ').map(Number); const k = Math.min(sb.width / vb[2], sb.height / vb[3]);
        const shown = getComputedStyle(field).display !== 'none' && R(field).height > 0;
        return { pair: ladder.pair, state: field.getAttribute('data-field-state'), floor: Number(field.getAttribute('data-field-floor')), available: Number(field.getAttribute('data-field-available')), stack: Math.round(R(host).height * 10) / 10, shown, height: Math.round(R(field).height * 10) / 10, width: R(field).width, top: R(field).top, bottom: R(field).bottom, pressingTop: R(pressing).top, trackW: track.clientWidth, runPresent: document.querySelector('[data-field="genres"]') !== null, drawnW: vb[2] * k, drawnH: vb[3] * k };
      });
      const where = `${r.title.split(':')[0]} @${w}x${h}`;
      if (m === null) { bad.push(`${where}: no identity cell`); continue; }
      readings += 1;
      const expectDrawn = Math.min(m.available, m.stack) >= m.floor;
      if (m.shown !== expectDrawn) bad.push(`${where}: field ${m.shown ? 'drawn' : 'suppressed'} where the rule says ${expectDrawn ? 'drawn' : 'suppressed'} (available ${m.available}, stack ${m.stack}, floor ${m.floor})`);
      if (m.shown) {
        if (Math.abs(m.bottom - m.pressingTop) > 1) bad.push(`${where}: the field ends ${m.bottom.toFixed(1)}, the pressing block starts ${m.pressingTop.toFixed(1)} (anchored to it)`);
        if (m.height > m.stack + 1) bad.push(`${where}: the field is ${m.height} tall, taller than the title stack ${m.stack}`);
        if (m.height > m.available + 1) bad.push(`${where}: the field is ${m.height} tall, more than the ${m.available} the gap leaves after the ladder's gap`);
        if (m.height + 0.5 < m.floor) bad.push(`${where}: the field is ${m.height} tall, shorter than one artist line ${m.floor}`);
        if (Math.abs(m.width - m.trackW) > 1) bad.push(`${where}: the field is ${m.width} wide, the track ${m.trackW}`);
        /* §49: a ground may not outweigh the mark it sits beside. Stop if any field is larger than its record's construction. */
        const fieldArea = m.height * m.width; const drawnArea = m.drawnW * m.drawnH;
        if (fieldArea > drawnArea) bad.push(`${where}: STOP -- the field (${Math.round(fieldArea)}) is larger than the construction's drawn area (${Math.round(drawnArea)})`);
      }
      if (!m.runPresent) bad.push(`${where}: the genres run collapsed under the field`);
      line.push(`${r.title.split(':')[0]} ${m.pair.title}/${m.pair.artist}: ${m.shown ? `field ${m.height}` : 'SUPPRESSED'} (floor ${m.floor}, gap ${m.available}, stack ${m.stack}${m.shown ? `, area ${Math.round(m.height * m.width / 1000)}k vs construction ${Math.round(m.drawnW * m.drawnH / 1000)}k` : ''})`);
    }
    report.push(`${w} × ${h}:\n    ${line.join('\n    ')}`);
  }
  console.log(`  §49 TINT FIELD:\n  ${report.join('\n  ')}`);
  expect(readings, 'the report has subjects').toBe(rows.length * 3);
  expect(bad, `§49's field not met:\n  ${bad.join('\n  ')}`).toEqual([]);
});
