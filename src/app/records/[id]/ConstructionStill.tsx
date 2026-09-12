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
 * **The frame never moves.** `viewBox` is `CONSTRUCTION_FRAME` on every record;
 * the forms move inside it. Fitting it per arrangement is the defect that made
 * six records look like one drawing.
 *
 * **The disc never takes base** (§5), even where base would look better on a
 * chromatic record — the rule exists for the five near-grey ones, and it is
 * what keeps the disc from becoming a heavy dark mass on them.
 */

/** §5.4: shadows are drawn, flat, one offset footprint per form at 7% ink. */
const SHADOW = 'oklch(0.19 0.008 60 / 0.07)';
const INK = 'oklch(0.19 0.008 60)';

export function ConstructionStill({
  recordId,
  spineColour,
}: {
  recordId: string;
  /** `null` falls the whole construction back to ink (8a §5.3). */
  spineColour: string | null;
}) {
  const scene = construction(recordId);
  const ladder = recordLadder(spineColour);

  /*
    §5.3: no cover means no derivation, and the fallback is INK — filled, not
    outlined, not omitted. Dropping the marks would let a missing image change
    the composition's structure.
  */
  const fill = (step: string): string => {
    if (ladder === null) return step === 'ink' ? INK : 'oklch(0.19 0.008 60 / 0.55)';
    switch (step) {
      case 'base':
        return ladder.base;
      case 'tint':
        return ladder.tint;
      case 'shade':
        return ladder.shade;
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
      viewBox={scene.viewBox}
      className="block h-full w-full"
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
      {scene.forms.map((form, index) => {
        const base = form.faces.find((f) => f.kind === 'top');
        if (base === undefined) return null;
        return (
          <polygon
            key={`shadow-${index}`}
            points={points(base.points.map(([x, y]) => [x + 7, y + 9] as const))}
            fill={SHADOW}
          />
        );
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
