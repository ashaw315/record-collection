/**
 * A read-only inventory for the free-text unit (4 Nov): how much of the collection a backfill of
 * `discogs_release_text` covers without a Discogs call, and what the cached payloads hold. Run by
 * hand against production, as the other `.mts` scripts are:
 *
 *   npm run discogs:inventory-text
 *
 * Reads and prints; writes nothing. A production count goes through a script like this, not
 * through a tool the session's permission rule refuses (NOTES, 4 Nov).
 */
import { sql } from 'drizzle-orm';
import { getDb } from '@/db/client';

const db = getDb();
const [row] = (
  await db.execute<Record<string, string | number | null>>(sql`
    SELECT
      (SELECT count(*) FROM records) AS records,
      (SELECT count(*) FROM records r JOIN pressings p ON p.id = r.pressing_id WHERE p.discogs_release_id IS NOT NULL) AS records_with_release_id,
      (SELECT count(*) FROM discogs_cache) AS cache_rows,
      (SELECT count(*) FROM discogs_cache c WHERE EXISTS (SELECT 1 FROM pressings p JOIN records r ON r.pressing_id = p.id WHERE p.discogs_release_id = c.discogs_release_id)) AS cache_rows_held,
      (SELECT count(*) FROM discogs_cache WHERE jsonb_array_length(coalesce(payload->'tracklist', '[]'::jsonb)) > 0) AS with_tracklist,
      (SELECT count(*) FROM discogs_cache WHERE jsonb_array_length(coalesce(payload->'extraartists', '[]'::jsonb)) > 0) AS with_credits,
      (SELECT count(*) FROM discogs_cache WHERE length(coalesce(payload->>'notes', '')) > 0) AS with_notes,
      (SELECT count(*) FROM discogs_cache WHERE jsonb_array_length(coalesce(payload->'companies', '[]'::jsonb)) > 0) AS with_companies,
      (SELECT sum(jsonb_array_length(coalesce(payload->'tracklist', '[]'::jsonb))) FROM discogs_cache) AS tracks,
      (SELECT sum(jsonb_array_length(coalesce(payload->'extraartists', '[]'::jsonb))) FROM discogs_cache) AS credits,
      (SELECT sum(length(coalesce(payload->>'notes', ''))) FROM discogs_cache) AS notes_chars,
      (SELECT sum(jsonb_array_length(coalesce(payload->'companies', '[]'::jsonb))) FROM discogs_cache) AS companies,
      (SELECT pg_size_pretty(pg_total_relation_size('discogs_cache'))) AS cache_size,
      (SELECT count(*) FROM discogs_cache WHERE fetched_at < now() - interval '7 days') AS stale_rows,
      (SELECT count(*) FROM discogs_release_text) AS text_rows_now`)
).rows;

for (const [key, value] of Object.entries(row)) console.log(`${key.padEnd(24)} ${value ?? 0}`);
process.exit(0);
