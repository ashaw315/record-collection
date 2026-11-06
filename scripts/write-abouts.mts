/**
 * ABOUT notes for the records that lack one, grounded, checked, and written to one readable file
 * WITHOUT storing (the coordinator and Adam, 4 Nov). Adam reads the file in one pass and marks
 * which hold; only those are stored, in a second pass. Nothing false reaches a record page or the
 * search.
 *
 *   npm run abouts:draft -- --sample 1611cb00 de2ad140 47b69af6   # the gate: three grounded samples
 *   npm run abouts:draft -- --all                                  # every record without an ABOUT
 *   npm run abouts:draft -- --store marked.txt                     # second pass: store the ids listed, one per line, from a draft file
 *
 * Grounding is free and cheap: the cached release payload (label, country, format, year, credits,
 * companies) at no call, and the artist's own releases from /artists/{id}/releases, one call per
 * artist through the one limiter, kept in a file beside the draft so a rerun spends nothing. Every
 * note is checked against the data after it is written and its conflicts stand beside it; every
 * call is recorded in llm_requests as finished or failed, so a run that stopped is visible. The
 * file is ordered by risk: release year descending, since the model's knowledge thins towards now,
 * each note marked with Discogs' have, want and rating as the obscurity proxy.
 *
 * `--store` writes the drafts the file holds for the listed ids through the same path the page
 * uses, and no other.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { sql } from 'drizzle-orm';
import { getDb } from '@/db/client';
import { findRecordSubject, storeGeneratedSnippet } from '@/lib/db/queries/snippet';
import { getDiscogsClient } from '@/lib/discogs/client';
import { checkNote, type Conflict } from '@/lib/llm/about-check';
import { discographyOf, groundingFromPayload, type DiscographyEntry, type ReleaseFacts } from '@/lib/llm/about-grounding';
import { recordLlmRun } from '@/lib/llm/rate-limit';
import { getSnippetClient } from '@/lib/llm/snippet-client';

type Row = { id: string; artist: string; title: string; year: number | null; releaseId: number | null; payload: unknown };
type Draft = { id: string; artist: string; title: string; year: number | null; facts: ReleaseFacts | null; discography: DiscographyEntry[]; note: string | null; status: string; inputTokens: number | null; outputTokens: number | null; ms: number; conflicts: Conflict[]; constraints: string[] };

const args = process.argv.slice(2);
/* `--rerender`: the last drafts again through the checker and into the file, no call spent; for a checker that learned something after the run. */
const mode = args.includes('--store') ? 'store' : args.includes('--rerender') ? 'rerender' : args.includes('--all') ? 'all' : 'sample';
/*
  `--note <id prefix>=<text>`, repeatable (Q47, 6 Nov): a record's own constraint for a note regenerated after a
  fact-check, carried into the prompt verbatim (snippet-client.ts) and printed under the draft so the reader sees
  what was asked. The id prefix is matched as `--sample`'s are.
*/
const notes: Array<{ prefix: string; text: string }> = [];
for (let i = 0; i < args.length; i += 1) {
  if (args[i] !== '--note') continue;
  const spec = args[i + 1] ?? '';
  const at = spec.indexOf('=');
  if (at < 7) { console.error(`write-abouts: --note wants <id prefix>=<text>, got "${spec}"`); process.exit(2); }
  notes.push({ prefix: spec.slice(0, at), text: spec.slice(at + 1) });
  i += 1;
}
const constraintsFor = (id: string): string[] => notes.filter((n) => id.startsWith(n.prefix)).map((n) => n.text);
const db = getDb();
const date = new Date().toISOString().slice(0, 10);
const OUT = join(homedir(), 'Downloads');
const WORK = join(process.cwd(), '.abouts');
mkdirSync(WORK, { recursive: true });

async function rows(where: ReturnType<typeof sql>): Promise<Row[]> {
  return (
    await db.execute<Row>(sql`
      SELECT r.id, a.name AS artist, r.title, r.release_year AS year, p.discogs_release_id AS "releaseId", c.payload
      FROM records r JOIN artists a ON a.id = r.artist_id
      LEFT JOIN pressings p ON p.id = r.pressing_id
      LEFT JOIN discogs_cache c ON c.discogs_release_id = p.discogs_release_id
      WHERE ${where} ORDER BY r.release_year DESC NULLS LAST, a.name, r.title`)
  ).rows;
}

/* The artist's releases, once per artist per machine: a rerun spends no call. */
const discographyFile = join(WORK, 'discographies.json');
const discographies: Record<string, unknown> = existsSync(discographyFile) ? JSON.parse(readFileSync(discographyFile, 'utf8')) : {};
async function discographyFor(artistId: number | null): Promise<DiscographyEntry[]> {
  if (artistId === null) return [];
  const key = String(artistId);
  if (!(key in discographies)) {
    discographies[key] = await getDiscogsClient().get(`/artists/${artistId}/releases`, { sort: 'year', sort_order: 'asc', per_page: 100 });
    writeFileSync(discographyFile, JSON.stringify(discographies, null, 2));
  }
  return discographyOf(discographies[key]);
}

function render(drafts: Draft[], title: string): string {
  const lines = [`# ${title}`, '', `${drafts.length} record(s), ordered by release year descending, the recent first because that is where the model's knowledge thins. Each note is marked with Discogs' have, want and rating, the obscurity proxy. Nothing here is stored: mark the ids that hold and run the second pass. Conflicts are what the checker read against the data; a conflict is for you to look at, not a verdict.`, ''];
  for (const d of drafts) {
    const c = d.facts?.community;
    lines.push(`## ${d.artist} — ${d.title} (${d.year ?? '?'})  \`${d.id.slice(0, 8)}\``);
    lines.push('');
    lines.push(`Discogs: ${c === null || c === undefined ? 'no community figures' : `${c.have} have, ${c.want} want, rated ${c.rating} by ${c.ratings}`}${d.facts?.label ? ` · ${d.facts.label}` : ''}${d.facts?.country ? ` · ${d.facts.country}` : ''}${d.facts?.format ? ` · ${d.facts.format}` : ''}${d.discography.length > 0 ? ` · the artist's releases: ${d.discography.map((e) => `${e.title} (${e.year})`).join(', ')}` : ' · no discography fetched'}`);
    lines.push('');
    lines.push(`Run: ${d.status}${d.inputTokens === null ? '' : `, ${d.inputTokens} in, ${d.outputTokens} out`}, ${d.ms}ms`);
    if ((d.constraints ?? []).length > 0) { lines.push(''); lines.push(`Asked for this record (Q47): ${(d.constraints ?? []).join(' · ')}`); }
    lines.push('');
    if (d.note !== null) {
      lines.push(d.note);
      lines.push('');
      lines.push(`*${[...d.note].length} characters.*`);
    } else {
      lines.push('*No note: the run did not finish; see the run line.*');
    }
    lines.push('');
    if (d.conflicts.length > 0) {
      lines.push(`**Conflicts with the data (${d.conflicts.length}):**`);
      for (const k of d.conflicts) lines.push(`- ${k.kind}: "${k.claim}" — ${k.fact}`);
    } else if (d.note !== null) {
      lines.push('*No conflict the checker could read; descriptive claims are not checked.*');
    }
    lines.push('');
  }
  return `${lines.join('\n')}\n`;
}

if (mode === 'store') {
  const file = args[args.indexOf('--store') + 1];
  const ids = readFileSync(file, 'utf8').split('\n').map((l) => l.trim()).filter((l) => /^[0-9a-f]{8}/.test(l)).map((l) => l.slice(0, 8));
  const drafts: Draft[] = JSON.parse(readFileSync(join(WORK, 'drafts.json'), 'utf8'));
  let stored = 0;
  for (const prefix of ids) {
    const d = drafts.find((x) => x.id.startsWith(prefix));
    if (d === undefined || d.note === null) { console.log(`${prefix}: no finished draft to store`); continue; }
    await storeGeneratedSnippet(d.id, d.note);
    stored += 1;
    console.log(`${prefix}: stored (${d.artist} — ${d.title})`);
  }
  console.log(`write-abouts: ${stored} of ${ids.length} stored`);
  process.exit(0);
}

if (mode === 'rerender') {
  const drafts: Draft[] = JSON.parse(readFileSync(join(WORK, 'drafts.json'), 'utf8'));
  /* The facts again from the cache, since a checker that learned to read a field the last run did not keep (the tracklist, 5 Nov) needs it. */
  const fresh = new Map((await rows(sql`${sql.join(drafts.map((d) => sql`r.id = ${d.id}::uuid`), sql` OR `)}`)).map((r) => [r.id, groundingFromPayload(r.payload)]));
  for (const d of drafts) {
    const subject = { artist: d.artist, title: d.title };
    d.facts = fresh.get(d.id) ?? d.facts;
    d.conflicts = d.note === null || d.facts === null ? [] : checkNote(d.note, { subject, year: d.year, facts: d.facts, discography: d.discography });
  }
  writeFileSync(join(WORK, 'drafts.json'), JSON.stringify(drafts, null, 2));
  /* A separate file: the one Adam is marking from is not rewritten under him. */
  const all = drafts.length > 3;
  const out = join(OUT, all ? `ABOUT drafts, ${date}, rechecked.md` : `ABOUT grounded samples, ${date}, rechecked.md`);
  writeFileSync(out, render(drafts, all ? `ABOUT drafts for the records without one, ${date}, rechecked` : `Three grounded ABOUT samples, ${date}, rechecked`));
  console.log(`write-abouts: re-rendered ${drafts.length} draft(s), ${drafts.reduce((s, d) => s + d.conflicts.length, 0)} conflict(s); ${out}`);
  process.exit(0);
}

const selected =
  mode === 'all'
    ? await rows(sql`r.snippet IS NULL OR length(trim(r.snippet)) = 0`)
    : await rows(sql`${sql.join(args.filter((a) => /^[0-9a-f]{6,}$/.test(a)).map((p) => sql`r.id::text LIKE ${p + '%'}`), sql` OR `)}`);
if (selected.length === 0) { console.error('write-abouts: nothing selected'); process.exit(2); }

const client = getSnippetClient();
const drafts: Draft[] = [];
for (const r of selected) {
  const subject = await findRecordSubject(r.id);
  const facts = groundingFromPayload(r.payload);
  const discography = await discographyFor(facts?.artistId ?? null);
  const t0 = Date.now();
  const draft: Draft = { id: r.id, artist: r.artist, title: r.title, year: r.year, facts, discography, note: null, status: 'not run', inputTokens: null, outputTokens: null, ms: 0, conflicts: [], constraints: constraintsFor(r.id) };
  if (subject === null) { draft.status = 'failed: no subject'; drafts.push(draft); continue; }
  try {
    const result = await client.write(subject, facts === null ? undefined : { facts, discography, constraints: constraintsFor(r.id) });
    draft.ms = Date.now() - t0;
    draft.inputTokens = result.inputTokens ?? null;
    draft.outputTokens = result.outputTokens ?? null;
    if (result.ok) {
      draft.note = result.snippet;
      draft.status = `finished (${result.stopReason ?? 'end_turn'})`;
      draft.conflicts = facts === null ? [] : checkNote(result.snippet, { subject, year: r.year, facts, discography });
      await recordLlmRun('about_batch', { finished: true, inputTokens: draft.inputTokens, outputTokens: draft.outputTokens, stopReason: result.stopReason ?? null });
    } else {
      draft.status = `failed: ${result.reason}`;
      await recordLlmRun('about_batch', { finished: false, reason: result.reason });
    }
  } catch (error) {
    draft.ms = Date.now() - t0;
    draft.status = `failed: ${error instanceof Error ? error.message : String(error)}`;
    await recordLlmRun('about_batch', { finished: false, reason: draft.status.slice(8, 80) });
  }
  drafts.push(draft);
  console.log(`${r.id.slice(0, 8)}  ${r.artist} — ${r.title}: ${draft.status}, ${draft.conflicts.length} conflict(s), ${draft.ms}ms`);
}
writeFileSync(join(WORK, 'drafts.json'), JSON.stringify(drafts, null, 2));
const out = join(OUT, mode === 'all' ? `ABOUT drafts, ${date}.md` : `ABOUT grounded samples, ${date}.md`);
writeFileSync(out, render(drafts, mode === 'all' ? `ABOUT drafts for the records without one, ${date}` : `Three grounded ABOUT samples, ${date}`));
console.log(`write-abouts: ${drafts.filter((d) => d.note !== null).length} finished, ${drafts.filter((d) => d.note === null).length} failed, ${drafts.reduce((s, d) => s + d.conflicts.length, 0)} conflict(s); ${out}`);
process.exit(0);
