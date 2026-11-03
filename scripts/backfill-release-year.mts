/**
 * §4.2's backfill: release_year is the album's original year, and every writer of it wrote the
 * pressing's until 2 Nov. Run by hand, by a person:
 *
 *   npm run records:backfill-year              # dry run: fetch every master, print, change nothing
 *   npm run records:backfill-year -- --write   # after the dry run has been read
 *
 * Every record with a Discogs release is asked about, not only the reissues: "a non-reissue's year
 * is right" rests on an inferred flag, and the dry run tests that for the cost of the extra calls.
 * The calls go through the one client, so they spend from the shared bucket. A pressing missing
 * its master id takes it from the cached payload, and `--write` stores that too. The write rule is
 * `classify`'s, and what is wrong but out of scope is listed apart, as a separate decision.
 */
import { sql } from 'drizzle-orm';
import { getDb } from '@/db/client';
import { getDiscogsClient } from '@/lib/discogs/client';
import { askMaster, type MasterAnswer } from '@/lib/discogs/master-year';
import { summarise, type Row } from '@/lib/records/release-year-backfill';

const write = process.argv.includes('--write');
const db = getDb();

type DbRow = Row & { pressingId: string; cachedMasterId: number | null; storedMasterId: number | null };
const rows = (
  await db.execute<DbRow>(sql`
    SELECT r.id, r.title, p.is_reissue AS "isReissue", r.release_year AS "releaseYear", p.year_pressed AS "yearPressed",
           p.discogs_master_id AS "masterId", p.discogs_master_id AS "storedMasterId", p.id AS "pressingId",
           NULLIF((d.payload->>'master_id')::int, 0) AS "cachedMasterId"
    FROM records r
    JOIN pressings p ON p.id = r.pressing_id
    LEFT JOIN discogs_cache d ON d.discogs_release_id = p.discogs_release_id
    ORDER BY r.title`)
).rows.map((row) => ({ ...row, masterId: row.masterId ?? row.cachedMasterId }));

/* Pressings with no stored master id whose cached payload names one: --write stores these. */
const fromCache = rows.filter((row) => row.storedMasterId === null && row.cachedMasterId !== null);
const client = getDiscogsClient();
const years = new Map<string, number | null>();
const byMaster = new Map<number, MasterAnswer>();
const failed: Array<Row & { reason: string }> = [];
for (const row of rows) {
  if (row.masterId === null) continue;
  if (!byMaster.has(row.masterId)) byMaster.set(row.masterId, await askMaster(client, row.masterId));
  const answer = byMaster.get(row.masterId) ?? { kind: 'none' as const };
  if (answer.kind === 'failed') failed.push({ ...row, reason: answer.reason });
  years.set(row.id, answer.kind === 'year' ? answer.year : null);
}
/* A failed read is not a master with no year: it is left out of every count below, and the run says it is incomplete. */
const s = summarise(rows.filter((row) => !failed.some((f) => f.id === row.id)), years);
const line = (row: Row, extra = '') => `  ${row.title}: release_year ${row.releaseYear ?? '—'}, pressed ${row.yearPressed ?? '—'}${extra}`;

console.log(`${rows.length} records, ${byMaster.size} masters asked, ${fromCache.length} pressings with no stored master id take one from the cache.\n`);
console.log(`FALSE ON THE PAGE, "Released · same year" where the master says otherwise: ${s.falseSameYear.length}`);
for (const row of s.falseSameYear) console.log(line(row, `, master ${years.get(row.id)}`));
console.log(`\nWRONG AND IN SCOPE, written with --write: ${s.write.length}`);
for (const row of s.write) console.log(line(row, ` → ${row.year}`));
console.log(`\nWRONG AND OUT OF SCOPE, a separate decision: ${s.outOfScope.length}`);
for (const row of s.outOfScope) console.log(line(row, `, master ${'master' in row.verdict ? row.verdict.master : '—'}: ${row.verdict.kind === 'flag-suspect' ? 'not flagged a reissue' : 'set by hand'}`));
console.log(`\nRight already: ${s.right.length}. No answer from the master: ${s.noAnswer.length}. No master: ${s.noMaster.length}.`);
for (const row of [...s.noAnswer, ...s.noMaster]) console.log(line(row));
if (failed.length > 0) {
  console.log(`\nFAILED TO READ, so this run is INCOMPLETE and writes nothing: ${failed.length}`);
  for (const row of failed) console.log(line(row, `: ${row.reason}`));
  process.exit(1);
}

if (write) {
  let ids = 0;
  for (const row of fromCache) {
    const r = await db.execute(sql`UPDATE pressings SET discogs_master_id = ${row.cachedMasterId} WHERE id = ${row.pressingId} AND discogs_master_id IS NULL`);
    ids += r.rowCount ?? 0;
  }
  for (const row of s.write) await db.execute(sql`UPDATE records SET release_year = ${row.year} WHERE id = ${row.id}`);
  console.log(`\nWritten: ${s.write.length} years, ${ids} master ids.`);
} else console.log('\nDry run: nothing written.');
process.exit(0);
