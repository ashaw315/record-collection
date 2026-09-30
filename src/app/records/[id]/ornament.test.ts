import { describe, expect, it } from 'vitest';
import {
  ARCHETYPE_ASPECT,
  BLEED_RATIO,
  CURVED_ASPECT,
  EXTENTS,
  FIGURES,
  FLATS,
  GATE_RATIO,
  MIN_FACE_WIDTH,
  PAIRS,
  SIZE_RATIO,
  SPECIMEN_HEIGHT,
  figureAt,
  figureBox,
  footprintsDisjoint,
  gatePasses,
  pairBoxRatio,
  projectedAspect,
  silhouettesOverlap,
  solidSize,
  visibleRatio,
  type OrnamentArchetype,
} from './ornament';

/**
 * 8a §25 (the specimen, the size rule raised, distribution) and §26 (the page
 * as a whole), with §13's ornament clause and §21's library behind them.
 *
 * **The size rule is 0.855 of the section's height, which is the gate
 * itself.** At 0.62 a figure showed 78 of an allowed 107 — conservative by a
 * quarter for no stated reason, and Adam's "boring" was that quarter. At
 * 0.855 the visible height equals the two-thirds ceiling exactly: the gate
 * binds, and every figure in §25's specimen is drawn touching it.
 *
 * **Distribution is §26's, not a rule about sections.** Two figures in eight
 * sections, never consecutive: the pair in Pressing detail's air, the solo in
 * Price history's strip. Two flats on opposite page edges: the tint triangle
 * bleeding off the left in the last row's air, the base quarter-disc off the
 * right beside About this record. Weight lightens down the page.
 */

describe('the size rule (§25)', () => {
  it('is 0.855 of the section height — the gate itself, raised from 0.62', () => {
    expect(SIZE_RATIO).toBe(0.855);
  });

  it('shows exactly the two-thirds ceiling: what bleeds below the foot is the difference', () => {
    expect(GATE_RATIO).toBeCloseTo(2 / 3, 6);
    expect(BLEED_RATIO, 'the part below the cell’s foot, as a fraction of the section').toBeCloseTo(SIZE_RATIO - GATE_RATIO, 6);
    /* The gate passes at the ruled size on any section: visible = 2/3, never more. */
    for (const section of [120, 127, 175, 200, 300]) {
      expect(gatePasses(section, section - 1), `${section}`).toBe(true);
      expect(visibleRatio(section, section - 1), `${section}: visible`).toBeLessThanOrEqual(GATE_RATIO + 0.01);
    }
  });

  it('derives height from the section and width from the archetype, never the reverse', () => {
    const at = (a: OrnamentArchetype) => solidSize(200, a);
    expect(at('cube').height, 'height is the governed term').toBe(Math.round(200 * SIZE_RATIO));
    expect(at('panel').width, 'a panel is narrower than a cube').toBeLessThan(at('cube').width);
    expect(at('plate').width, 'a plate is wider than a beam').toBeGreaterThan(at('beam').width);
  });
});

describe('the library (§21, §25): six solids, three curves, three pairs', () => {
  it('reproduces §25’s specimen at its drawn height', () => {
    /* Every figure on the sheet is drawn at 171 = 0.855 × 200; the widths are read off it. */
    expect(SPECIMEN_HEIGHT).toBe(171);
    const drawn: Record<OrnamentArchetype, number> = { beam: 249, slab: 92, cube: 148, plate: 269, panel: 88, rod: 12 };
    for (const [archetype, width] of Object.entries(drawn) as [OrnamentArchetype, number][]) {
      expect(Math.round(SPECIMEN_HEIGHT * ARCHETYPE_ASPECT[archetype]), `${archetype} ${width} × 171`).toBe(width);
    }
    expect(Math.round(SPECIMEN_HEIGHT * CURVED_ASPECT.cylinder), 'cylinder').toBe(184);
    expect(Math.round(SPECIMEN_HEIGHT * CURVED_ASPECT.ring), 'ring').toBe(226);
    expect(Math.round(SPECIMEN_HEIGHT * CURVED_ASPECT.quarterRing), 'quarter ring').toBe(322);
  });

  it('raises each solid from extents that project to the sheet’s silhouette', () => {
    /*
      The sheet's widths are the ruling; the extents are what the build raises.
      Asserted here because the rendering draws the EXTENTS through the
      projection, so an extent that projects to the wrong aspect draws a form
      the sheet does not show — and the E2E measures the rendering.
    */
    for (const archetype of Object.keys(EXTENTS) as OrnamentArchetype[]) {
      expect(projectedAspect(EXTENTS[archetype]), archetype).toBeCloseTo(ARCHETYPE_ASPECT[archetype], 1);
    }
  });

  it('holds no face narrower than 6px at the ruled size, and the rod is the case', () => {
    expect(MIN_FACE_WIDTH).toBe(6);
    /* The rod passes at 12px at the ruled size and is ineligible at any smaller one. */
    expect(solidSize(200, 'rod').width).toBe(12);
    expect(solidSize(100, 'rod').width, 'half the size, half the width').toBeLessThan(MIN_FACE_WIDTH + 1);
  });

  it('pairs earn their box: footprints disjoint, silhouettes overlapping, area ≥ 1.2× the larger solo', () => {
    for (const pair of PAIRS) {
      const name = pair.join('+');
      const { forms } = figureBox({ kind: 'pair', forms: pair });
      expect(forms, `${name} is two placed forms`).toHaveLength(2);
      expect(footprintsDisjoint(forms[0], forms[1]), `${name}: footprints do not overlap in plan`).toBe(true);
      expect(silhouettesOverlap(forms[0], forms[1]), `${name}: silhouettes overlap in projection`).toBe(true);
      expect(pairBoxRatio(pair), `${name} box area against its larger solo`).toBeGreaterThanOrEqual(1.2);
    }
    /* Three is not in the library. */
    expect(PAIRS.every((p) => p.length === 2)).toBe(true);
  });
});

describe('distribution (§26 over §25)', () => {
  it('places exactly two figures: the pair in Pressing detail’s air, the solo in Price history’s strip', () => {
    expect(figureAt('pressing-detail', 'air')).toEqual({ kind: 'pair', forms: ['slab', 'beam'] });
    expect(figureAt('price-history', 'strip')?.kind).toBe('solo');
    expect(Object.keys(FIGURES)).toHaveLength(2);
  });

  it('places nothing in the other six sections — never consecutive, at most one per three', () => {
    for (const section of ['acquisition', 'tags', 'market', 'images', 'journal']) {
      expect(figureAt(section, 'strip'), section).toBeNull();
      expect(figureAt(section, 'air'), section).toBeNull();
    }
  });

  it('puts the two flats on opposite page edges, tint lower than base', () => {
    expect(FLATS.left, 'tint triangle, left edge, last row’s air').toMatchObject({ shape: 'triangle', step: 'tint', edge: 'left' });
    /* §53 (steps 60b, 61): the lower About row is gone; the disc's host is Images, which ends the row at the page's right edge at every width. */
    expect(FLATS.right, 'base quarter-disc, right edge, beside Images').toMatchObject({ shape: 'quarterDisc', step: 'base', edge: 'right', beside: 'images' });
    /* Weight lightens down the page: the base flat sits above the tint flat. */
    expect(FLATS.right.rowIndex).toBeLessThan(FLATS.left.rowIndex);
  });
});
