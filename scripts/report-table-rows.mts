/**
 * **Row counts for named tables, read-only (the coordinator, 14 Nov: which of the tables SPEC §4 does not name are
 * live).** Prints each table's row count and its newest created_at or equivalent where it has one. Writes nothing.
 *
 *   node --env-file=.env.local --conditions=react-server --import tsx scripts/report-table-rows.mts <table> …
 */
import { sql } from 'drizzle-orm';
import { getDb } from '@/db/client';

const tables = process.argv.slice(2);
if (tables.length === 0 || tables.some((t) => !/^[a-z_]+$/.test(t))) throw new Error('report-table-rows: give table names, lower case and underscores');
const db = getDb();
for (const t of tables) {
  const cols = (await db.execute<{ column_name: string }>(sql`SELECT column_name FROM information_schema.columns WHERE table_name = ${t}`)).rows.map((r) => r.column_name);
  const at = ['created_at', 'rejected_at', 'assessed_at', 'fetched_at', 'updated_at'].find((c) => cols.includes(c));
  const [row] = (await db.execute<{ n: number; newest: string | null }>(sql.raw(`SELECT count(*)::int AS n${at ? `, max(${at})::text AS newest` : ', NULL AS newest'} FROM ${t}`))).rows;
  process.stdout.write(`${t}: ${row.n} rows${at ? `, newest ${at} ${row.newest ?? 'none'}` : ''}\n`);
}
process.exit(0);
