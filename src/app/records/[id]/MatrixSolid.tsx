'use client';

import { useEffect, useRef, useState } from 'react';
import { freeHeightSolid } from './rules-33';

/**
 * §5.4's record-independent solid in the frame's lower band.
 *
 * **§33 sizes it by the space it has.** It was drawn at a hard-coded
 * `h-[104px] w-[120px]`, which is the inline-value defect Design's reader
 * notes name: "a figure correct at the width it was written for, written where
 * nothing re-derives it at another". Measured on the built page it stood 104px
 * in a 299px cell and read as a speck.
 *
 * §33: "It takes 0.855 of the cell's free height below the matrix text, placed
 * bottom-right, with §29's six-pixel face minimum; if that minimum fails the
 * solid is not drawn."
 *
 * **Measured at render, not declared.** The free height depends on how many
 * lines the matrix string sets to and whether a variants line follows, so it
 * is read off the rendered text rather than computed from a font size — a
 * declared value is not a measurement, and this cell's content varies per
 * record.
 */
export function MatrixSolid({ inset = 18 }: { inset?: number }) {
  const host = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState<{ drawn: boolean; width: number; height: number } | null>(null);

  useEffect(() => {
    const el = host.current;
    if (el === null) return;

    const measure = () => {
      const cell = el.parentElement;
      if (cell === null) return;
      const cellBox = cell.getBoundingClientRect();

      /*
        The text's bottom edge, taken from the cell's own content rather than
        from a constant: the runout string wraps to a different number of
        lines per record, and a variants line may follow it.
      */
      const text = cell.querySelector('[data-matrix-text]');
      const textBox = text?.getBoundingClientRect();
      const textBottom =
        textBox === undefined ? 0 : textBox.y + textBox.height - cellBox.y;

      /*
        **The cell's own height and width, not an inset one.** §33 gives the
        base as "0.855 of the cell's free height below the matrix text" and
        says nothing about deducting the placement inset; subtracting it first
        drew 176.8 where the ruling gives 195.4. The inset is where the solid
        SITS, not what it is measured against.
      */
      /*
        **Height from the cell, width from the space the inset leaves.**

        §33 gives the base as "0.855 of the cell's free height below the
        matrix text" and says nothing about deducting the placement inset, so
        the HEIGHT is measured against the cell itself -- subtracting it first
        drew 176.8 where the ruling gives 195.4.

        The width is a different quantity. §33 places the solid "bottom-right"
        inside the cell, so it cannot be wider than the room the inset leaves:
        measured at full cell width it came out 225.4 in a 240px cell and
        started 4.4px LEFT of the cell's own edge. A figure that leaves its
        cell is not placed in it.
      */
      setFit(
        freeHeightSolid({
          cellHeight: cellBox.height,
          textBottom,
          /*
            The room to the LEFT of the inset the solid sits against. It is
            flush to the cell's right inset, so only one inset is spent --
            deducting both left 204px and pulled the height to 176.8, under
            §33's ruled 195.4. **This is reported to Design as a conflict:**
            at 0.855 of this cell's free height the figure wants 225.4px of
            width and the cell has 240, so the ruled height and an inset on
            both sides cannot both hold. The height is kept, because §33
            states it as a figure and states the placement only as
            "bottom-right".
          */
          cellWidth: cellBox.width - inset,
        }),
      );
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el.parentElement ?? el);
    return () => observer.disconnect();
  }, [inset]);

  const project = (u: number, v: number, w: number) => {
    const a = Math.PI / 6;
    return [(u - v) * Math.cos(a), (u + v) * Math.sin(a) - w] as const;
  };
  const p = (u: number, v: number, w: number) => {
    const [x, y] = project(u, v, w);
    return [x * 13 + 60, y * 13 + 52] as const;
  };
  const face = (pts: ReadonlyArray<readonly [number, number]>) =>
    pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');

  const [du, dv, dw] = [2.6, 1.5, 0.55];

  return (
    <div ref={host} aria-hidden="true">
      {fit !== null && fit.drawn && (
        <svg
          data-mark="matrixSolid"
          aria-hidden="true"
          viewBox="0 0 120 104"
          className="pointer-events-none absolute"
          style={{ right: inset, bottom: inset, width: fit.width, height: fit.height }}
        >
          <polygon
            points={face([p(0, 0, dw), p(du, 0, dw), p(du, dv, dw), p(0, dv, dw)])}
            fill="oklch(0.80 0.004 80)"
          />
          <polygon
            points={face([p(0, dv, 0), p(du, dv, 0), p(du, dv, dw), p(0, dv, dw)])}
            fill="oklch(0.66 0.004 80)"
          />
          <polygon
            points={face([p(du, 0, 0), p(du, dv, 0), p(du, dv, dw), p(du, 0, dw)])}
            fill="oklch(0.52 0.004 80)"
          />
        </svg>
      )}
    </div>
  );
}
