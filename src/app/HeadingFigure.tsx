'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { FigureSource } from './figure-source';
import { headingAir, type HeadingAir } from './heading-air';

/**
 * Step 103d, §T.6: the heading's figure on the table and the grid.
 *
 * "The heading's figure takes the air right of the band at the largest
 * height that air holds, and is drawn only where that height is at least
 * the height at which its construction's narrowest face clears §29's 6px."
 * Where it is not, "there is no figure, not a simplified one", which is
 * also why a phone has none: there is nothing right of the band there.
 *
 * **Measured at render, not declared**, as the matrix solid is
 * (`MatrixSolid`): the air is what the band, the filters and the list leave,
 * and that changes with the window, with a filter in force and with the
 * fonts. So the server sends the figure's place empty and the browser
 * decides whether anything stands in it.
 *
 * The figure is laid over the page and out of its flow, so it moves
 * nothing, and it takes no press: "it does not move" and it is never a
 * control. The still inside is the record page's own, in the air's box, and
 * placed in the box's slack by the record's hash as §33 places it.
 */

/** Type is read by its own box, since a heading is as wide as its line and not as its words. */
function drawnBox(el: Element): DOMRect {
  if (el.matches('input, select, button, img') || el.childElementCount > 0) return el.getBoundingClientRect();
  const range = document.createRange();
  range.selectNodeContents(el);
  return range.getBoundingClientRect();
}

function measure(host: HTMLElement, source: FigureSource): HeadingAir | null {
  const main = host.closest('main');
  if (main === null) return null;
  const frame = main.getBoundingClientRect();
  const list = main.querySelector<HTMLElement>('[data-collection-table] table, [data-collection-grid], [data-collection-empty]');
  if (list === null) return null;

  /*
    The first thing the list draws. A table's is its header's labels, which
    sit inside a row that sticks to the window once the page is scrolled:
    so the label's place is taken within its cell and added to the table's
    own top, which does not stick.
  */
  let listTop = list.getBoundingClientRect().top;
  const labels = Array.from(list.querySelectorAll<HTMLElement>('thead th')).flatMap((th) => {
    const label = th.querySelector('span');
    return label === null || th.getBoundingClientRect().width === 0 ? [] : [drawnBox(label).top - th.getBoundingClientRect().top];
  });
  if (labels.length > 0) listTop += Math.min(...labels);

  const add = main.querySelector<HTMLElement>('[data-collection-band] a[href="/records/new"]');
  /* Everything the band's column draws above the list, Add record apart: its widest right edge is where the air can start. */
  let columnRight = 0;
  for (const el of Array.from(main.querySelectorAll('[data-collection-band] *, [data-collection-heading] *, [data-collection-filters] *'))) {
    if (el === add || el.closest('[data-filter-panel], [data-filter-outside], .sr-only, style') !== null) continue;
    if (!el.matches('input, select, button, img') && (el.childElementCount > 0 || (el.textContent ?? '').trim() === '')) continue;
    const style = getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden') continue;
    const box = drawnBox(el);
    if (box.width === 0 || box.height === 0) continue;
    columnRight = Math.max(columnRight, box.right - frame.left);
  }
  if (columnRight === 0) return null;

  const header = document.querySelector('header[data-app-nav]');
  const addBox = add?.getBoundingClientRect();
  return headingAir(
    {
      headerFoot: header === null ? 0 : header.getBoundingClientRect().bottom - frame.top,
      columnRight,
      add: addBox === undefined || addBox.width === 0 ? null : { left: addBox.left - frame.left, top: addBox.top - frame.top, right: addBox.right - frame.left, bottom: addBox.bottom - frame.top },
      listTop: listTop - frame.top,
      /* The page's own right edge, where the list ends: the window's edge is past the page's inset, and a figure run to it stands against the glass. */
      edge: list.getBoundingClientRect().right - frame.left,
    },
    source.aspect,
    source.clearing,
  );
}

export function HeadingFigure({ source, children }: { source: FigureSource; children: ReactNode }) {
  const host = useRef<HTMLDivElement>(null);
  const [air, setAir] = useState<{ measured: boolean; air: HeadingAir | null }>({ measured: false, air: null });

  useEffect(() => {
    const el = host.current;
    const main = el?.closest('main') ?? null;
    if (el === null || main === null) return undefined;
    const read = () => setAir({ measured: true, air: measure(el, source) });
    /* The page's own height changes with a filter in force and with the list; the window's width changes the band. */
    const observer = new ResizeObserver(read);
    observer.observe(main);
    window.addEventListener('resize', read);
    void document.fonts.ready.then(read);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', read);
    };
  }, [source]);

  /* Air too small for the figure is measured and not drawn in: "there is no figure, not a simplified one". */
  const box = air.air !== null && air.air.drawn ? air.air : null;
  return (
    <div
      ref={host}
      data-heading-figure=""
      data-measured={air.measured}
      data-drawn={box !== null}
      data-air-figure={air.air === null ? undefined : air.air.figure}
      data-record={source.id}
      data-clearing={source.clearing}
      aria-hidden="true"
      className="pointer-events-none absolute"
      style={box === null ? { left: 0, top: 0, width: 0, height: 0 } : { left: box.left, top: box.top, width: box.width, height: box.height }}
    >
      {box !== null && children}
    </div>
  );
}
