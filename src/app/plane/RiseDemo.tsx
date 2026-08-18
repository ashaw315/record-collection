'use client';

import { useState } from 'react';
import type { ShelfRecord } from '@/lib/db/queries/shelf';
import { DEFAULT_SPINE_COLOUR, SPINE_HEIGHT, spineWidth } from '../shelf/spine';
import { BoxCanvas } from './BoxCanvas';
import { resolveSkins } from './skins';
import type { ScreenRect } from './world-map';

/**
 * A row of spines to rise out of, so the mapping has a real DOM rect to work
 * from on a page that has no shelf.
 *
 * **These are PLACEHOLDER spines, not the real wall**, and the report says so.
 * The alternative was rendering the actual `Shelf`, which mounts `PulledRecord`
 * — the entire CSS overlay this unit must leave untouched — so two pull
 * mechanisms would fight over the same click. What is being tested here is the
 * MAPPING, and for that a real flex child in a wrapping row on a scrolling page
 * is the whole requirement: these are exactly that, using the shelf's own
 * `spineWidth` and `SPINE_HEIGHT` so the rects are the size the real ones are.
 *
 * What it does not prove: that the mapping works against the real shelf's
 * layout, ordering or scroll container. That comes when this replaces the CSS
 * implementation on `/`.
 */
export function RiseDemo({ records }: { records: ShelfRecord[] }) {
  const [pulled, setPulled] = useState<{ record: ShelfRecord; from: ScreenRect } | null>(null);

  return (
    <div className="mt-6">
      <ul className="flex flex-wrap items-end gap-x-[3px] rounded-xs bg-[#0e0d0c] px-4 pt-5 pb-2">
        {records.map((record) => (
          <li key={record.id} className="shrink-0">
            <button
              type="button"
              data-testid="demo-spine"
              data-record-id={record.id}
              aria-label={`${record.title} — ${record.artistName}`}
              onClick={(event) => {
                /**
                 * **Measured at click time, viewport-relative, never cached.**
                 *
                 * `getBoundingClientRect` because the question is "where is this
                 * on screen right now, relative to the canvas" — and the canvas
                 * rect is read the same way, so scroll cancels out of the
                 * difference rather than needing a correction term. Unit 18's
                 * defect was mixing a document-relative measurement with a
                 * viewport-relative one; keeping both in one system is the fix.
                 *
                 * Re-measured on every click because a resize re-wraps the row
                 * and moves every spine.
                 */
                const rect = event.currentTarget.getBoundingClientRect();
                setPulled({
                  record,
                  from: {
                    left: rect.left,
                    top: rect.top,
                    width: rect.width,
                    height: rect.height,
                  },
                });
              }}
              className="block rounded-t-[1px] outline-none focus-visible:ring-2 focus-visible:ring-ring"
              style={{
                width: `${spineWidth(record.id)}px`,
                height: `${SPINE_HEIGHT}px`,
                background: record.spineColour ?? DEFAULT_SPINE_COLOUR,
                boxShadow:
                  'inset -6px 0 12px rgba(0,0,0,.45), inset 2px 0 0 rgba(255,255,255,.07)',
              }}
            />
          </li>
        ))}
      </ul>

      <p className="mt-2 text-xs text-muted-foreground">
        Placeholder spines — a real flex child in a wrapping row, which is what the mapping
        needs. Not the real shelf; see the unit report.
      </p>

      {pulled !== null && (
        <div className="mt-6 flex justify-center">
          <BoxCanvas
            // Keyed on the spine so a second click restarts the rise rather
            // than reusing a canvas that has already settled.
            key={`${pulled.record.id}-${pulled.from.left}-${pulled.from.top}`}
            testId="risen-canvas"
            skins={resolveSkins(pulled.record)}
            imprint={null}
            spineColour={pulled.record.spineColour}
            riseFrom={pulled.from}
            label={`risen from (${Math.round(pulled.from.left)}, ${Math.round(pulled.from.top)})`}
          />
        </div>
      )}
    </div>
  );
}
