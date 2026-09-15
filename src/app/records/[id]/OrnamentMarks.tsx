import { project } from './construction';
import { SOLID_HEIGHT, SOLID_WIDTH } from './ornament';

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
  const p = (u: number, v: number, w: number) => {
    const [x, y] = project(u, v, w);
    return [x * 8.5 + SOLID_WIDTH / 2, y * 8.5 + 20] as const;
  };
  const face = (points: ReadonlyArray<readonly [number, number]>) =>
    points.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');

  const [du, dv, dw] = [1.6, 1.6, 1.15];

  return (
    <svg
      data-ornament="solid"
      aria-hidden="true"
      viewBox={`0 0 ${SOLID_WIDTH} ${SOLID_HEIGHT}`}
      className="pointer-events-none absolute"
      style={{
        /*
          Against the bottom-right corner and bleeding past it. The bleed is
          deliberate and is why §9.2's gate measures the VISIBLE height: a
          clearance on the whole box could never be satisfied.
        */
        right: -SOLID_WIDTH / 3,
        bottom: -SOLID_HEIGHT / 3,
        /*
          **60 × 64, the drawn size.** This rendered at `SOLID_WIDTH * 2` —
          a 120 × 128 box, double the spec, which read as much larger than the
          frame's marks. The constant was right and the box around it was not.
        */
        width: SOLID_WIDTH,
        height: SOLID_HEIGHT,
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
