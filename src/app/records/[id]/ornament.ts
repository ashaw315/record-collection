import { COS30 } from '@/app/wall/geometry';
import { project } from './construction';

/**
 * 8a §25 (specimen, size rule, distribution), §26 (the page as a whole) and
 * §13's ornament clause, over §21's library.
 *
 * **The size rule is 0.855 of the section's height — the gate itself.** At
 * 0.62 a figure showed 78 of an allowed 107, conservative by a quarter for no
 * stated reason; at 0.855 the visible height equals the two-thirds ceiling
 * exactly, so the gate binds and the part of the figure beyond it bleeds
 * below the cell's foot, which §9.2 makes deliberate.
 *
 * **Distribution is §26's and it is a placement, not a per-section rule.** Two
 * figures in eight sections, never consecutive: a pair in Pressing detail's
 * air column and a solo in Price history's strip. Two flats on opposite page
 * edges: the tint triangle off the left in the last row's air, the base
 * quarter-disc off the right beside About this record — the lighter value
 * lower, because weight lightens down the page. The ceiling is not a target;
 * the balance comes from the gaps, and a figure in every legal section is
 * what reads as monotonous.
 *
 * §9.4's full tint fill of the last section is superseded by §26's two flats:
 * the region's flat colour is the triangle and the quarter-disc, and nothing
 * else — a third flat shape makes the region read as a layout with colour
 * blocks rather than a page with marks in it (§13).
 */

/** §25: of the SECTION's height, which is the height a build has before its cells lay out. */
export const SIZE_RATIO = 0.855;
/** §9.2's gate: a figure renders only where its visible part is at most two-thirds of its cell. */
export const GATE_RATIO = 2 / 3;
/** What sits below the cell's foot at the ruled size, as a fraction of the section — the deliberate bleed. */
export const BLEED_RATIO = SIZE_RATIO - GATE_RATIO;
/** §9.2: the cell is about 1.2px shorter than its section (the section carries the 1px border-top). */
/**
 * **Zero since step 29(f): the section no longer carries its row's rule.**
 *
 * This was 1.2 -- the 1px top border plus a rounding -- because a figure's
 * percentage height resolves against the section's padding box, which the
 * border made shorter than the row track, and the pixel term put the border
 * back so 0.855 was of the section and not of something 1px smaller.
 *
 * §33 moved the row rule off the section onto one element per row, so the
 * padding box IS the track and there is nothing to restore. Left at 1.2 the
 * term over-corrected: measured, the price-history figure drew 159.2px in a
 * 185px section, 0.8605 against 0.855, and the ratio test caught it.
 */
export const SECTION_CELL_DELTA = 0;

/**
 * §25's specimen sheet, every figure drawn at one height: 171 = 0.855 × 200.
 * Widths are read off the sheet, so the aspect is the drawing's and the
 * height stays the governed term.
 */
export const SPECIMEN_HEIGHT = 171;
export const ARCHETYPE_ASPECT = {
  beam: 249 / SPECIMEN_HEIGHT,
  slab: 92 / SPECIMEN_HEIGHT,
  cube: 148 / SPECIMEN_HEIGHT,
  plate: 269 / SPECIMEN_HEIGHT,
  panel: 88 / SPECIMEN_HEIGHT,
  /** §21's "line". Passes the 6px face floor at 12px at the ruled size and at no smaller one. */
  rod: 12 / SPECIMEN_HEIGHT,
} as const;
export type OrnamentArchetype = keyof typeof ARCHETYPE_ASPECT;

/** §21: curved forms are admitted because they are constructed — a circle or arc in plan, raised. Free outlines are not. */
export const CURVED_ASPECT = {
  cylinder: 184 / SPECIMEN_HEIGHT,
  ring: 226 / SPECIMEN_HEIGHT,
  quarterRing: 322 / SPECIMEN_HEIGHT,
} as const;
export type CurvedForm = keyof typeof CURVED_ASPECT;

/** §25: no face narrower than this as drawn — below it a solid reads as a rule, within reach of §W.31's 2px. */
export const MIN_FACE_WIDTH = 6;

/**
 * §21's pairs: two archetypes whose footprints do not overlap in plan and
 * whose silhouettes do overlap in projection. §25 states each pair's box
 * area against its larger solo — ×1.59, ×1.48, ×1.89 — and the rule is
 * 1.2. Three is not in the library.
 */
export const PAIRS: ReadonlyArray<readonly [OrnamentArchetype, OrnamentArchetype]> = [
  ['slab', 'beam'],
  ['panel', 'cube'],
  ['plate', 'slab'],
];

/**
 * The extents the figures are raised from, read off §26's drawing at its own
 * scale — each projects to the sheet's aspect (asserted in the unit test).
 * The beam LIES: 7.5 along u, under one wide, under one tall. The slab and
 * the panel stand; the plate is a square nearly flat; the cube is a cube; the
 * rod is the line §21 names, thin enough to fail the 6px floor at any size
 * below the ruled one.
 */
export const EXTENTS: Record<OrnamentArchetype, readonly [number, number, number]> = {
  beam: [7.5, 0.81, 0.8],
  slab: [1.27, 2.31, 4.0],
  cube: [1.5, 1.5, 1.5],
  plate: [2.77, 2.77, 0.3],
  panel: [2.42, 0.35, 3.2],
  rod: [0.12, 0.12, 2.85],
};

/** A form standing on the plan at `origin`. */
export type PlacedForm = { archetype: OrnamentArchetype; origin: readonly [number, number] };

/**
 * Where a pair's second form stands, in plan, with the first at the origin.
 * Read off §26's drawing for slab + beam (the slab stands behind the lying
 * beam); the other two are placed by the same rule — footprints disjoint,
 * silhouettes overlapping — and their ratios are the test's, not the sheet's.
 */
const PAIR_ORIGIN: Record<string, readonly [number, number]> = {
  'slab+beam': [-3.6, 2.6],
  'panel+cube': [0.5, 0.8],
  'plate+slab': [0.7, 3.1],
};

/** The six-point outline of a box in projection — the corners a silhouette is made of. */
export function silhouette({ archetype, origin: [u, v] }: PlacedForm): Array<readonly [number, number]> {
  const [du, dv, dw] = EXTENTS[archetype];
  return [
    project(u, v, dw),
    project(u + du, v, dw),
    project(u + du, v, 0),
    project(u + du, v + dv, 0),
    project(u, v + dv, 0),
    project(u, v + dv, dw),
  ];
}

/** A box's eight projected corners. */
export function boxCorners(u: number, v: number, extent: readonly [number, number, number]): Array<readonly [number, number]> {
  const [du, dv, dw] = extent;
  const out: Array<readonly [number, number]> = [];
  for (const [a, b, c] of [[0, 0, 0], [du, 0, 0], [0, dv, 0], [du, dv, 0], [0, 0, dw], [du, 0, dw], [0, dv, dw], [du, dv, dw]] as const) {
    out.push(project(u + a, v + b, c));
  }
  return out;
}

const bounds = (points: ReadonlyArray<readonly [number, number]>) => {
  const xs = points.map(([x]) => x);
  const ys = points.map(([, y]) => y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  return { minX, minY, width: Math.max(...xs) - minX, height: Math.max(...ys) - minY };
};

/** Width over height of a box's projected bounds — the sheet's "aspect". */
export function projectedAspect(extent: readonly [number, number, number]): number {
  const b = bounds(boxCorners(0, 0, extent));
  return b.width / b.height;
}

/** §25: footprints disjoint — in PLAN, where each form is an axis-aligned rectangle. */
export function footprintsDisjoint(a: PlacedForm, b: PlacedForm): boolean {
  const [au, av] = EXTENTS[a.archetype];
  const [bu, bv] = EXTENTS[b.archetype];
  const gapU = Math.max(b.origin[0] - (a.origin[0] + au), a.origin[0] - (b.origin[0] + bu));
  const gapV = Math.max(b.origin[1] - (a.origin[1] + av), a.origin[1] - (b.origin[1] + bv));
  return gapU > 0 || gapV > 0;
}

/** §25: silhouettes overlapping — two convex hexagons, tested by separating axis. */
export function silhouettesOverlap(a: PlacedForm, b: PlacedForm): boolean {
  const A = silhouette(a);
  const B = silhouette(b);
  for (const poly of [A, B]) {
    for (let i = 0; i < poly.length; i++) {
      const [x1, y1] = poly[i];
      const [x2, y2] = poly[(i + 1) % poly.length];
      const nx = y2 - y1;
      const ny = x1 - x2;
      const along = (pts: ReadonlyArray<readonly [number, number]>) => pts.map(([x, y]) => x * nx + y * ny);
      const pa = along(A);
      const pb = along(B);
      if (Math.max(...pa) <= Math.min(...pb) || Math.max(...pb) <= Math.min(...pa)) return false;
    }
  }
  return true;
}

/** §26's two figures, keyed by the section and the place in its row they occupy. */
export type Figure =
  | { kind: 'pair'; forms: readonly [OrnamentArchetype, OrnamentArchetype] }
  | {
      kind: 'solo';
      form: OrnamentArchetype;
      /**
       * §57: "The Price history solo is sized to the strip's free height
       * below its entries, as the matrix solid is sized to its cell's, and is
       * drawn only where that free height clears §29's bound." Absent, the
       * figure takes §25's 0.855 of its section, which the pair keeps.
       */
      sizing?: 'free-height';
    };

/** The placed forms of a figure and their projected bounds — the box a figure is sized and drawn by. */
export function figureBox(figure: Figure): { forms: PlacedForm[]; minX: number; minY: number; width: number; height: number } {
  const forms: PlacedForm[] =
    figure.kind === 'solo'
      ? [{ archetype: figure.form, origin: [0, 0] }]
      : [
          { archetype: figure.forms[0], origin: [0, 0] },
          { archetype: figure.forms[1], origin: PAIR_ORIGIN[figure.forms.join('+')] ?? [1, 0] },
        ];
  const box = bounds(forms.flatMap((f) => boxCorners(f.origin[0], f.origin[1], EXTENTS[f.archetype])));
  return { forms, ...box };
}

/** §25: the pair's combined projected box against the larger solo's, by AREA — drawn widths compare two scales. */
export function pairBoxRatio(pair: readonly [OrnamentArchetype, OrnamentArchetype]): number {
  const area = (b: { width: number; height: number }) => b.width * b.height;
  const larger = Math.max(...pair.map((form) => area(figureBox({ kind: 'solo', form }))));
  return area(figureBox({ kind: 'pair', forms: pair })) / larger;
}

export function solidSize(sectionHeight: number, archetype: OrnamentArchetype): { width: number; height: number } {
  const height = Math.round(sectionHeight * SIZE_RATIO);
  return { height, width: Math.round(height * ARCHETYPE_ASPECT[archetype]) };
}

export function visibleRatio(sectionHeight: number, cellHeight: number): number {
  if (cellHeight <= 0) return Number.POSITIVE_INFINITY;
  const visible = Math.round(sectionHeight * SIZE_RATIO) - Math.round(sectionHeight * BLEED_RATIO);
  return Math.min(visible, cellHeight) / cellHeight;
}

/** The gate takes no archetype: height is governed for every one, so the answer cannot depend on which is drawn. */
export function gatePasses(sectionHeight: number, cellHeight: number): boolean {
  if (cellHeight <= 0 || sectionHeight <= 0) return false;
  return visibleRatio(sectionHeight, cellHeight) <= GATE_RATIO + 0.01;
}

/** §9.2's clearance: no figure within half a column of a control's box. */
export const CONTROL_CLEARANCE = 60;

/*
  A single right-inset constant of 240 was here, fitted across §26's two
  figures, replaced by step 28's two rules keyed to the HOST
  (`figurePlacement` in region-rows.ts). It was right for the full-width
  strip and wrong for the air column, where the figure is centred rather
  than inset — and it put both figures on one vertical the drawing does not
  have.
*/

export type FigurePlace = 'air' | 'strip';
export const FIGURES: Readonly<Record<string, Figure>> = {
  /* Pressing detail's air column, row one. §26 does not name the pair; §25 lists three and this is its first. */
  'pressing-detail:air': { kind: 'pair', forms: ['slab', 'beam'] },
  /* Price history's full-width strip, row three. The archetype is §9.2's for this section. */
  'price-history:strip': { kind: 'solo', form: 'panel', sizing: 'free-height' },
};

/**
 * §29's bound is a FACE width, "no face narrower than 6px as drawn", and a
 * figure sized by its free height (§57) has to apply it at whatever height it
 * lands on. This is the narrowest face's projected width per pixel of the
 * figure's drawn height: a form's left face spans its first extent and its
 * right face its second, each foreshortened by cos 30°, over the box the
 * figure is drawn into. The rod at the ruled size is the check: 0.12 × cos 30°
 * over a 2.97 box is 6px at 171.
 */
export function smallestFaceRatio(figure: Figure): number {
  const box = figureBox(figure);
  const narrowest = Math.min(...box.forms.map(({ archetype }) => Math.min(EXTENTS[archetype][0], EXTENTS[archetype][1]) * COS30));
  return narrowest / box.height;
}
export function figureAt(section: string, place: FigurePlace): Figure | null {
  return FIGURES[`${section}:${place}`] ?? null;
}

/**
 * §26's two flats, on opposite page edges. `rowIndex` is the row of §26's
 * five, so "weight lightens down the page" is a comparison and not a claim.
 */
export const FLATS = {
  /* §53 (steps 60b, 61): the lower About row is gone and Images ends its row at the page's right edge at every width, so the disc's host is Images. */
  right: { shape: 'quarterDisc', step: 'base', edge: 'right', beside: 'images', rowIndex: 3, radius: 150 },
  left: { shape: 'triangle', step: 'tint', edge: 'left', beside: 'journal', rowIndex: 4 },
} as const;
