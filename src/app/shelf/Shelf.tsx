'use client';

import Link from 'next/link';
import { useState } from 'react';
import type { ShelfRecord } from '@/lib/db/queries/shelf';
import type { Rect } from './rise';
import { PulledRecord } from './PulledRecord';
import { WALL_MIN_HEIGHT, shelfRows, shelfSurface } from './shelf-surface';
import {
  DEFAULT_SPINE_COLOUR,
  SHELF_EDGE,
  SPINE_HEIGHT,
  spineText,
  spineWidth,
  textColourOn,
} from './spine';

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

  /**
   * §10b's rise needs to know which slot the record came out of, so the spine's
   * rect is measured at click time — FLIP's "First".
   *
   * **Measured, never cached across the return.** `spineRectFor` re-reads the
   * element at dismiss time rather than reusing the rect from the rise: the
   * wall may have scrolled, resized or re-wrapped while the record was out, and
   * a stale baseline would send it back to where its slot used to be. The DOM
   * is the source of truth for where a spine is; a copy of it is a bug waiting
   * for the first resize.
   */
  const spineRectFor = (recordId: string): Rect | null => {
    const spine = document.querySelector(`[data-record-id="${CSS.escape(recordId)}"]`);
    return spine === null ? null : spine.getBoundingClientRect();
  };

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
        **Shelves that fill the width and wrap** (§10b as amended). One shelf
        holds as many spines as fit and the rest continue below, so the wall
        grows downward as a bookcase does.

        This replaced `overflow-x-auto`, which put the whole collection on one
        sideways-scrolling shelf. That reads as a single strip rather than a
        wall, and — the practical half — everything past the viewport width was
        behind a horizontal scroll nobody thinks to use on a page that scrolls
        vertically.

        **`background-repeat` draws the shelf edge under every row**, which is
        what makes wrapping look like shelves rather than one tall box. A
        border-bottom on the container would draw a single line under the last
        row and leave the rows above floating. The gradient is a hard stop: a
        band of dark timber at the foot of each 168px row.

        `perspective` on the container with a slight rotation is what makes the
        spines read as objects with depth — §10b's "most of the feel from
        transforms and shadows".

        **The wall is a shelf PLANE, not a box.** The surface runs edge to
        edge and ends where the wall ends, so there is no boundary for a reader
        to interpret as a size.

        That replaced `min-width: 40%` with `w-fit max-w-full`, and the
        replacement is a change of kind rather than of number. Rendered at five
        records against a viewport-owning wall, every candidate width failed the
        same way — 151px read as a tile, 499px as a partly-drawn box, 1248px of
        black as missing data — because they were one object at four widths. A
        rectangle that stops has a size; a shelf does not.

        **The empty portion is WALL, not empty shelf**, which is the whole
        reason the full-width version now works where the black one did not:
        1111px of unoccupied TIMBER implies records that should have been there,
        while wall implies nothing. Judged by rendering four treatments of that
        space — black fill, edge-only, dim wall, and a wall block behind the
        records — and looking. Edge-only read as a line on a page; the wall
        block floated over its own edge with two boundaries instead of none.
      */}
      <div
        data-testid="shelf-timber"
        className="flex w-full flex-col pt-5"
        style={{ minHeight: WALL_MIN_HEIGHT, ...shelfSurface() }}
      >
        {/*
          **Three real things, not one background on one box.**

          The wall, the shelf plane and the records used to be a single element
          with a repeating gradient painted on it. That is what made every
          treatment of the empty space fail: a container sized by its contents
          has no empty space to treat, and a plane that is a gradient stop has
          no position anything can stand on. Three rounds of colour candidates
          were painting a box whose shape was the defect.

          Now the wall has a height of its own (A24a: "below the nav there is
          the wall and nothing else"), and the plane is an element with a rect —
          so a test can assert the spines meet it, which is the check that would
          have caught the 15px foot misalignment.

          Records fill the wall from the TOP down, as a bookcase does, and what
          is left below is wall. That is the vertical half of §10b's rule: the
          space beside the records is wall, and so is the space below them.
        */}
        {/*
          **The rows region carries the shelf under EVERY row.**

          How many spines fit on a shelf is decided by the browser from the
          container width, which the server does not know — so the shelf repeats
          per row rather than being one element per row. A single plane at the
          foot was tried and measured 2 rows against 1 plane at 80 records, with
          the first row's feet 240px above the only shelf.

          `rowGap` is the shelf itself: the gap between rows is where the
          repeating background paints the plane and its lip.
        */}
        {/*
          **The shelf under every row, drawn once by one mechanism.**

          `rowGap` IS the shelf: the gap between rows is exactly where the
          repeating background paints the plane and its lip, so the surface
          follows the browser's wrapping rather than predicting it.

          There is deliberately no separate element for the last row's shelf. A
          second mechanism was tried four ways and doubled the shelf line every
          time — invisible to rect assertions, because a background has no box,
          and obvious the moment anyone looked.
        */}
        <ul
          data-testid="shelf-rows"
          /*
            `pt-0`: the rows region is exactly as tall as its rows, so the
            bottom-anchored shelf pattern tiles across them and stops. With top
            padding it tiled into the padding too and drew a stray shelf near
            the top of the wall — measured at y=209 against feet at y=465.

            Breathing room above the first row now comes from the WALL's own
            padding, where it belongs: it is wall, not part of a row.
          */
          className="flex flex-wrap items-end gap-x-[3px] px-4"
          /*
            `paddingBottom` of one shelf: the last row needs somewhere for its
            shelf to be drawn. Bottom-anchored, the pattern's final tile ends at
            the bottom of this box, so the box must extend one shelf below the
            feet — otherwise the last row's shelf falls outside it and the row
            stands on nothing, which is the defect this unit is fixing.
          */
          style={{
            rowGap: `${SHELF_EDGE}px`,
            paddingBottom: `${SHELF_EDGE}px`,
            ...shelfRows(),
          }}
        >
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
                    The truncation is a rendering constraint of a ~13px-wide
                    spine and has no business reaching the accessibility tree.
                  */
                  aria-label={`${record.title} — ${record.artistName}`}
                  className="block rounded-t-[1px] outline-none transition-transform duration-150 focus-visible:ring-2 focus-visible:ring-ring group-hover:-translate-y-2 focus-visible:-translate-y-2"
                  style={{
                    width: `${spineWidth(record.id)}px`,
                    height: `${SPINE_HEIGHT}px`,
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

        {/*
          **The shelf plane the records stand on.**

          A real element rather than a gradient stop, so it has a rect and the
          spines can be measured against it with ONE instrument. Unit 22
          compared a transformed box against an untransformed background offset
          and found them equal to half a pixel while the feet hung 15px through
          the shelf — the same two-coordinate-systems defect as unit 18's tilt.

          It runs the full width regardless of what stands on it, which is what
          §10b means by a plane: "the surface runs edge to edge and ends where
          the wall ends", not where the records do.
        */}


        {/*
          The wall BELOW the shelf. This is what A24a's "the shelf owns the
          screen" actually buys, and what unit 21 left empty when it moved the
          controls off the wall: room under the shelf line for the wall to be a
          wall. `flex-1` gives the remainder of the viewport to it rather than
          to the records.
        */}
        <div className="min-h-0 flex-1" />
      </div>

      {/*
        §10b: "clicking a spine animates the record off the shelf and into view:
        front cover forward, the shelf dimmed behind it." Rendered here rather
        than per-spine so exactly one record is ever out.
      */}
      {pulled !== null && (
        <PulledRecord
          record={pulled}
          spineRect={spineRectFor(pulled.id)}
          measureSpine={() => spineRectFor(pulled.id)}
          onClose={() => setPulledId(null)}
        />
      )}
    </div>
  );
}
