/**
 * Display helpers for the collection list (SPEC.md §10).
 *
 * Pure, and deliberately outside the component: each one carries a decision
 * about how absent or hierarchical data reads, and a decision embedded in JSX
 * can only be tested by rendering the whole tree.
 *
 * No `server-only` marker — these run in a client component.
 */

type Named = { id: string; name: string };

export type MatchedVia = {
  filtered: Named;
  descendants: Named[];
};

/**
 * An em dash rather than an empty cell.
 *
 * §4.2 makes `release_year` and `purchase_price` nullable on purpose — a record
 * can be logged in a shop before either is known — so absence is ordinary here,
 * not exceptional. In a dense ruled table a blank cell reads as a rendering
 * fault; a dash reads as "known to be absent", which is what it is.
 */
import { formatMoney } from '@/lib/money';

const ABSENT = '—';

export function formatYear(year: number | null): string {
  return year === null ? ABSENT : String(year);
}

/**
 * Money stays a STRING from the database to the screen.
 *
 * `purchase_price` is NUMERIC(10,2) and is carried as a string end to end
 * precisely so it never routes through a float — the stats endpoint sums it in
 * SQL for the same reason (§7.6). Parsing it here to reformat would reintroduce
 * exactly the precision loss the column type exists to prevent, so the decimal
 * places are padded by string manipulation instead.
 */
export function formatPrice(price: string | null): string {
  return formatMoney(price);
}

/**
 * A money total with thousands separated — for SUMS, not row-level prices.
 *
 * A five-figure collection total is genuinely misread without separators:
 * `$12405.00` and `$1240.50` differ by a decimal point's worth of attention.
 * Individual record prices are rarely four digits and read fine without.
 *
 * Grouped by STRING manipulation, keeping `formatPrice`'s no-float rule:
 * `Number(...).toLocaleString()` would route a NUMERIC(10,2) through a float,
 * which is the precision loss the column type exists to prevent.
 */
export function formatTotal(price: string | null): string {
  return formatMoney(price);
}

/** Artist and title on one line, for the narrow layout where they share a cell. */
export function recordLine(artist: string, title: string): string {
  return `${artist} – ${title}`;
}

/**
 * Why this record appears under this genre filter (SPEC.md §5.2's `matchedVia`).
 *
 * §7.1 makes genre membership hierarchical, so filtering by Punk returns
 * records whose visible badges say only "Crust". This is the sentence that
 * stops that reading as a bug.
 *
 * Returns `undefined` — meaning "render nothing" — in the two cases where the
 * line would be noise rather than explanation:
 *
 *   - no genre filter is applied, so there is nothing to explain;
 *   - the record's only match is the filtered genre itself, where the badge
 *     already says it and "in Punk via Punk" is worse than silence.
 *
 * Every remaining descendant is named. Truncating to the first would flatten
 * genre distinctions that CLAUDE.md §8 exists to protect, and a display layer
 * shortening a list for tidiness is exactly how that happens.
 */
export function matchExplanation(matchedVia: MatchedVia | null): string | undefined {
  if (matchedVia === null) return undefined;

  const via = matchedVia.descendants.filter(
    (genre) => genre.id !== matchedVia.filtered.id,
  );
  if (via.length === 0) return undefined;

  const names = via.map((genre) => genre.name);
  const joined =
    names.length === 1
      ? names[0]
      : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;

  return `in ${matchedVia.filtered.name} via ${joined}`;
}
