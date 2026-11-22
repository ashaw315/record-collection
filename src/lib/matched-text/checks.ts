import type { MatchedTextChecks } from '@/lib/db/queries/matched-text';
import { disagreements } from './consistency';
import { needsChecking, type ReviewDraft } from './review';

/**
 * **The checks that travel with a draft into `record_matched_text.checks` (Design's question, 22 Nov: what is a draft
 * checked against before it reaches Adam, and does the result travel with it).** The mechanical three, each read from
 * the draft and the stored material with no model: the sentences the client dropped for describing the material, the
 * self-consistency disagreements, and the sentences (1-based) whose figure the credits cannot cover. Never the drafting
 * model's own basis marks: §67 rules them out of the sheet, Q75 has them as an unowned self-report, and a column is how
 * a thing shown nowhere ends up shown somewhere.
 */
export function mechanicalChecks(draft: Pick<ReviewDraft, 'sentences' | 'dropped' | 'credited'>): MatchedTextChecks {
  const texts = draft.sentences.map((s) => s.text);
  return {
    dropped: [...(draft.dropped ?? [])],
    disagreements: disagreements(texts),
    numbered: texts.flatMap((text, i) => (needsChecking(text, draft.credited ?? 0) ? [i + 1] : [])),
  };
}
