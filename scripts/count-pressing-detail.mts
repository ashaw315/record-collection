/**
 * **The catalogue-number-without-weight count (the coordinator, 11 Nov; from 173c's "a pressing with only a catalogue
 * number renders no Pressing detail section").** On the real collection: how many records have a catalogue number
 * recorded and no weight, and of those how many draw no Pressing detail section at all.
 *
 *   node --env-file=.env.local --conditions=react-server --import tsx scripts/count-pressing-detail.mts
 *
 * The section's presence is the page's rule (RecordDetail.tsx): it draws the pressing facts the identity grid does not
 * already carry, which are the plant, the weight, the colour and a reissue; catalogue number, country, pressed year and
 * matrix are the grid's, and §9.1 drops a section with nothing to show. So the count that matters is records whose
 * pressing has none of the four, split by whether a catalogue number is recorded. Read-only; prints and writes nothing.
 */
import { sql } from 'drizzle-orm';
import { getDb } from '@/db/client';

const db = getDb();
type Row = { label: string; n: number };
const rows = (
  await db.execute<Row>(sql`
    WITH r AS (
      SELECT rec.id,
             p.id IS NOT NULL AS has_pressing,
             nullif(p.catalog_number, '') IS NOT NULL AS has_cat,
             p.vinyl_weight_grams IS NOT NULL AS has_weight,
             (nullif(p.pressing_plant, '') IS NOT NULL OR p.vinyl_weight_grams IS NOT NULL
              OR nullif(p.color_variant, '') IS NOT NULL OR coalesce(p.is_reissue, false)) AS draws_section
      FROM records rec LEFT JOIN pressings p ON p.id = rec.pressing_id)
    SELECT 'records' AS label, count(*)::int AS n FROM r
    UNION ALL SELECT 'with a pressing row', count(*)::int FROM r WHERE has_pressing
    UNION ALL SELECT 'catalogue number recorded', count(*)::int FROM r WHERE has_cat
    UNION ALL SELECT 'catalogue number and no weight', count(*)::int FROM r WHERE has_cat AND NOT has_weight
    UNION ALL SELECT 'catalogue number and no weight, and no Pressing detail section (no plant, colour or reissue either)', count(*)::int FROM r WHERE has_cat AND NOT has_weight AND NOT draws_section
    UNION ALL SELECT 'Pressing detail section drawn', count(*)::int FROM r WHERE draws_section
    UNION ALL SELECT 'no Pressing detail section', count(*)::int FROM r WHERE NOT draws_section`)
).rows;
for (const row of rows) console.log(`${String(row.n).padStart(4)}  ${row.label}`);
