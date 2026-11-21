/*
  Does any stored text speak about its own material (the coordinator, 21 Nov)? Adam's pick reason on production said
  "the text offers period atmosphere, not evidence of a recent recording", and the Mandy, Indiana sentence dropped in
  November said "this material does not say". The pick now checks its reasons for the seven phrases; this reads the
  stored ABOUTs (records.snippet) and matched texts (generated and edited) for the same shape. Read-only.
*/
import { sql } from 'drizzle-orm';
import { getDb } from '@/db/client';
import { mentionsMaterial } from '@/lib/ask/pick';
const db = getDb();
type Row = { title: string; artist: string; snippet: string | null; generated: string | null; edited: string | null };
const rows = (await db.execute<Row>(sql`
  SELECT r.title, a.name AS artist, r.snippet, m.generated, m.edited
  FROM records r JOIN artists a ON a.id = r.artist_id LEFT JOIN record_matched_text m ON m.record_id = r.id
  ORDER BY a.name, r.title`)).rows;
const sentences = (text: string) => text.split(/(?<=[.!?])\s+/).filter((s) => s.trim() !== '');
let abouts = 0, aboutSentences = 0, matched = 0, matchedSentences = 0, hits = 0;
for (const r of rows) {
  for (const [kind, text] of [['about', r.snippet], ['matched (generated)', r.generated], ['matched (edited)', r.edited]] as const) {
    if (text === null) continue;
    const ss = sentences(text);
    if (kind === 'about') { abouts += 1; aboutSentences += ss.length; } else { matched += 1; matchedSentences += ss.length; }
    for (const s of ss) {
      const phrase = mentionsMaterial(s);
      if (phrase !== null) { hits += 1; console.log(`${r.artist} — ${r.title} [${kind}] "${phrase}": ${s}`); }
    }
  }
}
console.log(`${abouts} ABOUTs (${aboutSentences} sentences), ${matched} matched texts (${matchedSentences} sentences); ${hits} sentence(s) speak about their material`);
process.exit(0);
