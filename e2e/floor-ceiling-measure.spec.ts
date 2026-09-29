import { expect, test, type Page } from '@playwright/test';
import { BANDS, GRID_COLUMNS, IDENTITY_SPANS, NO_SCROLL_HEIGHT, STILL_MARGIN } from '../src/app/records/[id]/band-geometry';
import { construction } from '../src/app/records/[id]/construction';
import { ownFitViewBox } from '../src/app/records/[id]/own-fit';
import { readSeventeen } from './seventeen';

/**
 * **§5.5's floor and §30's ceiling, measured per record on the rendered page,
 * at the reference viewports each section names.**
 *
 * Both were first measured (steps 18, 20 and 22) on fixtures another spec's
 * cleanup could delete mid-run, and §39 to §44 were ruled from those figures.
 * The seventeen are now a run-level fixture nobody cleans up, so this is the
 * measurement the rulings should have rested on.
 *
 * Asserted, because they are rulings:
 *   - §5.5 / §30: every record's base faces are at least 0.5% of the viewport
 *     at 1440 × 900, 390 × 844, 1680 × 1050 and 1920 × 1080 -- "the floor is
 *     guaranteed at the named reference viewports, not between them".
 *   - §30 / §41: the upper band's empty width (unassigned + the construction's
 *     own empty width once height binds + the cover cell beside its square) is
 *     under one upper cell, 480, at every reference above the fork.
 *   - At 1440 × 900 the rendered share matches the share the geometry computes
 *     (`colour-eligibility.test.ts`), per record: the page draws what the
 *     module states.
 *
 * Reported, not asserted: 1920 × 950 (§30's stated known miss, one record
 * under), 1920 × 1200 (§30: "also clears"), and 1680 × 900 and 1920 × 900,
 * where Believer's empty width was recorded before §39 took the air away.
 */
const PASSWORD = process.env.E2E_PASSWORD ?? 'test-password-for-e2e';
async function login(page: Page) {
  await page.goto('/login');
  await page.locator('form[data-hydrated="true"]').waitFor({ timeout: 15_000 });
  await page.getByLabel('Password').pressSequentially(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL('/');
}

const FLOOR_PCT = 0.5;
const CEILING_PX = 480;
const RENDERED_VS_COMPUTED_PTS = 0.02;

type Ref = { w: number; h: number; floor: boolean; ceiling: boolean };
const REFERENCES: Ref[] = [
  { w: 1440, h: NO_SCROLL_HEIGHT, floor: true, ceiling: true },
  { w: 390, h: 844, floor: true, ceiling: false },
  { w: 1680, h: 1050, floor: true, ceiling: true },
  { w: 1920, h: 1080, floor: true, ceiling: true },
  { w: 1920, h: 950, floor: false, ceiling: false },
  { w: 1920, h: 1200, floor: false, ceiling: false },
  { w: 1680, h: NO_SCROLL_HEIGHT, floor: false, ceiling: false },
  { w: 1920, h: NO_SCROLL_HEIGHT, floor: false, ceiling: false },
];

type Reading = { floorPct: number; empty: number | null; unassigned: number | null; constructionEmpty: number | null; coverBeside: number | null; bound: 'width' | 'height' };

/** In-page: the base faces' rendered area over the viewport, and §30's empty-width terms. */
const MEASURE = () => {
  const svg = document.querySelector<SVGSVGElement>('[data-testid="construction-still"]');
  if (svg === null) return null;
  const sb = svg.getBoundingClientRect();
  const vb = (svg.getAttribute('viewBox') ?? '0 0 1 1').split(' ').map(Number);
  const sx = sb.width / vb[2];
  const sy = sb.height / vb[3];
  /* `xMidYMid meet`: the drawing scales uniformly by the SMALLER ratio, so the rendered area is that scale squared -- not sx × sy, which overstates whichever axis the box is slack on. */
  const s = Math.min(sx, sy);
  let faces = 0;
  for (const poly of svg.querySelectorAll('polygon[data-step="base"]')) {
    const pts = (poly.getAttribute('points') ?? '').trim().split(/\s+/).map((p) => p.split(',').map(Number));
    let sum = 0;
    for (let i = 0; i < pts.length; i += 1) { const [x1, y1] = pts[i]; const [x2, y2] = pts[(i + 1) % pts.length]; sum += x1 * y2 - x2 * y1; }
    faces += (Math.abs(sum) / 2) * s * s;
  }
  const floorPct = (faces / (window.innerWidth * window.innerHeight)) * 100;
  const bound: 'width' | 'height' = sx < sy ? 'width' : 'height';

  const band = document.querySelector<HTMLElement>('[data-band="identity"]');
  const cell = (n: string) => document.querySelector<HTMLElement>(`[data-band="identity"] > [data-cell="${n}"]`);
  const identity = cell('identity'); const still = cell('still'); const sleeve = cell('sleeve');
  if (band === null || identity === null || still === null || sleeve === null || window.innerWidth < 960) {
    return { floorPct, empty: null, unassigned: null, constructionEmpty: null, coverBeside: null, bound };
  }
  /* The cells sharing the identity's row: three above the fork, two from 960 to 1439 (§41). */
  const top = Math.round(identity.getBoundingClientRect().top);
  const rowWidth = [identity, still, sleeve].filter((c) => Math.round(c.getBoundingClientRect().top) === top).reduce((a, c) => a + c.getBoundingClientRect().width, 0);
  const unassigned = Math.max(0, band.getBoundingClientRect().width - rowWidth);
  const cs = getComputedStyle(still);
  const innerW = still.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
  const constructionEmpty = bound === 'width' ? 0 : innerW - Math.min(sx, sy) * vb[2];
  const cover = document.querySelector<HTMLElement>('[data-mark="coverFrame"], [data-cover]');
  const coverBeside = cover === null ? 0 : sleeve.getBoundingClientRect().width - cover.getBoundingClientRect().width;
  const r = (n: number) => Math.round(n * 10) / 10;
  return { floorPct, empty: r(unassigned + constructionEmpty + coverBeside), unassigned: r(unassigned), constructionEmpty: r(constructionEmpty), coverBeside: r(coverBeside), bound };
};

/** The geometry's own figure at 1440 × 900: `colour-eligibility.test.ts`'s baseFraction, per record. */
const computedAt1440 = (id: string): number => {
  const scene = construction(id);
  const [, , w, h] = ownFitViewBox(scene).split(' ').map(Number);
  const cellW = (1440 / GRID_COLUMNS) * IDENTITY_SPANS[1] - 2 * STILL_MARGIN;
  const cellH = BANDS.identity - 2 * STILL_MARGIN;
  const scale = Math.min(cellW / w, cellH / h);
  const area = (points: ReadonlyArray<readonly [number, number]>) => { let s = 0; for (let i = 0; i < points.length; i += 1) { const [x1, y1] = points[i]; const [x2, y2] = points[(i + 1) % points.length]; s += x1 * y2 - x2 * y1; } return Math.abs(s) / 2; };
  const base = scene.forms.flatMap((f) => f.faces.filter((face) => face.step === 'base')).map((face) => area(face.points));
  return (base.reduce((a, b) => a + b, 0) * scale * scale) / (1440 * NO_SCROLL_HEIGHT) * 100;
};

test('§5.5’s floor and §30’s ceiling hold per record at the reference viewports, and the page draws the share the geometry states', async ({ page }) => {
  test.setTimeout(900_000);
  await login(page);
  const rows = readSeventeen();
  const bad: string[] = [];
  const report: string[] = [];
  let deltaWorst = { pts: 0, where: 'none' };
  for (const ref of REFERENCES) {
    const readings: Array<{ title: string; m: Reading }> = [];
    await page.setViewportSize({ width: ref.w, height: ref.h });
    for (const r of rows) {
      await page.goto(`/records/${r.id}`);
      await page.locator('[data-testid="construction-still"] polygon').first().waitFor({ timeout: 20_000 });
      await page.evaluate(() => document.fonts.ready);
      await page.waitForTimeout(250);
      const m = (await page.evaluate(MEASURE)) as Reading | null;
      if (m === null) { bad.push(`${r.title} @${ref.w}x${ref.h}: no construction rendered`); continue; }
      readings.push({ title: r.title, m });
      if (ref.floor && m.floorPct < FLOOR_PCT) bad.push(`${r.title} @${ref.w}x${ref.h}: base faces ${m.floorPct.toFixed(3)}% of the viewport, under §5.5’s ${FLOOR_PCT}%`);
      if (ref.ceiling && m.empty !== null && m.empty >= CEILING_PX) bad.push(`${r.title} @${ref.w}x${ref.h}: empty width ${m.empty} (unassigned ${m.unassigned} + construction ${m.constructionEmpty} + beside the square ${m.coverBeside}) is not under one upper cell`);
      if (ref.w === 1440 && ref.h === NO_SCROLL_HEIGHT) {
        const delta = Math.abs(m.floorPct - computedAt1440(r.id));
        if (delta > deltaWorst.pts) deltaWorst = { pts: delta, where: r.title };
        if (delta > RENDERED_VS_COMPUTED_PTS) bad.push(`${r.title} @1440x900: rendered ${m.floorPct.toFixed(4)}% against computed ${computedAt1440(r.id).toFixed(4)}%`);
      }
    }
    const floors = readings.map((x) => x.m.floorPct).sort((a, b) => a - b);
    const worst = readings.reduce((a, b) => (b.m.floorPct < a.m.floorPct ? b : a));
    const under = readings.filter((x) => x.m.floorPct < FLOOR_PCT).map((x) => `${x.title} ${x.m.floorPct.toFixed(3)}%`);
    const widest = readings.filter((x) => x.m.empty !== null).reduce<{ title: string; m: Reading } | null>((a, b) => (a === null || (b.m.empty ?? 0) > (a.m.empty ?? 0) ? b : a), null);
    report.push(`${ref.w} × ${ref.h} (${worst.m.bound}-bound): floor worst ${floors[0].toFixed(3)}% (${worst.title}), median ${floors[Math.floor(floors.length / 2)].toFixed(3)}%, under 0.5%: ${under.length ? under.join(', ') : 'none'}` + (widest === null ? '' : `; empty width widest ${widest.m.empty} (${widest.title}: unassigned ${widest.m.unassigned} + construction ${widest.m.constructionEmpty} + beside the square ${widest.m.coverBeside})`));
    report.push('    ' + readings.map((x) => `${x.title.split(':')[0]} ${x.m.floorPct.toFixed(3)}%${x.m.empty === null ? '' : `/${x.m.empty}`}`).join(' · '));
  }
  console.log(`  §5.5 FLOOR / §30 CEILING per record on the seventeen:\n  ${report.join('\n  ')}\n  rendered vs computed at 1440 × 900: worst delta ${deltaWorst.pts.toFixed(4)} points (${deltaWorst.where})`);
  expect(report.length, 'the report has subjects').toBe(REFERENCES.length * 2);
  expect(bad, `rulings not met:\n  ${bad.join('\n  ')}`).toEqual([]);
});
