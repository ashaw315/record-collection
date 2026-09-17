/**
 * The dense rank of each record's section in wall order.
 *
 * The runs need the boundaries between sections and the screen must never
 * show their names (§10b removed the headings) — so `shelfRecords` exposes
 * an ordinal per record and drops the name. Records without a section come
 * last in the query's order and share one ordinal of their own.
 */
export function sectionIndices(names: ReadonlyArray<string | null>): number[] {
  const out: number[] = [];
  let index = -1;
  let previous: string | null | undefined;
  for (const name of names) {
    if (out.length === 0 || name !== previous) index += 1;
    out.push(index);
    previous = name;
  }
  return out;
}
