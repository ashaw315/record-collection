import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { GapAnalysis, type LastGapAnalysis } from './GapAnalysis';

/**
 * SPEC.md §11 (component layer, A46) — the retention disclosure's STRUCTURE.
 *
 * **This is the layer's first test, and it exists because the feature it covers
 * cannot be reached in a browser.** `ANTHROPIC_API_KEY` is deliberately absent
 * from `.env.test` so `snippet.spec.ts` can assert the unconfigured state, which
 * makes that absence a fixture other specs depend on. `GapAnalysis` therefore
 * renders "not configured" in E2E and the disclosure never appears.
 *
 * **Here `configured` is a PROP**, so the gate is not involved and nothing
 * touches the fixture. That is what makes this the fix rather than a workaround.
 *
 * **What was previously verified but NOT GUARDED**: opening the details by
 * default, or adding an action link inside the disclosure, would have been
 * caught by nothing.
 */

const CURRENT: LastGapAnalysis = {
  suggestions: [{ artist: 'Discharge', title: 'Hear Nothing', reason: 'r', genre: 'UK82' }],
  dropped: 0,
  askedAt: new Date(Date.now() - 5 * 60 * 1000),
  recordsAddedSince: 0,
};

const PRIOR: LastGapAnalysis = {
  suggestions: [{ artist: 'Crass', title: 'The Feeding of the 5000', reason: 'r', genre: 'UK82' }],
  dropped: 0,
  askedAt: new Date(Date.now() - 3 * 60 * 60 * 1000),
  recordsAddedSince: 4,
};

const render = (props: Parameters<typeof GapAnalysis>[0]) =>
  renderToStaticMarkup(<GapAnalysis {...props} />);

/** The markup from `<details` onward — the disclosure and nothing before it. */
function disclosureOf(html: string): string {
  const at = html.indexOf('<details');
  return at < 0 ? '' : html.slice(at);
}

describe('the previous answer is subordinate by STRUCTURE, not by wording', () => {
  /**
   * **Closed by default**, which is the whole basis of the distinction: the
   * current answer is the only thing rendered at full weight.
   *
   * `open` is a DOM attribute rather than a CSS state, so static rendering can
   * testify about it. Fails against `<details open>` — the natural change
   * someone makes to "make the comparison easier to find".
   */
  it('renders the previous answer closed', () => {
    const html = render({ configured: true, last: CURRENT, previous: PRIOR });

    expect(html).toContain('<details');

    /*
     * **Matched against how React actually SERIALISES the attribute**, which is
     * `open=""` — not a bare `open`. A pattern requiring whitespace or `>` after
     * the word never fires, and the test passes against `<details open>` while
     * appearing to forbid it. Caught by mutation; the first version of this
     * assertion was hollow for exactly that reason, as was the capability probe
     * that preceded it.
     */
    const tag = html.slice(html.indexOf('<details'), html.indexOf('>', html.indexOf('<details')));
    expect(tag, `closed by default, got: ${tag}`).not.toMatch(/\bopen\b/);
  });

  /**
   * **THE non-peer assertion.** Adam's requirement was that opening the
   * disclosure must not make the two look alike — the distinction has to survive
   * the moment of comparison, which is when it matters most.
   *
   * A superseded suggestion is not something to ACT on: that is a fact about
   * what it is, not a display choice. So the affordance is absent, and a missing
   * affordance is a difference no rewording can erase.
   *
   * Fails against the previous answer being rendered through the current
   * answer's list markup, which is exactly how someone would "simplify" this.
   */
  it('offers no way to act on a superseded suggestion', () => {
    const html = render({ configured: true, last: CURRENT, previous: PRIOR });

    expect(
      (html.match(/want-list\/new/g) ?? []).length,
      'the current answer keeps its action',
    ).toBe(1);
    expect(
      (disclosureOf(html).match(/want-list\/new/g) ?? []).length,
      'and the previous answer has none',
    ).toBe(0);
  });

  /**
   * **Each answer states what IT covers** — the design question the retention
   * unit turned on, asserted here as rendered TEXT rather than as two numbers in
   * a payload.
   *
   * Fails against one staleness line shown twice, which is the natural
   * implementation: `recordsAddedSince` computed once and reused.
   */
  it('gives each answer its own staleness sentence', () => {
    const html = render({ configured: true, last: CURRENT, previous: PRIOR });

    expect(html, 'the current answer is quiet — nothing added since').toContain(
      'Asked 5 minutes ago.',
    );
    expect(disclosureOf(html), 'the previous one carries its own count').toContain(
      'before you added 4 records',
    );
  });

  /**
   * **No previous answer renders no disclosure at all**, rather than an empty
   * one inviting a click that shows nothing. A39's absent-versus-empty
   * distinction, one row further down.
   */
  it('renders no disclosure when there is no previous answer', () => {
    const html = render({ configured: true, last: CURRENT, previous: null });

    expect(html).toContain('Discharge');
    expect(html, 'nothing to compare against').not.toContain('<details');
  });
});

/**
 * **The gate itself, asserted at this layer too.**
 *
 * `snippet.spec.ts` covers the unconfigured state in a browser and must keep
 * doing so — this does not replace it. It is here because the two states are one
 * decision, and a layer that can only see one of them would report half of it.
 */
describe('the unconfigured deployment', () => {
  it('names itself rather than rendering a button that does nothing', () => {
    const html = render({ configured: false, last: CURRENT, previous: PRIOR });

    expect(html).toContain('not configured');
    expect(html, 'and no answer leaks past the gate').not.toContain('Discharge');
  });
});
