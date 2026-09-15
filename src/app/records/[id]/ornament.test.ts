import { describe, expect, it } from 'vitest';
import {
  CONTROL_CLEARANCE,
  GATE_RATIO,
  ORNAMENTED_SECTIONS,
  SOLID_ASPECT,
  SOLID_HEIGHT,
  SOLID_WIDTH,
  gatePasses,
  mayOrnament,
  visibleRatio,
} from './ornament';

describe('a solid is sized by width, because width is the known dimension', () => {
  it('is half a column at the reference width', () => {
    /*
      Twelve columns at 120px are known before any content renders; heights are
      not. A full column was the first draft and permitted exactly one legal
      cell in the whole region once the gate and the clearance were applied —
      a rule permitting one position is not a rule about where ornament goes.
    */
    expect(SOLID_WIDTH, 'half of a 120px column').toBe(60);
  });

  it('takes its height from the projection rather than from the cell', () => {
    expect(SOLID_HEIGHT).toBe(Math.round(SOLID_WIDTH * SOLID_ASPECT));
    expect(SOLID_HEIGHT, '60 × 1.06').toBe(64);
  });

  it('would permit almost nothing at a full column', () => {
    /**
     * **The correction, asserted rather than described.** At 120px the solid is
     * 127px, and the gate needs a cell at least 1.5× that — 190px — while the
     * tallest non-control cell in the region is 175px. So a full-column solid
     * renders nowhere, which is how the first rule permitted zero positions
     * while the drawing showed two.
     */
    const fullColumn = Math.round(120 * SOLID_ASPECT);
    const tallestCell = 175;

    expect(fullColumn).toBe(127);
    expect(fullColumn / GATE_RATIO, 'the cell a full-column solid would need').toBeGreaterThan(
      tallestCell,
    );

    /* The half-column one fits the same cell with room. */
    expect(SOLID_HEIGHT / GATE_RATIO).toBeLessThan(tallestCell);
  });
});

describe('the gate is a ratio on visible height (§9.2)', () => {
  it('passes at two-thirds and fails above it', () => {
    /* The boundary, from both sides, so the comparison cannot drift. */
    const exactly = SOLID_HEIGHT / GATE_RATIO;

    expect(gatePasses(Math.ceil(exactly)), 'just above the boundary').toBe(true);
    expect(gatePasses(Math.floor(exactly) - 1), 'just below it').toBe(false);
  });

  it('renders in all four drawn cells, at the drawn ratios', () => {
    /**
     * **The drawing's own numbers**, which is what makes this a check rather
     * than a restatement of the constant: these heights were measured off the
     * composition and the ratios stated with them.
     */
    const drawn = [
      { section: 'Pressing detail', visible: 50, height: 126, ratio: 0.4 },
      { section: 'Market', visible: 48, height: 122, ratio: 0.39 },
      { section: 'Snippet', visible: 50, height: 115, ratio: 0.43 },
      { section: 'Price history', visible: 48, height: 150, ratio: 0.32 },
    ];

    for (const cell of drawn) {
      expect(cell.visible / cell.height, `${cell.section} drawn ratio`).toBeCloseTo(cell.ratio, 2);
      expect(gatePasses(cell.height), `${cell.section} renders`).toBe(true);
    }
  });

  it('reports the visible fraction, which is what the drawn ratios are', () => {
    /**
     * **The gate's BOOLEAN cannot tell visible from total, and claiming it
     * could was an overstatement.**
     *
     * `min(64, h)/h` and `64/h` differ only where h < 64 — and there both
     * exceed two-thirds and both reject, because 64/h > 1. Staged, a gate
     * written on the total height passed all thirteen tests including this one,
     * which was named for exactly that distinction.
     *
     * So the distinction is asserted where it is observable: `visibleRatio` is
     * what the drawing's four numbers ARE, and it clamps at 1 for a cell
     * shorter than the solid rather than reporting 1.6. A caller reading the
     * ratio to place or describe a solid gets the visible fraction; the gate
     * happens to agree either way.
     */
    expect(visibleRatio(40), 'clamped: the cell shows all it can').toBe(1);
    expect(64 / 40, 'the unclamped figure this replaces').toBeCloseTo(1.6, 1);

    expect(visibleRatio(200)).toBeCloseTo(0.32, 2);
    expect(visibleRatio(SOLID_HEIGHT), 'exactly filled').toBe(1);
  });

  it('bleeds past the bottom, which is why the measure is visible at all', () => {
    /*
      The solid is placed against the cell's bottom-right corner and runs past
      it. An earlier gate measured the whole box against 1.5× — which no
      one-column solid can satisfy — so the rule permitted zero positions while
      the drawing showed two. The clamp is what encodes the bleed.
    */
    expect(visibleRatio(SOLID_HEIGHT - 20), 'never above 1, however short').toBe(1);
  });

  it('suppresses rather than shrinking, and that is safe here', () => {
    /*
      §5.4 forbids suppression above the fold because a missing mark there would
      change the composition's structure. Ornament carries no data, so a record
      whose cell is one line short simply has no solid — which is why the same
      move is safe one region down.
    */
    expect(gatePasses(40), 'a short cell renders nothing').toBe(false);
    expect(gatePasses(0), 'and an empty one certainly does not').toBe(false);
  });

  it('decides per cell at render, not per section', () => {
    /**
     * **Not a whitelist with a content floor**, which is the enumeration defect
     * §9.4 records: a section's height varies by record, so a rule naming
     * sections decides on the SCHEMA what only the record can answer.
     *
     * Asserted as: the gate's answer depends only on the height it is given.
     * The same section at two heights gets two answers.
     */
    expect(gatePasses(120)).toBe(true);
    expect(gatePasses(80)).toBe(false);
  });
});

describe('the clearance is a distance, not cell membership (§9.2)', () => {
  it('is the same unit the solid is sized in', () => {
    expect(CONTROL_CLEARANCE).toBe(SOLID_WIDTH);
  });

  it('excludes the four sections whose cells hold a control', () => {
    /**
     * **By construction rather than by placement.** A ruled input spans its
     * cell's full inner width, so no position in that cell is half a column
     * clear of it — Acquisition can carry no solid at all, which is where the
     * first drawing put one, painting over 120px of the Date field's underline.
     * The uploader and the textarea fail the same way by filling their cells,
     * and Tags is excluded by its add chip.
     */
    for (const section of ['acquisition', 'images', 'journal', 'tags']) {
      expect(mayOrnament(section, 0), `${section} cell 0`).toBe(false);
      expect(mayOrnament(section, 1), `${section} cell 1`).toBe(false);
    }
  });

  it('names the four cells that hold only type', () => {
    expect(ORNAMENTED_SECTIONS.sort()).toEqual(
      ['market', 'pressing-detail', 'price-history', 'snippet'].sort(),
    );
  });

  it('places one solid per section, in one cell', () => {
    /* A section ornaments at most one of its cells — "one per section". */
    for (const section of ORNAMENTED_SECTIONS) {
      const cells = [0, 1].filter((index) => mayOrnament(section, index));
      expect(cells, `${section} ornaments exactly one cell`).toHaveLength(1);
    }
  });

  it('ornaments the cell holding type where a section has two', () => {
    /*
      Pressing detail's pairs divide across 5+5 and both cells hold type, so the
      solid goes in the second; Price history's rows are in the second cell and
      its series in the first, so the solid goes in the first. The rule is which
      cell holds type ALONE, not which index it happens to be.
    */
    expect(mayOrnament('pressing-detail', 1)).toBe(true);
    expect(mayOrnament('price-history', 0)).toBe(true);
  });
});
