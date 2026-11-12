/**
 * **Q71's count on the real collection (11 Nov): pressings nothing references.** The record form re-posts the pressing's
 * fields on every save, and a pressing whose match key (catalogue number, country, pressed year, or a Discogs id) is
 * empty is always created anew (§4's white-label rule), so a save moved the record to a second pressing and left the
 * first. How many such rows production holds, and whether any still match a referenced pressing by matrix, is Adam's
 * to rule on; this only counts. Read-only; prints and writes nothing.
 *
 *   node --env-file=.env.local --conditions=react-server --import tsx scripts/count-orphan-pressings.mts
 */
import { sql } from 'drizzle-orm';
import { getDb } from '@/db/client';

const db = getDb();
type Row = { label: string; n: number };
const rows = (
  await db.execute<Row>(sql`
    WITH o AS (
      SELECT p.*
      FROM pressings p
      WHERE NOT EXISTS (SELECT 1 FROM records r WHERE r.pressing_id = p.id)
        AND NOT EXISTS (SELECT 1 FROM want_list w WHERE w.target_pressing_id = p.id)
        AND NOT EXISTS (SELECT 1 FROM price_history h WHERE h.pressing_id = p.id))
    SELECT 'pressings' AS label, count(*)::int AS n FROM pressings
    UNION ALL SELECT 'referenced by no record, want-list row or price row', count(*)::int FROM o
    UNION ALL SELECT 'of those, with a matrix', count(*)::int FROM o WHERE nullif(matrix_runout, '') IS NOT NULL
    UNION ALL SELECT 'of those, sharing a matrix with a referenced pressing', count(*)::int FROM o
      WHERE nullif(matrix_runout, '') IS NOT NULL AND EXISTS (
        SELECT 1 FROM pressings q JOIN records r ON r.pressing_id = q.id WHERE q.matrix_runout = o.matrix_runout AND q.id <> o.id)
    UNION ALL SELECT 'of those, with an empty match key (no catalogue, country, year or Discogs id)', count(*)::int FROM o
      WHERE nullif(catalog_number, '') IS NULL AND nullif(country_pressed, '') IS NULL AND year_pressed IS NULL AND discogs_release_id IS NULL
    UNION ALL SELECT 'referenced pressings with an empty match key (a save would duplicate them)', count(*)::int FROM pressings p
      WHERE EXISTS (SELECT 1 FROM records r WHERE r.pressing_id = p.id)
        AND nullif(catalog_number, '') IS NULL AND nullif(country_pressed, '') IS NULL AND year_pressed IS NULL AND discogs_release_id IS NULL
  `)
).rows;
for (const row of rows) process.stdout.write(`${row.label.padEnd(80)} ${row.n}\n`);
