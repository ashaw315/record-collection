import Link from 'next/link';
import type { ShelfSection } from '@/lib/db/queries/shelf';
import { DEFAULT_SPINE_COLOUR, spineText, spineWidth, textColourOn } from './spine';

/**
 * §10b's shelf: the collection as a wall of spines, browsed by eye.
 *
 * **2D with CSS perspective, not a 3D engine** (§10b). Criterion's wall is
 * `three.js`; this gets most of the feel from transforms and shadows for a
 * fraction of the work and no new dependency. If it turns out to be worth more,
 * that is a later decision made with the flat version in front of us.
 *
 * **A server component.** Hover is CSS, the aimed-at label is CSS, and clicking
 * a spine is a `Link` — there is no state to hold, so there is nothing to
 * hydrate. That also means the wall renders in the first paint rather than
 * appearing after JavaScript loads.
 *
 * **Sparse is fine** (§10b): six records is a short shelf and this does not pad,
 * fake, or hide itself. Three records render as three spines with the shelf edge
 * visible beneath them — a short shelf, which is what it is.
 */

export function Shelf({ sections }: { sections: ShelfSection[] }) {
  if (sections.length === 0) {
    return (
      <p className="mt-8 text-sm text-muted-foreground">
        No records yet. Add one and it appears on the shelf.
      </p>
    );
  }

  return (
    <div className="mt-6 space-y-8" data-testid="shelf">
      {sections.map((section) => (
        <section key={section.genreId ?? 'ungrouped'} aria-label={section.label}>
          <h2 className="mb-2 font-heading text-xs tracking-[0.14em] text-muted-foreground uppercase">
            {section.label}
            <span className="ml-2 tracking-normal normal-case">
              {section.records.length === 1 ? '1 record' : `${section.records.length} records`}
            </span>
          </h2>

          {/*
            The shelf itself. `perspective` on the container and a slight
            rotation on the row is what makes the spines read as objects with
            depth rather than coloured bars — §10b's "most of the feel from
            transforms and shadows".

            `overflow-x-auto` because a wall is horizontal and a long section
            should scroll sideways rather than wrap into rows, which would stop
            it reading as one shelf.
          */}
          <div
            className="overflow-x-auto rounded-xs border-b-4 border-b-[#241d16] bg-[#0e0d0c] px-4 pt-5 pb-1"
            style={{ perspective: '900px' }}
          >
            <ul className="flex items-end gap-[3px]" style={{ transform: 'rotateX(2deg)' }}>
              {section.records.map((record) => {
                const colour = record.spineColour ?? DEFAULT_SPINE_COLOUR;
                const light = textColourOn(record.spineColour) === 'light';

                return (
                  <li key={record.id} className="group relative shrink-0">
                    <Link
                      href={`/records/${record.id}`}
                      data-testid="shelf-spine"
                      data-record-id={record.id}
                      className="block h-[210px] rounded-t-[1px] outline-none transition-transform duration-150 focus-visible:ring-2 focus-visible:ring-ring group-hover:-translate-y-2 focus-visible:-translate-y-2"
                      style={{
                        width: `${spineWidth(record.id)}px`,
                        background: colour,
                        /*
                          Two inset shadows do the work of a 3D model: a dark
                          edge on the right reads as the gap between records,
                          and a light one on the left as the fold of the sleeve
                          catching the light.
                        */
                        boxShadow:
                          'inset -6px 0 12px rgba(0,0,0,.45), inset 2px 0 0 rgba(255,255,255,.07), 0 6px 14px rgba(0,0,0,.5)',
                      }}
                    >
                      <span
                        className={`flex h-full items-center justify-center px-1 font-mono text-[9px] leading-none font-semibold tracking-[0.06em] whitespace-nowrap ${
                          light ? 'text-[#ece6dc]' : 'text-[#241f18]'
                        }`}
                        /*
                          Rotated to read bottom-to-top, as spines on a shelf do
                          (§10b: "set in mono, rotated").
                        */
                        style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}
                      >
                        {spineText(record)}
                      </span>
                    </Link>

                    {/*
                      §10b: "hover names the record — artist, title, year, label
                      — in a floating label, with the aimed-at spine marked. Aim,
                      then click."

                      CSS-only, on hover AND focus-within, so the label is
                      reachable by keyboard. `pointer-events-none` so it can
                      never intercept the click it is describing.
                    */}
                    <div
                      data-testid="shelf-label"
                      className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-2 hidden -translate-x-1/2 rounded-xs border border-border bg-popover px-2 py-1.5 whitespace-nowrap shadow-lg group-hover:block group-focus-within:block"
                    >
                      <p className="text-xs font-medium text-popover-foreground">{record.title}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {[record.artistName, record.releaseYear, record.labelName]
                          .filter((part) => part !== null && part !== '')
                          .join(' · ')}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        </section>
      ))}
    </div>
  );
}
