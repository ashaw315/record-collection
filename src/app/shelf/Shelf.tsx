'use client';

import Link from 'next/link';
import { useState } from 'react';
import type { ShelfRecord } from '@/lib/db/queries/shelf';
import { PulledRecord } from './PulledRecord';
import { DEFAULT_SPINE_COLOUR, spineText, spineWidth, textColourOn } from './spine';

/**
 * §10b's shelf: the collection as ONE continuous wall of spines, browsed by eye.
 *
 * **2D with CSS perspective, not a 3D engine** (§10b). Criterion's wall is
 * `three.js`; this gets most of the feel from transforms and shadows for a
 * fraction of the work and no new dependency.
 *
 * **No section headings, and that is a correction.** An earlier version grouped
 * spines into genre sections with a heading and a shelf band each. It was
 * correct and it looked broken — the real collection has six genres for five
 * records and every one is top-level, so it rendered five near-empty black
 * bands stacked down the page. §10b was amended: "adjacency does the grouping,
 * as it does on a real shelf and in the reference this borrows from, which
 * shows 1,300 spines with no headings at all."
 *
 * The ordering survived. Punk records still stand next to each other; nothing
 * announces that they are punk.
 *
 * **A client component, and it was a server one until §10b's pull.** Hover and
 * the floating label are still pure CSS; what needs state is which record has
 * been taken off the shelf. The spines themselves render on the server as part
 * of the page — only the pulled record is interactive, and it lives in its own
 * component so a wall of three hundred spines ships one handler rather than
 * three hundred.
 *
 * A spine stays a LINK whose click is intercepted. §10b pulls the record into
 * view rather than navigating, but the element still leads to a record: the
 * href works with middle-click, cmd-click and no JavaScript, and eight E2E
 * specs across five files locate records by `getByRole('link', { name })`,
 * which is the contract every other collection view honours.
 */

export function Shelf({ records }: { records: ShelfRecord[] }) {
  const [pulledId, setPulledId] = useState<string | null>(null);
  const pulled = records.find((record) => record.id === pulledId) ?? null;

  if (records.length === 0) {
    return (
      <p className="mt-8 text-sm text-muted-foreground">
        No records yet. Add one and it appears on the shelf.
      </p>
    );
  }

  return (
    <div className="mt-6" data-testid="shelf">
      {/*
        One shelf. `perspective` on the container with a slight rotation on the
        row is what makes the spines read as objects with depth rather than as
        coloured bars — §10b's "most of the feel from transforms and shadows".

        `overflow-x-auto` because a wall is horizontal: a long collection
        scrolls sideways rather than wrapping into rows, which would stop it
        reading as one shelf. §10b's "sparse is fine" is why nothing pads it —
        five records is five spines and a lot of visible shelf.
      */}
      <div
        className="overflow-x-auto rounded-xs border-b-4 border-b-[#241d16] bg-[#0e0d0c] px-4 pt-5 pb-1"
        style={{ perspective: '900px' }}
      >
        <ul className="flex items-end gap-[3px]" style={{ transform: 'rotateX(2deg)' }}>
          {records.map((record) => {
            const colour = record.spineColour ?? DEFAULT_SPINE_COLOUR;
            const light = textColourOn(record.spineColour) === 'light';

            return (
              <li key={record.id} className="group relative shrink-0">
                {/*
                  **A LINK that is intercepted, not a button.**

                  §10b pulls the record into view rather than navigating, which
                  reads as a button — and making it one broke eight E2E specs
                  across five files that locate a record with
                  `getByRole('link', { name: title })`. That is not a test
                  detail: it is the contract every other collection view
                  honours, and it is how a record is found by anything reading
                  the accessibility tree.

                  More importantly it is what the element IS. A spine leads to a
                  record; pulling it into view is an enhancement over that
                  journey, not a different one. As a link it works with
                  middle-click, cmd-click, "open in new tab" and no JavaScript
                  at all — `preventDefault` is what upgrades it, and if the
                  handler never runs the href still goes somewhere correct.
                */}
                <Link
                  href={`/records/${record.id}`}
                  onClick={(event) => {
                    // Let the browser handle the modified clicks a link should:
                    // new tab, new window, download.
                    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
                    event.preventDefault();
                    setPulledId(record.id);
                  }}
                  data-testid="shelf-spine"
                  data-record-id={record.id}
                  /*
                    **The accessible name is the RECORD, not the spine text.**

                    Spine text is truncated to fit (see `spineText`), so the
                    visible string can be `Luther Vandross  Nev…  FE 37451` —
                    which names no record to a screen reader, and which no
                    caller could search for. Every other collection view exposes
                    a record as a link named by its title, and eight E2E specs
                    across five files locate records that way; the shelf broke
                    all of them by naming its links after abbreviated text.

                    So the label carries the full title and artist, untruncated.
                    The truncation is a rendering constraint of a 210px spine and
                    has no business reaching the accessibility tree.
                  */
                  aria-label={`${record.title} — ${record.artistName}`}
                  className="block h-[210px] rounded-t-[1px] outline-none transition-transform duration-150 focus-visible:ring-2 focus-visible:ring-ring group-hover:-translate-y-2 focus-visible:-translate-y-2"
                  style={{
                    width: `${spineWidth(record.id)}px`,
                    background: colour,
                    /*
                      Two inset shadows do the work of a 3D model: a dark edge on
                      the right reads as the gap between records, a light one on
                      the left as the fold of the sleeve catching the light.
                    */
                    boxShadow:
                      'inset -6px 0 12px rgba(0,0,0,.45), inset 2px 0 0 rgba(255,255,255,.07), 0 6px 14px rgba(0,0,0,.5)',
                  }}
                >
                  <span
                    className={`flex h-full items-center justify-center px-1 font-mono text-[9px] leading-none font-semibold tracking-[0.06em] whitespace-nowrap ${
                      light ? 'text-[#ece6dc]' : 'text-[#241f18]'
                    }`}
                    // Rotated to read bottom-to-top, as spines on a shelf do
                    // (§10b: "set in mono, rotated").
                    style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}
                  >
                    {spineText(record)}
                  </span>
                </Link>

                {/*
                  §10b: "hover names the record — artist, title, year, label — in
                  a floating label, with the aimed-at spine marked. Aim, then
                  click."

                  CSS-only, on hover AND focus-within so it is reachable by
                  keyboard. `pointer-events-none` so it can never intercept the
                  click it is describing.
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

      {/*
        §10b: "clicking a spine animates the record off the shelf and into view:
        front cover forward, the shelf dimmed behind it." Rendered here rather
        than per-spine so exactly one record is ever out.
      */}
      {pulled !== null && (
        <PulledRecord record={pulled} onClose={() => setPulledId(null)} />
      )}
    </div>
  );
}
