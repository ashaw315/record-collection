/**
 * **Step 173a (§65, "Credits fold"; the coordinator, 8 Nov): what the count line reads on every record that holds a
 * cached release, with the companies the section would draw and the ones it suppresses.** Two records with the same
 * Discogs data can show different counts because one's label or plant matched; Design should see that in numbers
 * before it meets it in a capture.
 *
 *   npm run discogs:tracklist-counts
 *
 * Read-only against production, through the model the section draws (`tracklistModel`), so the counts here are the
 * page's, not a second derivation. Reads and prints; writes nothing.
 */
import { sql } from 'drizzle-orm';
import { getDb } from '@/db/client';
import { tracklistModel } from '@/app/records/[id]/tracklist';
import type { ReleaseTextKind } from '@/lib/discogs/release-text';

const db = getDb();
type Held = { record_id: string; artist: string; title: string; label: string | null; plant: string | null; release_id: number };
const held = (
  await db.execute<Held>(sql`
    SELECT r.id AS record_id, a.name AS artist, r.title, l.name AS label, p.pressing_plant AS plant, p.discogs_release_id AS release_id
    FROM records r JOIN artists a ON a.id = r.artist_id JOIN pressings p ON p.id = r.pressing_id LEFT JOIN labels l ON l.id = r.label_id
    WHERE p.discogs_release_id IS NOT NULL ORDER BY a.name, r.title`)
).rows;
type Text = { release_id: number; kind: ReleaseTextKind; text: string; detail: string | null };
/* The read `releaseTextFor` makes, for every release at once: each kind in the release's order. */
const text = (await db.execute<Text>(sql`SELECT discogs_release_id AS release_id, kind, text, detail FROM discogs_release_text ORDER BY discogs_release_id, CASE kind WHEN 'track' THEN 0 WHEN 'credit' THEN 1 ELSE 2 END, ordinal`)).rows;

const per = held.map((h) => {
  const rows = text.filter((t) => Number(t.release_id) === Number(h.release_id));
  const shown = [h.label, h.plant].filter((v): v is string => v !== null && v.trim() !== '');
  const m = tracklistModel(rows, shown);
  const all = rows.filter((r) => r.kind === 'company').length;
  const credits = rows.filter((r) => r.kind === 'credit').length;
  return { h, m, shown, credits, companies: all };
});

const name = (p: (typeof per)[number]) => `${p.h.artist} — ${p.h.title}`;
console.log(`records holding a release ${per.length}; with a section ${per.filter((p) => p.m !== null).length}; with a count line ${per.filter((p) => p.m?.countLine).length}`);
console.log(`records whose count drops for a suppressed company ${per.filter((p) => (p.m?.suppressed.length ?? 0) > 0).length}`);
console.log(`records with no credits but a company drawn, so a count line on companies alone ${per.filter((p) => p.credits === 0 && (p.m?.companies.length ?? 0) > 0).length}`);
console.log(`records with no credits and no company drawn, so no count line ${per.filter((p) => p.m !== null && p.m.countLine === null).length}`);

const by = new Map<number, (typeof per)[number][]>();
for (const p of per) by.set(Number(p.h.release_id), [...(by.get(Number(p.h.release_id)) ?? []), p]);
const split = [...by.values()].filter((list) => new Set(list.map((p) => p.m?.count)).size > 1);
console.log(`releases held by two or more records whose counts differ ${split.length}`);
for (const list of split) for (const p of list) console.log(`  ${p.m?.countLine}  ${name(p)} (shows ${p.shown.join(' / ') || 'nothing'})`);

console.log('\nevery record: the count line, credits stored, companies drawn of stored, and what was suppressed');
for (const p of [...per].sort((a, b) => (b.m?.count ?? -1) - (a.m?.count ?? -1))) {
  const m = p.m;
  console.log(`${(m?.countLine ?? (m === null ? 'no section' : 'no count line')).padEnd(16)} credits ${String(p.credits).padStart(3)}, companies ${m?.companies.length ?? 0} of ${p.companies}${m && m.suppressed.length ? `, suppressed ${m.suppressed.join('; ')} (shows ${p.shown.join(' / ')})` : ''}  ${name(p)} (record ${p.h.record_id}, release ${p.h.release_id})`);
}
process.exit(0);
