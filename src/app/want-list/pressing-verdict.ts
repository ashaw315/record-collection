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

/**
 * What each tone RENDERS AS. Lives here, beside the tone it maps, and is
 * exported so it can be tested — `PressingAssessment.tsx` held it privately and
 * nothing guarded it.
 *
 * **No border on any tone, deliberately.** The three tones used to carry a 2px
 * left border, and `open`'s was `border-l-dashed` — not a Tailwind utility, so
 * it generated no rule and silently fell back. The colour it fell back to
 * measured **1.29:1** against the page: below even the 3:1 non-text floor, so
 * the verdict meaning "nothing is settled here, you are on your own" rendered
 * as very nearly no mark. **A state signalled by near-absence** is the failure
 * this project has spent the most effort removing.
 *
 * **Repairing the typo was not the fix, because dashed is already spent.**
 * `OwnershipBadge.tsx` uses `border-dashed` for want INTENT — "a want is a
 * plan, not a fact about the shelf". A dashed stroke here would mean
 * want-intent on `/lookup` and no-knowledge on the want-list detail: one
 * stroke, two meanings, two screens. The broken class was masking that
 * collision rather than causing it.
 *
 * So the border goes entirely — it was a redundant channel that had already
 * failed once — and the distinction rides on the marker and the heading, which
 * are text and cannot fall back to nothing. Tone now only decides ink versus
 * muted, and `muted` is `--muted-foreground`: **6.28:1** on the light ground,
 * **7.63:1** on the dark, and already the token used by the detail line
 * directly beneath.
 */
export const TONE_CLASS: Record<VerdictPresentation['tone'], string> = {
  positive: '',
  settled: '',
  open: 'text-muted-foreground',
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
