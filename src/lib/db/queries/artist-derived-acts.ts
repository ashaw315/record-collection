import 'server-only';
import { getDb } from '@/db/client';
import { artistDerivedActs } from '@/db/schema';

/**
 * SPEC.md §9.1 (A48) — bands MusicBrainz says derive from another band.
 *
 * **The one signal that escapes §9.1's honest limit.** A graph records that two
 * groups share a person and never why, so nothing derived from graph SHAPE can
 * separate a tribute act from a side project — Guitar Heroes and The Notting
 * Hillbillies share the identical pair with Dire Straits and are different
 * things. `tribute` and `subgroup` are MusicBrainz stating the relationship's
 * PURPOSE, which is information the shape never carried.
 */

export type DerivedActInput = {
  /** The ORIGINAL — the band tributed or spun off from. */
  originArtistId: string;
  /** The DERIVED act. */
  derivedArtistId: string;
  kind: 'tribute' | 'subgroup';
};

export async function saveDerivedActs(rows: DerivedActInput[]): Promise<void> {
  /*
   * **A self-reference is DROPPED here rather than left to the constraint.**
   * The CHECK is the structural guarantee and stays; this is so a payload that
   * names the artist we asked about does not abort a whole walk's write. §6's
   * rule for imperfect upstream data — skip the row, keep the payload.
   */
  const usable = rows.filter((row) => row.originArtistId !== row.derivedArtistId);

  // An artist with no tribute or subgroup relations is the common case, and an
  // empty INSERT is a syntax error.
  if (usable.length === 0) return;

  /*
   * **Idempotent, because every row is DERIVED.** The walk re-runs and the
   * 90-day cache expires and re-fetches, so a missing conflict clause would not
   * error — it would silently accumulate duplicates, the exact failure §4.3
   * documents for memberships.
   */
  await getDb().insert(artistDerivedActs).values(usable).onConflictDoNothing();
}
