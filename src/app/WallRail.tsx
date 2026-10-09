import Link from "next/link";
import { RECORD_SORT_FIELDS } from "@/lib/records/fields";
import type { FilterOption } from "./CollectionFilters";
import { RailSelect } from "./RailSelect";
import {
  SORT_LABELS,
  toQueryString,
  VIEW_MODES,
  type CollectionParams,
  type ViewMode,
} from "./collection-params";
import { HAIRLINE, INK, LABEL, LABEL_INK, LABEL_TYPE } from "./records/[id]/grid-type";

/**
 * **The rail (8a §W.13): the page's controls leave the horizontal band.**
 *
 * The 260px header band cost height in the one dimension the unit is
 * measured in, so the wall starts directly under the app nav and the
 * controls go down a 148px rail on the left: SEARCH at the head — a ruled
 * field, 44 tall by §W.24 (step 100) — then the three views stacked, then Add record
 * at the foot below a rule that bleeds to both edges of the rail.
 *
 * Stacked, the switcher stops being buttons and becomes a list of views —
 * the honest object, since they are three representations of one set rather
 * than three actions. So the current view is marked the way this page marks
 * a current thing: ink against muted, with the 44 × 4 bar under it, and no
 * box, pill or field around any of them; a column of three is already a
 * group. Add record is the only control here that changes the collection
 * rather than the view of it, so it is separated by a rule rather than a gap
 * (§3's distinction, applied to chrome).
 *
 * The rail carries no identity. COLLECTION and the count are the facts
 * column's head (§W.9); the header's Collection and count were the
 * duplicate, and they are the instance that goes. Every control is a plain
 * link or a GET form, so all of it works with JavaScript off.
 *
 * **GENRE and SORT sit under SEARCH (§W.24), three lines in the rail's
 * mono with the same ink underline.** §W.12 is what puts them here rather
 * than convenience: a filter that empties seats produces a shape on the
 * fixture, and an empty seat you did not watch empty is indistinguishable
 * from a gap in the collection — arriving pre-filtered throws away what
 * that ruling bought. ShelfControls' behaviour survives and its horizontal
 * form does not. All three are fields of the one GET form; the other
 * filters ride as hidden inputs so a change keeps them.
 */
const VIEW_NAMES: Record<ViewMode, string> = {
  shelf: "Shelf",
  table: "Table",
  grid: "Grid",
};

const FIELD_BASE = `mt-[6px] block w-full border-b bg-transparent px-0 outline-none ${HAIRLINE} ${INK}`;
const FIELD = `${FIELD_BASE} h-[34px]`;
/* §W.24 (step 100): the search field meets the 44 floor, in the rail and in the band. */
const SEARCH_FIELD = `${FIELD_BASE} h-[44px]`;

export function WallRail({
  params,
  genres = [],
}: {
  params: CollectionParams;
  genres?: readonly FilterOption[];
}) {
  const hidden = new URLSearchParams(
    toQueryString({
      ...params,
      filters: { ...params.filters, q: undefined, genreId: undefined },
      sort: undefined,
      page: 1,
    }),
  );
  const sortValue =
    params.sort === undefined
      ? ""
      : `${params.sort.field}:${params.sort.direction}`;

  return (
    <nav
      data-testid="wall-rail"
      aria-label="Collection controls"
      className="flex flex-col"
      style={{ width: 148, padding: "34px 20px 0" }}
    >
      <form role="search" action="/" method="get" className="mb-[34px]">
        {[...hidden.entries()].map(([key, value]) => (
          <input key={key} type="hidden" name={key} value={value} />
        ))}
        <label htmlFor="rail-search" className={`block ${LABEL}`}>
          Search
        </label>
        <input
          id="rail-search"
          name="q"
          type="search"
          defaultValue={params.filters.q ?? ""}
          className={`${SEARCH_FIELD} font-sans text-[16px] leading-[1.9]`}
        />

        <div data-rail-filter="" className="relative">
          {genres.length > 0 && (
            <>
              {/*
                §W.36: out of flow — GENRE sits above the switcher, so a set filter in flow would move the control you choose the view with.
                §W.32: "the short ink bar UNDER the label". Placed from the label's own foot, 9 below its type as the current view's bar is
                below its name. It was placed by a negative margin from the same foot and drew across the label (found 9 Oct).
              */}
              <div className="relative mt-[18px]">
                <label htmlFor="rail-genre" className={`block ${LABEL}`}>
                  Genre
                </label>
                {params.filters.genreId !== undefined && (
                  <span
                    data-set-bar=""
                    aria-hidden="true"
                    className="absolute top-full left-0 mt-[7.5px] block bg-[oklch(0.19_0.008_60)]"
                    style={{ width: 44, height: 2 }}
                  />
                )}
              </div>
              {/*
                §W.32: a SET filter takes the rail's own set mark — §W.13's
                44-wide ink bar at §W.31's 2px — not oxblood, and not the
                field's underline, which §9.3 puts there whether or not a
                filter is set and so encodes nothing. On the shelf a filter's
                real expression is the empty seats (§W.12); this only says
                which filter made them.
              */}
              {/* §W.36: out of flow like the view's — GENRE and SORT sit above the switcher, so a set filter in flow would move the control you choose the view with. */}
              {/* The count follows §7.1's rollup, as the chips' does: "Punk 12" is what choosing it returns. */}
              <RailSelect
                id="rail-genre"
                name="genreId"
                defaultValue={params.filters.genreId ?? ""}
                className={`${FIELD} font-mono text-label`}
              >
                <option value="">Any</option>
                {genres.map((genre) => (
                  <option key={genre.id} value={genre.id}>
                    {genre.name} {genre.count}
                  </option>
                ))}
              </RailSelect>
            </>
          )}

          <label htmlFor="rail-sort" className={`mt-[18px] block ${LABEL}`}>
            Sort
          </label>
          <RailSelect
            id="rail-sort"
            name="sort"
            defaultValue={sortValue}
            className={`${FIELD} font-mono text-label`}
          >
            <option value="">Default</option>
            {RECORD_SORT_FIELDS.map((field) => (
              <optgroup key={field} label={SORT_LABELS[field]}>
                <option value={`${field}:asc`}>{SORT_LABELS[field]} ↑</option>
                <option value={`${field}:desc`}>{SORT_LABELS[field]} ↓</option>
              </optgroup>
            ))}
          </RailSelect>
        </div>
        {/* The no-JavaScript path: with it, a change is the submit (RailSelect). */}
        <button type="submit" className="sr-only">
          Apply
        </button>
      </form>

      {/* §W.31: above the view switcher, bleeding to both edges of the rail. */}
      <hr data-line="rail-views" className={`border-t ${HAIRLINE}`} style={{ margin: "0 -20px 18px" }} />

      <ul className="flex flex-col gap-[18px]" aria-label="View">
        {VIEW_MODES.map((mode) => {
          const current = params.view === mode;
          const href = `/${toQueryString({ ...params, view: mode, page: 1 }) === "" ? "" : `?${toQueryString({ ...params, view: mode, page: 1 })}`}`;
          return (
            <li key={mode} className="relative">
              <Link
                href={href}
                aria-current={current ? "page" : undefined}
                className={`${LABEL} ${current ? INK : ""}`}
                style={
                  current
                    ? { color: "oklch(0.19 0.008 60)" }
                    : { color: LABEL_INK }
                }
              >
                {VIEW_NAMES[mode]}
              </Link>
              {/*
                §W.36: OUT OF FLOW — drawn against the label's baseline and
                occupying no height, so the switcher's pitch is the type's
                whether a view is set or not. A mark is not content, so it
                cannot push: in flow, GRID sat 8px lower when SHELF was
                active, and the rail's spacing encoded state. §W.31 gives
                the weight (§3's 2px non-type mark) and the 44 that makes it
                a mark rather than a rule.
              */}
              {current && (
                <span
                  data-current-bar=""
                  aria-hidden="true"
                  className="absolute top-full left-0 mt-[6px] block bg-[oklch(0.19_0.008_60)]"
                  style={{ width: 44, height: 2 }}
                />
              )}
            </li>
          );
        })}
      </ul>

      {/* The rule bleeds to both edges of the rail: it separates an action on the collection from the views of it. */}
      <hr
        data-rail-rule=""
        data-line="rail-actions"
        className={`mt-[34px] border-t ${HAIRLINE}`}
        style={{ margin: "34px -20px 0" }}
      />
      <Link href="/records/new" className={`mt-[18px] block ${LABEL_TYPE} ${INK}`}>
        Add record
      </Link>
    </nav>
  );
}
