import { expect, test, type Page } from '@playwright/test';
import { registerCleanup, trackArtist } from './cleanup';
import { CELL_PADDING } from '../src/app/records/[id]/extended-grid';
import { CONTENT_MEASURE, GRID_FORK } from '../src/app/records/[id]/band-geometry';

registerCleanup();

/**
 * **§18: the type never moves, the grid does.**
 *
 * §4.2 names the sizes and forbids 16 to 39, so a remedy that shrinks the
 * artist below some width would add the tier §4.2 exists to prevent — "it
 * would not be a responsive rule, it would be a fourth size with a media
 * query for a justification". And a clip is not the answer either: §9.2's
 * clip rule is about ORNAMENT staying in its cell, ornament carries no data,
 * while §6 makes a silently cut artist name a fact rendered as a shorter
 * fact — the app confidently misleading rather than obviously broken.
 *
 * So the grid moves. The content track floors at 412, which is the measure
 * §4.2 already sets the type to: "the track's floor and the type's measure
 * are the same number because they are the same decision". A track narrower
 * than its own measure is not a squeezed composition, it is a different one —
 * which is why the earlier collapse-to-min-content attempt wrapped titles at
 * 196, and why `identity-cell.spec.ts` was right to fail it.
 *
 * The bands are `repeat(12, 120px)`, fixed rather than fractional, so the
 * page has never reflowed: what the 93px cell was reporting is a fixed
 * composition being asked to be a fluid one. Below 1440 the twelve columns
 * become one and the identity cell spans it.
 *
 * The give order has four terms and is §4.2's, cited rather than re-listed
 * here: its three, then the measure itself as the fourth. Full measure holds
 * at 40px down to 480 (412 + 2 × 34); below that the measure yields to the
 * column's inner width, reaching 322 at 390. What that costs is stated —
 * §4.2's `text-wrap: balance` shape goes, so titles take more lines — and the
 * type still does not move, because a narrower measure is a worse setting of
 * the same sizes rather than a new size.
 */
const PASSWORD = process.env.E2E_PASSWORD ?? 'test-password-for-e2e';

/** §18: full measure holds to 412 + 2 × 34. */
const FULL_MEASURE_FLOOR = CONTENT_MEASURE + CELL_PADDING * 2;

async function login(page: Page) {
  await page.goto('/login');
  await page.locator('form[data-hydrated="true"]').waitFor({ timeout: 15_000 });
  await page.getByLabel('Password').pressSequentially(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL('/');
}

async function measure(page: Page, width: number, href: string) {
  await page.setViewportSize({ width, height: 1100 });
  await page.goto(href);
  await page.waitForTimeout(600);

  return page.evaluate(() => {
    const cell = document.querySelector('[data-cell="identity"]')!.getBoundingClientRect();
    const track = document.querySelector('[data-track="content"]')!.getBoundingClientRect();
    const artist = document.querySelector('[data-field="artist"]')!.getBoundingClientRect();
    const title = document.querySelector('[data-field="title"]')!.getBoundingClientRect();
    const grid = document.querySelector('[data-testid="record-page-8a"]')!.getBoundingClientRect();
    const de = document.documentElement;

    /* Is any part of the artist or title outside the cell that clips it? */
    const spill = (b: DOMRect) =>
      Math.round(Math.max(b.right - cell.right, cell.left - b.left, 0));

    return {
      grid: Math.round(grid.width),
      cell: Math.round(cell.width),
      track: Math.round(track.width),
      artist: Math.round(artist.width),
      artistSpill: spill(artist),
      titleSpill: spill(title),
      pageOverflow: de.scrollWidth > de.clientWidth,
    };
  });
}

test('§18: the grid moves and the type does not, at every width', async ({ page }) => {
  await login(page);
  const s = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  /* A real band name that does not fit: the case the ruling was written for. */
  const a = await page.request.post('/api/artists', { data: { name: 'Godspeed You! Black Emperor' } });
  const { id: artistId } = await a.json();
  trackArtist(artistId);
  const r = await page.request.post('/api/records', {
    data: { artistId, title: `Lift Your Skinny Fists Like Antennas to Heaven ${s}`, releaseYear: 2000 },
  });
  const { id } = await r.json();
  const href = `/records/${id}`;

  /* Above the fork: twelve fixed columns, so the grid does not stretch. */
  /* Widths above the fork. 1730 rather than 1728 deliberately: the old cap is
     not a landmark any more, and a literal equal to a constant reads as that
     constant to the next person (and to `specs-import-constants`). */
  for (const width of [2000, 1730, 1600, GRID_FORK]) {
    const m = await measure(page, width, href);
    expect(m.grid, `at ${width}, the grid is fixed at ${GRID_FORK}`).toBe(GRID_FORK);
    expect(m.track, `at ${width}, the track holds its measure`).toBeGreaterThanOrEqual(CONTENT_MEASURE);
    expect(m.artistSpill, `at ${width}, nothing of the artist is cut`).toBe(0);
    expect(m.titleSpill, `at ${width}, nothing of the title is cut`).toBe(0);
    expect(m.pageOverflow, `at ${width}, the page does not scroll sideways`).toBe(false);
  }

  /* Below the fork: one column, and the measure still holds down to 480. */
  for (const width of [1439, 1200, 880, 768, FULL_MEASURE_FLOOR]) {
    const m = await measure(page, width, href);
    expect(m.cell, `at ${width}, the identity cell spans the single column`).toBeGreaterThanOrEqual(
      Math.min(width, FULL_MEASURE_FLOOR) - 1,
    );
    expect(m.track, `at ${width}, the track keeps §4.2's 412 measure`).toBeGreaterThanOrEqual(CONTENT_MEASURE);
    expect(m.artistSpill, `at ${width}, nothing of the artist is cut`).toBe(0);
    expect(m.titleSpill, `at ${width}, nothing of the title is cut`).toBe(0);
    expect(m.pageOverflow, `at ${width}, the page does not scroll sideways`).toBe(false);
  }

  /* Below 480 the measure yields — §4.2's give order's fourth term. */
  for (const width of [420, 390]) {
    const m = await measure(page, width, href);
    expect(m.track, `at ${width}, the measure yields to the column's inner width`).toBe(
      width - CELL_PADDING * 2,
    );
    expect(m.artistSpill, `at ${width}, nothing of the artist is cut`).toBe(0);
    expect(m.titleSpill, `at ${width}, nothing of the title is cut`).toBe(0);
    expect(m.pageOverflow, `at ${width}, the page does not scroll sideways`).toBe(false);
  }

  /* §18 names 322 at 390, which is the derivation and not a second figure. */
  const narrow = await measure(page, 390, href);
  expect(narrow.track, '§18: 322 at 390').toBe(322);
});
