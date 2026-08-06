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
  if (price === null) return ABSENT;

  const [whole, fraction = ''] = price.split('.');
  return `£${whole}.${fraction.padEnd(2, '0').slice(0, 2)}`;
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
