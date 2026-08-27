import type { PressingVerdict } from '@/lib/llm/pressing-assessment-client';

/**
 * SPEC.md §12b (A43) — how each verdict presents itself.
 *
 * **The constraint is habituation, not clarity** (Adam): *"if they render as two
 * similar grey paragraphs I will stop distinguishing them within a week."* A
 * distinction that survives careful reading but not habit is not a distinction —
 * so it is carried by STRUCTURE (a marker, a tone, a heading) rather than by
 * wording, which is the part a reader stops parsing once the screen is familiar.
 *
 * **Three of the four states mean stop, for different reasons, and only one
 * means go look.** `matters` directs a hunt; `any-copy` ENDS one; `unknown`
 * leaves it open and says the user is on their own. The fourth — not assessed —
 * has no presentation, because nothing renders.
 */

export type VerdictPresentation = {
  /** A glyph, so the state is legible before any word is read. */
  marker: string;
  heading: string;
  detail: string;
  /**
   * Drives colour. `positive` is the actionable one; `settled` closes the
   * question; `open` says the app cannot help. **Never `error`** — every one of
   * these is a successful answer.
   */
  tone: 'positive' | 'settled' | 'open';
  /** Whether this verdict asks the user to go and look for something. */
  actionable: boolean;
};

export function verdictPresentation(verdict: PressingVerdict): VerdictPresentation {
  switch (verdict) {
    case 'matters':
      return {
        marker: '◆',
        heading: 'The pressing matters here',
        detail: 'Check these against the record in your hands before buying.',
        tone: 'positive',
        actionable: true,
      };

    case 'any-copy':
      /*
       * **A RESULT, and it must not read as a failure.** This is the answer that
       * saves the most time — it ends a hunt rather than directing one, and it
       * is the state A40's ranked list could not express at all. A user who
       * reads it as "the app found nothing" will treat the feature as broken at
       * the moment it is most useful.
       */
      return {
        marker: '●',
        heading: 'Any copy is fine',
        detail: 'Pressing makes no real difference for this record — buy the one in front of you.',
        tone: 'settled',
        actionable: false,
      };

    case 'unknown':
      /*
       * **Whose gap it is, stated.** "Nothing is known about this record's
       * pressings" would be a claim about the RECORD; the honest version is that
       * the model has nothing — the same distinction 14c draws with "Discogs
       * holds no matrix… that is a gap in the database, not a fact about the
       * record".
       *
       * And it leaves the hunt OPEN, which is the opposite of `any-copy` above
       * despite both ending without a pressing to chase.
       */
      return {
        marker: '○',
        heading: 'Not known to Claude',
        detail:
          'No reliable knowledge of this record’s pressings — which is not the same as there ' +
          'being nothing to find. Worth checking the deadwax yourself.',
        tone: 'open',
        actionable: false,
      };
  }
}
