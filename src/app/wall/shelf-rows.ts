/**
 * How the collection divides into shelves (8a §11.9): **a fixed capacity,
 * and no-reflow extends to wrapping.** A record that changes shelf when the
 * window narrows has a position that is a fact about the viewport rather
 * than about the collection, and §11.1 leaves position carrying the order.
 *
 * Forty is Wall Density's figure — "200 records, five shelves of forty" at
 * the 240 scale — the one number for what a shelf holds that was drawn and
 * measured rather than derived from a view or a count of the collection.
 * A row's length and a plane's length are different quantities: the plane
 * still runs the pan extent (§11.8), whatever the row holds.
 */
export const PER_SHELF = 40;

/** Seats per shelf, top shelf first: full shelves, then the remainder. */
export function shelfRows(count: number): number[] {
  const rows: number[] = [];
  for (let left = count; left > 0; left -= PER_SHELF) rows.push(Math.min(PER_SHELF, left));
  return rows;
}

/** Split seats into shelves by `shelfRows`. */
export function intoShelves<T>(seats: readonly T[]): T[][] {
  const rows: T[][] = [];
  let start = 0;
  for (const size of shelfRows(seats.length)) {
    rows.push(seats.slice(start, start + size));
    start += size;
  }
  return rows;
}
