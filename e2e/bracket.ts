/**
 * A bracketed read: a read taken between two fingerprints of the database's
 * visibility, counted only when the fingerprints agree, reopened otherwise, a
 * bounded number of times (option (b) for pick-moods-157:154, the
 * coordinator, 5 Nov).
 *
 * The test it serves compares two page loads of a count every other worker
 * can move, up and down: a record created untagged raises it, a record tagged
 * (ring-144, pick-moods) or an untagged record deleted (every cleanup) lowers
 * it. So the quantity's own equality is not the bracket: a compensating pair
 * inside the window leaves two whole reads equal while the filtered read was
 * taken mid-flight. The fingerprint is `pg_current_snapshot()`, Postgres's
 * xmin:xmax:xip, which changes whenever a writing transaction starts (xmax
 * advances) or ends (its id leaves xip, or xmin advances) and never on a read.
 * Two equal snapshots either side of the reads mean no committed state
 * changed between them, whatever any count did, so every read inside saw the
 * same collection. Monotonic in the only sense needed: it moves on every
 * write and moves back on none.
 */
export async function bracketed<T>(
  snapshot: () => Promise<string>,
  read: () => Promise<T>,
  { attempts }: { attempts: number },
): Promise<{ value: T; attempts: number; reopened: string[] }> {
  const reopened: string[] = [];
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const before = await snapshot();
    const value = await read();
    const after = await snapshot();
    if (before === after) return { value, attempts: attempt, reopened };
    reopened.push(`${before} -> ${after}`);
  }
  throw new Error(`the bracket did not close in ${attempts} attempts: ${reopened.join(', ')}`);
}
