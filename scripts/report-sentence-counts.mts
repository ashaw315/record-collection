/*
  The sentence rule read against the drafting model's own sentence lists, read-only (the coordinator, 21 Nov: 446 by the
  old splitter, 437 after its abbreviation boundaries, 439 by hand off the drafts, and there is to be one number). For
  every stored matched text, the shared splitter's sentences are compared, text for text, with the sentence list the
  drafting model returned for that record in each drafts file under .matched/ (gitignored; "absent" where none). A
  record whose text the model has since redrafted is named, since its list is no longer the stored text's. Prints every
  disagreement and the totals; a disagreement is a boundary the rule reads differently from the model that wrote it.

    node --env-file=.env.local --conditions=react-server --import tsx scripts/report-sentence-counts.mts
*/
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { sql } from 'drizzle-orm';
import { getDb } from '@/db/client';
import { sentencesOf } from '@/lib/text/sentences';
type Row = { id: string; artist: string; title: string; matched: string; generated_at: string | null; edited_at: string | null };
type Draft = { id: string; text: string | null; sentences: Array<{ text: string }> };
const rows = (await getDb().execute<Row>(sql`
  SELECT r.id, a.name AS artist, r.title, coalesce(m.edited, m.generated) AS matched, m.generated_at::text, m.edited_at::text
  FROM record_matched_text m JOIN records r ON r.id = m.record_id JOIN artists a ON a.id = r.artist_id
  WHERE coalesce(m.edited, m.generated) IS NOT NULL ORDER BY a.name, r.title`)).rows;
const WORK = existsSync(join(process.cwd(), '.matched')) ? join(process.cwd(), '.matched') : join(process.cwd(), '..', '.matched');
const files = ['drafts-before-marking-fix.json', 'drafts-previous.json', 'drafts.json'].filter((f) => existsSync(join(WORK, f)));
const drafts = new Map(files.map((f) => [f, new Map((JSON.parse(readFileSync(join(WORK, f), 'utf8')) as Draft[]).map((d) => [d.id, d]))]));
const totals: Record<string, number> = { splitter: 0, ...Object.fromEntries(files.map((f) => [f, 0])) };
let disagreements = 0;
for (const r of rows) {
  const ours = sentencesOf(r.matched);
  totals.splitter += ours.length;
  for (const f of files) {
    const d = drafts.get(f)?.get(r.id);
    if (d === undefined) continue;
    totals[f] += d.sentences.length;
    if (d.text !== r.matched) continue;
    const theirs = d.sentences.map((s) => s.text.trim());
    if (ours.length === theirs.length && ours.every((s, i) => s === theirs[i])) continue;
    disagreements += 1;
    console.log(`${r.artist} — ${r.title} (${f}): the rule reads ${ours.length}, the model listed ${theirs.length}; generated ${r.generated_at ?? 'null'}, edited ${r.edited_at ?? 'null'}`);
    for (const s of ours.filter((s) => !theirs.includes(s))) console.log(`    rule only:  ${s.slice(0, 110)}${s.length > 110 ? '…' : ''}`);
    for (const s of theirs.filter((s) => !ours.includes(s))) console.log(`    model only: ${s.slice(0, 110)}${s.length > 110 ? '…' : ''}`);
  }
}
console.log(`${rows.length} matched texts: the rule ${totals.splitter} sentences; ${files.map((f) => `${f} ${totals[f]}`).join(', ')}; ${disagreements} disagreement(s) where the draft's text is the stored text`);
process.exit(0);
