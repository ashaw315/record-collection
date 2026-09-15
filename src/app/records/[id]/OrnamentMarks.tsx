import { project } from './construction';
import { CELL_SIZE_RATIO, SOLID_ASPECT } from './ornament';

/**
 * §9.2's in-cell solid — half a column wide, against the cell's bottom-right
 * corner, bleeding past it.
 *
 * **All ornament is the tint step.** The three faces are three LIGHTNESSES of
 * one tint value, not three hues — §5.3's argument that a form reads as an
 * object because its tones are lightness steps. That keeps §9.4's base-mark
 * count at four and untouched: ornament is ground, the bars are the record's
 * colour arriving, and a reader can tell which is which because one kind sits
 * in the label column and the other never does.
 *
 * **It carries no z-index of its own.** The stacking is structural: the cell
 * isolates, this sits at the bottom of that stacking context, and everything
 * else is above it by being in flow. See `Section`.
 */
export function Ornament({ tint }: { tint: string }) {
  /*
    The projection in the solid's own coordinate space. The viewBox scales to
    whatever height the container query resolves, so these numbers are a shape
    rather than a size — nothing here is measured in pixels.
  */
  const p = (u: number, v: number, w: number) => {
    const [x, y] = project(u, v, w);
    return [x * 14 + 50, y * 14 + 33] as const;
  };
  const face = (points: ReadonlyArray<readonly [number, number]>) =>
    points.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');

  const [du, dv, dw] = [1.6, 1.6, 1.15];

  return (
    <svg
      data-ornament="solid"
      aria-hidden="true"
      viewBox="0 0 100 106"
      preserveAspectRatio="xMidYMid meet"
      className="pointer-events-none absolute"
      style={{
        /*
          **Height is the primary term; width follows by the projection.**

          **A percentage of the cell, because that is what a percentage height
          resolves against.** §9.2 sizes the solid at 0.62 of the SECTION — the
          height a build has before the cells lay out — and states that the same
          solid is 0.627 of its CELL, which is about 1.2px shorter. Both numbers
          are §9.2's and neither contradicts the other; this authors the cell
          one because that is the box in hand, and `CELL_SIZE_RATIO` records
          which rule it came from.

          `aspect-ratio` gives the width FROM that height, so the value is never
          round-tripped: the defect §9.2 names is computing height, deriving
          width, then re-deriving height from the width, which inflates every
          solid by a pixel and draws 0.63 where the rule says 0.62.

          **Not `container-type: size`**, which was tried and collapses the
          layout: size containment removes a cell's contents from its own height
          calculation, so a section that should be 140px rendered at 69 and the
          solid at 0×0. The container the ratio needs is the one the percentage
          already resolves against.
        */
        height: `${CELL_SIZE_RATIO * 100}%`,
        aspectRatio: `1 / ${SOLID_ASPECT}`,

        /* Against the bottom-right corner, bleeding past it. */
        right: '-3%',
        bottom: '-8%',
        zIndex: -1,
      }}
    >
      {/* Top face: the lightest of the three lightnesses. */}
      <polygon
        points={face([p(0, 0, dw), p(du, 0, dw), p(du, dv, dw), p(0, dv, dw)])}
        fill={tint}
      />
      {/* Left face. */}
      <polygon
        points={face([p(0, dv, 0), p(du, dv, 0), p(du, dv, dw), p(0, dv, dw)])}
        fill={tint}
        opacity="0.72"
      />
      {/* Right face, darkest — one value, three lightnesses. */}
      <polygon
        points={face([p(du, 0, 0), p(du, dv, 0), p(du, dv, dw), p(du, 0, dw)])}
        fill={tint}
        opacity="0.5"
      />
    </svg>
  );
}

/**
 * §9.2's flat edge fields.
 *
 * **They attach to the REGION, not to a cell, and bleed off the composition's
 * bottom edge** — the one place below the fold where a height is known, because
 * it is the region's own end.
 *
 * That is §5.1's frame rule re-derived rather than copied: a mark touching a
 * page edge is a flat plane, a mark not touching it is an isometric solid. The
 * division of labour is the frame's, from what each kind can be measured
 * against — solids go in cells because a column width is enough to size them,
 * and planes go on the region's edges because a cell's edge is not the
 * composition's.
 */
export function EdgeFields({ tint }: { tint: string }) {
  return (
    <div
      data-ornament="edge-fields"
      aria-hidden="true"
      className="pointer-events-none absolute inset-x-0 bottom-0 overflow-hidden"
      style={{ height: 140, zIndex: -1 }}
    >
      {/* Two quarter-circles on the region's bottom edge, flat: no faces. */}
      <svg
        viewBox="0 0 400 140"
        preserveAspectRatio="none"
        className="absolute bottom-0 left-0"
        style={{ width: 280, height: 140 }}
      >
        <path d="M 0 140 L 0 0 A 140 140 0 0 1 140 140 Z" fill={tint} />
      </svg>
      <svg
        viewBox="0 0 400 140"
        preserveAspectRatio="none"
        className="absolute right-0 bottom-0"
        style={{ width: 200, height: 100 }}
      >
        <path d="M 400 140 L 400 40 A 100 100 0 0 0 300 140 Z" fill={tint} />
      </svg>
    </div>
  );
}
