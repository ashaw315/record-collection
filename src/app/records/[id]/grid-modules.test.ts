import { describe, expect, it } from 'vitest';
import { gridModules, type ModuleInput } from './grid-modules';

/**
 * Which of the grid's modules are populated, and which are drawn empty.
 *
 * **The diagonal marks MODULES, not fields (7a §1.4).** Absent fields inside a
 * populated cell render nothing at all; the diagonal appears only when a whole
 * module is empty. That is the limit the diagonal census forced: at field level
 * Donovan produces five marks and the page reads as one that failed to load,
 * and the four small ones fail §5's area floor at 3.3% of the grid between
 * them. At cell level the same record produces two, each above the floor.
 *
 * **`purchase_date` is not a module and not a field here (§1.4).** It is absent
 * on all seventeen records, so its marker would never vary — and a mark whose
 * value is constant is texture rather than information. If it is ever populated
 * it joins the provenance line as text.
 */

const EMPTY: ModuleInput = {
  catalogNumber: null,
  labelName: null,
  formatName: null,
  countryPressed: null,
  releaseYear: null,
  yearPressed: null,
  genres: [],
  purchasePrice: null,
  storeName: null,
  conditionMedia: null,
  conditionSleeve: null,
  marketMedian: null,
  marketLow: null,
  marketHigh: null,
  marketFetchedAt: null,
  hasDiscogsRelease: false,
  journalEntry: null,
};

describe('a module is populated when any of its fields is', () => {
  it('draws provenance when only the price is present', () => {
    const modules = gridModules({ ...EMPTY, purchasePrice: '18.00' });

    expect(modules.provenance.empty).toBe(false);
    expect(modules.provenance.diagonal).toBe('none');
  });

  it('draws provenance when only the condition is present', () => {
    const modules = gridModules({ ...EMPTY, conditionMedia: 'VG+' });

    expect(modules.provenance.empty).toBe(false);
  });

  /**
   * **The rule that caps the device.** Four absent provenance fields inside a
   * populated cell produce NO marks — not four small ones.
   */
  it('renders no mark for absent fields inside a populated module', () => {
    const modules = gridModules({ ...EMPTY, purchasePrice: '18.00' });

    expect(modules.provenance.diagonal).toBe('none');
    expect(modules.provenance.empty).toBe(false);
  });
});

describe('a pressing fact makes the pressing module populated', () => {
  /**
   * **`yearPressed` was missing from the populated check**, so a record whose
   * only pressing fact is the year it was pressed rendered an EMPTY pressing
   * module — a diagonal saying "not recorded" over a record that has recorded
   * something. Found by an E2E round-trip that saves a pressing year and looks
   * for it on the screen; no unit test covered the combination, because every
   * fixture that set `yearPressed` also set a label or a country.
   */
  it('is populated when the pressed year is the only pressing fact', () => {
    const modules = gridModules({ ...EMPTY, yearPressed: 1999 });

    expect(modules.pressing.empty, 'a pressed year is a pressing fact').toBe(false);
    expect(modules.pressing.diagonal).toBe('none');
  });

  it('does not claim the years match when only the pressed year is known', () => {
    // No release year to compare against, so §1.2's "pressed the same year"
    // label must not appear — it would assert a match with nothing.
    expect(gridModules({ ...EMPTY, yearPressed: 1999 }).pressing.pressedSameYear).toBe(false);
  });
});

describe('the diagonal distinguishes not-recorded from not-applicable', () => {
  /**
   * §1.3: the market module on the emptiest record is CROSSED rather than
   * single — no Discogs release, so the figure is not applicable rather than
   * not recorded. One diagonal means "you can fill this"; crossed means "you
   * cannot".
   */
  it('crosses the market module when there is no Discogs release', () => {
    const modules = gridModules({ ...EMPTY, hasDiscogsRelease: false });

    expect(modules.market.empty).toBe(true);
    expect(modules.market.diagonal).toBe('crossed');
  });

  it('marks the market module not-recorded when a release exists but no price does', () => {
    const modules = gridModules({ ...EMPTY, hasDiscogsRelease: true });

    expect(modules.market.diagonal).toBe('single');
  });

  it('draws no diagonal once a median exists', () => {
    const modules = gridModules({
      ...EMPTY,
      hasDiscogsRelease: true,
      marketMedian: '24.00',
    });

    expect(modules.market.empty).toBe(false);
    expect(modules.market.diagonal).toBe('none');
  });

  it('marks an absent journal not-recorded, never crossed', () => {
    // A journal entry is always something the owner could add.
    expect(gridModules(EMPTY).journal.diagonal).toBe('single');
  });
});

/**
 * **The count is the cap, and it is asserted against the real collection's
 * shapes.** §1.4: the cell-level rule caps the device at three per page across
 * the entire collection.
 */
describe('the device is capped at three per page', () => {
  const countDiagonals = (input: ModuleInput) =>
    Object.values(gridModules(input)).filter((module) => module.diagonal !== 'none').length;

  it('gives the emptiest real record three', () => {
    /*
      Discharge — Hear Nothing See Nothing Say Nothing: label and format and
      country and year present, nothing else. §1.3 draws this as the worst case
      in the collection.
    */
    expect(
      countDiagonals({
        ...EMPTY,
        labelName: 'Clay Records',
        formatName: 'LP',
        countryPressed: 'United Kingdom',
        releaseYear: 1982,
      }),
    ).toBe(3);
  });

  it('gives the modal real record two', () => {
    // Donovan: pressing facts and a market figure, no provenance, no journal.
    expect(
      countDiagonals({
        ...EMPTY,
        catalogNumber: 'BN 26420',
        labelName: 'Epic',
        formatName: 'LP',
        countryPressed: 'United States',
        releaseYear: 1968,
        hasDiscogsRelease: true,
        marketMedian: '24.00',
      }),
    ).toBe(2);
  });

  it('gives a fully populated record none', () => {
    expect(
      countDiagonals({
        ...EMPTY,
        catalogNumber: 'BN 26420',
        labelName: 'Epic',
        purchasePrice: '18.00',
        hasDiscogsRelease: true,
        marketMedian: '24.00',
        journalEntry: { entry: 'Bought for the B-side.', entryDate: '2024-03-14' },
      }),
    ).toBe(0);
  });

  /**
   * **The cap holds at three only while the pressing module is populated, and
   * §1.4 does not say so.**
   *
   * Exhaustive over every combination: four modules can carry a mark, so four
   * diagonals are reachable in the type. §1.4 states the cell-level rule "caps
   * the device at three per page across the entire collection" — which is true
   * of the collection and not of the layout.
   *
   * Measured: **0 of 17 records have an empty pressing module.** Every record
   * has at least a label, a format, a year or a genre, so the fourth mark
   * cannot occur on real data — the cap is a property of the DATA, not of the
   * grid. Asserted as four-with-an-empty-pressing rather than three, because a
   * test claiming three would be asserting something the code does not
   * guarantee, and a record imported with nothing but a title would break it.
   *
   * Reported rather than fixed by adjusting the target: §5's area floor is what
   * a fourth mark would threaten, and whether that matters is Design's call.
   */
  it('reaches four only when the pressing module is also empty', () => {
    expect(countDiagonals(EMPTY), 'nothing at all present').toBe(4);
  });

  it('never exceeds three while the pressing module holds anything', () => {
    for (const price of [null, '18.00']) {
      for (const release of [false, true]) {
        for (const median of [null, '24.00']) {
          for (const journal of [null, { entry: 'x', entryDate: '2024-01-01' }]) {
            const count = countDiagonals({
              ...EMPTY,
              /* The condition every real record meets. */
              labelName: 'Some Label',
              purchasePrice: price,
              hasDiscogsRelease: release,
              marketMedian: median,
              journalEntry: journal,
            });
            expect(count, `${price}/${release}/${median}/${journal}`).toBeLessThanOrEqual(3);
          }
        }
      }
    }
  });
});

describe('the pressing module', () => {
  /** §1.1: the genres line moves into the pressing block on the facts side. */
  it('carries the genres', () => {
    const modules = gridModules({ ...EMPTY, genres: [
    { id: 'g1', name: 'Folk Rock' },
    { id: 'g2', name: 'Psychedelic Rock' },
  ] });

    expect(modules.pressing.empty).toBe(false);
    expect(modules.pressing.genres.map((genre) => genre.name)).toEqual([
      'Folk Rock',
      'Psychedelic Rock',
    ]);
  });

  /**
   * §1.2's line reads "Released · pressed the same year" when the two years
   * agree — one line rather than two fields saying the same thing, which is
   * §6's "labels that duplicate their content are dropped".
   */
  it('says the pressing year is the same year when it matches the release', () => {
    const modules = gridModules({ ...EMPTY, releaseYear: 1968, yearPressed: 1968 });

    expect(modules.pressing.pressedSameYear).toBe(true);
  });

  it('does not claim sameness when the pressing year is unknown', () => {
    const modules = gridModules({ ...EMPTY, releaseYear: 1968, yearPressed: null });

    expect(modules.pressing.pressedSameYear).toBe(false);
  });

  it('does not claim sameness when the years differ', () => {
    const modules = gridModules({ ...EMPTY, releaseYear: 1968, yearPressed: 1972 });

    expect(modules.pressing.pressedSameYear).toBe(false);
  });
});

describe('purchase_date has no visual presence', () => {
  /**
   * §1.4: absent on all seventeen, so a marker for it would never vary. It is
   * not in `ModuleInput` at all — this test names the decision so that adding
   * it back is a deliberate act rather than an oversight.
   */
  it('is not a field the grid knows about', () => {
    expect(Object.keys(EMPTY)).not.toContain('purchaseDate');
  });
});
