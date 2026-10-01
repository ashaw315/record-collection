/**
 * §61 (step 72): report, for every record, the spine colour re-derived from
 * its NEWEST cover, against the colour it holds. Read-only unless `--apply`
 * is passed, in which case each record whose colour differs is set through
 * the same function the routes use (`rederiveSpineColour`), so a backfill
 * is the app's own rule applied once, not a hand edit.
 *
 *   node --env-file=.env.local --conditions=react-server --import tsx scripts/rederive-spine-colours.mts [--apply]
 *
 * `--conditions=react-server` is what lets `server-only` load outside Next;
 * `.mts` because tsx compiles a `.ts` script as CommonJS, where top-level
 * await is not allowed.
 */
import { desc, eq } from 'drizzle-orm';
import { getDb } from '@/db/client';
import { images, records } from '@/db/schema';
import { rederiveSpineColour } from '@/lib/images/follow-cover';
import { averageColour } from '@/lib/images/spine-colour';

const apply = process.argv.includes('--apply');
const db = getDb();
const rows = await db.select({ id: records.id, title: records.title, spineColour: records.spineColour }).from(records).orderBy(records.title);
let changed = 0;
let same = 0;
let none = 0;
const lines: string[] = [];
for (const r of rows) {
  const covers = (await db.select().from(images).where(eq(images.recordId, r.id)).orderBy(desc(images.createdAt), desc(images.id))).filter((i) => i.imageType === 'cover');
  const cover = covers[0];
  if (cover === undefined) {
    none += 1;
    lines.push(`| ${r.title.split(':')[0]} | none | ${r.spineColour ?? 'null'} | null | ${r.spineColour === null ? 'same' : 'CHANGES to null'} |`);
    if (apply && r.spineColour !== null) await rederiveSpineColour(r.id);
    continue;
  }
  const response = await fetch(cover.url);
  const bytes = response.ok ? await response.arrayBuffer() : null;
  const colour = bytes === null ? null : await averageColour(bytes);
  const differs = colour !== r.spineColour;
  if (differs) changed += 1; else same += 1;
  lines.push(`| ${r.title.split(':')[0]} | ${covers.length} cover${covers.length === 1 ? '' : 's'}, newest ${new Date(cover.createdAt).toISOString().slice(0, 10)} | ${r.spineColour ?? 'null'} | ${colour ?? 'null'} | ${differs ? 'CHANGES' : 'same'} |`);
  if (apply && differs) await rederiveSpineColour(r.id, bytes === null ? {} : { bytes });
}
console.log('| record | covers | colour held | re-derived from the newest cover | |');
console.log('|---|---|---|---|---|');
for (const l of lines) console.log(l);
console.log(`${rows.length} records: ${same} unchanged, ${changed} would change, ${none} with no cover${apply ? ' -- APPLIED' : ' -- dry run, nothing written'}`);
