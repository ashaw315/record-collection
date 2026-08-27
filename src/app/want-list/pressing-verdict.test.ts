import { describe, expect, it } from 'vitest';
import { verdictPresentation } from './pressing-verdict';

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
  it('gives any-copy and unknown different tones', () => {
    expect(anyCopy.tone).not.toBe(unknown.tone);
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
