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
        **§33 rules which term yields: the height.** "It takes 0.855 of the
        cell's free height below the matrix text, or the height at which it
        fits the cell's width inside its insets, whichever is smaller... The
        height yields, not the insets: a figure never crosses its cell's side
        edges (§21), and 0.855 is a target, not a floor. At 240 wide with
        18px insets that is 176.8, not 195.4."

        This spent one inset -- `cellBox.width - inset` -- to keep 195.4, and
        the solid crossed the cell's left edge by about a pixel; the spec
        that measured it was named known-failing and pinned the overhang, so
        building the ruling turned it red. Both insets are room the solid
        does not have.
      */
      setFit(
        freeHeightSolid({
          cellHeight: cellBox.height,
          textBottom,
          /*
            The width inside BOTH insets: 204 in the 240 cell, so the height
            yields to 176.8. The PADDING box, not the border box: the cell
            carries its 1px right rule, and `right: inset` positions from the
            padding edge, so a room taken from the border box sat the solid
            17px inside the left inset, not 18.
          */
          cellWidth: cell.clientWidth - 2 * inset,
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
