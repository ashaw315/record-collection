import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { TONE_CLASS, verdictPresentation, assessmentAvailable } from './pressing-verdict';

/**
 * SPEC.md §12b (A43) — the four states, told apart AT A GLANCE.
 *
 * **Adam's constraint, and it is about habituation rather than clarity:**
 * *"they should be visually distinct enough that I can tell them apart at a
 * glance without reading… if they render as two similar grey paragraphs I will
 * stop distinguishing them within a week."*
 *
 * **A distinction that survives careful reading but not habit is not a
 * distinction.** So the difference is carried by structure — a label, a tone, an
 * icon — rather than by wording alone, and these tests assert the carriers
 * rather than the sentences.
 */

describe('the three assessed states are structurally distinct', () => {
  const matters = verdictPresentation('matters');
  const anyCopy = verdictPresentation('any-copy');
  const unknown = verdictPresentation('unknown');

  /**
   * **The pair Adam named specifically.** Both leave him without a pressing to
   * hunt, and they mean opposite things: one ENDS the hunt, the other says he is
   * on his own.
   *
   * Fails against two states sharing a tone — which is what "two similar grey
   * paragraphs" would be.
   */
  /**
   * **This asserts the CHANNEL, not the token.** The previous version of this
   * test compared `anyCopy.tone` to `unknown.tone` and stopped there. Two token
   * strings differ, so it passed — while the rendering did not: the `open` tone
   * carried `border-l-dashed`, which is not a Tailwind utility and generated
   * zero rules, and the border colour it fell back to measured 1.29:1 against
   * the page, below even the 3:1 non-text floor. The state meaning "nothing is
   * settled, you are on your own" rendered as very nearly no mark at all.
   *
   * A token comparison cannot see that. `TONE_CLASS` is what reaches the DOM,
   * so that is what is asserted here.
   */
  it('gives any-copy and unknown different tones', () => {
    expect(anyCopy.tone).not.toBe(unknown.tone);
    expect(
      TONE_CLASS[anyCopy.tone],
      'the tokens differ AND the classes they render as differ',
    ).not.toBe(TONE_CLASS[unknown.tone]);
  });

  it('gives each state its own marker, so none is told apart by prose alone', () => {
    const markers = [matters.marker, anyCopy.marker, unknown.marker];

    expect(new Set(markers).size, 'three states, three markers').toBe(3);
  });

  it('gives each state its own heading', () => {
    const headings = [matters.heading, anyCopy.heading, unknown.heading];

    expect(new Set(headings).size).toBe(3);
  });

  /**
   * **Only one state means "go look".** Three of the four mean stop, for
   * different reasons, so the actionable one must be the one that reads as
   * actionable.
   */
  it('marks only "matters" as actionable', () => {
    expect(matters.actionable).toBe(true);
    expect(anyCopy.actionable).toBe(false);
    expect(unknown.actionable).toBe(false);
  });

  /**
   * **`any-copy` is a RESULT and reads as one** — it ends a hunt, which is
   * useful. It must not read as a failure, or the user will treat the feature as
   * broken when it is being most helpful.
   */
  it('states any-copy as a finding rather than an absence', () => {
    expect(anyCopy.heading).toMatch(/any copy|does not matter/i);
    expect(anyCopy.heading).not.toMatch(/no|none|nothing|unable|could not/i);
  });

  /**
   * **`unknown` says whose gap it is.** "Nothing is known here" would read as a
   * fact about the record; the honest version is that the MODEL has nothing —
   * the same distinction 14c's "Discogs holds no matrix" draws.
   */
  it('attributes the gap in unknown to the model, not to the record', () => {
    const text = `${unknown.heading} ${unknown.detail}`;

    expect(text).toMatch(/claude|model|not known to/i);
    expect(text).not.toMatch(/there (is|are) no|no such|does not exist/i);
  });

  /** And it must not read as an error — the call succeeded. */
  it('does not present unknown as a failure', () => {
    expect(unknown.tone).not.toBe('error');
    expect(`${unknown.heading} ${unknown.detail}`).not.toMatch(/error|failed|could not reach/i);
  });
});

/**
 * **The map that reaches the DOM (`PressingAssessment.tsx`).**
 *
 * Untested until 2026-09-05, which is how a fake class survived in it. The
 * tone tokens were tested in isolation from the classes they map to, so the
 * seam between derivation and application had no guard on either side of it.
 */
describe('TONE_CLASS — what the verdict actually renders as', () => {
  const TONES = ['positive', 'settled', 'open'] as const;

  /**
   * Read from the COMPILED stylesheet rather than hand-listed, because a
   * hand-list encodes what we believe Tailwind emits — which is exactly the
   * belief that was wrong. `border-l-dashed` would have looked plausible in a
   * hand-written array.
   *
   * The build output is gitignored, so the check is skipped when it is absent
   * (a clean checkout, CI before `npm run build`) rather than failing for a
   * reason that has nothing to do with the code. It is a real assertion on any
   * tree that has been built, and `npm run build` is in the definition of done.
   */
  const compiled = (() => {
    const dir = join(process.cwd(), '.next', 'static', 'chunks');
    if (!existsSync(dir)) return null;
    const css = readdirSync(dir)
      .filter((f) => f.endsWith('.css'))
      .map((f) => readFileSync(join(dir, f), 'utf8'))
      .join('\n');
    return css === '' ? null : css;
  })();

  const generatesRule = (cls: string) =>
    compiled === null || new RegExp(`\\.${cls.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![a-zA-Z0-9_-])`).test(compiled);

  /**
   * **No left border on any tone, and that is deliberate rather than an
   * omission.** The border was a redundant channel that had already failed
   * once, and it was the channel rendering `open` as nearly nothing.
   *
   * Dashed is NOT available as the repair. `OwnershipBadge.tsx` spends
   * `border-dashed` on want INTENT — "a want is a plan, not a fact about the
   * shelf" — so a dashed stroke here would carry want-intent on `/lookup` and
   * no-knowledge on the want-list detail. One stroke, two meanings, two
   * screens. The broken class was masking that collision, not causing it.
   */
  it('spends no border on the distinction', () => {
    for (const tone of TONES) {
      expect(TONE_CLASS[tone], `${tone} carries no border`).not.toMatch(/border/);
    }
  });

  /**
   * Every class must be one Tailwind actually generates. `border-l-dashed` was
   * not, and nothing noticed — a fake utility fails silently, which is the
   * absence-as-success shape this repo keeps meeting.
   */
  it('names only utilities Tailwind actually generates', () => {
    expect(compiled, 'no built CSS found — run `npm run build` for this to bite').not.toBe(
      undefined,
    );

    for (const tone of TONES) {
      for (const cls of TONE_CLASS[tone].split(/\s+/).filter(Boolean)) {
        expect(generatesRule(cls), `${cls} (on ${tone}) generates no rule`).toBe(true);
      }
    }
  });

  /**
   * **The distinction that survives.** `positive` and `settled` are ink;
   * `open` is muted — and muted means `text-muted-foreground`, a token that
   * measures 6.28:1 against the light ground and 7.63:1 against the dark one,
   * not the 1.29:1 the old border fell back to.
   */
  it('marks open as muted and the settled verdicts as ink', () => {
    expect(TONE_CLASS.open).toBe('text-muted-foreground');
    expect(TONE_CLASS.positive).not.toMatch(/muted/);
    expect(TONE_CLASS.settled).not.toMatch(/muted/);
  });

  /**
   * `positive` and `settled` share a class ON PURPOSE: both are verdicts the
   * model actually reached, and neither is muted. They are told apart by the
   * marker and the heading, which `the three assessed states are structurally
   * distinct` above asserts — not by this map.
   */
  it('shares one class between positive and settled, deliberately', () => {
    expect(TONE_CLASS.positive).toBe(TONE_CLASS.settled);
    expect(
      verdictPresentation('matters').marker,
      'so the distinction is carried by the marker instead',
    ).not.toBe(verdictPresentation('any-copy').marker);
  });
});

/**
 * SPEC.md §12b (A56, 2026-09-08) — whether the assessment renders at all.
 *
 * **Gated on an anchor.** A row with no target pressing gave the model two
 * strings and nothing else, which is how it produced CAD 3016 on one run and
 * CAD 3020 on the next for a record numbered CAD 3X38. Neither ask nor stored
 * answer is shown for such a row.
 *
 * **The stored row is KEPT in the database and not rendered** (Adam): it is a
 * record of the model answering a question the app never gave it enough to
 * answer, which is not worth showing beside a statement that the app has no
 * anchor.
 */
describe('assessmentAvailable (A56)', () => {
  it('is false when the row has no target pressing', () => {
    expect(assessmentAvailable(null)).toBe(false);
  });

  /**
   * Fails against a gate keyed on the pressing ROW existing rather than on it
   * carrying an identifier — an empty pressing anchors nothing, and the prompt
   * would be exactly as unanchored as before.
   */
  it('is false when a pressing exists but carries no identifier', () => {
    expect(
      assessmentAvailable({
        catalogNumber: null,
        matrixRunout: null,
        countryPressed: null,
        colorVariant: null,
        pressingPlant: null,
        yearPressed: 2010,
      }),
    ).toBe(false);
  });

  it('is true once the pressing carries a catalogue number', () => {
    expect(
      assessmentAvailable({
        catalogNumber: 'CAD 3X38',
        matrixRunout: null,
        countryPressed: null,
        colorVariant: null,
        pressingPlant: null,
        yearPressed: null,
      }),
    ).toBe(true);
  });

  /** A runout alone is an anchor too — it is what is read off the deadwax. */
  it('is true on a runout alone', () => {
    expect(
      assessmentAvailable({
        catalogNumber: null,
        matrixRunout: 'Salt',
        countryPressed: null,
        colorVariant: null,
        pressingPlant: null,
        yearPressed: null,
      }),
    ).toBe(true);
  });
});
