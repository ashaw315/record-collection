import type { SVGProps } from 'react';

/**
 * §T.1's disclosure mark: "+ closed and − open, at the line's right", drawn
 * as "1px ink strokes in a 12 square, the system's hairline weight". The
 * sidebar's filters draw it (step 97) and stats' branch rows (step 143):
 * "a row with a branch draws §T.1's + there".
 *
 * `open` is a boolean where the caller holds the state (the filters, client
 * state) and `'details'` where a `<details>` holds it: the down stroke is
 * then hidden by CSS while the nearest `group` ancestor is open, so a server
 * component draws the mark without knowing the state.
 */
export function DisclosureMark({ open, ...attrs }: { open: boolean | 'details' } & Omit<SVGProps<SVGSVGElement>, 'open'>) {
  return (
    <svg aria-hidden="true" width="12" height="12" viewBox="0 0 12 12" shapeRendering="crispEdges" className="shrink-0 fill-none stroke-[oklch(0.19_0.008_60)] stroke-1" {...attrs}>
      <line data-mark-line="across" x1="0" y1="6" x2="12" y2="6" />
      {open === 'details' ? (
        <line data-mark-line="down" className="group-open:hidden" x1="6" y1="0" x2="6" y2="12" />
      ) : (
        !open && <line data-mark-line="down" x1="6" y1="0" x2="6" y2="12" />
      )}
    </svg>
  );
}
