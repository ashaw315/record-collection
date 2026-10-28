import 'server-only';
import { eq, sql } from 'drizzle-orm';
import { getDb } from '@/db/client';
import { pressings, records } from '@/db/schema';
import { attachDiscogsCover } from '@/lib/discogs/attach-cover';
import { readCachedRelease, writeCachedRelease } from '@/lib/discogs/cache';
import type { DiscogsClient } from '@/lib/discogs/client';
import { fetchCollection, type CollectionItem } from '@/lib/discogs/collection';
import { mapCollectionItem, type Omission } from '@/lib/discogs/collection-map';
import { findFormatByName } from './formats';
import { importRelease } from './discogs-import';

/**
 * Step 18 unit D (SPEC §5 `POST /api/discogs/import-collection`, §12 step 18):
 * the token owner's Discogs collection into the app, item by item.
 *
 * Idempotent on release id: a release any record already holds is skipped,
 * so a second run imports nothing and a second Discogs instance of one
 * release imports once (§5 states the consequence). Each item is its own
 * transaction through `importRelease`, and an item that fails is reported
 * with its reason rather than failing the run: one bad release must not cost
 * the other eight. The cover is attached after the commit, as the single
 * import does, and its outcome is reported, never fatal.
 */
export type ImportedItem = { releaseId: number; recordId: string; title: string; artist: string; blank: Omission[]; dropped: Omission[]; cover: string };
export type SkippedItem = { releaseId: number; reason: 'already here' };
export type FailedItem = { releaseId: number; reason: string };
export type CollectionReport = { username: string; items: number; imported: ImportedItem[]; skipped: SkippedItem[]; failed: FailedItem[] };

async function alreadyHeld(releaseId: number): Promise<boolean> {
  const db = getDb();
  const [row] = await db
    .select({ id: records.id })
    .from(records)
    .innerJoin(pressings, eq(pressings.id, records.pressingId))
    .where(eq(pressings.discogsReleaseId, releaseId))
    .limit(1);
  return row !== undefined;
}

async function releasePayload(client: DiscogsClient, releaseId: number): Promise<unknown> {
  const cached = await readCachedRelease(releaseId);
  if (cached !== null) return cached;
  const payload = await client.get(`/releases/${releaseId}`);
  await writeCachedRelease(releaseId, payload);
  return payload;
}

async function importOne(client: DiscogsClient, item: CollectionItem): Promise<ImportedItem> {
  const mapped = mapCollectionItem(await releasePayload(client, item.releaseId), item);
  const format = mapped.formatName === null ? undefined : await findFormatByName(mapped.formatName);
  const created = await importRelease({
    release: mapped.release,
    target: 'record',
    overrides: { ...mapped.overrides, formatId: format?.id ?? null },
    matrixRunoutSource: 'discogs',
    recordNameCollisions: true,
  });
  const cover = await attachDiscogsCover({ recordId: created.id, images: mapped.release.images, client });
  return {
    releaseId: item.releaseId,
    recordId: created.id,
    title: mapped.release.title ?? '',
    artist: mapped.release.artist ?? '',
    blank: mapped.blank,
    dropped: mapped.dropped,
    cover: cover.attached ? 'attached' : `not attached: ${'reason' in cover ? String(cover.reason) : 'no primary image'}`,
  };
}

export async function importCollection(client: DiscogsClient): Promise<CollectionReport> {
  const collection = await fetchCollection(client);
  const report: CollectionReport = { username: collection.username, items: collection.items.length, imported: [], skipped: [], failed: [] };
  for (const item of collection.items) {
    if (await alreadyHeld(item.releaseId)) {
      report.skipped.push({ releaseId: item.releaseId, reason: 'already here' });
      continue;
    }
    try {
      report.imported.push(await importOne(client, item));
    } catch (error) {
      report.failed.push({ releaseId: item.releaseId, reason: error instanceof Error ? error.message : String(error) });
    }
  }
  return report;
}

/* Kept so a report can be checked against the database it describes: the count of records holding each release. */
export async function heldReleaseIds(): Promise<number[]> {
  const db = getDb();
  const rows = await db.execute<{ id: number }>(sql`SELECT DISTINCT p.discogs_release_id AS id FROM records r JOIN pressings p ON p.id = r.pressing_id WHERE p.discogs_release_id IS NOT NULL`);
  return rows.rows.map((r) => r.id);
}
