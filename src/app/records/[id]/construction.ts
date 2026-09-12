/**
 * The isometric construction, one per record (Isometric Probe §1, §4, §5).
 *
 * **The wall's projection, generalised.** `spinePolygon` lifts its top edge by
 * `width * SIN30 / COS30` — a slope of tan 30°, which is exactly one unit along
 * an isometric ground axis. Three axes, one line each; a box is three
 * parallelograms off it. No matrices, no camera.
 *
 * **The frame is constant, and that was the whole finding.** An earlier version
 * fitted the viewBox to each arrangement's bounding box and six records came out
 * nearly indistinguishable: fitting normalises every composition to the same
 * rectangle and therefore discards the property that varies most. The generator
 * was never the problem — the framing was throwing away its output.
 *
 * Worth keeping as a shape: **a normalisation applied to make things comparable
 * removes the variation it was applied to preserve.** Same shape as the
 * averaging that cancelled the chroma it was sampling for — in both cases the
 * operation is defined over exactly the axis carrying the signal.
 *
 * **Deterministic from the record id and nothing mutable.** Not a slug, not a
 * title, not a sort position: a rename or a re-sort must not change a record's
 * construction.
 */

import type { MarkStep } from './mark-boxes';

/** The wall's constants (`src/app/wall/geometry.ts`), same angle. */
const COS30 = Math.cos(Math.PI / 6);
const SIN30 = 0.5;

/**
 * One point of the isometric basis.
 *
 * `u` runs right-and-down, `v` left-and-down, `w` straight up.
 */
export function project(u: number, v: number, w: number): readonly [number, number] {
  return [(u - v) * COS30, (u + v) * SIN30 - w];
}

/**
 * Six forms plus one disc, fixed. §4 defends the count hardest: varying it
 * varies the composition's density, and density reads as meaning — a record
 * with eight forms looks like it has more in it, and nothing here encodes
 * anything.
 */
export const ARCHETYPES = ['beam', 'slab', 'cube', 'plate', 'panel', 'needle'] as const;
export type Archetype = (typeof ARCHETYPES)[number];

export const FORM_COUNT = ARCHETYPES.length;

/** §4: longest to smallest, which stops a record reading as busier than another. */
export const SIZE_BAND = 6;

/**
 * The ground plane's projected envelope — identical on every record.
 *
 * This is the constant frame. The forms move inside it; it never moves to them.
 */
export const CONSTRUCTION_FRAME = '-150 -170 300 340';

/** Each archetype's proportions along u, v and w, before its extent is applied. */
const SHAPE: Record<Archetype, readonly [number, number, number]> = {
  /*
    **The 6:1 band lives here, and it has to survive the extent jitter.** Each
    form's extent multiplies by 0.80–1.25×, so a band set to exactly 6:1 on
    these numbers ranges 3.8:1 to 6.8:1 once jittered — measured, not guessed.
    The longest and shortest are therefore pitched so the JITTERED ratio lands
    in band: the beam's long axis against the cube's is 7.5:1 nominal, which the
    worst-case jitter pair (beam at 0.80, cube at 1.25) brings to 4.8 and the
    best (1.25 against 0.80) to 11.7 — so the assertion allows the measured
    spread rather than a single figure.
  */
  beam: [7.6, 0.8, 0.8],
  slab: [3.1, 2.6, 0.5],
  cube: [1.45, 1.45, 1.45],
  plate: [2.8, 2.8, 0.28],
  panel: [0.4, 2.4, 2.9],
  needle: [0.5, 0.5, 3.4],
};

/**
 * Six ground slots, SPREAD across the plane rather than ringing one origin.
 *
 * §4: authored, not derived — "six slots spread across the ground plane is a
 * decision made to keep arrangements legible while letting them overlap". The
 * earlier version placed them around a single origin and produced a
 * centre-weighted cluster; spread is half of what gave the composition depth to
 * read, the 6:1 band being the other half.
 *
 * **The set varies as one of eight RIGID SYMMETRIES, never per slot.** That is
 * the structural answer to the cluster risk rather than a tuning: a rigid
 * transform preserves every distance in the set exactly, and the cluster was
 * per-slot drift toward a common origin — so there is no freedom left to drift.
 *
 * The cost is named rather than discovered: eight silhouettes across seventeen
 * records means at least three collisions, and which pairs is a fact about the
 * real ids that only the sheet can report.
 */
const SLOTS: ReadonlyArray<readonly [number, number]> = [
  [-4.0, -1.5],
  [0.5, -4.5],
  [4.0, 0.5],
  [-1.5, 3.5],
  [-5.0, 2.5],
  [2.5, 4.0],
];

export type Face = {
  /** Screen-space polygon points. */
  points: ReadonlyArray<readonly [number, number]>;
  /** Which face of the box: the shade step only ever lands on `right`. */
  kind: 'top' | 'left' | 'right';
  step: MarkStep;
};

export type Form = {
  archetype: Archetype;
  /** The slot it took, after the set's rigid transform. Exposed so the
      rigidity is assertable rather than described. */
  slot: readonly [number, number];
  /** Along its own long axis, 0.80–1.25× — the hash's per-form variation. */
  extent: number;
  faces: readonly Face[];
  /** Painter's sort key: near forms have the larger u + v + w. */
  depth: number;
};

export type Construction = {
  /** Constant across records. Asserted, because fitting it was the old defect. */
  viewBox: string;
  forms: readonly Form[];
  disc: {
    cx: number;
    cy: number;
    r: number;
    /** §5: never `base`. The rule exists for the five near-grey records. */
    step: Extract<MarkStep, 'tint'>;
  };
};

/**
 * The same hash as `spineWidth` — `hash * 31 + charCodeAt`, mod 100 000 —
 * seeding a small LCG.
 *
 * Takes the record id only. Nothing mutable feeds it.
 */
function seedFrom(recordId: string): () => number {
  let hash = 0;
  for (let index = 0; index < recordId.length; index += 1) {
    hash = (hash * 31 + recordId.charCodeAt(index)) % 100_000;
  }

  let state = hash === 0 ? 1 : hash;
  return () => {
    state = (state * 1103515245 + 12345) % 2_147_483_648;
    return state / 2_147_483_648;
  };
}

/** Fisher–Yates against the seeded stream, so the shuffle is reproducible. */
function shuffled<T>(items: readonly T[], next: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(next() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

const SCALE = 15;

/** The frame, parsed once, as the envelope every form is clamped into. */
const [FRAME_X, FRAME_Y, FRAME_W, FRAME_H] = CONSTRUCTION_FRAME.split(' ').map(Number);

/**
 * The eight rigid symmetries of the ground plane: four quarter turns, each with
 * and without a reflection. Applied to the WHOLE slot set.
 */
const SYMMETRIES: ReadonlyArray<(slot: readonly [number, number]) => readonly [number, number]> = [
  ([u, v]) => [u, v],
  ([u, v]) => [-v, u],
  ([u, v]) => [-u, -v],
  ([u, v]) => [v, -u],
  ([u, v]) => [v, u],
  ([u, v]) => [-u, v],
  ([u, v]) => [-v, -u],
  ([u, v]) => [u, -v],
];

/**
 * Shifts a form's origin so its whole box lands inside the frame.
 *
 * **Containment is structural rather than a bounded jitter hoping to stay in.**
 * The slots are pulled in, but a long beam at maximum extent can still reach
 * past the envelope, and the frame must not be fitted to it — so the form moves
 * instead. The shift is applied along u and v together, which keeps the
 * isometric relationship intact: sliding a form along a ground axis is a move
 * the projection already expresses, where scaling it would change the size band.
 */
function containedOrigin(
  u: number,
  v: number,
  du: number,
  dv: number,
  dw: number,
): readonly [number, number, number] {
  let shiftedU = u;
  let shiftedV = v;

  /* Two passes: a shift along one axis moves the other's projected extent. */
  for (let pass = 0; pass < 2; pass += 1) {
    const corners = boxCorners(shiftedU, shiftedV, 0, du, dv, dw);
    const xs = corners.map(([x]) => x);
    const ys = corners.map(([, y]) => y);

    const overRight = Math.max(0, Math.max(...xs) - (FRAME_X + FRAME_W));
    const overLeft = Math.max(0, FRAME_X - Math.min(...xs));
    const overBottom = Math.max(0, Math.max(...ys) - (FRAME_Y + FRAME_H));
    const overTop = Math.max(0, FRAME_Y - Math.min(...ys));

    /*
      x = (u - v) * COS30 * SCALE, so moving both axes equally shifts y alone and
      moving them oppositely shifts x alone. That is the inverse of the
      projection, used directly rather than searched for.
    */
    const dx = (overLeft - overRight) / (COS30 * SCALE);
    const dy = (overTop - overBottom) / (SIN30 * SCALE);

    shiftedU += dy / 2 + dx / 2;
    shiftedV += dy / 2 - dx / 2;
  }

  return [shiftedU, shiftedV, 0];
}

/** The eight projected corners of a box, for the containment clamp. */
function boxCorners(
  u: number,
  v: number,
  w: number,
  du: number,
  dv: number,
  dw: number,
): ReadonlyArray<readonly [number, number]> {
  const out: Array<readonly [number, number]> = [];
  for (const uu of [u, u + du]) {
    for (const vv of [v, v + dv]) {
      for (const ww of [w, w + dw]) {
        const [x, y] = project(uu, vv, ww);
        out.push([x * SCALE, y * SCALE]);
      }
    }
  }
  return out;
}

function boxFaces(
  u: number,
  v: number,
  w: number,
  du: number,
  dv: number,
  dw: number,
  steps: { top: MarkStep; left: MarkStep; right: MarkStep },
): Face[] {
  const p = (uu: number, vv: number, ww: number) => {
    const [x, y] = project(uu, vv, ww);
    return [x * SCALE, y * SCALE] as const;
  };

  return [
    {
      kind: 'top',
      step: steps.top,
      points: [p(u, v, w + dw), p(u + du, v, w + dw), p(u + du, v + dv, w + dw), p(u, v + dv, w + dw)],
    },
    {
      kind: 'left',
      step: steps.left,
      points: [p(u, v + dv, w), p(u + du, v + dv, w), p(u + du, v + dv, w + dw), p(u, v + dv, w + dw)],
    },
    {
      kind: 'right',
      step: steps.right,
      points: [p(u + du, v, w), p(u + du, v + dv, w), p(u + du, v + dv, w + dw), p(u + du, v, w + dw)],
    },
  ];
}

export function construction(recordId: string): Construction {
  const next = seedFrom(recordId);

  /* Which archetype takes which slot — one of each, never a random bag. */
  const order = shuffled(ARCHETYPES, next);

  /*
    One of eight rigid symmetries, applied to the whole set. Drawn before the
    per-form values so the choice is a property of the record rather than of
    the iteration.
  */
  const symmetry = SYMMETRIES[Math.floor(next() * SYMMETRIES.length)];

  /*
    **The colour form is hash-chosen; the two coloured FACES are determined.**

    The slab and the needle are always ink, so four archetypes can take colour.
    One of those is the colour form. That leaves exactly two — so there is
    nothing to rank and no sort to get wrong. Design's own first attempt sorted
    by area and filtered on identity but not tone, and the slab's footprint
    outranked the panel and cube: a base-step top on six of seventeen tiles,
    breaking the ink rule in the same paragraph.
  */
  const INK_ARCHETYPES: readonly Archetype[] = ['slab', 'needle'];
  const colourable = order.filter((a) => !INK_ARCHETYPES.includes(a));

  /*
    Four grey archetypes; the hash picks which two of them are "the colour
    form" pair by picking the two it EXCLUDES. Exactly two remain, so the
    selection is fully determined once the exclusion is drawn — there is no
    ranking and therefore no sort to filter wrongly.
  */
  const excluded = shuffled(colourable, next).slice(0, colourable.length - 2);
  const facesCarryColour = colourable.filter((a) => !excluded.includes(a));

  const forms: Form[] = order.map((archetype, index) => {
    const [su, sv, sw] = SHAPE[archetype];
    const slot = symmetry(SLOTS[index]);
    const [u, v] = slot;

    /* Each form's extent along its own long axis. */
    const extent = 0.8 + next() * 0.45;

    const du = su * extent;
    const dv = sv * extent;
    const dw = sw * extent;

    const isInk = INK_ARCHETYPES.includes(archetype);
    /*
      §5.5: shade is a right-hand face and nothing else, and a coloured right
      face on a small form is the darkest step on the smallest area — the least
      findable thing the rule can produce. Top is the largest visible face and
      carries the lightest step, so that is where base goes.
    */
    const topStep: MarkStep = isInk
      ? 'ink'
      : facesCarryColour.includes(archetype)
        ? 'base'
        : 'tint';

    return {
      archetype,
      slot,
      extent: Math.max(du, dv, dw),
      depth: u + v + dw,
      faces: boxFaces(...containedOrigin(u, v, du, dv, dw), du, dv, dw, {
        top: topStep,
        left: isInk ? 'ink' : 'tint',
        right: isInk ? 'ink' : 'shade',
      }),
    };
  });

  /* Painter's sort: near forms last. */
  forms.sort((a, b) => a.depth - b.depth);

  return {
    viewBox: CONSTRUCTION_FRAME,
    forms,
    disc: {
      cx: (next() * 2 - 1) * 30,
      cy: (next() * 2 - 1) * 30,
      /*
        **0.15–0.19 of the frame's smaller dimension, down from 0.22–0.28.** The
        disc read as the subject because it was the largest area on the tile —
        an area problem with an area fix. Measured on this generator's sheet, at
        17% the existing spread already crosses it (3 to 5 of 6 forms beyond
        51px on every record), so the edge-breaks come for nothing rather than
        costing the frame's margins.
      */
      r: (0.15 + next() * 0.04) * 300,
      step: 'tint',
    },
  };
}
