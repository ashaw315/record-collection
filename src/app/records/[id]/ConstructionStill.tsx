import { ownFitViewBox } from './own-fit';
import { SHADOW_STEPS, footprintPoints } from './footprints';
import { slackAlignment } from './own-fit';
import { construction } from './construction';
import { recordLadder } from '@/lib/colour/record-ladder';

/**
 * A record's construction, drawn into the constant frame (Isometric Probe §1).
 *
 * **Flat SVG, and that is the right property rather than a compromise.** The
 * probe's §2: a render "sits IN the cell as a picture with its own light", the
 * generated one "sits ON the same plane as the rules — same crispness, same
 * flatness, same paper". Against a hairline grid the loss of grain and falloff
 * is mostly a gain, and the render's materiality is what makes it look
 * imported.
 *
 * **The frame never moves.** `viewBox` is §26's one shared frame on every record;
 * the forms move inside it. Fitting it per arrangement is the defect that made
 * six records look like one drawing.
 *
 * **The disc never takes base** (§5), even where base would look better on a
 * chromatic record — the rule exists for the five near-grey ones, and it is
 * what keeps the disc from becoming a heavy dark mass on them.
 */

/**
 * **Three offset footprints per form, tight-and-dark to broad-and-faint.**
 *
 * A single flat 7% parallelogram measured 1.14:1 against paper and grounded
 * nothing — it read as a stain beside the form rather than under it. The
 * contact step at 20% does the grounding, and the outer two stop that step
 * reading as a hard stamp.
 *
 * **The honest residual:** a real penumbra is smooth and this is three steps.
 * At 360px the banding is not visible; it is the one place the flat medium
 * imitates a rendered one and loses.
 */
const INK = 'oklch(0.19 0.008 60)';

export function ConstructionStill({
  recordId,
  spineColour,
  placed,
}: {
  recordId: string;
  /** `null` falls the whole construction back to ink (8a §5.3). */
  spineColour: string | null;
  /**
   * Step 110: where the still stands inside another drawing, in that
   * drawing's units. The heading's figure is the construction with a row
   * of solids beside it in one box, so there the still is a part and not
   * the whole. Absent, it fills its cell as on the record page.
   */
  placed?: { x: number; y: number; width: number; height: number };
}) {
  const scene = construction(recordId);
  const ladder = recordLadder(spineColour);

  /*
    §5.3: no cover means no derivation, and the fallback is INK — filled, not
    outlined, not omitted. Dropping the marks would let a missing image change
    the composition's structure.
  */
  const fill = (step: string): string => {
    if (step === 'grey') return 'oklch(0.74 0.004 80)';
    /* §54 (step 62): with no cover every mark is ink, flat, at full strength; the disc merges into the base faces and that is accepted, the grey faces keeping their neutral. The 0.55 alpha was a value no section states. */
    if (ladder === null) return INK;
    switch (step) {
      case 'base':
        return ladder.base;
      case 'tint':
        return ladder.tint;
      case 'shade':
        return ladder.shade;
      case 'grey':
        /* Neutral silver: the forms the reference leaves uncoloured. */
        return 'oklch(0.74 0.004 80)';
      default:
        return INK;
    }
  };

  const points = (pts: ReadonlyArray<readonly [number, number]>) =>
    pts.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(' ');

  return (
    <svg
      data-testid="construction-still"
      data-record={recordId}
      /*
        **§33: the record's own box, not §31's shared constant.**

        "Each record's drawing is scaled to the smaller of its inner box's
        width and height over its own forms and disc." A smaller viewBox over
        the same cell is a larger drawing, so every record's scale rises --
        measured across the seventeen, from 1.263x to 1.662x.

        §31's constant is retired (step 29g): a scene carries no viewBox, so
        this is the only box the still can draw in.
      */
      viewBox={ownFitViewBox(scene)}
      /*
        **§17's offset survives as position.** §33: "It is then placed by the
        hash within whatever slack the binding dimension leaves... §17's
        offset is kept where it can be seen, as the drawing's position in its
        slack."

        `preserveAspectRatio` decides where a drawing sits when its box and
        its cell disagree in aspect, which is exactly that slack. Centring it
        (the default, `xMidYMid`) would throw the offset away, so the hash
        picks the alignment instead.
      */
      preserveAspectRatio={placed === undefined ? slackAlignment(recordId) : 'xMinYMin meet'}
      {...(placed === undefined ? { className: 'block h-full w-full' } : placed)}
      aria-hidden="true"
    >
      {/* Ground: the disc, always tint, never base. */}
      <circle
        data-mark="disc"
        cx={scene.disc.cx.toFixed(2)}
        cy={scene.disc.cy.toFixed(2)}
        r={scene.disc.r.toFixed(2)}
        fill={fill(scene.disc.step)}
      />

      {/* Flat footprints, light from upper-left. They stop the forms floating. */}
      {scene.forms.flatMap((form, index) => {
        const base = form.faces.find((f) => f.kind === 'top');
        if (base === undefined) return [];
        /* Broadest first, so the contact step lands on top of the others. */
        return [...SHADOW_STEPS].reverse().map((step, s) => (
          <polygon
            key={`shadow-${index}-${s}`}
            points={points(footprintPoints(base.points, step.offset))}
            fill={`oklch(0.19 0.008 60 / ${step.opacity})`}
          />
        ));
      })}

      {/* Painter's sort is already applied: near forms come last. */}
      {scene.forms.map((form, index) => (
        <g key={index} data-form={form.archetype}>
          {form.faces.map((face) => (
            <polygon
              key={face.kind}
              data-face={face.kind}
              data-step={face.step}
              points={points(face.points)}
              fill={fill(face.step)}
            />
          ))}
        </g>
      ))}
    </svg>
  );
}
