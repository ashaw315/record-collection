import 'server-only';
import { eq, sql } from 'drizzle-orm';
import { getDb } from '@/db/client';
import { artists, pressings, records } from '@/db/schema';
import { attachDiscogsCover } from '@/lib/discogs/attach-cover';
import { readCachedRelease, writeCachedRelease } from '@/lib/discogs/cache';
import type { DiscogsClient } from '@/lib/discogs/client';
import { fetchCollection, type CollectionItem } from '@/lib/discogs/collection';
import { mapCollectionItem, type Omission } from '@/lib/discogs/collection-map';
import { findFormatByName } from './formats';
import { importRelease } from './discogs-import';
import { recordImportRun, type ImportRun } from './import-runs';
import { writeMoodSets } from './record-moods';
import { runTagging, type Tagger } from '@/lib/moods/tagging';
import { describeError } from '@/lib/errors/describe';
import { logger } from '@/lib/logger';

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
/** Named by the record that holds the release, so the report reads as records and not as ids. */
export type SkippedItem = { releaseId: number; reason: 'already here'; title: string; artist: string };
/** Named from the page's basic information, since a release can fail before its detail is fetched. */
export type FailedItem = { releaseId: number; title: string | null; artist: string | null; reason: string };
/**
 * `total` is Discogs' own count of the collection (its page's `pagination.items`), carried and
 * never derived from the three lists: §T.6's four lines add up to it, and a check against a
 * total computed from the same lists would pass whatever the partition did.
 */
export type CollectionReport = { username: string; total: number; imported: ImportedItem[]; skipped: SkippedItem[]; failed: FailedItem[] };

/** The record holding the release, by title and artist, or null when no record does. */
async function alreadyHeld(releaseId: number): Promise<{ title: string; artist: string } | null> {
  const db = getDb();
  const [row] = await db
    .select({ title: records.title, artist: artists.name })
    .from(records)
    .innerJoin(pressings, eq(pressings.id, records.pressingId))
    .innerJoin(artists, eq(artists.id, records.artistId))
    .where(eq(pressings.discogsReleaseId, releaseId))
    .limit(1);
  return row ?? null;
}

async function releasePayload(client: DiscogsClient, releaseId: number): Promise<unknown> {
  const cached = await readCachedRelease(releaseId);
  /* The payload, not the cache's row: the row went to the mapper once, in production, on the one release whose record had been deleted between two runs, and Zod refused it at `id` (28 Oct). */
  if (cached !== null) return cached.payload;
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
  const report: CollectionReport = { username: collection.username, total: collection.total, imported: [], skipped: [], failed: [] };
  for (const item of collection.items) {
    const held = await alreadyHeld(item.releaseId);
    if (held !== null) {
      report.skipped.push({ releaseId: item.releaseId, reason: 'already here', ...held });
      continue;
    }
    try {
      report.imported.push(await importOne(client, item));
    } catch (error) {
      report.failed.push({ releaseId: item.releaseId, title: item.title, artist: item.artist, reason: error instanceof Error ? error.message : String(error) });
    }
  }
  return report;
}

/**
 * The import as Manage asks for it: the run, recorded (§4.2 `discogs_import_runs`)
 * and answered with when it finished. Then its own records tagged (the
 * coordinator, 28 Oct): the import creates the untagged state, so the import
 * resolves it, through the one tagging module (§7.12), after the commit and
 * never fatal, as the cover is attached. Logged and not drawn: §T.6's four
 * lines partition the run and a tagged count would be a fifth element; a run
 * that fails stays visible where it matters, in the rail's untagged count.
 */
export async function runImport(client: DiscogsClient, options: { tagger?: Tagger } = {}): Promise<ImportRun> {
  const report = await importCollection(client);
  const run = await recordImportRun(report);
  if (options.tagger !== undefined && report.imported.length > 0) await tagImported(report, options.tagger);
  return run;
}

async function tagImported(report: CollectionReport, tagger: Tagger): Promise<void> {
  try {
    const records = report.imported.map((item) => ({ id: item.recordId, artist: item.artist, title: item.title }));
    const run = await runTagging(records, tagger);
    const written = run.verdict === 'refused-flat' ? 0 : await writeMoodSets(run.sets, tagger.model);
    logger.info('collection-import.tag', `Tagged ${written} of ${records.length} imported records${run.verdict === 'refused-flat' ? ' (refused: every record given the same count)' : ''}${run.failed.length > 0 ? `; ${run.failed.length} not answered` : ''}.`);
  } catch (cause) {
    logger.warn('collection-import.tag', `The imported records were not tagged: ${describeError(cause)}. The rail's untagged count shows them.`);
  }
}

/* Kept so a report can be checked against the database it describes: the count of records holding each release. */
export async function heldReleaseIds(): Promise<number[]> {
  const db = getDb();
  const rows = await db.execute<{ id: number }>(sql`SELECT DISTINCT p.discogs_release_id AS id FROM records r JOIN pressings p ON p.id = r.pressing_id WHERE p.discogs_release_id IS NOT NULL`);
  return rows.rows.map((r) => r.id);
}
