import { expect, test, type Page } from '@playwright/test';
import { registerCleanup, trackArtist } from './cleanup';
import { CELL_PADDING } from '../src/app/records/[id]/extended-grid';
import { GRID_FORK } from '../src/app/records/[id]/band-geometry';
import { IDENTITY_PADDING } from '../src/app/records/[id]/title-steps';
import { pageWidthAt } from '../src/app/records/[id]/region-rows';
import { login } from './sign-in';

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
/** §18: the identity cell never narrower than four columns above §28's fork. */
const FULL_MEASURE_FLOOR = GRID_FORK / 3;
/** §45: 412 is the measure's FLOOR -- a 480 cell less its padding -- not a constant of its own; above 480 the measure grows with the cell. */
const MEASURE_FLOOR = FULL_MEASURE_FLOOR - CELL_PADDING * 2;

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
  const a = await page.request.post('/api/artists', { data: { name: `Godspeed You! Black Emperor ${s}` } });
  const { id: artistId } = await a.json();
  trackArtist(artistId);
  /*
    **The suffix goes on the ARTIST, not the title — §27, fifth instance.**
    "No test may alter a fixture along the axis it measures; an isolation
    suffix goes on a field the assertion does not read." This spec measures
    the title's wrap in §4.2's 412 measure, and it was appending
    `${Date.now()}-${random}` to the title: a 20-character unbreakable digit
    string that sets 843px at 72px, against a longest real word ("Antennas")
    of 321px. The h1 ran to 569 of a 412 measure at EVERY width, and at 480
    that escaped and scrolled the document.

    Measured unsuffixed, the same title is 412/412 with nothing over, at
    1440 and 480 alike — as is the collection's real worst title. The
    artist carries the isolation instead; `artistSpill` asserts the artist
    is not cut, which a longer name cannot break.
  */
  const r = await page.request.post('/api/records', {
    data: { artistId, title: 'Lift Your Skinny Fists Like Antennas to Heaven', releaseYear: 2000 },
  });
  const { id } = await r.json();
  const href = `/records/${id}`;

  /*
    **§30 withdraws the flat 1440 cap, so the claim is the page's WIDTH rule
    rather than one number.** §18's point survives — the type never moves, the
    grid does — but above 1440 the grid grows: 14 columns from 1680, 16 from
    1920, and the page stays 1920 above that. So the expected width is
    `pageWidthAt`, which is 1440 at the fork and 1920 at 2000.
  */
  for (const width of [2000, 1730, 1600, GRID_FORK]) {
    const m = await measure(page, width, href);
    expect(m.grid, `at ${width}, the grid takes ${pageWidthAt(width)}`).toBe(pageWidthAt(width));
    expect(m.track, `at ${width}, the track holds its measure`).toBeGreaterThanOrEqual(MEASURE_FLOOR);
    expect(m.artistSpill, `at ${width}, nothing of the artist is cut`).toBe(0);
    expect(m.titleSpill, `at ${width}, nothing of the title is cut`).toBe(0);
    /*
      **This caught a fixture defect, not a page one, and the distinction
      took four measurements.** It failed at 480 with the document scrolling
      125px, and the first reading was that §27's removal of
      `overflow-hidden` had exposed a pre-existing page overflow. It had
      not: the test's own isolation suffix was on the title, and that is
      what overflowed. Kept as a plain assertion because it does its job.
    */
    expect(m.pageOverflow, `at ${width}, the page does not scroll sideways`).toBe(false);
  }

  /* Below the fork: one column, and the measure still holds down to 480. */
  for (const width of [1439, 1200, 880, 768, FULL_MEASURE_FLOOR]) {
    const m = await measure(page, width, href);
    expect(m.cell, `at ${width}, the identity cell spans the single column`).toBeGreaterThanOrEqual(
      Math.min(width, FULL_MEASURE_FLOOR) - 1,
    );
    expect(m.track, `at ${width}, the track keeps the measure's floor (§45: 412 at a 480 cell)`).toBeGreaterThanOrEqual(MEASURE_FLOOR);
    expect(m.artistSpill, `at ${width}, nothing of the artist is cut`).toBe(0);
    expect(m.titleSpill, `at ${width}, nothing of the title is cut`).toBe(0);
    /**
     * **KNOWN-FAILING at 480, and it is a defect FOUND rather than caused.**
     *
     * The page overflows 125px horizontally at 480 × 1100: `scrollWidth` 605
     * against `clientWidth` 480. It has been doing so all along —
     * `overflow-hidden` on the identity cell was swallowing it, and §27's
     * removal of that class ("never overflow-hidden") is what made it
     * visible. **Do not restore the class to get this green**; the class is
     * the thing §27 forbids and the swallowing is why this went unseen.
     *
     * What is ruled out, by measurement: no element's right edge exceeds the
     * viewport, none has a left edge below −1, both 900 and 1100 heights are
     * clean on a fresh load, and walking 2000 → 480 in one page is clean at
     * every step. `scrollWidth` growing with no element accounting for it is
     * the signature of content clipped by an ancestor, which a
     * `getBoundingClientRect` scan cannot see.
     *
     * Open with Design. The next step is an `offsetLeft + offsetWidth`
     * traversal, which reports a box a rect cannot.
     */
    expect(m.pageOverflow, `at ${width}, the page does not scroll sideways`).toBe(false);
  }

  /* Below 480 the measure yields — §4.2's give order's fourth term. */
  for (const width of [420, 390]) {
    const m = await measure(page, width, href);
    /*
      §45: the measure is the rendered track, the column less the identity
      cell's own padding (18 a side, `IDENTITY_PADDING`). This read
      `CELL_PADDING` (34, the extended grid's) and so expected 352 at 420 while
      the cell renders 384; the 412 box hid the difference by being 16 narrower
      than the cell on each side. Whether §18's 34 or the built 18 is the
      ruling is Design's question, recorded in NOTES; the assertion is on what
      renders.
    */
    expect(m.track, `at ${width}, the measure yields to the column's inner width`).toBe(
      width - IDENTITY_PADDING * 2,
    );
    expect(m.artistSpill, `at ${width}, nothing of the artist is cut`).toBe(0);
    expect(m.titleSpill, `at ${width}, nothing of the title is cut`).toBe(0);
    /**
     * **KNOWN-FAILING at 480, and it is a defect FOUND rather than caused.**
     *
     * The page overflows 125px horizontally at 480 × 1100: `scrollWidth` 605
     * against `clientWidth` 480. It has been doing so all along —
     * `overflow-hidden` on the identity cell was swallowing it, and §27's
     * removal of that class ("never overflow-hidden") is what made it
     * visible. **Do not restore the class to get this green**; the class is
     * the thing §27 forbids and the swallowing is why this went unseen.
     *
     * What is ruled out, by measurement: no element's right edge exceeds the
     * viewport, none has a left edge below −1, both 900 and 1100 heights are
     * clean on a fresh load, and walking 2000 → 480 in one page is clean at
     * every step. `scrollWidth` growing with no element accounting for it is
     * the signature of content clipped by an ancestor, which a
     * `getBoundingClientRect` scan cannot see.
     *
     * Open with Design. The next step is an `offsetLeft + offsetWidth`
     * traversal, which reports a box a rect cannot.
     */
    expect(m.pageOverflow, `at ${width}, the page does not scroll sideways`).toBe(false);
  }

  /*
    §18 names 322 at 390 -- 390 less twice a 34 padding the identity cell does
    not have. It is padded 18 a side, so the rendered track is 354 (§45: the
    measure is the rendered track). Which padding is the ruling is Design's
    question, recorded in NOTES; the assertion is on what renders.
  */
  const narrow = await measure(page, 390, href);
  expect(narrow.track, `§18 at 390: the column less the cell's padding`).toBe(390 - 2 * IDENTITY_PADDING);
});
