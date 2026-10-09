'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { holdScroll } from '@/components/scroll-hold';
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

/** Whether the history entry in force is the one an open filter added. */
const hasEntry = () => (window.history.state as { collectionFilter?: boolean } | null)?.collectionFilter === true;

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
   * Step 101: an open filter covers. Its options are on a fixed panel of
   * opaque paper to the viewport's bottom, and the page beneath does not
   * move. Step 102: the panel starts beneath the LAST filter line, whichever
   * is open, so all four lines stay in view and a press on another closes
   * this one and opens that (`T.3/covers-own-line` was beneath its own). The mechanics are §G.8's, the menu's
   * (`AppHeader`): opening adds one history entry at the same URL, so Back
   * closes the filter rather than leaving the screen; closing by any other
   * means goes back over that entry, so entries do not pile up; and a
   * chosen option replaces it. Step 97b pushed the page down instead
   * (`T.3/push-down`).
   */
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [panelTop, setPanelTop] = useState(0);
  const closeFilter = useCallback(() => {
    setOpenKey(null);
    if (hasEntry()) window.history.back();
  }, []);
  /* Where the last filter line ends in the window: every filter's panel starts there. */
  const lastLineBottom = useCallback(() => {
    const lines = rootRef.current?.querySelectorAll<HTMLElement>('[data-filter-trigger]');
    return lines === undefined || lines.length === 0 ? undefined : lines[lines.length - 1].getBoundingClientRect().bottom;
  }, []);
  const openFilter = useCallback((key: string) => {
    /* Placed in the press itself, so the panel's first paint is already beneath the last line. */
    setPanelTop(lastLineBottom() ?? 0);
    /* A second filter opened over the first takes the first's entry: one entry however many are tried. */
    if (!hasEntry()) window.history.pushState({ ...(window.history.state as object | null), collectionFilter: true }, '');
    setOpenKey(key);
  }, [lastLineBottom]);

  useEffect(() => {
    if (openKey === null) return undefined;
    const trigger = () => rootRef.current?.querySelector<HTMLElement>(`[data-filter="${openKey}"] [data-filter-trigger]`);
    const place = () => {
      const bottom = lastLineBottom();
      if (bottom !== undefined) setPanelTop(bottom);
    };
    place();
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      closeFilter();
      // Focus goes back to the line, which is where the list was opened from and has not moved.
      trigger()?.focus();
    };
    /* Back, or anything else that leaves the filter's entry: the filter is closed. */
    const onPop = () => {
      if (!hasEntry()) setOpenKey(null);
    };
    /* "The page beneath does not move": held in both directions, with step 86's compensation. */
    const release = holdScroll(document.documentElement, window);
    document.addEventListener('keydown', onKey);
    window.addEventListener('popstate', onPop);
    window.addEventListener('resize', place);
    return () => {
      release();
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('popstate', onPop);
      window.removeEventListener('resize', place);
    };
  }, [openKey, closeFilter, lastLineBottom]);

  function change(mutate: (current: CollectionParams) => CollectionParams, how: 'push' | 'replace' = 'push') {
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
    router[how](query === '' ? '/' : `/?${query}`);
  }

  const hasYearFilter =
    params.filters.yearFrom !== undefined || params.filters.yearTo !== undefined;

  const activeCount =
    Object.keys(params.filters).filter(
      (key) => key !== 'includeUndated' && params.filters[key as keyof typeof params.filters] !== undefined,
    ).length;

  const body = (
    <div className="flex flex-col gap-3">
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
        count. Closed, a filter is one line whatever the count: its label
        and the one option chosen. Open, its options are on a panel that
        covers what lies beneath the last line (steps 101 and 102), every
        line stays where it is, and the open one's label is in ink so the
        panel says whose it is.
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
                className="flex h-[44px] w-full items-baseline gap-3 text-left leading-[44px]"
              >
                <span data-filter-label="" className={`w-12 shrink-0 ${open ? `${LABEL_TYPE} ${INK}` : LABEL}`}>
                  {group.label}
                </span>
                <span data-filter-chosen="" className="min-w-0 truncate text-detail">
                  {chosen?.name ?? ''}
                </span>
              </button>
              {open && (
                /*
                  §T.3 by §G.8: fixed, opaque paper, full width, from the
                  last line's end to the viewport's bottom. `z-50` raises it above
                  the table's rows and the grid's cells, which are positioned
                  and later in the page, so they would paint over it and take
                  its taps; asserted on the grid in `filter-panel-101.spec.ts`.
                  A list longer than the panel scrolls within it. A tap on
                  the paper, anywhere off the list, closes it.
                */
                <div
                  data-filter-panel=""
                  onClick={(event) => {
                    if (!(event.target as HTMLElement).closest('[data-filter-list]')) closeFilter();
                  }}
                  style={{ top: panelTop }}
                  className="fixed inset-x-0 bottom-0 z-50 overflow-y-auto overscroll-contain bg-background"
                >
                  <ul id={`filter-${group.key}`} data-filter-list="" className="mx-5" style={{ maxWidth: FILTER_MEASURE }}>
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
                              // The choice replaces the filter's history entry (§G.8), so one Back leaves the filtered page.
                              setOpenKey(null);
                              change(
                                (current) => withFacet(current, { filters: { [group.key]: active ? undefined : option.id } }),
                                hasEntry() ? 'replace' : 'push',
                              );
                            }}
                            className="flex h-[44px] w-full items-baseline justify-between gap-3 border-t border-border text-left leading-[43px]"
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
        <div className={`flex flex-wrap items-center gap-x-3 gap-y-1 text-label ${LABEL_TEXT}`}>
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
        <div>
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
    <div ref={rootRef} data-collection-filters="" className="mb-5">
      {body}
    </div>
  );
}
