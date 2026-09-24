/**
 * 8a §5.1 — what the LAYOUT owes each of the nine marks, and no more.
 *
 * **A box each: a cell, an inset and an anchor corner.** §5.4 is explicit that
 * the ornament has no geometry in the spec "and will not be given any —
 * specifying vertices would fix by hand the exact thing the generator exists to
 * derive, and would need re-specifying the moment the slot set changes". So
 * shapes, sizes and the disc's radius come from the hash; this module says
 * where a mark may live and what step it takes, and stops.
 *
 * The boundary is asserted rather than described: `mark-boxes.test.ts` fails if
 * anything here grows a vertex list, a radius or a width.
 *
 * **Seven derived marks and two fixed-ink ones** (§5.1). The two black marks
 * anchor the construction rather than being its subject, so they never take the
 * ladder.
 */

/** §5.5's steps, plus the fixed ink the two black marks take. */
export type MarkStep =
  | 'tint'
  | 'base'
  | 'shade'
  | 'ink'
  /**
   * Neutral, and NOT on the ladder. The construction's non-carrying forms take
   * it: the reference is silver and black forms with colour in them, and
   * tinting every face made the whole object the record's hue.
   */
  | 'grey';

/**
 * Where in its cell a mark hangs. Not a coordinate — the generator resolves an
 * anchor plus its own size into a position.
 */
export type MarkAnchor =
  | 'top-left'
  | 'top-right'
  | 'bottom-left'
  | 'bottom-right'
  /** The mark is the cell's own ground. */
  | 'fill'
  /** A rule or bar on the cell's right edge. */
  | 'right-edge';

export type MarkBox = {
  /** The `data-cell` this mark belongs to. */
  cell: string;
  /** Which band it is in, for §5.5's one-or-two-base-marks-per-band rule. */
  band: 'identity' | 'record';
  /** Distance from the anchor, in px. The generator owns everything else. */
  inset: number;
  anchor: MarkAnchor;
  step: MarkStep;
  /**
   * §5.4: "decoration does not decorate an absence." Ornament is suppressed
   * when its cell is empty, because a decorated empty cell reads as a designed
   * state rather than as a gap the reader can fill. Structural marks persist.
   */
  suppressWhenEmpty: boolean;
};

/**
 * The nine marks, in the order §5.1 says the eye takes them.
 *
 * `step` is fixed here rather than chosen at render time: §5.5's system only
 * reads if the strong marks always touch the record and the pale ones are
 * always behind something, which is a property of the assignment and not of any
 * single mark.
 */
export const MARKS = {
  /** The only mark that carries type, which is what sets the lightness floor. */
  releaseYearField: {
    cell: 'year',
    band: 'record',
    inset: 0,
    anchor: 'fill',
    step: 'base',
    suppressWhenEmpty: false,
  },
  /** Base: it frames the record's own material. */
  sleeveBar: {
    cell: 'sleeve',
    band: 'identity',
    inset: 0,
    anchor: 'right-edge',
    step: 'base',
    suppressWhenEmpty: false,
  },
  /*
    **§28 withdraws the identity triangle with the ornament track that held
    it.** "The identity cell carries no ornament. Its corner field and
    ornament track are withdrawn, and the ornament step leaves §4.2's give
    order." A track holding a triangle on most records and 1px on the worst
    makes ornament's presence depend on the record, which §21 forbids — the
    same defect as hashing ornament, reached through the give order.

    The §1, §6.1 and §10 drawings still show it and are superseded on that
    point.
  */
  /** Ground behind the rendered still; only the disc takes colour, not the still. */
  stillDisc: {
    cell: 'still',
    band: 'identity',
    inset: 0,
    anchor: 'fill',
    step: 'tint',
    suppressWhenEmpty: true,
  },
  provenanceArc: {
    cell: 'provenance',
    band: 'record',
    inset: 18,
    anchor: 'bottom-right',
    step: 'tint',
    suppressWhenEmpty: true,
  },
  aboutArc: {
    cell: 'journal',
    band: 'record',
    inset: 18,
    anchor: 'bottom-right',
    step: 'tint',
    suppressWhenEmpty: true,
  },
  /**
   * §3: the only 2px edge and the only rule on the page that is not grey. It
   * marks the cell whose content the owner WRITES rather than records, and
   * persists beside a diagonal because it marks the cell, not its content.
   */
  journalEdge: {
    cell: 'journal',
    band: 'record',
    inset: 0,
    anchor: 'right-edge',
    step: 'base',
    suppressWhenEmpty: false,
  },

  /* The two fixed-ink marks. Never derived — they anchor the construction. */
  sleeveBlock: {
    cell: 'sleeve',
    band: 'identity',
    inset: 0,
    anchor: 'right-edge',
    step: 'ink',
    suppressWhenEmpty: false,
  },
  aboutSquare: {
    cell: 'journal',
    band: 'record',
    inset: 18,
    anchor: 'bottom-left',
    step: 'ink',
    suppressWhenEmpty: true,
  },
} as const satisfies Record<string, MarkBox>;

export type MarkName = keyof typeof MARKS;

export function markBox(name: MarkName): MarkBox {
  return MARKS[name];
}

/** Every mark in a band, for §5.5's base-mark budget. */
export function marksForBand(band: 'identity' | 'record'): MarkName[] {
  return (Object.keys(MARKS) as MarkName[]).filter((name) => MARKS[name].band === band);
}
