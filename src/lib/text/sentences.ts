/**
 * **The sentence rule, held once (the coordinator, 21 Nov).** The pick's claim check (a claim is a whole stored
 * sentence, §P.2), the ABOUT's fact checker (a conflict names the sentence it sits in) and §67's coming sheet (Adam
 * corrects a sentence at a time) must agree on where a sentence ends, not merely happen to; three copies of one regex
 * agreed until one was edited. And the regex they held, a split at any `.` `!` or `?` before a space, read the stored
 * texts wrongly fourteen times in 55: "Rev. Gary Davis" ended a sentence (nine times across eight records, two more in
 * ABOUTs), "Stop! Stop!" inside a quoted title ended one, and a sentence closing inside quotation marks, `With You." Side
 * C`, ended none, so three of Dylan's sides were one sentence. On a bench run the claim check dropped Hot Tuna's whole
 * sentence as "not a whole sentence", and the pick lost a correct record to its own instrument.
 *
 * A sentence ends at `.` `!` or `?`, with any closing quotation mark or bracket after it, before whitespace, except:
 * after a title or abbreviation a name or number follows (the list below, read from the stored texts and the common
 * cases); where the next word begins lowercase, since the stop was not a sentence's; and inside an open quotation,
 * where a title's own stop is not the sentence's. Not on a single capital initial: "side A. The second" is a sentence
 * end, and no stored text carried an initial at a boundary. A sentence-final "Jr." before a capital is joined wrongly
 * by this rule; the stored texts hold none, and the drafting model's own sentence lists are the check
 * (scripts/report-sentence-counts.mts).
 */
const ABBREVIATIONS = new Set(['rev.', 'mr.', 'mrs.', 'ms.', 'dr.', 'st.', 'mt.', 'sgt.', 'jr.', 'sr.', 'vol.', 'no.', 'pt.', 'op.', 'ft.', 'feat.', 'vs.', 'co.', 'inc.', 'ltd.']);

const insideQuotation = (sofar: string): boolean => {
  const straight = (sofar.match(/"/g) ?? []).length;
  const curly = (sofar.match(/“/g) ?? []).length - (sofar.match(/”/g) ?? []).length;
  return straight % 2 === 1 || curly > 0;
};

export const sentencesOf = (text: string): string[] => {
  const out: string[] = [];
  let start = 0;
  const boundary = /[.!?]["”’)\]]*(?=\s+\S)/g;
  for (const m of text.matchAll(boundary)) {
    const end = m.index + m[0].length;
    const fragment = text.slice(start, end);
    const lastWord = (fragment.trim().split(/\s+/).pop() ?? '').replace(/^["“'(\[]+/, '').toLowerCase();
    const next = text.slice(end).trimStart().charAt(0);
    if (ABBREVIATIONS.has(lastWord) || /[a-z]/.test(next) || insideQuotation(text.slice(0, end))) continue;
    out.push(fragment.trim());
    start = end;
  }
  const rest = text.slice(start).trim();
  if (rest !== '') out.push(rest);
  return out.filter((s) => s !== '');
};
