'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { containDrag } from '@/components/scroll-hold';
import { cn } from '@/lib/utils';
import { HAIRLINE, INK, LABEL, LABEL_TYPE } from '@/app/records/[id]/grid-type';
import { RECORD_SORT_FIELDS, type RecordSortField } from '@/lib/records/fields';
import {
  SORT_LABELS,
  parseCollectionParams,
  toQueryString,
  withFacet,
  type CollectionParams,
} from './collection-params';

/**
 * The collection screen's controls (SPEC.md §10: "Filterable, sortable
 * list/grid of owned records. Prominent search. Filter chips for
 * genre/label/store/tag").
 *
 * Every control navigates rather than setting local state: the URL is the
 * state (see collection-params.ts), so the server re-runs the query and the
 * view is linkable. That also means there is exactly one copy of the filter
 * state, rather than a client mirror that can disagree with the rows on screen.
 */

/** A facet value and how many records carry it (§5.2). */
export type FilterOption = { id: string; name: string; count: number };

export type FilterOptions = {
  genres: FilterOption[];
  labels: FilterOption[];
  stores: FilterOption[];
  tags: FilterOption[];
};

/** The label colour as a text class: every figure and aside in these views that is not ink (§T.2). */
const LABEL_TEXT = 'text-[oklch(0.44_0.008_70)]';

/** The measure the band gives search, and the record page its title: a list row wider than this parts a name from its count. */
const FILTER_MEASURE = 443;

/** §T.3, step 113: "Its floor: three rows, 132." */
const FLOOR = 132;

/**
 * §T.3: "+ closed and − open, at the line's right", and "the + and − ...
 * are 1px ink strokes in a 12 square, the system's hairline weight."
 */
function FilterMark({ open }: { open: boolean }) {
  return (
    <svg data-filter-mark={open ? 'minus' : 'plus'} aria-hidden="true" width="12" height="12" viewBox="0 0 12 12" shapeRendering="crispEdges" className="shrink-0 fill-none stroke-[oklch(0.19_0.008_60)] stroke-1">
      <line x1="0" y1="6" x2="12" y2="6" />
      {!open && <line x1="6" y1="0" x2="6" y2="12" />}
    </svg>
  );
}

const FILTER_GROUPS = [
  { key: 'genreId', label: 'Genre', options: 'genres' },
  { key: 'labelId', label: 'Label', options: 'labels' },
  { key: 'storeId', label: 'Store', options: 'stores' },
  { key: 'tagId', label: 'Tag', options: 'tags' },
] as const;

export function CollectionFilters({
  params,
  options,
  undatedCount,
}: {
  params: CollectionParams;
  options: FilterOptions;
  undatedCount: number;
}) {
  const router = useRouter();

  /**
   * The last query THIS component pushed, so a click can build on intent that
   * has not landed yet.
   *
   * The bug this fixes: clicking Genre then Label produced `?labelId=…` alone —
   * the genre filter silently dropped. Every client-side source of truth is
   * stale in the window between a click and the server render completing.
   * Measured in a browser rather than reasoned about:
   *
   *   after 1st click: window.location.search === ''   (still!)
   *   after 2nd click: window.location.search === ''
   *   settled:         '?labelId=…'
   *
   * `router.push` does not update the URL until the render completes, so
   * `params`, `useSearchParams()` AND `window.location` all report the
   * PRE-click state. Reading any of them gives the second click a base that
   * omits the first. Confirmed by inserting a wait between clicks, which made
   * them compose correctly.
   *
   * **The URL remains the source of truth.** This ref holds only IN-FLIGHT
   * intent and is cleared the moment the server state catches up with it, so
   * it can never own filter state or diverge from what a fresh page load
   * produces — there is a test asserting exactly that equivalence.
   */
  const pending = useRef<string | undefined>(undefined);

  /**
   * A test-support affordance — see RecordForm for the full reasoning.
   *
   * `data-hydrated` appears only after the effect runs, so it is the one signal
   * that distinguishes "React has attached its handlers" from "the markup
   * arrived". These controls are server-rendered, so their PRESENCE proves
   * nothing about interactivity, and a test that waits for a visible control
   * still races hydration on WebKit.
   */
  const rootRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    rootRef.current?.setAttribute('data-hydrated', 'true');
  }, []);

  /**
   * Which filter is open: one at a time (§T.3).
   *
   * Step 113, from Adam's wireframe: "A filter's options open in place,
   * beneath its own title in the sidebar, in a container that scrolls."
   * The container is in the page's flow, so the lines below it move down
   * by its height, and it is bounded, so its height does not grow with the
   * option count, which is what `T.3/push-down` was withdrawn for. Nothing
   * is covered and the page is not held, so there is no outside to tap, no
   * CLOSE and no history entry: steps 101, 102 and 106 to 108 built those,
   * and each is withdrawn within §T.3.
   */
  const [openKey, setOpenKey] = useState<string | null>(null);
  /*
    How far the floor moved the page to make room, so a close can give it
    back: "opening first scrolls the page by the shortfall in one instant
    move, and closing returns it, as step 109 ruled."
  */
  const floorMove = useRef(0);
  /* Where the pressed title was in the window, so it can be kept there when a container above it closes. */
  const pressedTop = useRef<number | null>(null);
  const titleOf = useCallback((key: string) => rootRef.current?.querySelector<HTMLElement>(`[data-filter="${key}"] [data-filter-trigger]`) ?? null, []);
  const returnPage = useCallback(() => {
    const moved = floorMove.current;
    floorMove.current = 0;
    if (moved > 0) window.scrollTo({ top: Math.max(0, window.scrollY - moved), behavior: 'instant' });
  }, []);
  const closeFilter = useCallback(() => {
    setOpenKey(null);
    returnPage();
  }, [returnPage]);
  const openFilter = useCallback((key: string) => {
    pressedTop.current = titleOf(key)?.getBoundingClientRect().top ?? null;
    setOpenKey(key);
  }, [titleOf]);
  /* "The room left in the window after the filter lines below it, so all four lines stay in view." */
  const roomUnder = useCallback((title: HTMLElement) => {
    const lines = Array.from(rootRef.current?.querySelectorAll<HTMLElement>('[data-filter-trigger]') ?? []);
    const below = lines.slice(lines.indexOf(title) + 1).reduce((sum, line) => sum + line.getBoundingClientRect().height, 0);
    return window.innerHeight - title.getBoundingClientRect().bottom - below;
  }, []);

  /*
    Before the open container is painted: the page is put where the ruling
    wants it, and the container is told its room. The room is a property on
    the root and not state, since it is read from the page after the page
    has been moved.
  */
  useLayoutEffect(() => {
    const root = rootRef.current;
    if (openKey === null || root === null) return undefined;
    const title = titleOf(openKey);
    const panel = root.querySelector<HTMLElement>('[data-filter-panel]');
    if (title === null || panel === null) return undefined;
    /* The floor, or the whole list where it is shorter than the floor. */
    const need = Math.min(FLOOR, panel.scrollHeight);
    root.style.setProperty('--filter-room', `${need}px`);
    /* "Opening another closes this one. The page moves by the height that closed, so the pressed title stays under the finger." */
    if (pressedTop.current !== null) {
      const shift = title.getBoundingClientRect().top - pressedTop.current;
      pressedTop.current = null;
      if (shift !== 0) window.scrollBy({ top: shift, behavior: 'instant' });
    }
    const shortfall = need - roomUnder(title);
    if (shortfall > 0) {
      const from = window.scrollY;
      /* No further than the title's own top: "the floor wins and those lines are reached by scrolling the page." */
      window.scrollBy({ top: Math.min(shortfall, Math.max(0, title.getBoundingClientRect().top)), behavior: 'instant' });
      floorMove.current += window.scrollY - from;
    }
    const fit = () => root.style.setProperty('--filter-room', `${Math.max(need, roomUnder(title))}px`);
    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, [openKey, titleOf, roomUnder]);

  useEffect(() => {
    if (openKey === null) return undefined;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      closeFilter();
      /* Focus goes back to the title the list was opened from, without the focus itself moving the page the close has just returned. */
      titleOf(openKey)?.focus({ preventScroll: true });
    };
    /* "A drag in the container scrolls it and does not carry on into the page at its ends. The page itself is not held." */
    const releaseDrag = containDrag(document, () => rootRef.current?.querySelector<HTMLElement>('[data-filter-panel]') ?? null);
    document.addEventListener('keydown', onKey);
    return () => {
      releaseDrag();
      document.removeEventListener('keydown', onKey);
    };
  }, [openKey, closeFilter, titleOf]);

  function change(mutate: (current: CollectionParams) => CollectionParams) {
    /**
     * Reconciled HERE, in the event handler, not during render — reading a ref
     * while rendering is unsound and react-hooks/refs rejects it, correctly.
     *
     * If the props now match what we last pushed, the server has caught up and
     * the pending value is spent. Anything else means a navigation is still in
     * flight and its query is the only place the newest intent exists.
     */
    const settled = toQueryString(params);
    if (pending.current === settled) pending.current = undefined;

    const base =
      pending.current === undefined
        ? params
        : parseCollectionParams(new URLSearchParams(pending.current));

    const query = toQueryString(mutate(base));
    pending.current = query;
    router.push(query === '' ? '/' : `/?${query}`);
  }

  const hasYearFilter =
    params.filters.yearFrom !== undefined || params.filters.yearTo !== undefined;

  const activeCount =
    Object.keys(params.filters).filter(
      (key) => key !== 'includeUndated' && params.filters[key as keyof typeof params.filters] !== undefined,
    ).length;

  /* Step 111: Sort and the filter lines are one block, five lines at the 44 floor with nothing between; a 12 gap stood under Sort until then. What follows the block keeps its 12. */
  const body = (
    <div className="flex flex-col">
      <div className="flex flex-wrap items-center gap-2">
        {/*
          §T.5's Sort control, kept by the table at every width (§T.4): a
          control whose label names the order in force, since Date bought
          and Artist have no header to say it. The select lies over the
          whole control, unseen, so a press anywhere on its 44 opens the
          platform's own list.
        */}
        <label data-sort-control="" className={`relative flex h-[44px] shrink-0 items-center border-b ${HAIRLINE}`}>
          <span data-sort-current="" className={LABEL} style={{ color: 'oklch(0.19 0.008 60)' }}>
            Sort · {params.sort === undefined ? 'Default' : `${SORT_LABELS[params.sort.field]} ${params.sort.direction === 'asc' ? '↑' : '↓'}`}
          </span>
          <select
            id="collection-sort"
            aria-label="Sort by"
            value={params.sort === undefined ? '' : `${params.sort.field}:${params.sort.direction}`}
            onChange={(event) => {
              const [field, direction] = event.target.value.split(':');
              change((current) =>
                withFacet(current, {
                  sort:
                    event.target.value === ''
                      ? undefined
                      : { field: field as RecordSortField, direction: direction as 'asc' | 'desc' },
                }),
              );
            }}
            className="absolute inset-x-0 top-0 h-[44px] w-full cursor-pointer text-label opacity-0"
          >
            <option value="">Default</option>
            {RECORD_SORT_FIELDS.map((field) => (
              <optgroup key={field} label={SORT_LABELS[field]}>
                <option value={`${field}:asc`}>{SORT_LABELS[field]} ↑</option>
                <option value={`${field}:desc`}>{SORT_LABELS[field]} ↓</option>
              </optgroup>
            ))}
          </select>
        </label>
      </div>

      {/*
        §T.3: "Filters are a disclosure, not a set of chips always shown."
        The options grow with the collection (genres were 6 in the seed and
        are 32), so anything that shows them all always fails at some
        count. Closed, a filter is one line whatever the count: its label,
        the one option chosen, and a +. Open, its options are beneath it in
        a container of bounded height, and the lines below move down.
      */}
      <div className="flex flex-col" style={{ maxWidth: FILTER_MEASURE }}>
        {FILTER_GROUPS.map((group) => {
          const list = options[group.options];
          if (list.length === 0) return null;

          const selected = params.filters[group.key];
          const chosen = list.find((option) => option.id === selected);
          const open = openKey === group.key;

          return (
            <div key={group.key} data-filter={group.key}>
              <button
                type="button"
                data-filter-trigger=""
                aria-expanded={open}
                aria-controls={`filter-${group.key}`}
                onClick={() => (open ? closeFilter() : openFilter(group.key))}
                className="flex h-[44px] w-full items-center gap-3 text-left"
              >
                {/* "A chosen option shows on the line as GENRE · JAZZ, the value in ink." The open state "needs no underline, because the − and the list beneath say it". */}
                <span className="min-w-0 flex-1 truncate">
                  <span data-filter-label="" className={open ? `${LABEL_TYPE} ${INK}` : LABEL}>
                    {group.label}
                  </span>
                  {chosen !== undefined && <span className={`${LABEL_TYPE} ${INK}`}> · </span>}
                  <span data-filter-chosen="" className={`${LABEL_TYPE} ${INK}`}>
                    {chosen?.name ?? ''}
                  </span>
                </span>
                <FilterMark open={open} />
              </button>
              {open && (
                /*
                  As wide as its line, whatever width the sidebar gives
                  that: nothing here names one. As tall as its list up to
                  the room the open effect measured; a list longer than
                  that scrolls within it, and does not hand the scroll on
                  to the page at its ends.
                */
                <div data-filter-panel="" className="max-h-[var(--filter-room)] overflow-y-auto overscroll-contain">
                  <ul id={`filter-${group.key}`} data-filter-list="">
                    {list.map((option) => {
                      const active = selected === option.id;
                      return (
                        <li key={option.id}>
                          <button
                            type="button"
                            data-filter-option=""
                            aria-pressed={active}
                            onClick={() => {
                              // Single-valued: choosing the chosen one clears it, so the list both applies and removes.
                              setOpenKey(null);
                              returnPage();
                              change((current) => withFacet(current, { filters: { [group.key]: active ? undefined : option.id } }));
                            }}
                            /* Clipped to its 44: the text's line box hangs a pixel below it, which made a list that fits a list that scrolls by one. */
                            className="flex h-[44px] w-full items-baseline justify-between gap-3 overflow-hidden border-t border-border text-left leading-[43px]"
                          >
                            <span
                              data-filter-name=""
                              className={cn('min-w-0 truncate text-detail', active && 'underline decoration-2 underline-offset-[7px]')}
                            >
                              {option.name}
                            </span>
                            {/* The count follows §7.1 for genres, so it is what choosing the option returns. Right-aligned so the counts read down the list. */}
                            <span data-filter-count="" className={`shrink-0 tabular-nums ${LABEL}`}>
                              {option.count}
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}
                </div>
          );
        })}
      </div>

      {/*
        The undated control, and the count that makes it honest.
        §4.2 makes release_year nullable, so a year range silently excludes
        every undated record — records vanish behind a successful page. The
        count is stated whether they are shown or hidden, so the omission is
        never invisible (NOTES.md, and SPEC.md §5.2's meta.undatedCount).
      */}
      {(hasYearFilter || undatedCount > 0) && (
        <div className={`mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-label ${LABEL_TEXT}`}>
          {hasYearFilter && (
            <label data-filter-undated="" className="flex min-h-[44px] items-center gap-1.5">
              <input
                type="checkbox"
                checked={params.filters.includeUndated !== false}
                onChange={(event) =>
                  change((current) =>
                    withFacet(current, {
                      filters: { includeUndated: event.target.checked ? undefined : false },
                    }),
                  )
                }
                className="size-3.5 accent-[oklch(0.19_0.008_60)]"
              />
              Include records with no release year
            </label>
          )}
          <span>
            {undatedCount === 1
              ? '1 record has no release year'
              : `${undatedCount} records have no release year`}
          </span>
        </div>
      )}

      {activeCount > 0 && (
        <div className="mt-3">
          <button
            type="button"
            onClick={() =>
              change((current) => ({
                filters: {},
                sort: current.sort,
                view: current.view,
                wall: current.wall,
                shelf: current.shelf,
                page: 1,
              }))
            }
            data-filter-clear=""
            className={`min-h-[44px] text-label underline underline-offset-2 ${LABEL_TEXT}`}
          >
            Clear {activeCount === 1 ? 'filter' : `all ${activeCount} filters`}
          </button>
        </div>
      )}
    </div>
  );

  return (
    <div ref={rootRef} data-collection-filters="" className="mb-6">
      {body}
    </div>
  );
}
