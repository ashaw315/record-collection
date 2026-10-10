'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { SOLID_SLOTS, composeFigure, cubeRow, type ComposedFigure, type FigureMeasure } from './block-figure';

/**
 * §T.6: the heading's figure on the table and the grid, steps 111 and 112.
 *
 * "The figure spans the filter block...: its top meets the block's first
 * line's top, its foot meets the block's last line's foot, and its right
 * edge meets the content's right edge", narrowing with its foot and right
 * edge kept where the width beside the column cannot hold it, and not
 * drawn below its clearing height (`composeFigure`). It was step 103d's
 * figure in the air right of the band, as tall as that air.
 *
 * **Measured at render, not declared**, as the matrix solid is
 * (`MatrixSolid`): the block's place and the content's edge are what the
 * page gives them, and they change with the window and the fonts. So the
 * server sends the construction's still and the solids' colours, and the
 * browser decides the figure's box and whether the solids have room.
 *
 * One drawing in the construction's own units: the still placed at its own
 * box, and the cubes beside it, so the figure scales as one thing. It is
 * laid over the page and out of its flow, and takes no press.
 */
export type HeadingSource = FigureMeasure & { id: string; /** The construction's own box, in its units. */ box: { x: number; y: number; width: number; height: number } };
export type HeadingSolid = { id: string; base: string; shade: string; top: string };

const points = (pts: ReadonlyArray<readonly [number, number]>) => pts.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(' ');

function measure(host: HTMLElement, source: HeadingSource, wantSolids: boolean): (ComposedFigure & { frameWidth: number }) | null {
  const main = host.closest('main');
  if (main === null) return null;
  const frame = main.getBoundingClientRect();
  const list = main.querySelector<HTMLElement>('[data-collection-table] table, [data-collection-grid]');
  /* The block: "Sort and the four filter lines in whatever order the build sets them". */
  const lines = Array.from(main.querySelectorAll<HTMLElement>('[data-sort-control], [data-filter-trigger]')).map((line) => line.getBoundingClientRect());
  if (list === null || lines.length === 0) return null;
  const composed = composeFigure(
    {
      blockTop: Math.min(...lines.map((line) => line.top)) - frame.top,
      blockFoot: Math.max(...lines.map((line) => line.bottom)) - frame.top,
      columnRight: Math.max(...lines.map((line) => line.right)) - frame.left,
      /* Where the table's right-aligned figures and the grid's last column end. */
      contentRight: list.getBoundingClientRect().right - frame.left,
      windowWidth: window.innerWidth,
    },
    source,
    wantSolids,
  );
  return composed === null ? null : { ...composed, frameWidth: frame.width };
}

export function HeadingFigure({ source, solids, children }: { source: HeadingSource; /** A solid for each coloured record of the first three shown, in the page's order; none on the grid. */ solids: readonly HeadingSolid[]; children: ReactNode }) {
  const host = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<{ measured: boolean; figure: (ComposedFigure & { frameWidth: number }) | null }>({ measured: false, figure: null });
  const wantSolids = solids.length > 0;

  useEffect(() => {
    const el = host.current;
    const main = el?.closest('main') ?? null;
    if (el === null || main === null) return undefined;
    const read = () => setState({ measured: true, figure: measure(el, source, wantSolids) });
    /* The page's own height changes with a filter in force and with the list; the window's width changes the content's edge. */
    const observer = new ResizeObserver(read);
    observer.observe(main);
    window.addEventListener('resize', read);
    void document.fonts.ready.then(read);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', read);
    };
  }, [source, wantSolids]);

  const figure = state.figure !== null && state.figure.drawn ? state.figure : null;
  const edge = figure?.solidEdge ?? null;
  /* Three places are kept whatever is drawn in them, so the figure's box does not change with how many of the records shown have a colour. */
  const row = edge === null ? [] : cubeRow(source.box, edge, SOLID_SLOTS);
  const rowWidth = edge === null || figure === null || figure.solidWidth === null ? 0 : (SOLID_SLOTS * 1.5 * figure.solidWidth * source.box.height) / figure.height;
  return (
    <div
      ref={host}
      data-heading-figure=""
      data-measured={state.measured}
      data-drawn={figure !== null}
      data-record={source.id}
      data-clearing={source.clearing}
      aria-hidden="true"
      className="pointer-events-none absolute"
      /* Placed from the right: the right edge is the one the ruling fixes, and a left and a width each rounded by the browser can miss it by a sixty-fourth. */
      style={figure === null ? { left: 0, top: 0, width: 0, height: 0 } : { right: figure.frameWidth - figure.right, top: figure.top, width: figure.right - figure.left, height: figure.height }}
    >
      {figure !== null && (
        <svg data-heading-drawing="" viewBox={`${source.box.x} ${source.box.y} ${source.box.width + rowWidth} ${source.box.height}`} preserveAspectRatio="xMaxYMax meet" className="block h-full w-full">
          {children}
          {row.map((faces, i) => {
            const solid = solids[i];
            return solid === undefined ? null : (
              <g key={solid.id} data-solid={solid.id}>
                <polygon data-face="base" points={points(faces.base)} fill={solid.base} />
                <polygon data-face="shade" points={points(faces.shade)} fill={solid.shade} />
                <polygon data-face="top" points={points(faces.top)} fill={solid.top} />
              </g>
            );
          })}
        </svg>
      )}
    </div>
  );
}
