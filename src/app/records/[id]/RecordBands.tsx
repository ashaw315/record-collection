import { BANDS, IDENTITY_SPANS, LOWER_SPANS } from './band-geometry';

/**
 * 8a §2.1's three fixed bands — the geometry only, before any content.
 *
 * **`box-sizing: border-box` everywhere, and it is load-bearing.** Every band
 * and cell carries its own 1px rule, and with no slack in 900px a border
 * rendering outside its box breaks the budget while the arithmetic still looks
 * correct. The design's own fix found exactly that on the identity band.
 * Tailwind's preflight sets `border-box` globally; the E2E asserts the rendered
 * total anyway, because a preflight is a dependency rather than a guarantee.
 *
 * **No heavy rule anywhere (§3).** This deletes the three 6px verticals built
 * for 7a — intended, not an omission: 7a ranked its bands with rule weight
 * because it had no colour field, and 8a ranks with two 72s and seven colour
 * marks. Keeping both would rank the page twice.
 *
 * **Full bleed.** No page margin, no centred container: the nav rule, the band
 * rules and the colour marks all run to the viewport edge.
 */

/** §3: every structural edge, one weight, one colour. */
const RULE = 'oklch(0.72 0.004 80)';

export function RecordBands({
  identity,
  still,
  sleeve,
  lower,
}: {
  identity: React.ReactNode;
  still: React.ReactNode;
  sleeve: React.ReactNode;
  /** Five cells, left to right: provenance, matrix, year, market, journal. */
  lower: readonly React.ReactNode[];
}) {
  return (
    <div data-testid="record-bands" className="w-full">
      {/*
        The identity band. Its rule is on the BOTTOM of this element, inside the
        500px, which is the thing the design's border-box fix was about.
      */}
      <div
        data-band="identity"
        className="grid grid-cols-12 gap-0"
        style={{ height: BANDS.identity, borderBottom: `1px solid ${RULE}` }}
      >
        <div
          data-cell="identity"
          className="min-w-0 overflow-hidden p-[18px]"
          style={{ gridColumn: `span ${IDENTITY_SPANS[0]}`, borderRight: `1px solid ${RULE}` }}
        >
          {identity}
        </div>
        <div
          data-cell="still"
          className="min-w-0 overflow-hidden"
          style={{ gridColumn: `span ${IDENTITY_SPANS[1]}`, borderRight: `1px solid ${RULE}` }}
        >
          {still}
        </div>
        {/* Last cell in the band: no right rule (§3). */}
        <div
          data-cell="sleeve"
          className="min-w-0 overflow-hidden"
          style={{ gridColumn: `span ${IDENTITY_SPANS[2]}` }}
        >
          {sleeve}
        </div>
      </div>

      <div
        data-band="record"
        className="grid grid-cols-12 gap-0"
        style={{ height: BANDS.record }}
      >
        {LOWER_SPANS.map((span, index) => (
          <div
            key={index}
            data-cell={['provenance', 'matrix', 'year', 'market', 'journal'][index]}
            className="relative min-w-0 overflow-hidden"
            style={{
              gridColumn: `span ${span}`,
              /* Every cell but the last in the band (§3). */
              borderRight: index === LOWER_SPANS.length - 1 ? undefined : `1px solid ${RULE}`,
            }}
          >
            {lower[index]}
          </div>
        ))}
      </div>

      {/* The tail is paper, not a footer: nothing is drawn in it. */}
      <div data-band="tail" style={{ height: BANDS.tail }} />
    </div>
  );
}
