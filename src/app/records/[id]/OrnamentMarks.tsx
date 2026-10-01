'use client';

import { useEffect, useRef, useState } from 'react';
import type { RecordLadder } from '@/lib/colour/record-ladder';
import { INK_CSS } from '@/lib/colour/ink';
import { project } from './construction';
import { GRID_COLUMN } from './band-geometry';
import { CELL_PADDING } from './extended-grid';
import { freeHeightSolid } from './rules-33';
import { FIGURE_INSET_COLUMNS, type FigureHost } from './region-rows';
import {
  BLEED_RATIO,
  EXTENTS,
  FLATS,
  SECTION_CELL_DELTA,
  SIZE_RATIO,
  figureBox,
  smallestFaceRatio,
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
 * **§57 takes the Price history solo out of that rule and tests every figure
 * against type.** The solo is sized to its strip's free height below its
 * entries, as the matrix solid is to its cell's (`rules-33.ts`), and drawn
 * only where that clears §29's six-pixel face; and every figure, whatever
 * its host, is hidden where its box would sit over the host's text, as the
 * plane is (§34). Both need the host's box, so this is a client component.
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
  const aspect = box.width / box.height;
  const freeHeight = figure.kind === 'solo' && figure.sizing === 'free-height';
  const faceRatio = smallestFaceRatio(figure);
  const ref = useRef<SVGSVGElement>(null);
  /*
    §57: every figure is tested against its host's type, and the free-height
    solo is sized by the host; both need the host's box, which only the
    browser has. A section-sized figure is served DRAWN and hidden if the
    test finds it over type, as the plane is; a free-height figure is served
    MEASURING and not displayed, because no size the server could send is
    the host's.
  */
  const [fit, setFit] = useState<{ state: FigureState; height: number | null; terms: FigureTerms | null }>({ state: freeHeight ? 'measuring' : 'drawn', height: null, terms: null });

  useEffect(() => {
    const el = ref.current;
    const hostEl = el?.parentElement ?? null;
    if (el === null || hostEl === null) return;
    const test = () => {
      const h = hostEl.getBoundingClientRect();
      const type = typeIn(hostEl, el);
      /* The right inset: two page columns in a strip (§26), the cell's own padding in a content column (§58). */
      const inset = host === 'column' ? CELL_PADDING : FIGURE_INSET_COLUMNS * GRID_COLUMN;
      let size: { width: number; height: number };
      let bottom: number;
      let terms: FigureTerms | null = null;
      if (freeHeight) {
        /*
          §57: "as the matrix solid takes its cell's" -- the text that bounds
          the solo is the text in its own column. §58 makes that column the
          host itself (the summary column); in a strip it is the content cell
          under the solo's right edge. The §34 test below guards the whole
          host either way.
        */
        const xRight = h.right - inset;
        const column =
          host === 'column'
            ? hostEl
            : Array.from(hostEl.querySelectorAll<HTMLElement>('[data-cell^="content-"]')).find((c) => {
                const cb = c.getBoundingClientRect();
                return cb.left <= xRight - 1 && xRight - 1 <= cb.right && cb.top <= h.bottom - CELL_PADDING - 1 && h.bottom - CELL_PADDING - 1 <= cb.bottom;
              });
        const columnType = column === undefined || column === hostEl ? type : typeIn(column, el);
        const textBottom = Math.max(0, ...columnType.flatMap(glyphs).map((g) => g.bottom - h.top));
        const columnLeft = column === undefined ? h.left : column.getBoundingClientRect().left;
        const cellWidth = xRight - (columnLeft + CELL_PADDING);
        const free = Math.max(0, h.height - CELL_PADDING - textBottom);
        /*
          §58 asked for both terms, not only the result: the height term is
          §57's 0.855 of the free height; the width term is the height at
          which the figure fills the column inside its insets (§33's yield,
          §21's side edges). Whichever is smaller binds, and the figure says
          which so the report reads it off the figure and not off a guess.
        */
        const heightTerm = free * SIZE_RATIO;
        const widthTerm = cellWidth / aspect;
        terms = { free, heightTerm, widthTerm, binds: heightTerm * aspect > cellWidth ? 'width' : 'height' };
        const sized = freeHeightSolid({ cellHeight: h.height, textBottom, cellWidth, inset: CELL_PADDING, aspect, smallestFaceRatio: faceRatio });
        if (!sized.drawn) {
          setFit({ state: 'below-bound', height: 0, terms });
          return;
        }
        size = sized;
        bottom = h.bottom - CELL_PADDING;
      } else {
        const height = h.height * SIZE_RATIO + SIZE_RATIO * SECTION_CELL_DELTA;
        size = { height, width: height * aspect };
        bottom = h.bottom + BLEED_RATIO * h.height + BLEED_RATIO * SECTION_CELL_DELTA;
      }
      /*
        The box is computed from the host, as the plane's is, so a hidden
        figure can be re-tested; and it is clipped to the host first, since
        what bleeds below the foot is cut and cannot cover anything.
      */
      const right = host === 'air' ? h.left + h.width / 2 + size.width / 2 : h.right - inset;
      const clipped = { left: Math.max(right - size.width, h.left), right: Math.min(right, h.right), top: Math.max(bottom - size.height, h.top), bottom: Math.min(bottom, h.bottom) };
      const covers = type.flatMap(glyphs).some((b) => b.left < clipped.right && clipped.left < b.right && b.top < clipped.bottom && clipped.top < b.bottom);
      setFit({ state: covers ? 'covers-type' : 'drawn', height: freeHeight ? size.height : null, terms });
    };
    test();
    const observer = new ResizeObserver(test);
    observer.observe(hostEl);
    return () => observer.disconnect();
  }, [host, freeHeight, aspect, faceRatio]);

  const face = (points: ReadonlyArray<readonly [number, number]>) =>
    points.map(([x, y]) => `${x.toFixed(3)},${y.toFixed(3)}`).join(' ');

  return (
    <svg
      ref={ref}
      data-ornament="figure"
      data-figure={figure.kind}
      data-figure-state={fit.state}
      data-free-height={fit.terms === null ? undefined : Math.round(fit.terms.free * 10) / 10}
      data-height-term={fit.terms === null ? undefined : Math.round(fit.terms.heightTerm * 10) / 10}
      data-width-term={fit.terms === null ? undefined : Math.round(fit.terms.widthTerm * 10) / 10}
      data-binds={fit.terms === null ? undefined : fit.terms.binds}
      aria-hidden="true"
      viewBox={`${box.minX} ${box.minY} ${box.width} ${box.height}`}
      preserveAspectRatio="xMidYMid meet"
      className="pointer-events-none absolute"
      style={{
        ...(freeHeight
          ? {
              /* §57: the free height the browser measured, on the strip's inset; nothing until it has. */
              height: fit.height ?? 0,
              bottom: CELL_PADDING,
            }
          : {
              /*
                A percentage resolves against the CELL, which is `SECTION_CELL_DELTA`
                shorter than its section (the section carries the rule); the pixel
                term restores the section as the measure so the rendered height is
                0.855 of the section and not of something 1px smaller.
              */
              height: `calc(${SIZE_RATIO * 100}% + ${SIZE_RATIO * SECTION_CELL_DELTA}px)`,
              /* The part below the foot: the ruled size less the gate. */
              bottom: `calc(${-BLEED_RATIO * 100}% - ${BLEED_RATIO * SECTION_CELL_DELTA}px)`,
            }),
        aspectRatio: `${aspect} / 1`,
        /*
          Two rules, keyed to the host. A strip has no air of its own, so the
          figure is set against the page edge by a module; an air column IS
          the host, so centring is what being in the air means. A single
          constant was right for the strip and wrong for the air column, and
          it aligned both figures on one vertical the drawing does not have.
        */
        ...(host === 'strip'
          ? { right: FIGURE_INSET_COLUMNS * GRID_COLUMN }
          : host === 'column'
            ? { right: CELL_PADDING }
            : { left: '50%', transform: 'translateX(-50%)' }),
        /* §34, §57: a figure over type, or one without a size yet, is not drawn. `hidden` is an HTML attribute and an SVG element in an HTML document does not take its style. */
        ...(fit.state === 'drawn' ? {} : { display: 'none' }),
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

/** §57's states: served measuring (free-height) or drawn; the browser then finds it drawn, over type, or under §29's bound. */
type FigureState = 'measuring' | 'drawn' | 'covers-type' | 'below-bound';

/** §58's two terms for a free-height figure, as the figure measured them, and which one bound. */
type FigureTerms = { free: number; heightTerm: number; widthTerm: number; binds: 'height' | 'width' };

/**
 * A text element's extent is its GLYPHS, not its box: the section label is a
 * block that spans the whole strip while its letters stop a hundred pixels
 * in, and the box test found every Price history solo under "Price history".
 * `e2e/layout-sweep.spec.ts` learned the same on the year figure. An element
 * whose own text lays out no rect keeps its box.
 */
function glyphs(el: HTMLElement): DOMRect[] {
  const rects: DOMRect[] = [];
  for (const node of Array.from(el.childNodes)) {
    if (node.nodeType !== Node.TEXT_NODE || (node.textContent ?? '').trim() === '') continue;
    const range = document.createRange();
    range.selectNodeContents(node);
    for (const rect of Array.from(range.getClientRects())) if (rect.width > 0 && rect.height > 0) rects.push(rect);
  }
  if (rects.length > 0) return rects;
  const box = el.getBoundingClientRect();
  return box.width > 0 && box.height > 0 ? [box] : [];
}

/**
 * The host's type: elements carrying their own text, outside the figure and
 * outside anything hidden from readers WITHIN the host. The host's own
 * `aria-hidden` does not count -- an air column is hidden from readers as a
 * whole, and type placed in it is still painted type, which is exactly the
 * case §57 rules the test in for.
 */
function typeIn(root: HTMLElement, figure: Element): HTMLElement[] {
  const hiddenInside = (t: HTMLElement) => {
    for (let a: HTMLElement | null = t; a !== null && a !== root; a = a.parentElement) if (a.getAttribute('aria-hidden') === 'true') return true;
    return false;
  };
  return Array.from(root.querySelectorAll<HTMLElement>('*')).filter(
    (t) => t !== figure && !figure.contains(t) && !hiddenInside(t) && Array.from(t.childNodes).some((n) => n.nodeType === Node.TEXT_NODE && (n.textContent ?? '').trim() !== ''),
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
    return <QuarterDisc fill={fill} />;
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

/**
 * The quarter-disc: a full disc whose centre sits on the host's bottom-right
 * corner, twice the visible radius, so exactly one quadrant shows. §29's two
 * bounds sit on their own axes -- `maxHeight` the height bound, `maxWidth`
 * the width bound, `aspectRatio` keeping it a circle whichever binds.
 *
 * **§56 (step 66): sized against the host as it stands with one image.**
 * The Images section grows by rows of tiles, and a disc sized against the
 * grown section more than doubled the moment a record gained a second
 * image -- a mark encoding the count, which §21 rules ornament does not.
 * Anything in the host marked `data-not-host-height` (the tile grid) is
 * left out of the height term: the host's height less those elements and
 * their margins, measured in the browser. With nothing marked, the CSS
 * percentage is the measure, as before, and the server renders that.
 *
 * **§59 (step 69): the disc yields to its caption.** Its visible radius is
 * at most the free height below the lowest glyph in its reach, and it is
 * not drawn where that is zero: the caption is the section's subject and
 * the disc is ornament, so the disc gives way by size, not by vanishing
 * elsewhere, and never by changing the caption's ink.
 */
function QuarterDisc({ fill }: { fill: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [disc, setDisc] = useState<{ state: 'measuring' | 'drawn' | 'not-drawn'; radius: number | null; free: number | null }>({ state: 'measuring', radius: null, free: null });
  useEffect(() => {
    const el = ref.current;
    const host = el?.parentElement ?? null;
    if (el === null || host === null) return;
    const measure = () => {
      const h = host.getBoundingClientRect();
      const excluded = Array.from(host.querySelectorAll<HTMLElement>('[data-not-host-height]'));
      const taken = excluded.reduce((sum, x) => {
        const cs = getComputedStyle(x);
        return sum + x.getBoundingClientRect().height + parseFloat(cs.marginTop) + parseFloat(cs.marginBottom);
      }, 0);
      /* §29's two bounds, the height one against the host as §56 states it. */
      const sized = Math.min(Math.max(0, host.clientHeight - taken) * VISIBLE_OF_HOST_HEIGHT, host.clientWidth * VISIBLE_OF_SECTION_WIDTH);
      /*
        §59: "sized to its host's free height below the caption... drawn only
        where that height is greater than zero." The caption is whatever
        type the disc would otherwise sit under: every glyph run in the host
        within the disc's horizontal reach, measured as glyphs (the caption's
        block spans the section; its letters stop early).
      */
      const inReach = typeIn(host, el).flatMap(glyphs).filter((g) => g.right > h.right - sized);
      const free = h.bottom - Math.max(h.top, ...inReach.map((g) => g.bottom));
      const radius = Math.min(sized, free);
      setDisc({ state: radius > 0 ? 'drawn' : 'not-drawn', radius: Math.max(0, radius), free });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(host);
    return () => observer.disconnect();
  }, []);
  /* Served at the CSS bounds until the browser has measured; then the measured radius, doubled for the full disc. */
  const visible = disc.radius === null ? VISIBLE_HEIGHT : `${disc.radius}px`;
  return (
    <div
      ref={ref}
      data-ornament="flat"
      data-flat="quarterDisc"
      data-disc-state={disc.state}
      data-disc-radius={disc.radius === null ? undefined : Math.round(disc.radius * 10) / 10}
      data-disc-free={disc.free === null ? undefined : Math.round(disc.free * 10) / 10}
      aria-hidden="true"
      className="pointer-events-none absolute"
      style={{
        height: `calc(${visible} * 2)`,
        maxHeight: `calc(${visible} * 2)`,
        maxWidth: `calc(${VISIBLE_WIDTH} * 2)`,
        aspectRatio: '1 / 1',
        right: 0,
        bottom: 0,
        transform: 'translate(50%, 50%)',
        borderRadius: '50%',
        background: fill,
        ...(disc.state === 'not-drawn' ? { display: 'none' } : {}),
        zIndex: -1,
      }}
    />
  );
}
