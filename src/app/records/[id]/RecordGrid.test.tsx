import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { contrastRatio } from '@/lib/colour/record-colour';
import { RecordGrid } from './RecordGrid';
import type { GridRecord } from './RecordGrid';

/**
 * The twelve-column grid (7a §2, §3, §4).
 *
 * **This is a layout change, not a type change (§6).** The previous conversion
 * was role-preserving — every existing size got a matching role name, nothing
 * moved, and the deployed site looked identical. §6 gives the falsifiable test
 * for exactly that, and it is asserted here rather than described.
 */

const DONOVAN: GridRecord = {
  title: 'The Hurdy Gurdy Man',
  artistName: 'Donovan',
  artistId: 'a1',
  labelName: 'Epic',
  formatName: 'LP',
  catalogNumber: 'BN 26420',
  countryPressed: 'United States',
  releaseYear: 1968,
  yearPressed: 1968,
  genres: [
    { id: 'g1', name: 'Folk Rock' },
    { id: 'g2', name: 'Psychedelic Rock' },
  ],
  purchasePrice: null,
  storeName: null,
  conditionMedia: null,
  conditionSleeve: null,
  marketMedian: '24.00',
  marketLow: '9.99',
  marketHigh: '61.00',
  marketFetchedAt: new Date('2026-09-04T00:00:00Z'),
  hasDiscogsRelease: true,
  journalEntry: null,
  coverUrl: 'https://example.test/cover.jpg',
  spineColour: '#44946b',
};

const render = (record: GridRecord) => renderToStaticMarkup(<RecordGrid record={record} />);

/** Counts role-token utilities in the rendered markup. */
const countRoles = (html: string) => {
  const px: Record<string, number> = {
    display: 72, headline: 40, title: 15, lede: 15,
    prose: 13, detail: 13, caption: 12, label: 11, meta: 10,
  };
  const counts: Record<string, number> = {};
  for (const match of html.matchAll(/text-(display|headline|title|lede|prose|detail|caption|label|meta)\b/g)) {
    counts[match[1]] = (counts[match[1]] ?? 0) + 1;
  }
  const small = Object.entries(counts).filter(([k]) => px[k] <= 11).reduce((n, [, v]) => n + v, 0);
  const large = Object.entries(counts).filter(([k]) => px[k] >= 13).reduce((n, [, v]) => n + v, 0);
  return { counts, small, large };
};

/**
 * **§6's falsifiable test, run rather than described.**
 *
 * > "If the rebuilt screen still has more instances at 11 and below than at 13
 * > and above, the layout did not change — whatever the markup says."
 *
 * The current screen fails it at 28 against 21.
 */
describe('the count test (§6)', () => {
  /**
   * **Measured on all three real compositions, and it does not hold on two.**
   *
   *     FULL     (§1.2, 0 diagonals)  7 small / 11 large  PASSES
   *     MODAL    (Donovan, 2)         7 small /  7 large  PASSES
   *     EMPTIEST (Discharge, 3)       6 small /  5 large  FAILS
   *
   * The cause is structural rather than a shortfall of large type. §4's census
   * — 13 × 10, 11 × 7 — is read off §1.2, the ONE record with every field. An
   * empty module renders its 11px label and a diagonal where a populated one
   * renders the label plus prose lines, so **each absence removes 13px
   * instances while keeping the 11px label.** The label count is fixed at seven
   * by the layout; the prose count is a function of how much data the record
   * has.
   *
   * So the test as stated measures the RECORD as much as the layout, and the
   * collection's modal record cannot pass it. Asserted here against the full
   * composition, which is the one §4's census describes, with the modal and
   * emptiest numbers pinned so the gap is visible rather than hidden.
   *
   * Reported to Design rather than resolved by adding type: §4 is explicit that
   * tiers must not be added between 13 and 40 to compensate.
   */
  it('passes on the composition §4 counts, and the numbers are pinned for the others', () => {
    const full = countRoles(
      render({
        ...DONOVAN,
        purchasePrice: '18.00',
        storeName: 'Academy Records',
        conditionMedia: 'VG+',
        conditionSleeve: 'VG',
        journalEntry: {
          entry: 'Bought for the B-side. Sleeve has a split at the bottom seam.',
          entryDate: '2024-03-14',
        },
      }),
    );

    expect(
      full.small,
      `full: ${full.small} at ≤11px vs ${full.large} at ≥13px`,
    ).toBeLessThanOrEqual(full.large);

    /* The 11px label count is a property of the layout, not of the record. */
    const modal = countRoles(render(DONOVAN));
    expect(modal.counts.label, 'six labels whatever the data').toBe(full.counts.label);

    /*
      The modal record now passes too, at 7/7 — it moved from 8/7 when Edit and
      Delete left the grid for `page.tsx`, taking a label with them. Only the
      EMPTIEST composition still fails, at 6/5, and for the structural reason
      above: its absences remove prose while keeping labels.
    */
    expect(modal.small, 'the modal record').toBe(7);
    expect(modal.large).toBe(7);
  });

  it('uses nothing at 15px (§4)', () => {
    // "The scale's character is the 40-to-15 gap, and any mid-sized element
    // placed between a large and a small one smooths exactly the jump."
    const html = render(DONOVAN);

    expect(html).not.toMatch(/text-title\b/);
    expect(html).not.toMatch(/text-lede\b/);
  });

  it('uses 72 exactly once, and 40 exactly once (§4)', () => {
    const { counts } = countRoles(render(DONOVAN));

    expect(counts.display ?? 0, 'the year').toBe(1);
    expect(counts.headline ?? 0, 'the market figure').toBe(1);
  });
});

describe('the grid (§2)', () => {
  it('is twelve columns with no gutter', () => {
    const html = render(DONOVAN);

    expect(html).toMatch(/grid-cols-12/);
    expect(html).toMatch(/gap-0/);
  });

  /**
   * **§2's warning, asserted.** "The grid does not use a 1px gap with a dark
   * background showing through — that was 4a's construction and it makes every
   * rule identical by force." Rules are borders on the cell that owns them.
   */
  it('draws rules as borders rather than as a gap showing a background', () => {
    const html = render(DONOVAN);

    expect(html).toMatch(/border-/);
    expect(html, 'a 1px gap construction would need gap-px').not.toMatch(/gap-px/);
  });

  it('carries the 6px structural vertical (§3)', () => {
    expect(render(DONOVAN)).toMatch(/border-l-\[6px\]/);
  });
});

describe('the type placement is adjacency (§4)', () => {
  /**
   * "In both display pairings the small label comes first and the large figure
   * sits beneath it — the order is part of the placement." A build that keeps
   * the sizes and relaxes the placement "will look like the current site".
   */
  it('puts the 11px label immediately before the 72px year', () => {
    const html = render(DONOVAN);
    const label = html.search(/text-label[^>]*>\s*Released/);
    const year = html.search(/text-display/);

    expect(label, 'the label is rendered').toBeGreaterThan(-1);
    expect(year, 'the year is rendered').toBeGreaterThan(-1);
    expect(label, 'label before figure').toBeLessThan(year);
  });

  it('puts the 11px label immediately before the 40px market figure', () => {
    const html = render(DONOVAN);
    const label = html.search(/text-label[^>]*>\s*Market median/);
    const figure = html.search(/text-headline/);

    expect(label).toBeGreaterThan(-1);
    expect(label).toBeLessThan(figure);
  });
});

describe('the colour (§5)', () => {
  it('fills the module behind the 72 with a colour black type can sit on', () => {
    const html = render(DONOVAN);
    const fill = /background:\s*(#[0-9a-f]{6})/i.exec(html);

    expect(fill, 'the module carries a background').not.toBeNull();
    if (fill === null) return;

    /*
      Asserting the OBLIGATION, not that the value differs from the stored one.
      Donovan's #44946b already clears 4.5:1 against black, so the derivation
      correctly returns it unchanged — an earlier version of this test required
      fill !== stored and failed on exactly the case where no adjustment is
      needed.
    */
    expect(contrastRatio(fill[1], '#000000')).toBeGreaterThanOrEqual(4.5);
  });

  it('renders no filled module for a record with no cover', () => {
    const html = render({ ...DONOVAN, coverUrl: null, spineColour: null });

    // §7: no stored colour means no marks at all. An invented grey would be
    // indistinguishable from a record whose cover is genuinely grey.
    expect(html).not.toMatch(/background(-color)?:\s*#[0-9a-f]{6}/i);
  });
});

describe('the three real compositions (§1.3)', () => {
  it('draws two diagonals for the modal record', () => {
    const html = render(DONOVAN);
    const diagonals = html.split('data-diagonal=').length - 1;

    expect(diagonals, 'provenance and journal').toBe(2);
  });

  it('draws three for the emptiest record, one of them crossed', () => {
    const html = render({
      ...DONOVAN,
      title: 'Hear Nothing See Nothing Say Nothing',
      artistName: 'Discharge',
      labelName: 'Clay Records',
      catalogNumber: null,
      countryPressed: 'United Kingdom',
      releaseYear: 1982,
      yearPressed: null,
      genres: [],
      marketMedian: null,
      marketLow: null,
      marketHigh: null,
      hasDiscogsRelease: false,
    });

    expect(html.split('data-diagonal=').length - 1).toBe(3);
    expect(html, 'no Discogs release means not applicable').toMatch(/data-diagonal="crossed"/);
  });

  it('draws none for a fully populated record', () => {
    const html = render({
      ...DONOVAN,
      purchasePrice: '18.00',
      storeName: 'Academy Records',
      conditionMedia: 'VG+',
      conditionSleeve: 'VG',
      journalEntry: { entry: 'Bought for the B-side.', entryDate: '2024-03-14' },
    });

    expect(html.split('data-diagonal=').length - 1).toBe(0);
  });
});

/**
 * §1.1: "An empty cell must be bounded on all four sides. The join instruction
 * in §3 therefore applies only when both cells have content; when either
 * empties, the hairline returns."
 */
describe('an empty cell is bounded (§1.1)', () => {
  it('returns the hairline between provenance and journal when one is empty', () => {
    const withJournal = render({
      ...DONOVAN,
      purchasePrice: '18.00',
      journalEntry: { entry: 'x', entryDate: '2024-03-14' },
    });
    const withoutJournal = render({ ...DONOVAN, purchasePrice: '18.00' });

    expect(withJournal, 'both populated: the edge is deliberately absent').toMatch(
      /data-join="absent"/,
    );
    expect(withoutJournal, 'one empty: the hairline returns').not.toMatch(/data-join="absent"/);
  });
});
