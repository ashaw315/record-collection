'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';
import { HAIRLINE, LABEL } from '@/app/records/[id]/grid-type';
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

const CHIP_GROUPS = [
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

  const body = (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor="collection-sort" className="sr-only">
          Sort by
        </label>
        <select
          id="collection-sort"
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
          className={`h-9 shrink-0 border bg-transparent px-2 text-label ${HAIRLINE}`}
        >
          <option value="">Sort: default</option>
          {RECORD_SORT_FIELDS.map((field) => (
            <optgroup key={field} label={SORT_LABELS[field]}>
              <option value={`${field}:asc`}>{SORT_LABELS[field]} ↑</option>
              <option value={`${field}:desc`}>{SORT_LABELS[field]} ↓</option>
            </optgroup>
          ))}
        </select>
      </div>

      {/* Chips. Each group scrolls horizontally rather than wrapping to four
          lines on a phone — §10 makes the in-store case a priority, and a
          filter bar taller than the results is unusable one-handed. */}
      {CHIP_GROUPS.map((group) => {
        const list = options[group.options];
        if (list.length === 0) return null;

        const selected = params.filters[group.key];

        return (
          <div key={group.key} className="flex items-baseline gap-2">
            {/*
              §4's label, from the one definition. This was uppercase INTER —
              the page around the wall takes the record screen's system, and a
              second label treatment is A61's fifteen-places defect arriving on
              the collection screen.
            */}
            <span className={`w-12 shrink-0 ${LABEL}`}>
              {group.label}
            </span>
            <div className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1">
              {list.map((option) => {
                const active = selected === option.id;
                return (
                  <button
                    key={option.id}
                    type="button"
                    aria-pressed={active}
                    onClick={() =>
                      change((current) =>
                        withFacet(current, {
                          // Clicking the active chip clears it — the same
                          // control both applies and removes, so there is no
                          // separate "×" to hunt for on a phone.
                          filters: { [group.key]: active ? undefined : option.id },
                        }),
                      )
                    }
                    className={cn(
                      'shrink-0 border px-2 py-1 text-label whitespace-nowrap transition-colors',
                      active ? HAIRLINE : 'border-border hover:bg-accent',
                    )}
                  >
                    {option.name}{' '}
                    {/* The count is what makes a chip worth clicking — and for
                        genres it follows §7.1, so "Punk (12)" is exactly what
                        clicking returns rather than only the directly-tagged
                        records. */}
                    <span className={cn('tabular-nums', LABEL_TEXT)}>
                      {option.count}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}

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
            <label className="flex items-center gap-1.5">
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
            className={`text-label underline underline-offset-2 ${LABEL_TEXT}`}
          >
            Clear {activeCount === 1 ? 'filter' : `all ${activeCount} filters`}
          </button>
        </div>
      )}
    </div>
  );

  return (
    <div ref={rootRef} className="mb-5">
      {body}
    </div>
  );
}
