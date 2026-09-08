import { config } from 'dotenv';
import pg from 'pg';
config({ path: '.env.local', quiet: true });
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const q=(t,p=[])=>pool.query(t,p).then(r=>r.rows);
const rows = await q(`
  SELECT w.title, a.name artist, p.catalog_number, p.matrix_runout, p.country_pressed,
         p.year_pressed, p.pressing_plant, p.color_variant, p.discogs_release_id
    FROM want_list w JOIN artists a ON a.id=w.artist_id
    LEFT JOIN pressings p ON p.id=w.target_pressing_id
   WHERE w.title ILIKE '%halcyon%' OR a.name ILIKE '%deerhunter%'`);
console.log('WANT-LIST ROW(S):');
for (const r of rows) console.log(JSON.stringify(r, null, 1));
const asmt = await q(`SELECT w.title, pa.verdict, pa.pressings, pa.asked_at FROM pressing_assessments pa JOIN want_list w ON w.id=pa.want_list_id ORDER BY pa.asked_at DESC LIMIT 3`);
console.log('\nSTORED ASSESSMENTS:');
for (const a of asmt) console.log(`  ${a.title} | ${a.verdict} | ${JSON.stringify(a.pressings)}`);
await pool.end();
