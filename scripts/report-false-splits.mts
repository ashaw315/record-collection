/*
  Where the sentence splitter ends a sentence at an abbreviation, read-only (the coordinator, 21 Nov: 446 matched-text
  sentences by the splitter against 439 or 440 by hand, and the rule is load-bearing in the claim check). Every stored
  ABOUT and matched text is split by the pick's own sentencesOf; a boundary is suspect when the fragment before it ends
  in an abbreviation-shaped token (Rev., Mr., St., Vol., No., feat., vs., a single initial) or the fragment after it
  begins with a lowercase letter. Prints each suspect boundary with its record.

    node --env-file=.env.local --conditions=react-server --import tsx scripts/report-false-splits.mts
*/
import { sql } from 'drizzle-orm';
import { getDb } from '@/db/client';
import { sentencesOf } from '@/lib/ask/pick';
type Row = { artist: string; title: string; snippet: string | null; matched: string | null };
const rows = (await getDb().execute<Row>(sql`
  SELECT a.name AS artist, r.title, r.snippet, coalesce(m.edited, m.generated) AS matched
  FROM records r JOIN artists a ON a.id = r.artist_id LEFT JOIN record_matched_text m ON m.record_id = r.id
  WHERE r.snippet IS NOT NULL OR m.record_id IS NOT NULL ORDER BY a.name, r.title`)).rows;
const KNOWN = new Set(['rev.', 'mr.', 'mrs.', 'ms.', 'dr.', 'st.', 'jr.', 'sr.', 'vol.', 'no.', 'feat.', 'vs.', 'etc.', 'approx.', 'pt.', 'op.', 'ft.', 'co.', 'inc.', 'ltd.', 'mt.', 'ca.', 'c.']);
const total = { about: 0, matched: 0 };
const suspect = { about: 0, matched: 0 };
for (const r of rows) {
  for (const [kind, text] of [['about', r.snippet], ['matched', r.matched]] as const) {
    if (text === null) continue;
    const parts = sentencesOf(text);
    total[kind] += parts.length;
    for (let i = 0; i < parts.length - 1; i += 1) {
      const before = parts[i];
      const after = parts[i + 1];
      const lastWord = before.split(/\s+/).pop() ?? '';
      const endsAbbreviation = KNOWN.has(lastWord.toLowerCase().replace(/^[(“"']+/, '')) || /^[A-Z]\.$/.test(lastWord);
      const startsLower = /^[a-z]/.test(after);
      if (endsAbbreviation || startsLower) {
        suspect[kind] += 1;
        console.log(`${r.artist} — ${r.title} [${kind}] ${endsAbbreviation ? `ends "${lastWord}"` : 'next begins lowercase'}:\n    …${before.slice(-60)} | ${after.slice(0, 60)}…`);
      }
    }
  }
}
console.log(`ABOUT: ${total.about} sentences by the splitter, ${suspect.about} suspect boundaries; matched text: ${total.matched} sentences, ${suspect.matched} suspect boundaries`);
process.exit(0);
