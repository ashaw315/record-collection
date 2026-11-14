/**
 * **Each ABOUT's closing sentence, listener-facing or record-facing, against how often the record heads a phrase
 * (the coordinator, 13 Nov).** The hypothesis from the ten printed: a head's closing sentence puts the listener
 * somewhere ("a late set you walked in on", "best played late and whole"), a non-head's describes the record ("for
 * the warmth"). The classification is a text rule, printed beside every sentence so it can be read and disputed, not
 * a model's judgement: listener-facing where the sentence has "you" or "your", "when", "late", or "play"/"played"
 * with "it" or "best". Heads are read from the route's ranking as built (cosine nearness of stored vectors) over the
 * phrases given: a record's count of top-three and top-ten places. Read-only; one embedding call.
 *
 *   node --env-file=.env.local --conditions=react-server --import tsx scripts/report-about-closings.mts "phrase" …
 */
import { sql } from 'drizzle-orm';
import { getDb } from '@/db/client';
import { embedTexts } from '@/lib/openai/embeddings';
import { cosine } from '@/lib/ask/rank';

const phrases = process.argv.slice(2);
if (phrases.length === 0) throw new Error('report-about-closings: give the phrases');
const rows = (await getDb().execute<{ id: string; artist: string; title: string; snippet: string; vector: number[] }>(sql`
  SELECT r.id, a.name AS artist, r.title, r.snippet, e.vector
  FROM records r JOIN artists a ON a.id = r.artist_id JOIN record_embeddings e ON e.record_id = r.id
  WHERE r.snippet IS NOT NULL`)).rows;

/** The last sentence: the text after the last sentence end that is not the text's own end. */
function closing(text: string): string {
  const trimmed = text.trim();
  const ends = [...trimmed.slice(0, -1).matchAll(/[.!?](?=\s+[A-Z“"'(])/g)].map((m) => (m.index ?? 0) + 1);
  return trimmed.slice(ends.length === 0 ? 0 : ends[ends.length - 1]).trim();
}
const LISTENER = /\byou(r)?\b|\bwhen\b|\blate\b|\bplay(ed)?\b[^.]*\b(it|best)\b|\bbest (played|heard)\b/i;

const vectors = await embedTexts(phrases);
const top3 = new Map<string, number>();
const top10 = new Map<string, number>();
for (const q of vectors) {
  const ranked = rows.map((r) => ({ id: r.id, cos: cosine(q, r.vector) })).sort((a, b) => b.cos - a.cos);
  for (const r of ranked.slice(0, 3)) top3.set(r.id, (top3.get(r.id) ?? 0) + 1);
  for (const r of ranked.slice(0, 10)) top10.set(r.id, (top10.get(r.id) ?? 0) + 1);
}

const out = rows.map((r) => {
  const sentence = closing(r.snippet);
  return { name: `${r.artist} — ${r.title}`, sentence, listener: LISTENER.test(sentence), top3: top3.get(r.id) ?? 0, top10: top10.get(r.id) ?? 0 };
}).sort((a, b) => b.top3 - a.top3 || b.top10 - a.top10 || a.name.localeCompare(b.name));

for (const o of out) process.stdout.write(`${o.listener ? 'LISTENER' : 'record  '}  top3 ${o.top3}  top10 ${o.top10}  ${o.name}\n          "${o.sentence}"\n`);
const group = (pred: (o: (typeof out)[number]) => boolean) => out.filter(pred);
for (const [label, list] of [['listener-facing', group((o) => o.listener)], ['record-facing', group((o) => !o.listener)]] as const) {
  const heads = list.filter((o) => o.top3 > 0).length;
  const top10s = list.reduce((s, o) => s + o.top10, 0);
  process.stdout.write(`\n${label}: ${list.length} records; ${heads} of them in some phrase's top three; ${(top10s / Math.max(1, list.length)).toFixed(2)} top-ten places each\n`);
}
process.stdout.write(`\nphrases: ${phrases.length}; records with an ABOUT and a vector: ${rows.length}\n`);
process.exit(0);
