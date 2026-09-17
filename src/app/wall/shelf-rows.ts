/**
 * How the collection divides into shelves.
 *
 * **At least four, never more than forty a shelf, spread evenly.** The
 * composition (D2, from the reference) stacks four shelves; Wall Density's
 * 200-record case is five of forty. A remainder shelf — thirty-nine full ones
 * and a stub — would read as the collection running out, so records spread
 * evenly with the extra ones on the first shelves. Empty shelves are not
 * drawn: a plane with nothing on it is the carcass coming back.
 */
export const MIN_SHELVES = 4;
export const PER_SHELF = 40;

/** Seats per shelf, top shelf first. */
export function shelfRows(count: number): number[] {
  if (count <= 0) return [];
  const shelves = Math.max(MIN_SHELVES, Math.ceil(count / PER_SHELF));
  const base = Math.floor(count / shelves);
  const extra = count % shelves;
  return Array.from({ length: shelves }, (_, index) => base + (index < extra ? 1 : 0)).filter(
    (size) => size > 0,
  );
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
