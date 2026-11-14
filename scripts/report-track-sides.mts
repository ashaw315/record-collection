/**
 * **What the collection's tracklists hold for side markers (the coordinator, 14 Nov, before the side split is built).**
 * Design's §65 rule breaks two track columns "at the change of side nearest the middle". This reads every cached
 * release's track rows and prints, for each record, its positions' form: lettered sides (A1, B2, or a bare A, B), plain
 * numbers (1, 2, 3), blank, or anything else, with the sides found and their track counts. Read-only against
 * production; prints, writes nothing.
 *
 *   node --env-file=.env.local --conditions=react-server --import tsx scripts/report-track-sides.mts
 */
import { sql } from 'drizzle-orm';
import { getDb } from '@/db/client';

const db = getDb();
const held = (await db.execute<{ artist: string; title: string; release_id: string }>(sql`
  SELECT a.name AS artist, r.title, p.discogs_release_id AS release_id
  FROM records r JOIN artists a ON a.id = r.artist_id JOIN pressings p ON p.id = r.pressing_id
  WHERE p.discogs_release_id IS NOT NULL ORDER BY a.name, r.title`)).rows;
/* A track row's detail is its position, as the section reads it (tracklist-model.ts). */
const tracks = (await db.execute<{ release_id: string; detail: string | null; text: string }>(sql`
  SELECT discogs_release_id AS release_id, detail, text FROM discogs_release_text WHERE kind = 'track' ORDER BY discogs_release_id, ordinal`)).rows;

const positionOf = (detail: string | null): string => (detail ?? '').trim();
const form = (p: string) => (p === '' ? 'blank' : /^[A-Z]{1,2}\d*[a-z]?$/.test(p) ? 'side' : /^\d+[a-z]?$/.test(p) ? 'number' : /^\d+-\d+$/.test(p) ? 'disc-number' : 'other');

const tally = new Map<string, number>();
for (const h of held) {
  const own = tracks.filter((t) => Number(t.release_id) === Number(h.release_id));
  if (own.length === 0) continue;
  const positions = own.map((t) => positionOf(t.detail));
  const forms = new Set(positions.map(form));
  const kind = forms.size === 1 ? [...forms][0] : `mixed (${[...forms].join(', ')})`;
  tally.set(kind, (tally.get(kind) ?? 0) + 1);
  const sides = new Map<string, number>();
  for (const p of positions) if (form(p) === 'side') { const s = (/^[A-Z]+/.exec(p) ?? [''])[0]; sides.set(s, (sides.get(s) ?? 0) + 1); }
  const sideText = sides.size === 0 ? 'no sides' : [...sides].map(([s, n]) => `${s}:${n}`).join(' ');
  /* A record whose positions are not all one form: every row, so what the blank or odd one is can be read. */
  if (forms.size > 1) for (const t of own) process.stdout.write(`    ${JSON.stringify(t.detail)} · ${t.text}\n`);
  process.stdout.write(`${kind.padEnd(14)} ${String(own.length).padStart(2)} tracks  ${sideText.padEnd(22)} ${h.artist} — ${h.title}  [${positions.slice(0, 4).join(' ')}${positions.length > 4 ? ' …' : ''}]\n`);
}
process.stdout.write(`\n${[...tally].map(([k, n]) => `${k}: ${n}`).join('; ')}; records with tracks ${[...tally.values()].reduce((a, b) => a + b, 0)} of ${held.length} holding a release\n`);
process.exit(0);
