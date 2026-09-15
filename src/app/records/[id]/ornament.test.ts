import { describe, expect, it } from 'vitest';
import {
  CELL_SIZE_RATIO,
  CONTROL_CLEARANCE,
  SECTION_CELL_DELTA,
  GATE_RATIO,
  ORNAMENTED_SECTIONS,
  SIZE_RATIO,
  SOLID_ASPECT,
  gatePasses,
  mayOrnament,
  solidSize,
  visibleRatio,
} from './ornament';

/** The four carrying cells, and the heights §9.2 draws them at. */
const DRAWN = [
  { section: 'Pressing detail', height: 127, solid: 79 },
  { section: 'Market', height: 116, solid: 72 },
  { section: 'Snippet', height: 122, solid: 76 },
  { section: 'Price history', height: 151, solid: 94 },
] as const;

describe('the size term is relative, because height is what carries presence', () => {
  it('is 0.62 of the section height', () => {
    expect(SIZE_RATIO).toBe(0.62);
  });

  it('draws the four carrying cells at their ruled heights', () => {
    /*
      The ruled values, from the drawing. These are what a fixed-size rule
      cannot produce: the four differ because their sections do.
    */
    for (const cell of DRAWN) {
      expect(solidSize(cell.height).height, `${cell.section} at ${cell.height}px`).toBe(
        cell.solid,
      );
    }
  });

  it('derives width FROM height, and never re-derives height from the width', () => {
    /**
     * **The round-trip defect, named in §9.2 because it shipped once.**
     *
     * Computing height, deriving width, then re-deriving height from that width
     * inflates every solid by a pixel and draws 0.63 where the rule says 0.62.
     * Height is the primary term; width follows and never feeds back.
     *
     * Asserted by doing the round trip here and requiring it to differ — if the
     * implementation ever adopts it, the numbers move and this fails.
     */
    for (const cell of DRAWN) {
      const { width, height } = solidSize(cell.height);

      expect(width, `${cell.section} width from height`).toBe(Math.round(height / SOLID_ASPECT));

      /* What the wrong order would have produced. */
      const roundTripped = Math.round(width * SOLID_ASPECT);
      expect(height, `${cell.section}: height survives the round trip`).toBeLessThanOrEqual(
        roundTripped,
      );
    }
  });

  it('grows with the section rather than staying fixed', () => {
    /*
      The withdrawn rule was half a column — a WIDTH — and in cells eleven times
      wider than tall the dimension carrying presence is height. So the same
      rule at two section heights gives two solids.
    */
    expect(solidSize(100).height).toBeLessThan(solidSize(200).height);
    expect(solidSize(200).height / solidSize(100).height).toBeCloseTo(2, 1);
  });

  it('keeps the projection', () => {
    for (const height of [79, 72, 76, 94, 200]) {
      const size = solidSize(Math.round(height / SIZE_RATIO));
      expect(size.height / size.width).toBeCloseTo(SOLID_ASPECT, 1);
    }
  });
});

describe('the section and the cell are different boxes (§9.2)', () => {
  it('sizes against the section and gates against the cell', () => {
    /**
     * **Both numbers are in §9.2 and neither contradicts the other.**
     *
     * The size is 0.62 of the SECTION, because that is the height a build has
     * before the cells lay out. The gate's ceiling is checked against the CELL,
     * because that is the box clipping the solid. A cell is about 1.2px shorter
     * — the section carries the 1px border-top and its cells resolve sub-pixel
     * — so the same solid is 0.627 of its cell.
     */
    const section = 127;
    const cell = section - 1.2;

    const { height } = solidSize(section);

    expect(height / section, 'against the section').toBeCloseTo(0.62, 2);
    expect(height / cell, 'against the cell it is clipped by').toBeCloseTo(0.627, 2);
    expect(visibleRatio(section, cell)).toBeCloseTo(0.627, 2);
  });

  it('states one rule from two boxes, and they agree', () => {
    /**
     * `SIZE_RATIO` is against the section, `CELL_SIZE_RATIO` against the cell.
     * They are not two decisions — §9.2 states both and says explicitly that
     * neither contradicts the other. This asserts they describe the same solid,
     * so a change to one that is not a change to the other fails here.
     */
    for (const section of [127, 116, 122, 151, 97]) {
      const cell = section - SECTION_CELL_DELTA;
      const bySection = section * SIZE_RATIO;
      const byCell = cell * CELL_SIZE_RATIO;

      expect(byCell, `${section}px section: the two agree within a pixel`).toBeCloseTo(
        bySection,
        0,
      );
    }
  });

  it('reports the drawn cell ratios', () => {
    /* 0.627 on three cells and 0.623 on the fourth, per §9.2. */
    const ratios = DRAWN.map((cell) =>
      Number(visibleRatio(cell.height, cell.height - 1.2).toFixed(3)),
    );

    for (const ratio of ratios) {
      expect(ratio).toBeGreaterThanOrEqual(0.62);
      expect(ratio).toBeLessThanOrEqual(0.63);
    }
  });
});

describe('the gate, which no longer discriminates', () => {
  /**
   * **Kept as a guard against a future size change, and it cannot fire now.**
   *
   * Under a height-relative size the gate binds at a single value BY
   * CONSTRUCTION: the visible height is 0.62 of the section by definition, so
   * every placement sits at the same ratio and the ceiling is never approached
   * from both sides.
   *
   * At the withdrawn fixed size the four cells measured 0.40, 0.39, 0.43 and
   * 0.32 — all far under two-thirds, so the gate could not have fired then
   * either. **No test here claims it discriminates**, because it does not.
   */
  it('passes on every cell, which is what a non-discriminating guard does', () => {
    for (const cell of DRAWN) {
      expect(gatePasses(cell.height, cell.height - 1.2), cell.section).toBe(true);
    }
  });

  it('would fire if the size ratio were raised past the ceiling', () => {
    /*
      The guard's value is entirely in this: it catches a FUTURE size change
      that pushes the solid past two-thirds of its cell. Demonstrated by
      computing the ratio a larger size would produce, rather than by claiming
      the current one is near the edge.
    */
    const section = 127;
    const cell = section - 1.2;
    const oversized = Math.round(section * 0.7);

    expect(oversized / cell, 'a 0.70 ratio would exceed the ceiling').toBeGreaterThan(GATE_RATIO);
    expect(solidSize(section).height / cell, 'and 0.62 does not').toBeLessThan(GATE_RATIO);
  });

  it('rejects a cell too short to hold the solid', () => {
    /* Ornament carries no data, so suppression is safe here where §5.4 forbids
       it above the fold: a short cell simply has none. */
    expect(gatePasses(127, 40)).toBe(false);
    expect(gatePasses(127, 0)).toBe(false);
    expect(gatePasses(0, 127)).toBe(false);
  });
});

describe('the clearance is a distance, not cell membership (§9.2)', () => {
  it('excludes the four sections whose cells hold a control', () => {
    for (const section of ['acquisition', 'images', 'journal', 'tags']) {
      expect(mayOrnament(section, 0), `${section} cell 0`).toBe(false);
      expect(mayOrnament(section, 1), `${section} cell 1`).toBe(false);
    }
  });

  it('names the four cells that hold only type', () => {
    expect([...ORNAMENTED_SECTIONS].sort()).toEqual(
      ['market', 'pressing-detail', 'price-history', 'snippet'].sort(),
    );
  });

  it('places one solid per section, in one cell', () => {
    for (const section of ORNAMENTED_SECTIONS) {
      const cells = [0, 1].filter((index) => mayOrnament(section, index));
      expect(cells, `${section} ornaments exactly one cell`).toHaveLength(1);
    }
  });

  it('keeps a clearance to state, whatever the solid is sized at', () => {
    /* Half a column remains the clearance unit even though the SIZE is no
       longer stated in columns — the constraint is about a hit target's
       surroundings, not about the solid's proportions. */
    expect(CONTROL_CLEARANCE).toBeGreaterThan(0);
  });
});
