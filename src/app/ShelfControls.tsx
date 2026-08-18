'use client';

import { useState } from 'react';
import { CollectionFilters, type FilterOptions } from './CollectionFilters';
import type { CollectionParams } from './collection-params';

/**
 * §10b A24a: the shelf view owns the screen, so its controls live in an overlay
 * rather than above the wall.
 *
 * "Below the nav there is the wall and nothing else. Search and the filter chips
 * are reachable from it — as an overlay, opened when wanted — but they do not
 * sit above the wall taking vertical space from it, because a wall that arrives
 * under four rows of controls is a strip rather than a wall."
 *
 * Measured: the controls occupied 403px above the wall before this existed and
 * 205px after, and opening the panel moves the wall 0px — that last number is
 * what makes it an overlay rather than a collapsible section.
 *
 * **This ARRANGES `CollectionFilters` rather than replacing or wrapping it.**
 * The controls, their URL handling and their behaviour are unchanged; what
 * changes is where the pieces sit. Grid and table render the same component
 * with no arrangement supplied and get its default inline layout, which is why
 * the branch lives at the SHELF's use of it — §10's screens table states that
 * asymmetry, and imposing the overlay one level lower would have applied it to
 * the list views too.
 *
 * **One control opens all of them**, and the view toggle is deliberately not
 * one of them: it stays on the page, as the reference does with its List/Closet
 * switch. It arrives here through `renderToolbar` rather than as a second
 * toggle of its own, so it shares the one navigation handler — a separate one
 * wired to its own `router.push` would be two implementations that must agree,
 * and the one outside the panel would drop a filter change still in flight.
 */
export function ShelfControls({
  params,
  undatedCount,
  options,
  activeCount,
}: {
  params: CollectionParams;
  undatedCount: number;
  options: FilterOptions;
  /** How many filters are applied, for the closed state to announce. */
  activeCount: number;
}) {
  const [open, setOpen] = useState(false);

  return (
    <CollectionFilters
      params={params}
      undatedCount={undatedCount}
      options={options}
      renderToolbar={(toggle, body) => (
        <div className="relative z-20 mb-4">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              data-testid="shelf-controls-toggle"
              aria-expanded={open}
              aria-controls="shelf-controls-panel"
              onClick={() => setOpen((current) => !current)}
              className="flex items-center gap-2 rounded-xs border border-border bg-background/90 px-3 py-1.5 text-sm text-foreground backdrop-blur-sm hover:bg-accent"
            >
              {open ? 'Hide controls' : 'Search and filter'}

              {/*
                **A closed panel must never hide the fact that the wall is
                filtered.** The gaps are the primary feedback, but a wall with
                fewer records and no reason given cannot be told from a
                collection that is simply small — the absent-versus-unknown
                distinction this project keeps meeting.

                A count rather than a dot: "2 filters" answers how much is
                hidden, where a dot only says that something is.
              */}
              {activeCount > 0 && (
                <span
                  data-testid="shelf-controls-active"
                  className="rounded-xs bg-primary px-1.5 py-0.5 text-xs text-primary-foreground"
                >
                  {activeCount === 1 ? '1 filter' : `${activeCount} filters`}
                </span>
              )}
            </button>

            {toggle}
          </div>

          {/*
            Absolutely positioned so opening it does NOT push the wall down —
            the whole point of the overlay, and the property the E2E measures as
            a 0px displacement.

            Mounted only when open, so a test asserting visibility gets a
            straight answer rather than one about opacity.
          */}
          {open && (
            <div
              id="shelf-controls-panel"
              data-testid="shelf-controls-panel"
              className="absolute top-full left-0 mt-2 w-full max-w-4xl rounded-xs border border-border bg-background/97 p-4 shadow-lg backdrop-blur-sm"
            >
              {body}
            </div>
          )}
        </div>
      )}
    />
  );
}
