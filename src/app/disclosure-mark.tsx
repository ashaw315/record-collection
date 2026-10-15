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
/**
 * §T.1's other marks, at the same weight in the same 12 square: the + on
 * manage's Add, and the tick and the × on its inline row edit, "the tick
 * confirms what the × cancels" (§T.6 part 2, 14 Oct), where lucide's plus,
 * check and x were. `data-mark` names the mark for a reading.
 */
export function Mark({ kind, ...attrs }: { kind: 'plus' | 'cross' | 'tick' } & SVGProps<SVGSVGElement>) {
  return (
    <svg aria-hidden="true" data-mark={kind} width="12" height="12" viewBox="0 0 12 12" shapeRendering={kind === 'plus' ? 'crispEdges' : 'geometricPrecision'} className="shrink-0 fill-none stroke-[oklch(0.19_0.008_60)] stroke-1" {...attrs}>
      {kind === 'plus' && (
        <>
          <line x1="0" y1="6" x2="12" y2="6" />
          <line x1="6" y1="0" x2="6" y2="12" />
        </>
      )}
      {kind === 'cross' && (
        <>
          <line x1="1" y1="1" x2="11" y2="11" />
          <line x1="11" y1="1" x2="1" y2="11" />
        </>
      )}
      {kind === 'tick' && <polyline points="1,6.5 4.5,10 11,2" />}
    </svg>
  );
}

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
