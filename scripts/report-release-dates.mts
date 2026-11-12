/**
 * **§66's report-first bullet (Design, 11 Nov; the coordinator: the answer must not arrive as an assumption inside the
 * build).** Before the full release date is drawn: which year the PRESSING line's end draws and which year RELEASE YEAR
 * draws, by field; which of those the stored full date dates; and how many of the collection's records have a day, a
 * month only, or a year only.
 *
 *   node --env-file=.env.local --conditions=react-server --import tsx scripts/report-release-dates.mts
 *
 * The two years by field, read from the code and stated here so the figures sit beside their source: RELEASE YEAR is
 * `records.release_year`, the album's year from its Discogs master (`masterYear`, §4.2); the PRESSING line's end is
 * `pressings.year_pressed`, the release's own year, read at import from the release's `year` or, failing that, the
 * first digits of its `released` (`toYear`). No column holds a full date: it exists only as the cached release
 * payload's `released` ("1982-03-15", "1982-03" or "1982"), keyed by the pressing's `discogs_release_id`. So the full
 * date dates the pressing's year, the PRESSING line's end, and never RELEASE YEAR. Read-only; prints and writes nothing.
 */
import { sql } from 'drizzle-orm';
import { getDb } from '@/db/client';

const db = getDb();
type Row = { label: string; n: number };
const rows = (
  await db.execute<Row>(sql`
    WITH r AS (
      SELECT rec.id,
             rec.release_year,
             p.year_pressed,
             p.discogs_release_id,
             c.payload->>'released' AS released,
             c.payload->>'year' AS release_year_field
      FROM records rec
      LEFT JOIN pressings p ON p.id = rec.pressing_id
      LEFT JOIN discogs_cache c ON c.discogs_release_id = p.discogs_release_id),
    g AS (
      SELECT *,
             CASE
               WHEN released IS NULL OR released = '' THEN 'no released field'
               WHEN released ~ '^\\d{4}-\\d{2}-\\d{2}$' THEN 'a day'
               WHEN released ~ '^\\d{4}-\\d{2}(-00)?$' THEN 'a month only'
               WHEN released ~ '^\\d{4}(-00-00)?$' THEN 'a year only'
               ELSE 'another shape'
             END AS grain
      FROM r)
    SELECT 'records' AS label, count(*)::int AS n FROM g
    UNION ALL SELECT 'with RELEASE YEAR (records.release_year)', count(*)::int FROM g WHERE release_year IS NOT NULL
    UNION ALL SELECT 'with a pressed year (pressings.year_pressed)', count(*)::int FROM g WHERE year_pressed IS NOT NULL
    UNION ALL SELECT 'pressed year equal to RELEASE YEAR', count(*)::int FROM g WHERE year_pressed = release_year
    UNION ALL SELECT 'pressed year differing from RELEASE YEAR', count(*)::int FROM g WHERE year_pressed <> release_year
    UNION ALL SELECT 'with a cached release (a stored released field possible)', count(*)::int FROM g WHERE discogs_release_id IS NOT NULL
    UNION ALL SELECT 'released dates the pressed year (first four digits equal)', count(*)::int FROM g WHERE left(released, 4) = year_pressed::text
    UNION ALL SELECT 'released equal to RELEASE YEAR but not the pressed year', count(*)::int FROM g WHERE left(released, 4) = release_year::text AND left(released, 4) IS DISTINCT FROM year_pressed::text
    UNION ALL SELECT 'grain: ' || grain, count(*)::int FROM g GROUP BY grain
  `)
).rows;
for (const row of rows) process.stdout.write(`${row.label.padEnd(64)} ${row.n}\n`);
const odd = (await db.execute<{ released: string; n: number }>(sql`
  SELECT c.payload->>'released' AS released, count(*)::int AS n
  FROM records rec JOIN pressings p ON p.id = rec.pressing_id JOIN discogs_cache c ON c.discogs_release_id = p.discogs_release_id
  WHERE c.payload->>'released' !~ '^\\d{4}(-\\d{2}(-\\d{2})?)?$'
  GROUP BY 1 ORDER BY 2 DESC`)).rows;
if (odd.length > 0) process.stdout.write(`released values of another shape: ${odd.map((o) => `${JSON.stringify(o.released)} ×${o.n}`).join(', ')}\n`);
