import { describe, expect, it } from 'vitest';
import { askedLine } from './asked-line';

/**
 * SPEC.md §9.2 (A39) — what the persisted result says about itself.
 *
 * **The sentence STATES, it does not advise.** Whether five more records is
 * worth one of ten hourly requests is the user's judgement, and copy that nudges
 * toward re-asking is the app spending the user's quota on its own opinion.
 */

const at = (minutesAgo: number) => new Date(Date.now() - minutesAgo * 60_000);

describe('the asked line', () => {
  it('says when it was asked', () => {
    expect(askedLine({ askedAt: at(20), gapsClosedSince: 0 })).toBe('Asked 20 minutes ago.');
  });

  it('reads naturally for a single minute and for just now', () => {
    expect(askedLine({ askedAt: at(1), gapsClosedSince: 0 })).toBe('Asked 1 minute ago.');
    expect(askedLine({ askedAt: at(0), gapsClosedSince: 0 })).toBe('Asked just now.');
  });

  it('uses hours once minutes stop being readable', () => {
    expect(askedLine({ askedAt: at(90), gapsClosedSince: 0 })).toBe('Asked 1 hour ago.');
    expect(askedLine({ askedAt: at(200), gapsClosedSince: 0 })).toBe('Asked 3 hours ago.');
  });

  /**
   * **The fact the timestamp does not carry** (A39). Fails against a line that
   * shows only the age — which reads as reassurance in exactly the case where
   * the answer is about a different collection.
   */
  /**
   * **CORRECTED (A47): the count is records AND want-list additions**, so the
   * copy can no longer say "records". A number's NAME must match what it
   * measures — the test-name rule applied to UI copy — and "before you added 5
   * records" is a claim that would be false the moment one of the five was a
   * want-list row.
   */
  it('names what has changed since, when something has', () => {
    expect(askedLine({ askedAt: at(20), gapsClosedSince: 5 })).toBe(
      'Asked 20 minutes ago, before you added 5 records or wanted records.',
    );
  });

  it('says one without pluralising', () => {
    expect(askedLine({ askedAt: at(20), gapsClosedSince: 1 })).toBe(
      'Asked 20 minutes ago, before you added 1 record or wanted record.',
    );
  });

  /**
   * Fails against copy that still claims a RECORD count. The defect this
   * corrects was a line asserting nothing had changed when a want-list addition
   * had staled the answer; a line that counts both and still says "records" is
   * the same overclaim in the other direction.
   */
  it('does not describe the count as records alone', () => {
    const line = askedLine({ askedAt: at(20), gapsClosedSince: 3 });

    expect(line).toMatch(/wanted/i);
  });

  /**
   * **Quiet when nothing has changed.** A caveat shown when the answer is
   * current is noise that spends the credibility of the one that matters — the
   * same rule as §12 step 14c's variant limit.
   *
   * Fails against a line that always appends a clause.
   */
  it('says nothing about changes when there are none', () => {
    const line = askedLine({ askedAt: at(20), gapsClosedSince: 0 });

    expect(line).not.toMatch(/record|wanted|added|chang/i);
  });

  /**
   * **It must not advise** (Adam, 2026-08-26). Fails against copy suggesting
   * the user re-ask — "you may want to ask again", "re-run", "out of date".
   */
  it('states a fact and gives no instruction', () => {
    const line = askedLine({ askedAt: at(20), gapsClosedSince: 5 });

    expect(line).not.toMatch(/again|re-?ask|re-?run|refresh|update|should|may want|out of date|stale/i);
  });
});
