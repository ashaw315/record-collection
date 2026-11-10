/**
 * **173c (§65): the records the step's captures are taken on, exported from production read-only.** The step names them
 * by property, "the record with the most credits, and the ones with the most release credits and the most track credits;
 * the longest and the shortest tracklist", so they are found here through the model the section draws (`tracklistModel`),
 * never by hand, and their release payloads are written beside their page-visible names for the capture tool to seed into
 * the local test database. Reads and writes one file; writes nothing to the database.
 *
 *   npm run discogs:export-tracklist-records           # writes docs/captures/tracklist-173/records.json
 *
 * On 10 Nov: OutKast — ATLiens (most credits, 126), Pointer Sisters — Break Out (most release-credit lines, 38), Carly
 * Simon — No Secrets (most track-credit lines, 67), Cindy Lee — Diamond Jubilee (32 tracks), Pharoah Sanders — Jewels
 * Of Thought (2 tracks); 55 records hold a release, 2 to 32 tracks, §65's measured range.
 */
import { writeFileSync } from 'node:fs';
import { sql } from 'drizzle-orm';
import { getDb } from '@/db/client';
import { tracklistModel } from '@/app/records/[id]/tracklist';
import type { ReleaseTextKind } from '@/lib/discogs/release-text';

const OUT = 'docs/captures/tracklist-173/records.json';
const db = getDb();
type Held = { id: string; artist: string; title: string; label: string | null; plant: string | null; catalog: string | null; release_year: number | null; release_id: number; payload: unknown };
const held = (await db.execute<Held>(sql`
  SELECT r.id, a.name AS artist, r.title, l.name AS label, p.pressing_plant AS plant, p.catalog_number AS catalog, r.release_year, p.discogs_release_id AS release_id, c.payload
  FROM records r JOIN artists a ON a.id = r.artist_id JOIN pressings p ON p.id = r.pressing_id LEFT JOIN labels l ON l.id = r.label_id
  JOIN discogs_cache c ON c.discogs_release_id = p.discogs_release_id
  WHERE p.discogs_release_id IS NOT NULL`)).rows;
type Text = { release_id: number; kind: ReleaseTextKind; text: string; detail: string | null };
const text = (await db.execute<Text>(sql`SELECT discogs_release_id AS release_id, kind, text, detail FROM discogs_release_text ORDER BY discogs_release_id, CASE kind WHEN 'track' THEN 0 WHEN 'credit' THEN 1 ELSE 2 END, ordinal`)).rows;

const per = held.map((h) => {
  const rows = text.filter((t) => Number(t.release_id) === Number(h.release_id));
  const m = tracklistModel(rows, [h.label, h.plant].filter((v): v is string => v !== null && v.trim() !== ''));
  return { ...h, release_id: Number(h.release_id), tracks: rows.filter((r) => r.kind === 'track').length, credits: rows.filter((r) => r.kind === 'credit').length, releaseLines: m?.release.length ?? 0, trackLines: m?.byTrack.reduce((n, t) => n + t.lines.length, 0) ?? 0, count: m?.count ?? 0 };
});
type Per = (typeof per)[number];
const top = (k: keyof Per, dir: 1 | -1) => [...per].sort((a, b) => dir * ((b[k] as number) - (a[k] as number)))[0];
const named: Array<[string, Per]> = [['most credits', top('credits', 1)], ['most release-credit lines', top('releaseLines', 1)], ['most track-credit lines', top('trackLines', 1)], ['longest tracklist', top('tracks', 1)], ['shortest tracklist', top('tracks', -1)]];
const records = named.map(([why, p]) => ({ why, id: p.id, artist: p.artist, title: p.title, label: p.label, plant: p.plant, catalog: p.catalog, releaseYear: p.release_year, releaseId: p.release_id, tracks: p.tracks, credits: p.credits, releaseLines: p.releaseLines, trackLines: p.trackLines, count: p.count, payload: p.payload }));
writeFileSync(OUT, `${JSON.stringify({ exported: new Date().toISOString(), source: 'production: records, pressings, labels, discogs_cache and discogs_release_text, read-only', held: per.length, tracks: { min: Math.min(...per.map((p) => p.tracks)), max: Math.max(...per.map((p) => p.tracks)) }, records }, null, 2)}\n`);
for (const r of records) console.log(`${r.why.padEnd(26)} ${r.artist} — ${r.title}: tracks ${r.tracks}, credits ${r.credits} (release lines ${r.releaseLines}, track lines ${r.trackLines}), count ${r.count}, release ${r.releaseId}`);
console.log(`held ${per.length}; tracks ${Math.min(...per.map((p) => p.tracks))} to ${Math.max(...per.map((p) => p.tracks))}; written ${OUT}`);
await (db as unknown as { $client?: { end?: () => Promise<void> } }).$client?.end?.();
