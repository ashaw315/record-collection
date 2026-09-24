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
import { REAL_RECORD_IDS } from './real-records';

/** The wall's constants (`src/app/wall/geometry.ts`), same angle. */
/* The wall's projection, by import — one definition, not a copy. */
import { COS30, SIN30 } from '@/app/wall/geometry';

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
 * **§31: the frame is a STATED constant, not a result.**
 *
 * It is the union of (forms ∪ disc) measured across the collection in step
 * 18 — `-139.5932 -186.0000 294.7735 313.6029` — with its origin floored and
 * its extent rounded up to the next whole unit. §31: "the rounding is the
 * tolerance, not slack. At full precision the widest current record would fit
 * by exactly zero, which makes its fit an equality: a coincidence, not a
 * margin (§W.18)."
 *
 * **Stated rather than computed, because a computed frame is a mutable input
 * to every drawing.** A frame fitted to the collection's extremes changes
 * when Adam buys a record, and through §22's guard that can change an
 * existing record's colour placement or its arrangement. §5.1 forbids feeding
 * the drawing anything that changes. With the constant, a record's drawing
 * depends only on its id and on numbers in this file.
 *
 * The cost of the rounding, measured: 0.41% of width, against §31's estimate
 * of at most 1 ÷ 432 = 0.23%. The extra is the origin flooring as well as the
 * extent rounding up, which grows the box on both sides of each axis.
 */
export const CONSTRUCTION_FRAME = '-140 -186 296 314';

/**
 * §31: the hash advances at most this many times before the fallbacks are
 * used.
 *
 * **A guard, not a test.** At the measured 14.1% rejection rate, reaching it
 * needs 32 consecutive rejections — 0.141³² ≈ 6 × 10⁻²⁸ — so no id will ever
 * reach it in practice. The fallbacks below it are built because §31 rules
 * them and because an unreachable branch that throws is worse than one that
 * renders, not because the cap is expected to bind.
 */
export const HASH_ADVANCE_CAP = 32;

/** An id reserved for testing the exhausted-hash fallback, which no real id reaches. */
export const EXHAUSTED_ID = 'exhausted-arrangement-fixture';

/** The margin the shared frame keeps around its extreme, so the outermost form has air and the shadows have room. */
export const FRAME_PAD = 16;

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
  /*
    **The long axis is VERTICAL on the two largest forms, and that is the fix
    for a composition that lay down.**

    Measured against the reference: it stacks — a slab standing upright, a beam
    crossing above it, a panel on end — and gets its presence from HEIGHT. Ours
    put its 7.6-unit beam along a ground axis, so the largest form ran
    horizontally and the whole arrangement hugged the bottom of its cell. The
    6:1 band was right and the axis was wrong.

    The beam now rises and the slab stands; the plate stays flat because a plate
    that stands is a panel, and the set is six distinct things.
  */
  beam: [0.8, 0.8, 7.6],
  slab: [2.6, 0.5, 3.1],
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

/**
 * The extent bands, named so eligibility and drawing cannot drift apart.
 *
 * §5.5's floor governs the coloured faces, so a carrying form draws from a
 * higher band — a 1.25x nudge rather than a redesign. `carrierFaceArea` judges
 * eligibility at the carrier floor because that is the size the form will
 * actually be if it is chosen.
 */
/**
 * **§22's bar: the largest face a carrier must be able to draw.**
 *
 * Derived from §5.5's floor rather than chosen. The floor is 0.5% of the page
 * on the PAIR, so each of the two faces has to average 0.25%; at the drawn
 * scale the four large archetypes measure 0.17–0.23% at the carrier extent's
 * FLOOR and reach the floor together once the extent jitter and the record's
 * own scale are in. The cube and needle measure 0.06% and 0.05% — a third of
 * the next form up — and no jitter closes that gap.
 *
 * So the bar sits at the discontinuity the archetype set already has, in the
 * frame's own units: 900 admits beam, panel, plate and slab and excludes cube
 * and needle. §5.5 calls the cube small by design and the needle is ink
 * (`INK_ARCHETYPES`), so the bar formalises a size relationship the set
 * already encodes rather than introducing a new one.
 */
const MIN_CARRIER_FACE = 900;
const CARRIER_EXTENT_FLOOR = 1.05;
const PLAIN_EXTENT_FLOOR = 0.8;
const EXTENT_JITTER = 0.45;

/**
 * **§22's eligibility: the largest visible face a form would draw AS A
 * CARRIER, in the frame's own units.**
 *
 * Judged at the carrier extent's floor (1.05) rather than at whatever extent
 * the form happens to have, because §22's bar is "at the drawn scale" and a
 * form not currently carrying is drawn from 0.80 — about 1.7x smaller in area
 * than it would be if chosen. Measuring the form where it stands would rule
 * out forms that are in fact large enough once they carry.
 *
 * The projection is what the eye sees, so the comparison is the shoelace over
 * the projected corners rather than the form's own proportions: the isometric
 * foreshortens the two ground axes by cos30 and the vertical not at all, and
 * comparing shape units gets the upright panel wrong by an order of magnitude.
 */
function carrierFaceArea(archetype: Archetype): number {
  const [su, sv, sw] = SHAPE[archetype];
  const du = su * CARRIER_EXTENT_FLOOR;
  const dv = sv * CARRIER_EXTENT_FLOOR;
  const dw = sw * CARRIER_EXTENT_FLOOR;

  const faces: Array<Array<readonly [number, number, number]>> = [
    [[0, 0, dw], [du, 0, dw], [du, dv, dw], [0, dv, dw]],
    [[0, dv, 0], [du, dv, 0], [du, dv, dw], [0, dv, dw]],
    [[du, 0, 0], [du, dv, 0], [du, dv, dw], [du, 0, dw]],
  ];

  let largest = 0;
  for (const corners of faces) {
    const pts = corners.map(([cu, cv, cw]) => project(cu, cv, cw));
    let sum = 0;
    for (let i = 0; i < pts.length; i += 1) {
      const [x1, y1] = pts[i];
      const [x2, y2] = pts[(i + 1) % pts.length];
      sum += x1 * y2 - x2 * y1;
    }
    largest = Math.max(largest, (Math.abs(sum) / 2) * SCALE * SCALE);
  }
  return largest;
}

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

/**
 * The forms for a record, optionally forced onto a given symmetry.
 *
 * Split out of `construction` so `frameFor` can ask "what would every record
 * look like under symmetry N" without recursing into the frame it is computing.
 */
function formsFor(
  recordId: string,
  forceSymmetry?: number,
  forceQuiet?: boolean,
): { forms: Form[]; symmetryIndex: number; quiet: boolean } {
  const next = seedFrom(recordId);

  /* Which archetype takes which slot — one of each, never a random bag. */
  const order = shuffled(ARCHETYPES, next);

  /*
    One of eight rigid symmetries, applied to the whole set. Drawn before the
    per-form values so the choice is a property of the record rather than of
    the iteration.
  */
  const drawn = Math.floor(next() * SYMMETRIES.length);
  const symmetryIndex = forceSymmetry ?? drawn;
  const symmetry = SYMMETRIES[symmetryIndex];

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
    **§22: the hash orders the forms and the colour takes the first ELIGIBLE
    two in that order.**

    It previously picked the two it excluded, which let the colour land on the
    cube — and §5.5 calls the cube small by design, so those records failed the
    0.5% floor by construction: six of seventeen, worst 0.320%.

    §17 and §20 both tried to fix that by moving the thing being measured (the
    frame's aspect, then the plan's width) and both were withdrawn. This moves
    neither: resizing the cube would tune the vocabulary to the measurement,
    re-measuring the floor would tune the measurement to the vocabulary, and
    choosing where the colour lands tunes neither — the assignment is the
    generator's, and §21 already makes it the one place a hash carries meaning,
    because the construction IS the record.

    Determinism is kept by construction rather than by luck: the order comes
    from the same hash as the arrangement and depends only on the id, so a
    record's colour placement is exactly as stable as its arrangement.

    Eligibility is judged at the extent the form WOULD be drawn at if it
    carried — the carrier band's floor — because that is "at the drawn scale"
    in §22's sense. Judging a form at its non-carrier extent understates it by
    about 1.7x in area and would rule out forms that are in fact large enough.
  */
  const ordered = shuffled(colourable, next);
  const eligible = ordered.filter((a) => carrierFaceArea(a) >= MIN_CARRIER_FACE);
  /*
    §22: an arrangement with no eligible pair is ILLEGAL. That case has not
    been observed across the seventeen and `colour-eligibility.test.ts`
    asserts it, so this falls back rather than handling it silently — taking
    the hash's own order, which keeps the result deterministic.
  */
  /*
    §22 + §31: an arrangement with no eligible pair is illegal, and §31 rules
    what happens when the hash cannot escape it — **the record renders QUIET,
    in greys with no base face**, which is the state §5.2 already draws for a
    record whose cover gives no usable colour. The reader sees something the
    collection contains rather than a blank cell.

    The build used to fall back to the hash's order and colour an INELIGIBLE
    form, which is §5.5's floor violated rather than §22's guard working, and
    nothing on the page said so.
  */
  const quiet = forceQuiet === true || eligible.length < 2;
  const facesCarryColour = quiet ? [] : eligible.slice(0, 2);

  const forms: Form[] = order.map((archetype, index) => {
    const [su, sv, sw] = SHAPE[archetype];
    const slot = symmetry(SLOTS[index]);
    const [u, v] = slot;

    /*
      Each form's extent along its own long axis.

      **A colour-carrying form takes the top of the band.** §5.5's floor governs
      the construction's coloured faces, and at the base extent they measured
      0.32–0.43% of the page against a 0.5% floor — so the two forms that carry
      colour draw from 1.05–1.45 rather than 0.80–1.25. That is a 1.25x nudge,
      not a redesign: the withdrawn area ceiling would have needed 21x and the
      construction becoming a colour field, which is the difference between a
      floor on one mark and a share of a total.

      The 6:1 size band still holds, because the band is measured across all six
      forms and the two carriers were not the extremes.
    */
    const carriesColour = facesCarryColour.includes(archetype);
    const extent = (carriesColour ? CARRIER_EXTENT_FLOOR : PLAIN_EXTENT_FLOOR) + next() * EXTENT_JITTER;

    const du = su * extent;
    const dv = sv * extent;
    const dw = sw * extent;

    const isInk = INK_ARCHETYPES.includes(archetype);
    const carries = carriesColour;

    /*
      **The colour goes on the form's LARGEST face, which is not always the top.**

      §5.5's reasoning is that a coloured right face on a small form is the
      darkest step on the smallest area — the least findable thing the rule can
      produce — so the colour belongs on the largest visible face carrying the
      lightest step. Design wrote that as "top", which holds for the beam, slab,
      cube and plate.

      **It is false for the panel**, which is upright: its top is 0.96 units
      against a left face of 6.96, a 7x inversion. Measured across the real
      seventeen, whenever the selection landed on the panel the two coloured
      faces came out 8-14x apart — 92.3% against 7.7% on the worst — and §5.1's
      traced path between two coloured forms cannot hold when one end is a
      twelfth of the other.

      So the rule is applied rather than its usual outcome: largest face by
      projected area, computed from the form's own proportions.
    */
    /*
      **Projected area, not shape proportions.** A first version compared
      `du*dv`, `dv*dw` and `du*dw` — the faces' areas in the form's own units —
      and got the panel wrong: its left face is 6.96 units against a right of
      1.16, yet PROJECTED they come out 185 and 1113. The isometric foreshortens
      the two ground axes by cos30 and the vertical not at all, so a comparison
      in shape units is a comparison of the wrong quantity.

      The shoelace over the projected corners is the quantity the eye sees.
    */
    const projectedArea = (kind: 'top' | 'left' | 'right'): number => {
      const corners: Array<readonly [number, number, number]> =
        kind === 'top'
          ? [[0, 0, dw], [du, 0, dw], [du, dv, dw], [0, dv, dw]]
          : kind === 'left'
            ? [[0, dv, 0], [du, dv, 0], [du, dv, dw], [0, dv, dw]]
            : [[du, 0, 0], [du, dv, 0], [du, dv, dw], [du, 0, dw]];

      const pts = corners.map(([cu, cv, cw]) => project(cu, cv, cw));
      let sum = 0;
      for (let i = 0; i < pts.length; i += 1) {
        const [x1, y1] = pts[i];
        const [x2, y2] = pts[(i + 1) % pts.length];
        sum += x1 * y2 - x2 * y1;
      }
      return Math.abs(sum) / 2;
    };

    /*
      **The largest projected face, including the right one — and that resolves
      a genuine conflict between two of §5.5's own rules.**

      "Shade is a right-hand face and never a shape" and "colour goes on the
      largest face" disagree on the upright panel, whose largest projected face
      IS its right. Both readings were measured across the real seventeen:

        largest face, right included   median 57%, worst 87.7%,  2/17 over 70%
        right excluded                 median 86%, worst 91.9%, 11/17 over 70%

      Excluding it costs more than it buys, because the panel's left face is a
      sliver and the colour lands there instead — so the traced path loses an
      end on eleven records rather than two. The shade rule's PURPOSE is that
      the darkest step must not land on the smallest area; applying it here
      produces exactly that outcome.

      So base takes the largest face, shade takes any remaining right face, and
      a panel carrying colour has no shade face. Reported to Design as a rule
      conflict rather than settled quietly: §5.5 says shade is a right face and
      never a shape, and this makes one form's right face a base.
    */
    const faceAreas = {
      top: projectedArea('top'),
      left: projectedArea('left'),
      right: projectedArea('right'),
    };
    const largest = (Object.keys(faceAreas) as Array<keyof typeof faceAreas>).reduce((a, b) =>
      faceAreas[a] >= faceAreas[b] ? a : b,
    );

    /*
      **A form that does not carry the accent is GREY, not tinted.**

      Compared against the reference: it is silver and black forms with a
      coloured disc behind and one small coloured cube — a grey object with
      colour IN it. Ours tinted every face of every non-ink form, so four of six
      forms were in the record's hue and the construction read as a coloured
      object. Only two faces were ever `base`; the other ten were tint and shade
      doing the same work at lower saturation.

      So the ladder now applies only to the carrier: its largest face takes base
      and its right face takes shade, which is the object having a lit side and
      a shaded one. Everything else is the neutral grey the reference uses,
      which is what lets two accent faces read as accents.
    */
    /**
     * **A carrier is a GREY form with one coloured face, not a coloured form.**
     *
     * The non-carrying forms went grey two rounds ago and that half held. What
     * did not: a carrier's own non-accent faces still took `tint` and `shade`,
     * both on the ladder — so each of the two carriers was coloured on all three
     * faces and the construction read as coloured again. Measured: 3 tint + 2
     * base + 1 shade against 6 grey, so two of six forms were fully in the
     * record's hue.
     *
     * §5.5 says the accent is what carries colour. A form showing colour on
     * every face is not an accent on a form, it is a coloured form — which is
     * exactly the reading the grey step was introduced to remove.
     */
    const stepFor = (kind: 'top' | 'left' | 'right'): MarkStep => {
      if (isInk) return 'ink';
      if (!carries) return 'grey';
      /* The accent, and nothing else on this form. */
      return kind === largest ? 'base' : 'grey';
    };

    return {
      archetype,
      slot,
      extent: Math.max(du, dv, dw),
      depth: u + v + dw,
      /*
        **§31: no clamp.** `containedOrigin` used to shift a form back inside
        the frame before drawing it, which made §31's fit check unreachable —
        measured, 0 rejections in 5,000 ids with the tightest arrangement
        touching the edge at exactly 0.00 units. The two mechanisms answer
        one question differently, and §31's is the ruled one: an arrangement
        that does not fit is illegal and the hash advances.
      */
      faces: boxFaces(u, v, 0, du, dv, dw, {
        top: stepFor('top'),
        left: stepFor('left'),
        right: stepFor('right'),
      }),
    };
  });

  /* Painter's sort: near forms last. */
  forms.sort((a, b) => a.depth - b.depth);

  return { forms, symmetryIndex, quiet };
}

/**
 * The disc's own draws continue the same stream the forms used, so it is
 * re-seeded and fast-forwarded rather than replayed — replaying meant
 * duplicating the draw order in two places, which is two things that must
 * agree.
 */
function discFor(recordId: string): Construction['disc'] {
  const next = seedFrom(recordId);
  shuffled(ARCHETYPES, next);
  next();
  shuffled(ARCHETYPES.filter((a) => a !== 'slab' && a !== 'needle'), next);
  for (let i = 0; i < ARCHETYPES.length * 3; i += 1) next();

  return {
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
  };
}

const [FRAME_LEFT, FRAME_TOP, FRAME_WIDTH, FRAME_HEIGHT] = CONSTRUCTION_FRAME.split(' ').map(Number);

/** Whether a drawing lies inside §31's stated frame. */
function fitsFrame(forms: readonly Form[], disc: Construction['disc']): boolean {
  for (const [x, y] of forms.flatMap((f) => f.faces.flatMap((face) => face.points))) {
    if (x < FRAME_LEFT || x > FRAME_LEFT + FRAME_WIDTH) return false;
    if (y < FRAME_TOP || y > FRAME_TOP + FRAME_HEIGHT) return false;
  }
  if (disc.cx - disc.r < FRAME_LEFT || disc.cx + disc.r > FRAME_LEFT + FRAME_WIDTH) return false;
  if (disc.cy - disc.r < FRAME_TOP || disc.cy + disc.r > FRAME_TOP + FRAME_HEIGHT) return false;
  return true;
}

/** Scale a drawing about the frame's centre until it fits — §31's fallback when no arrangement does. */
function scaledToFitFrame(forms: readonly Form[], disc: Construction['disc']): { forms: Form[]; disc: Construction['disc'] } {
  const cx = FRAME_LEFT + FRAME_WIDTH / 2;
  const cy = FRAME_TOP + FRAME_HEIGHT / 2;
  const points = [...forms.flatMap((f) => f.faces.flatMap((face) => face.points)), [disc.cx - disc.r, disc.cy - disc.r] as const, [disc.cx + disc.r, disc.cy + disc.r] as const];
  let scale = 1;
  for (const [x, y] of points) {
    const dx = Math.abs(x - cx);
    const dy = Math.abs(y - cy);
    if (dx > 0) scale = Math.min(scale, FRAME_WIDTH / 2 / dx);
    if (dy > 0) scale = Math.min(scale, FRAME_HEIGHT / 2 / dy);
  }
  const at = (x: number, y: number) => [cx + (x - cx) * scale, cy + (y - cy) * scale] as const;
  return {
    forms: forms.map((form) => ({
      ...form,
      faces: form.faces.map((face) => ({ ...face, points: face.points.map(([x, y]) => at(x, y)) })),
    })),
    disc: { ...disc, ...(([x, y]) => ({ cx: x, cy: y }))(at(disc.cx, disc.cy)), r: disc.r * scale },
  };
}

/**
 * §31: an arrangement that does not fit the stated frame is illegal, so the
 * hash moves to that record's next one — the same mechanism §22 uses for
 * colour eligibility.
 *
 * `forceExhausted` is for the test that constructs the fallback §31 rules but
 * no real id reaches: §31 requires it built, and waiting for a record that
 * exhausts 32 arrangements is waiting for a case the collection may never
 * produce.
 */
export function constructionWithin(
  recordId: string,
  options: { forceExhausted?: boolean; forceQuiet?: boolean } = {},
): Construction & { advances: number; scaledToFit: boolean; quiet: boolean } {
  for (let advance = 0; advance < HASH_ADVANCE_CAP; advance += 1) {
    if (options.forceExhausted === true) break;
    const seed = advance === 0 ? recordId : `${recordId}#${advance}`;
    const { forms, quiet } = formsFor(seed, undefined, options.forceQuiet);
    const disc = discFor(seed);
    if (fitsFrame(forms, disc)) {
      return { viewBox: CONSTRUCTION_FRAME, forms, disc, advances: advance, scaledToFit: false, quiet };
    }
  }

  /*
    §31: "If no arrangement fits, the id's first arrangement is drawn scaled
    down just enough to fit. Only that record's scale is lower, and it depends
    only on its id."
  */
  const { forms, quiet } = formsFor(recordId, undefined, options.forceQuiet);
  const fitted = scaledToFitFrame(forms, discFor(recordId));
  return { viewBox: CONSTRUCTION_FRAME, forms: fitted.forms, disc: fitted.disc, advances: HASH_ADVANCE_CAP, scaledToFit: true, quiet };
}

export function construction(recordId: string): Construction & { advances: number; scaledToFit: boolean; quiet: boolean } {
  return constructionWithin(recordId);
}
