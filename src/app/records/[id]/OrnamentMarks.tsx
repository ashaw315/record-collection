import type { RecordLadder } from '@/lib/colour/record-ladder';
import { INK_CSS } from '@/lib/colour/ink';
import { project } from './construction';
import { GRID_COLUMN } from './band-geometry';
import { FIGURE_INSET_COLUMNS, type FigureHost } from './region-rows';
import {
  BLEED_RATIO,
  EXTENTS,
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
export function Figure({
  ladder,
  figure,
  host,
}: {
  ladder: RecordLadder;
  figure: FigureSpec;
  /**
   * §26's placement is the HOST's rule, not the figure's (step 28): "a figure
   * in a full-width strip takes a two-column right inset; a figure in an air
   * column is centred in it. Neither rule depends on solo or pair."
   */
  host: FigureHost;
}) {
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
        /*
          Two rules, keyed to the host. A strip has no air of its own, so the
          figure is set against the page edge by a module; an air column IS
          the host, so centring is what being in the air means. A single
          constant was right for the strip and wrong for the air column, and
          it aligned both figures on one vertical the drawing does not have.
        */
        ...(host === 'strip'
          ? { right: FIGURE_INSET_COLUMNS * GRID_COLUMN }
          : { left: '50%', transform: 'translateX(-50%)' }),
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

/**
 * §29: **a flat's size follows its host, and no section fixes it at 150.**
 *
 * The build had 150 from §25's specimen caption — "r 150 · more than a third
 * outside, masked by the page edge" — which is one drawn instance on a sheet
 * and never a rule. §29 rules that a flat takes §9.2's gate measured on its
 * host at render: its visible part is at most two-thirds of the host cell's
 * HEIGHT and at most a quarter of the section's WIDTH, whichever is smaller.
 * On the record with no About snippet the host is 104px, so the visible
 * radius is 69 rather than 150.
 *
 * §29 also names the general form, since the quarter-disc is the first
 * instance and not the last: any ornament with a fixed size in a cell whose
 * height depends on its content will outgrow that cell on some record. So
 * every ornament here is sized against its host, and a size on a specimen
 * sheet is a drawn instance.
 *
 * **In CSS, not JavaScript.** `min(66.7%, 25%)` resolves the two bounds
 * against the host's height and width respectively, at first paint and at
 * every width, with no measurement pass — the same reason §9.2's solids are
 * sized by percentage. A layout effect would draw the wrong size once per
 * render and correct it, which on this page is a visible flash.
 */
export const VISIBLE_OF_HOST_HEIGHT = 2 / 3;
export const VISIBLE_OF_SECTION_WIDTH = 1 / 4;

/**
 * §21's bleed threshold: "a field bleeds at a page edge, never at a cell
 * edge, and **at least a third of it lies outside the frame**... A third is a
 * threshold, not a measurement, and it is stated as one; what it has to be is
 * large enough that no reader wonders whether the shape was cut."
 *
 * Slightly over a third, so rounding cannot put a rendered shape under the
 * threshold the assertion checks.
 */
export const FLAT_OUTSIDE = 0.34;

/**
 * The visible extent of a flat, as an aspect-locked square bounded on both
 * axes.
 *
 * **§29's two bounds are on different axes, and CSS resolves a percentage
 * against one.** `min(66.7%, 25%)` in `width` compares two fractions of the
 * WIDTH and silently drops the height bound: measured, a 242px host in a
 * 720px section gave 180 (a quarter of the width) where §29's smaller bound
 * is 161 (two-thirds of the height).
 *
 * **`container-type: size` is not the answer, and that was tried.** It
 * removes a box's contents from its own height, so every section collapsed
 * to 1px and the figures with them — the exact failure §9.2 recorded when it
 * tried the same thing on a content-derived cell. A row item's height comes
 * from its content like any other box.
 *
 * So the bounds are applied as what they are: `max-height` in the height
 * term, `max-width` in the width term, on a square whose height drives its
 * width through `aspect-ratio`. The height bound sets the size, the width
 * bound clamps it, and the smaller wins without either being expressed as a
 * fraction of the wrong axis.
 */
const VISIBLE_HEIGHT = `${VISIBLE_OF_HOST_HEIGHT * 100}%`;
const VISIBLE_WIDTH = `${VISIBLE_OF_SECTION_WIDTH * 100}%`;

/**
 * §26's two flats — one fill each, no faces, on opposite page edges.
 *
 * The quarter-disc is a full disc whose centre sits on its host's
 * bottom-right corner, so the host's clip shows one quadrant and the page
 * edge masks the rest: that is how "more than a third outside" is made
 * rather than drawn. The triangle stands on the foot with its vertical edge
 * on the page's left edge.
 *
 * **Neither bleeds at a cell edge, and §29 keeps that reasoning.** A cell
 * edge has the next section behind it, so a flat crossing it lies over that
 * section or over one of the structural rules, which is ornament overriding
 * structure. A page edge has nothing behind it.
 */
export function Flat({ ladder, flat }: { ladder: RecordLadder | null; flat: (typeof FLATS)[keyof typeof FLATS] }) {
  /* §54 (step 62): on a record with no cover the flats draw at ink, flat, by their usual placement; the gate that dropped them omitted two of §5.1's eight. */
  const fill = ladder === null ? INK_CSS : flat.step === 'base' ? ladder.base : ladder.tint;

  if (flat.shape === 'quarterDisc') {
    /*
      The disc is twice the visible radius, centred on the corner: half of it
      lies outside on each axis, so exactly one quadrant shows.
    */
    return (
      <div
        data-ornament="flat"
        data-flat="quarterDisc"
        aria-hidden="true"
        className="pointer-events-none absolute"
        style={{
          /*
            Twice the visible radius, centred on the corner: half lies outside
            on each axis, so exactly one quadrant shows. The bounds are
            doubled with it — `maxHeight` is §29's height bound, `maxWidth`
            its width bound, and `aspectRatio` keeps it a circle whichever
            binds.
          */
          height: `calc(${VISIBLE_HEIGHT} * 2)`,
          maxHeight: `calc(${VISIBLE_HEIGHT} * 2)`,
          maxWidth: `calc(${VISIBLE_WIDTH} * 2)`,
          aspectRatio: '1 / 1',
          right: 0,
          bottom: 0,
          transform: 'translate(50%, 50%)',
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
        /*
          **It bleeds off the page's left edge, with a third outside.**
          §26's placement: "The tint triangle bleeds off the left edge in
          that column; the base quarter-disc bleeds off the right edge beside
          About this record." §21 gives the threshold: "a field bleeds at a
          page edge, never at a cell edge, and at least a third of it lies
          outside the frame... large enough that no reader wonders whether
          the shape was cut."

          It was built at `left: 0` — flush inside its host, bleeding
          nowhere — from §26's VALUE paragraph, which names the triangle's
          position without the bleed clause the placement paragraph carries.
          The section states it twice and only once completely.

          So the drawn shape is `1 / (1 - OUTSIDE)` of the visible width, and
          the same fraction of it sits left of the page edge. The hypotenuse
          still runs corner to corner, so what shows is the same triangle
          with its point cut off by the page rather than a smaller whole one.
        */
        height: VISIBLE_HEIGHT,
        maxHeight: VISIBLE_HEIGHT,
        maxWidth: `calc(${VISIBLE_WIDTH} / ${1 - FLAT_OUTSIDE})`,
        aspectRatio: '1 / 1',
        left: `calc(${VISIBLE_WIDTH} / ${1 - FLAT_OUTSIDE} * ${-FLAT_OUTSIDE})`,
        bottom: 0,
        clipPath: 'polygon(0 100%, 0 0, 100% 100%)',
        background: fill,
        zIndex: -1,
      }}
    />
  );
}
