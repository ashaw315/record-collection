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
import { meaningful } from '@/lib/discogs/fields';

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

/*
  Step 172 (§65, 7 Nov): per release a record holds, the tracks, and the credits split into release-level and
  track-level, which §65's "release-level credits 3 to 10" does not distinguish and the section's ruling must; the
  extremes the captures are taken on; and the companies Pressing detail already shows (the record's label and its
  pressing's plant), measured and not resolved, since whether the section repeats one is Design's. Split from the
  cached payload with the store's own blank rule, and checked against the stored rows, which carry no flag: the
  last line says whether the rows alone can tell the two kinds apart.
*/
type Held = { record_id: string; artist: string; title: string; label: string | null; plant: string | null; release_id: number; payload: { extraartists?: { name?: string }[]; tracklist?: { extraartists?: { name?: string }[] }[] } };
const held = (
  await db.execute<Held>(sql`
    SELECT DISTINCT ON (p.discogs_release_id) r.id AS record_id, a.name AS artist, r.title, l.name AS label, p.pressing_plant AS plant, p.discogs_release_id AS release_id, c.payload
    FROM records r JOIN artists a ON a.id = r.artist_id JOIN pressings p ON p.id = r.pressing_id
    JOIN discogs_cache c ON c.discogs_release_id = p.discogs_release_id LEFT JOIN labels l ON l.id = r.label_id
    ORDER BY p.discogs_release_id, r.created_at`)
).rows;
type Text = { release_id: number; kind: string; text: string; detail: string | null };
const text = (await db.execute<Text>(sql`SELECT discogs_release_id AS release_id, kind, text, detail FROM discogs_release_text ORDER BY discogs_release_id, kind, ordinal`)).rows;
const named = (list: { name?: string }[] | undefined) => (list ?? []).filter((c) => meaningful(c.name) !== null).length;
const fold = (name: string) => name.replace(/\s\(\d+\)$/, '').trim().toLowerCase();

const per = held.map((h) => {
  const rows = text.filter((t) => t.release_id === h.release_id);
  const positions = rows.filter((t) => t.kind === 'track' && t.detail !== null).map((t) => t.detail as string);
  const credits = rows.filter((t) => t.kind === 'credit');
  const trackLevelByRows = credits.filter((t) => t.detail !== null && positions.some((p) => t.detail === p || (t.detail as string).endsWith(`, ${p}`))).length;
  const releaseLevel = named(h.payload.extraartists);
  const trackLevel = (h.payload.tracklist ?? []).reduce((n, t) => n + named(t.extraartists), 0);
  const companies = rows.filter((t) => t.kind === 'company');
  const shown = [h.label, h.plant].filter((v): v is string => v !== null && v.trim() !== '');
  const exact = companies.filter((c) => shown.some((s) => fold(s) === fold(c.text)));
  const within = companies.filter((c) => !exact.includes(c) && shown.some((s) => fold(s).includes(fold(c.text)) || fold(c.text).includes(fold(s))));
  return { h, tracks: rows.filter((t) => t.kind === 'track').length, releaseLevel, trackLevel, creditRows: credits.length, trackLevelByRows, companies: companies.length, exact, within };
});

const name = (p: (typeof per)[number]) => `${p.h.artist} — ${p.h.title} (record ${p.h.record_id}, release ${p.h.release_id})`;
const top = (label: string, key: (p: (typeof per)[number]) => number, dir: 1 | -1) => {
  console.log(`\n${label}`);
  for (const p of [...per].sort((a, b) => dir * (key(b) - key(a))).slice(0, 3)) console.log(`  ${String(key(p)).padStart(3)}  ${name(p)}`);
};
console.log(`\nreleases held by a record  ${per.length}`);
console.log(`release-level credit rows ${per.reduce((n, p) => n + p.releaseLevel, 0)}, on ${per.filter((p) => p.releaseLevel > 0).length} releases, ${Math.min(...per.map((p) => p.releaseLevel))} to ${Math.max(...per.map((p) => p.releaseLevel))} per release`);
console.log(`track-level credit rows   ${per.reduce((n, p) => n + p.trackLevel, 0)}, on ${per.filter((p) => p.trackLevel > 0).length} releases, ${Math.min(...per.map((p) => p.trackLevel))} to ${Math.max(...per.map((p) => p.trackLevel))} per release`);
top('longest tracklists', (p) => p.tracks, 1);
top('shortest tracklists', (p) => p.tracks, -1);
top('most release-level credit rows', (p) => p.releaseLevel, 1);
top('most track-level credit rows', (p) => p.trackLevel, 1);
top('most credit rows of both kinds', (p) => p.releaseLevel + p.trackLevel, 1);
top('most rows the section would draw (tracks, credits of both kinds, companies)', (p) => p.tracks + p.creditRows + p.companies, 1);
console.log(`\nstored credit rows equal to the payload's two kinds summed, per release: ${per.filter((p) => p.creditRows === p.releaseLevel + p.trackLevel).length} of ${per.length}`);
console.log(`track-level credits told from the stored rows alone (detail is, or ends in, a track position) agree with the payload: ${per.filter((p) => p.trackLevelByRows === p.trackLevel).length} of ${per.length}`);
for (const p of per.filter((q) => q.trackLevelByRows !== q.trackLevel)) console.log(`  disagrees: rows say ${p.trackLevelByRows}, payload ${p.trackLevel}  ${name(p)}`);

console.log(`\ncompanies Pressing detail already shows (the record's label, its pressing's plant), name folded for case and Discogs' "(n)"`);
console.log(`  records with a company equal to one: ${per.filter((p) => p.exact.length > 0).length} of ${per.filter((p) => p.companies > 0).length} with companies`);
console.log(`  records with a company only one name contains the other: ${per.filter((p) => p.within.length > 0).length}`);
const roles = new Map<string, number>();
for (const p of per) for (const c of p.exact) roles.set(c.detail ?? '(no role)', (roles.get(c.detail ?? '(no role)') ?? 0) + 1);
console.log(`  equal companies by role: ${[...roles].sort((a, b) => b[1] - a[1]).map(([r, n]) => `${r} ${n}`).join(', ') || 'none'}`);
for (const p of per.filter((q) => q.within.length > 0)) console.log(`  contains: ${p.within.map((c) => `${c.text} (${c.detail})`).join('; ')} against ${[p.h.label, p.h.plant].filter(Boolean).join(' / ')}  ${name(p)}`);

const [absent] = (
  await db.execute<{ n: number; example: string | null }>(sql`
    SELECT count(*)::int AS n, (array_agg(a.name || ' — ' || r.title || ' (record ' || r.id || ')' ORDER BY r.title))[1] AS example
    FROM records r JOIN artists a ON a.id = r.artist_id LEFT JOIN pressings p ON p.id = r.pressing_id
    WHERE NOT EXISTS (SELECT 1 FROM discogs_release_text t WHERE t.discogs_release_id = p.discogs_release_id)`)
).rows;
console.log(`\nrecords whose release has no cached text (no section): ${absent.n}; for example ${absent.example ?? 'none'}`);
process.exit(0);
