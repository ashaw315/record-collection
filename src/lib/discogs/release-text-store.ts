import 'server-only';
import { eq, sql } from 'drizzle-orm';
import { getDb } from '@/db/client';
import { discogsCache, discogsReleaseText } from '@/db/schema';
import { releaseText, type ReleaseTextKind } from './release-text';

/**
 * Where a cached release's searchable text is written (the free-text unit,
 * 4 Nov). `writeCachedRelease` is the one write of a payload, with five
 * callers, so deriving the rows there fills them on every path that caches
 * a release; the backfill is for the releases cached before the table
 * existed, one pass over the cache, no Discogs call.
 */

/** Replaces the release's rows with those of this payload. A refresh that changed a track's title must not leave the old one matching. */
export async function storeReleaseText(discogsReleaseId: number, payload: unknown): Promise<number> {
  const db = getDb();
  const rows = releaseText(payload);
  await db.delete(discogsReleaseText).where(eq(discogsReleaseText.discogsReleaseId, discogsReleaseId));
  if (rows.length > 0) await db.insert(discogsReleaseText).values(rows.map((row) => ({ discogsReleaseId, ...row })));
  return rows.length;
}

/**
 * Every cached release, its text derived again from the payload it holds.
 * Idempotent: a release's rows are replaced, never added to, so a second
 * pass leaves the counts where the first put them. Returns what it did, for
 * the script that runs it once to print.
 */
export async function backfillReleaseText(): Promise<{ releases: number; rows: number }> {
  const db = getDb();
  const cached = await db
    .select({ discogsReleaseId: discogsCache.discogsReleaseId, payload: discogsCache.payload })
    .from(discogsCache)
    .orderBy(sql`${discogsCache.discogsReleaseId}`);
  let rows = 0;
  for (const entry of cached) rows += await storeReleaseText(entry.discogsReleaseId, entry.payload);
  return { releases: cached.length, rows };
}

/** One release's text, in the order the record page's TRACKLIST section draws it (§65, step 172): the tracks, then the credits, then the companies, each in the release's own order. */
export async function releaseTextFor(discogsReleaseId: number): Promise<{ kind: ReleaseTextKind; text: string; detail: string | null }[]> {
  const rows = await getDb()
    .select({ kind: discogsReleaseText.kind, text: discogsReleaseText.text, detail: discogsReleaseText.detail })
    .from(discogsReleaseText)
    .where(eq(discogsReleaseText.discogsReleaseId, discogsReleaseId))
    .orderBy(sql`CASE ${discogsReleaseText.kind} WHEN 'track' THEN 0 WHEN 'credit' THEN 1 ELSE 2 END`, discogsReleaseText.ordinal);
  return rows.map((row) => ({ ...row, kind: row.kind as ReleaseTextKind }));
}
