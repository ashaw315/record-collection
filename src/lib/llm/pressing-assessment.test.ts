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

describe('the ordering states its own basis', () => {
  const respond = (body: unknown) =>
    vi.fn().mockResolvedValue({
      content: [{ type: 'text', text: JSON.stringify(body) }],
      stop_reason: 'end_turn',
      usage: { input_tokens: 200, output_tokens: 300 },
    });

  /**
   * **The defect Adam found: the app was letting him infer a claim it never
   * made.** The list reads best-first by convention, and nothing asked for an
   * order or said what one meant.
   *
   * **Measured on his two real assessments, the model DOES order — differently
   * each time.** Aja was original-first-then-chronological (MFSL below a common
   * MCA reissue, which is nobody's fidelity ranking); Dummy was
   * sought-after-first-then-territory. So "unordered" would be false and "best
   * first" would be a claim the assessment cannot support.
   *
   * Fails against a client that drops the basis.
   */
  it('carries the model’s stated basis for the order', async () => {
    /*
      TWO pressings: a basis describes an ORDER, and a single-entry list has no
      order to describe. The client carries a basis only when there is a list.
    */
    const create = respond({
      verdict: 'matters',
      orderedBy: 'original pressing first, then chronologically by reissue',
      pressings: [
        { description: 'US original', identifier: 'ABC AB-1006' },
        { description: 'Japanese pressing', identifier: 'ABC/Victor VIM-6243' },
      ],
    });

    const result = await createPressingAssessmentClient({ create }).assess(SUBJECT);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.orderedBy).toBe('original pressing first, then chronologically by reissue');
  });

  /**
   * **"Ordered by nothing in particular" is a real answer** (Adam), and
   * inventing a basis to fill the field is the fabrication this rule exists to
   * prevent — the same shape as `noParentFits` and `unknown`.
   *
   * Fails against a client that defaults the field to a plausible string.
   */
  it('reports no basis rather than inventing one', async () => {
    const create = respond({
      verdict: 'matters',
      pressings: [{ description: 'US original', identifier: 'ABC AB-1006' }],
    });

    const result = await createPressingAssessmentClient({ create }).assess(SUBJECT);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.orderedBy).toBeNull();
  });

  /**
   * **The basis is STATED, never RATED** — the rule this project has now landed
   * on three times. "Best first" is a claim about VALUE, and value here is the
   * user's (§8). A basis is a fact he weighs.
   *
   * Fails against a prompt asking the model to rank by quality.
   */
  it('never asks the model to rank by how good the pressings are', () => {
    const prompt = buildPressingAssessmentPrompt(SUBJECT).replace(/\s+/g, ' ');

    /*
      The prohibition necessarily quotes what it forbids — "do NOT rank them by
      which sounds best" contains "rank them". A whole-prompt ban would forbid
      explaining the rule, which is the same trap A44's example-sentence test
      hit. So this asserts the instruction is NEGATED where it appears.
    */
    expect(prompt).toMatch(/do not rank them by which sounds best/i);
    expect(prompt).toMatch(/collector’s judgement to make/i);

    // And it asks what the order MEANS rather than for a ranking.
    expect(prompt).toMatch(/say what order you have listed them in/i);
  });

  /** A one-entry list has no order to describe, and must not claim one. */
  it('carries no basis when there is nothing to order', async () => {
    const create = respond({ verdict: 'any-copy', pressings: [] });

    const result = await createPressingAssessmentClient({ create }).assess(SUBJECT);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.orderedBy).toBeNull();
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

/**
 * SPEC.md §12b (A57, 2026-09-08) — the prompt is told WHICH record.
 *
 * **The fix rather than the guard.** A56 stops an unanchored ask; this stops the
 * ask being unanchored. `PressingSubject` was `{ artist, title }`, so for
 * Deerhunter's *Halcyon Digest* the model produced CAD 3016 on one run and
 * CAD 3020 on the next — a record numbered CAD 3X38. **The instability is the
 * proof it was generated rather than recalled.**
 *
 * **The dig-notes exclusion stays and is not weakened.** Withholding the user's
 * own beliefs so the model cannot flatter them is sound; the catalogue number is
 * not a belief, it is the identity of the object. That distinction is the whole
 * amendment.
 */
describe('the prompt carries the held pressing (A57)', () => {
  const SUBJECT = { artist: 'Deerhunter', title: 'Halcyon Digest' };

  it('names the catalogue number the app holds', () => {
    const prompt = buildPressingAssessmentPrompt({
      ...SUBJECT,
      held: { catalogNumber: 'CAD 3X38', matrixRunout: null, countryPressed: null, colorVariant: null },
    });

    expect(prompt).toContain('CAD 3X38');
  });

  it('names the runout and the variant descriptor', () => {
    const prompt = buildPressingAssessmentPrompt({
      ...SUBJECT,
      held: {
        catalogNumber: 'CAD 3X38',
        matrixRunout: 'Salt',
        countryPressed: 'UK',
        colorVariant: 'White, Early fadeout (Desire Lines)',
      },
    });

    expect(prompt).toContain('Salt');
    expect(prompt).toContain('White, Early fadeout (Desire Lines)');
  });

  /**
   * **The load-bearing instruction.** Fails against a prompt that supplies the
   * catalogue number without forbidding contradiction of it — which would leave
   * the model free to name CAD 3020 alongside, exactly as before.
   */
  it('forbids contradicting the held identifiers', () => {
    const prompt = buildPressingAssessmentPrompt({
      ...SUBJECT,
      held: { catalogNumber: 'CAD 3X38', matrixRunout: null, countryPressed: null, colorVariant: null },
    });

    expect(prompt).toMatch(/do not contradict|must not contradict|never contradict/i);
  });

  /**
   * Fails against a prompt that asks the model to confirm what it was given.
   * Echoing the held value back is the flattery risk the dig-notes reasoning
   * correctly identified — a confirmation that reads as corroboration.
   */
  it('asks the model NOT to simply repeat the value it was given', () => {
    const prompt = buildPressingAssessmentPrompt({
      ...SUBJECT,
      held: { catalogNumber: 'CAD 3X38', matrixRunout: null, countryPressed: null, colorVariant: null },
    });

    expect(prompt).toMatch(/already know|do not repeat|no need to restate/i);
  });

  /**
   * Fails against a prompt that renders an empty "the collector holds" block.
   * A56 gates the ask on an anchor, so this should not occur — but a heading
   * over nothing would tell the model it had been given facts it had not.
   */
  it('says nothing about held facts when there are none', () => {
    const prompt = buildPressingAssessmentPrompt(SUBJECT);

    expect(prompt).not.toMatch(/the collector (already )?(holds|has recorded)/i);
  });

  /** Unchanged: the user's own dig notes are still never sent. */
  it('still sends no dig notes', () => {
    const prompt = buildPressingAssessmentPrompt({
      ...SUBJECT,
      held: { catalogNumber: 'CAD 3X38', matrixRunout: null, countryPressed: null, colorVariant: null },
    });

    expect(prompt).not.toMatch(/dig note|best dig|their notes/i);
  });
});
