/**
 * **The matched text, drafted and stored (SPEC §4.6; step 3, unit 4; the coordinator, 13 and 14 Nov).** The text the
 * ask's model pick reads, drafted from each record's cached Discogs release with its ABOUT as context only, reviewed
 * by Adam, and stored only for the ids he marks: as the ABOUT drafts are (`write-abouts.mts`), on Anthropic's key,
 * locally.
 *
 *   npm run matched:draft -- --sample 1611cb00 de2ad140   # drafts for these records
 *   npm run matched:draft -- --all                        # drafts for every record with no matched text
 *   npm run matched:draft -- --sample … --compare-effort   # each drafted at medium and high, side by side
 *   npm run matched:draft -- --store marked.txt           # second pass: store the ids listed, one per line; a line
 *                                                          # "e315c6a7 high" stores that effort's draft, medium otherwise
 *
 * The review file goes to ~/Downloads, each sentence marked [supported] or [inferred]; the drafts are kept in
 * `.matched/drafts.json`, so storing spends no call. The store writes `generated` and never Adam's edit. The pick goes
 * live when every record with an ABOUT has matched text (§4.8's latch), not before; storing ten of fifty-five leaves
 * the ask ranking, and the ten are read by unit 5's diagnostic script.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { sql } from 'drizzle-orm';
import { getDb } from '@/db/client';
import { storeGeneratedMatchedText } from '@/lib/db/queries/matched-text';
import { groundingFromPayload } from '@/lib/llm/about-grounding';
import { getMatchedTextClient } from '@/lib/llm/matched-text-client';
import { renderReview, type ReviewDraft } from '@/lib/matched-text/review';

const MODEL = 'claude-opus-5';
const args = process.argv.slice(2);
const mode = args.includes('--store') ? 'store' : args.includes('--all') ? 'all' : 'sample';
/* The first ten drafted at medium and the next step up (the coordinator, 15 Nov): evidence for the effort, not a judgement. */
const efforts = args.includes('--compare-effort') ? (['medium', 'high'] as const) : ([undefined] as const);
const WORK = join(process.cwd(), '.matched');
const OUT = join(homedir(), 'Downloads');
mkdirSync(WORK, { recursive: true });
type Draft = ReviewDraft & { text: string | null };

if (mode === 'store') {
  const file = args[args.indexOf('--store') + 1];
  if (file === undefined) throw new Error('write-matched-text: --store wants a file of ids, one per line');
  const marks = readFileSync(file, 'utf8').split('\n').map((l) => l.trim()).filter((l) => /^[0-9a-f]{8}/.test(l)).map((l) => ({ prefix: l.slice(0, 8), effort: /\b(low|medium|high)\b/.exec(l)?.[1] }));
  const drafts: Draft[] = JSON.parse(readFileSync(join(WORK, 'drafts.json'), 'utf8'));
  const ids = marks.map((m) => m.prefix);
  let stored = 0;
  for (const { prefix, effort } of marks) {
    /* Where a record was drafted at two efforts, the mark names which; a mark naming none takes medium, the default. */
    const d = drafts.find((x) => x.id.startsWith(prefix) && (x.effort === undefined || x.effort === (effort ?? 'medium')));
    if (d === undefined || d.text === null) { console.log(`${prefix}: no finished draft to store`); continue; }
    await storeGeneratedMatchedText(d.id, d.text, MODEL);
    stored += 1;
    console.log(`${prefix}: stored (${d.artist} — ${d.title})`);
  }
  console.log(`write-matched-text: ${stored} of ${ids.length} stored`);
  process.exit(0);
}

const prefixes = mode === 'sample' ? args.filter((a) => /^[0-9a-f]{8}/.test(a)) : [];
if (mode === 'sample' && prefixes.length === 0) throw new Error('write-matched-text: give record id prefixes, or --all, or --store <file>');
const rows = (await getDb().execute<{ id: string; artist: string; title: string; year: number | null; about: string | null; payload: unknown }>(sql`
  SELECT r.id, a.name AS artist, r.title, r.release_year AS year, nullif(r.snippet, '') AS about, c.payload
  FROM records r JOIN artists a ON a.id = r.artist_id
  LEFT JOIN pressings p ON p.id = r.pressing_id
  LEFT JOIN discogs_cache c ON c.discogs_release_id = p.discogs_release_id
  LEFT JOIN record_matched_text m ON m.record_id = r.id
  WHERE ${mode === 'all' ? sql`m.generated IS NULL AND m.edited IS NULL` : sql`left(r.id::text, 8) = ANY(${prefixes})`}
  ORDER BY a.name, r.title`)).rows;

const client = getMatchedTextClient();
const drafts: Draft[] = [];
for (const r of rows) {
  const facts = r.payload === null ? null : groundingFromPayload(r.payload);
  for (const effort of efforts) {
    const result = await client.write({ artist: r.artist, title: r.title, year: r.year, about: r.about }, facts, effort === undefined ? {} : { effort });
    const base = { id: r.id, artist: r.artist, title: r.title, year: r.year, about: r.about, ...(effort === undefined ? {} : { effort }) };
    const draft: Draft = result.ok
      ? { ...base, status: 'finished', sentences: result.sentences, unknown: result.unknown, text: result.text }
      : { ...base, status: `failed: ${result.reason}`, sentences: [], unknown: [], text: null };
    drafts.push(draft);
    console.log(`${r.id.slice(0, 8)}  ${r.artist} — ${r.title}${effort === undefined ? '' : ` at ${effort}`}: ${draft.status}, ${draft.sentences.length} sentence(s), ${draft.sentences.filter((s) => s.basis === 'inferred').length} inferred`);
  }
}
writeFileSync(join(WORK, 'drafts.json'), JSON.stringify(drafts, null, 2));
const date = new Date().toISOString().slice(0, 10);
const out = join(OUT, `Matched text drafts, ${date}.md`);
writeFileSync(out, renderReview(drafts, `Matched text drafts, ${date}`));
console.log(`write-matched-text: ${drafts.filter((d) => d.text !== null).length} finished, ${drafts.filter((d) => d.text === null).length} with no draft; review file ${out}`);
process.exit(0);
