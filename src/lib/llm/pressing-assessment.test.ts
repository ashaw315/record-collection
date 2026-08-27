import { describe, expect, it, vi } from 'vitest';
import {
  buildPressingAssessmentPrompt,
  createPressingAssessmentClient,
} from './pressing-assessment-client';

/**
 * SPEC.md §12b (A43) — is a pressing worth chasing, and which one.
 *
 * **The fourth LLM caller.** It goes through `callAnthropic`, so A37's bound and
 * A38's diagnostics arrive by construction rather than by being remembered.
 */

const SUBJECT = { artist: 'Fleetwood Mac', title: 'Rumours' };

describe('the prompt', () => {
  /**
   * **"Any copy is fine" is a RESULT, and the prompt must invite it.** A44's
   * `noParentFits` established the shape: a constraint that cannot express its
   * own edge case turns silence into a lie.
   */
  it('offers "pressing does not matter" as a real answer', () => {
    /*
      Newlines collapsed before matching: the prompt is assembled from an array
      of lines, so a sentence that reads as one to the model spans two entries
      here. Asserting the source's line breaks would pin formatting rather than
      content — the same correction A37's count test needed.
    */
    const prompt = buildPressingAssessmentPrompt(SUBJECT).replace(/\s+/g, ' ');

    expect(prompt).toMatch(/any copy is fine|makes no real difference/i);
  });

  /**
   * **And "I do not know this record" separately**, because it is a DIFFERENT
   * answer: "any copy is fine" ends the hunt, "I have nothing reliable" leaves
   * it open and tells the user they are on their own. Collapsing them would turn
   * "no information" into "there is nothing to find" — a negative the app never
   * established, on exactly the obscure records Adam mostly buys.
   */
  it('offers "I have no reliable knowledge" as a separate answer', () => {
    const prompt = buildPressingAssessmentPrompt(SUBJECT);

    expect(prompt).toMatch(/no reliable|do not have reliable|not familiar/i);
    // And says the honest answer is preferred to a guess, so admitting it is
    // cheaper than complying with a request to assess.
    expect(prompt).toMatch(/better than|rather than guess|more useful than a guess/i);
  });

  /**
   * §8 and 14c: a pressing is identified by what is printed or stamped on the
   * object. The prompt asks for that specifically rather than for "detail".
   */
  it('asks for something checkable against the record in hand', () => {
    const prompt = buildPressingAssessmentPrompt(SUBJECT);

    expect(prompt).toMatch(/catalogue|catalog/i);
    expect(prompt).toMatch(/matrix|runout|dead ?wax/i);
  });

  /**
   * **Year is NOT checkable, and the prompt says so** (Adam) — for the same
   * reason 14b gave for not filtering a version list by it: a year is an OUTPUT
   * of identification, not an input to it. A pressing year is printed on a
   * sleeve at best and inferred at worst.
   */
  it('does not accept a year as the identifying detail', () => {
    const prompt = buildPressingAssessmentPrompt(SUBJECT);

    const flat = prompt.replace(/\s+/g, ' ');

    expect(flat).toMatch(/a year is not enough/i);
    expect(flat).toMatch(/never identify a pressing by year alone/i);
  });

  /** The app must not ask the model to grade itself — A44's rule, reused. */
  it('never asks for a confidence score', () => {
    const prompt = buildPressingAssessmentPrompt(SUBJECT);

    expect(prompt).not.toMatch(/confidence|how (sure|certain)|score|rate your/i);
  });
});

describe('the four states stay distinguishable', () => {
  const respond = (body: unknown) =>
    vi.fn().mockResolvedValue({
      content: [{ type: 'text', text: JSON.stringify(body) }],
      stop_reason: 'end_turn',
      usage: { input_tokens: 200, output_tokens: 300 },
    });

  it('reports pressings that matter, with what identifies each', async () => {
    const create = respond({
      verdict: 'matters',
      pressings: [
        { description: 'First US press', identifier: 'Warner BSK 3010, "LW" in the deadwax' },
      ],
    });

    const result = await createPressingAssessmentClient({ create }).assess(SUBJECT);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.verdict).toBe('matters');
    expect(result.pressings[0]?.identifier).toContain('BSK 3010');
  });

  /**
   * **The answer that saves the most time**, because it ENDS a hunt rather than
   * directing one — and the state A40's ranked list could not express at all.
   */
  it('reports that pressing does not matter, as a verdict rather than an absence', async () => {
    const create = respond({ verdict: 'any-copy' });

    const result = await createPressingAssessmentClient({ create }).assess(SUBJECT);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.verdict).toBe('any-copy');
    expect(result.pressings).toEqual([]);
  });

  it('reports having no reliable knowledge, distinctly from any-copy', async () => {
    const create = respond({ verdict: 'unknown' });

    const result = await createPressingAssessmentClient({ create }).assess(SUBJECT);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.verdict).toBe('unknown');
  });
});

describe('a claim without something checkable collapses to unknown', () => {
  const respond = (body: unknown) =>
    vi.fn().mockResolvedValue({
      content: [{ type: 'text', text: JSON.stringify(body) }],
      stop_reason: 'end_turn',
      usage: { input_tokens: 200, output_tokens: 300 },
    });

  /**
   * **A PARSE-LEVEL requirement, not a prompt request** (Adam, citing A29c: an
   * instruction is not a verification). A44 drops pairings naming unknown
   * genres regardless of what the prompt said; this drops pressings naming
   * nothing checkable.
   *
   * **The failure is deliberate and Adam asked for it:** *"a model that knows an
   * album has notable pressings but cannot name one has told me nothing I did
   * not know from the fact that I am holding a record."* Suppressing genuine
   * but general knowledge is the intended cost — "the first press sounds
   * better" is not actionable in a shop.
   */
  it('drops a pressing identified only by vague praise', async () => {
    const create = respond({
      verdict: 'matters',
      pressings: [{ description: 'The original', identifier: 'sounds much better' }],
    });

    const result = await createPressingAssessmentClient({ create }).assess(SUBJECT);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.pressings).toEqual([]);
    // With nothing left, the verdict is not "matters" — it is not knowing.
    expect(result.verdict).toBe('unknown');
  });

  /**
   * **A YEAR is not checkable** (Adam), for 14b's reason: a year is an output of
   * identification rather than an input to it, and it is printed on a sleeve at
   * best. Fails against a parser accepting "the 1977 pressing".
   */
  it('does not accept a year alone as identifying', async () => {
    const create = respond({
      verdict: 'matters',
      pressings: [{ description: 'Original', identifier: 'the 1977 pressing' }],
    });

    const result = await createPressingAssessmentClient({ create }).assess(SUBJECT);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.pressings).toEqual([]);
  });

  /**
   * Each accepted form, asserted individually so the list is a decision rather
   * than a regex nobody can find (Adam). All four are readable off the object:
   * catalogue number, pressing plant, matrix/runout marking, country.
   */
  it.each([
    ['catalogue number', 'Warner BSK 3010'],
    ['pressing plant', 'pressed at Terre Haute'],
    ['matrix marking', 'CTH stamped in the deadwax'],
    ['country', 'the UK press on Clay'],
  ])('accepts a %s as checkable', async (_kind, identifier) => {
    const create = respond({
      verdict: 'matters',
      pressings: [{ description: 'The one to find', identifier }],
    });

    const result = await createPressingAssessmentClient({ create }).assess(SUBJECT);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.pressings).toHaveLength(1);
  });

  /** "any-copy" carries no pressings, so the checkable rule cannot demote it. */
  it('does not demote an any-copy verdict, which names no pressings by design', async () => {
    const create = respond({ verdict: 'any-copy', pressings: [] });

    const result = await createPressingAssessmentClient({ create }).assess(SUBJECT);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.verdict).toBe('any-copy');
  });
});

/**
 * CLAUDE.md §2: no test may make a live external call. The fourth client needs
 * this for the same reason the third did — every test above injects a fake,
 * which the guard exempts by design, so none of them touches the real path.
 */
describe('the real client cannot reach Anthropic from a test', () => {
  it('refuses to reach api.anthropic.com, naming the host', async () => {
    const { getPressingAssessmentClient } = await import('./pressing-assessment-client');

    await expect(getPressingAssessmentClient().assess(SUBJECT)).rejects.toThrow(
      /api\.anthropic\.com/,
    );
  });
});
