import type { RecordLadder } from '@/lib/colour/record-ladder';
import { project } from './construction';
import {
  BLEED_RATIO,
  EXTENTS,
  FIGURE_RIGHT_INSET,
  FLATS,
  SECTION_CELL_DELTA,
  SIZE_RATIO,
  figureBox,
  type Figure as FigureSpec,
} from './ornament';

/**
 * §25's figures and §26's flats, drawn from the record's ladder.
 *
 * **A figure's faces are three of the ladder's four steps**: top at 0.745 (a
 * face only, halfway from tint to base, because tint is the ground the disc
 * paints and a tint top vanishes on it), base on the left, shade on the
 * right. §9.2's earlier "three lightnesses of the one tint value" is
 * superseded: base crossing into ornament is deliberate — it is the record's
 * colour, and both kinds of mark carry the record. Shade is a face and never
 * a flat mark; a flat takes tint or base.
 *
 * **Height is the governed term and it is the section's.** 0.855 of the
 * section, of which two-thirds shows above the cell's foot and the rest
 * bleeds below it — the gate binds exactly. Width follows the figure's
 * projected box; nothing is measured in pixels but the inset.
 *
 * **No z-index of its own beyond the cell's floor.** The cell isolates and
 * clips (`Section`), so the figure sits at the bottom of that stacking
 * context and can never enter another cell: its clip is its own cell, and it
 * is cut by at most one edge, the foot.
 */
export function Figure({ ladder, figure }: { ladder: RecordLadder; figure: FigureSpec }) {
  const box = figureBox(figure);
  const face = (points: ReadonlyArray<readonly [number, number]>) =>
    points.map(([x, y]) => `${x.toFixed(3)},${y.toFixed(3)}`).join(' ');

  return (
    <svg
      data-ornament="figure"
      data-figure={figure.kind}
      aria-hidden="true"
      viewBox={`${box.minX} ${box.minY} ${box.width} ${box.height}`}
      preserveAspectRatio="xMidYMid meet"
      className="pointer-events-none absolute"
      style={{
        /*
          A percentage resolves against the CELL, which is `SECTION_CELL_DELTA`
          shorter than its section (the section carries the rule); the pixel
          term restores the section as the measure so the rendered height is
          0.855 of the section and not of something 1px smaller.
        */
        height: `calc(${SIZE_RATIO * 100}% + ${SIZE_RATIO * SECTION_CELL_DELTA}px)`,
        aspectRatio: `${box.width / box.height} / 1`,
        right: FIGURE_RIGHT_INSET,
        /* The part below the foot: the ruled size less the gate. */
        bottom: `calc(${-BLEED_RATIO * 100}% - ${BLEED_RATIO * SECTION_CELL_DELTA}px)`,
        zIndex: -1,
      }}
    >
      {box.forms.map(({ archetype, origin: [u, v] }) => {
        const [du, dv, dw] = EXTENTS[archetype];
        const p = (a: number, b: number, c: number) => project(u + a, v + b, c);
        return (
          <g key={`${archetype}@${u},${v}`} data-archetype={archetype}>
            {/* Left face, at base: the record's colour. */}
            <polygon data-face="base" points={face([p(0, dv, 0), p(du, dv, 0), p(du, dv, dw), p(0, dv, dw)])} fill={ladder.base} />
            {/* Right face, at shade — a face and never a shape. */}
            <polygon data-face="shade" points={face([p(du, 0, 0), p(du, dv, 0), p(du, dv, dw), p(du, 0, dw)])} fill={ladder.shade} />
            {/* Top face at §26's 0.745, drawn last so it sits over both sides' top edges. */}
            <polygon data-face="top" points={face([p(0, 0, dw), p(du, 0, dw), p(du, dv, dw), p(0, dv, dw)])} fill={ladder.top} />
          </g>
        );
      })}
    </svg>
  );
}

/** The quarter-disc's radius: §25's "r 150 · more than a third outside, masked by the page edge". */
export const QUARTER_DISC_RADIUS = 150;
/** The triangle as §26 draws it in the last row's air: 250 across the foot, 190 up the page edge. */
export const TRIANGLE = { width: 250, height: 190 } as const;

/**
 * §26's two flats — one fill each, no faces, on opposite page edges.
 *
 * The quarter-disc is a full disc centred on its cell's bottom-right corner,
 * so the cell's clip shows one quadrant and the page edge masks three: that
 * is how "more than a third outside" is made rather than drawn. The triangle
 * stands on the foot with its vertical edge on the page's left edge.
 */
export function Flat({ ladder, flat }: { ladder: RecordLadder; flat: (typeof FLATS)[keyof typeof FLATS] }) {
  const fill = flat.step === 'base' ? ladder.base : ladder.tint;
  if (flat.shape === 'quarterDisc') {
    const size = QUARTER_DISC_RADIUS * 2;
    return (
      <div
        data-ornament="flat"
        data-flat="quarterDisc"
        aria-hidden="true"
        className="pointer-events-none absolute"
        style={{
          width: size,
          height: size,
          right: -QUARTER_DISC_RADIUS,
          bottom: -QUARTER_DISC_RADIUS,
          borderRadius: '50%',
          background: fill,
          zIndex: -1,
        }}
      />
    );
  }
  return (
    <div
      data-ornament="flat"
      data-flat="triangle"
      aria-hidden="true"
      className="pointer-events-none absolute"
      style={{
        width: TRIANGLE.width,
        height: TRIANGLE.height,
        left: 0,
        bottom: 0,
        clipPath: 'polygon(0 100%, 0 0, 100% 100%)',
        background: fill,
        zIndex: -1,
      }}
    />
  );
}
