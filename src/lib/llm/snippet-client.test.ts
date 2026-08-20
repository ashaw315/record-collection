import { describe, expect, it, vi } from 'vitest';
import {
  buildSnippetPrompt,
  createSnippetClient,
  SNIPPET_MAX_TOKENS,
  type SnippetSubject,
} from './snippet-client';
import { GAP_ANALYSIS_MAX_TOKENS } from './client';

/**
 * SPEC.md §10b's snippet prompt, and R5's finding 4 decided for both callers.
 *
 * **The unmeasurable property is named here rather than assumed away.** §10b
 * says the snippet "never contradicts entered data" — that is an INSTRUCTION to
 * the model, not a check the app performs, and no parser can catch a snippet
 * that names the wrong year. These tests pin what the prompt ASKS; nothing here
 * pins compliance, deliberately, and the docblocks say which is which. A29d's
 * correction is the precedent: a spec bullet claimed the genre validation
 * enforced a rule it could not enforce, and three files repeated the claim.
 */

const SUBJECT: SnippetSubject = {
  title: 'Hear Nothing See Nothing Say Nothing',
  artist: 'Discharge',
};

describe('the count decision (R5 finding 4)', () => {
  /**
   * Fails against: a snippet sharing §9.2's 4000-token budget.
   *
   * **The two callers need different bounds and the shared constant fitted
   * neither.** §10b gives the snippet a natural bound in words — "two or three
   * sentences" — which is roughly 200-400 characters, about 100 tokens. R5's
   * live gap analysis used 2994 output tokens for 34 suggestions and stopped on
   * `end_turn`, so 4000 is right there and roughly 40x what a snippet can use.
   *
   * A shared ceiling is not a safety net for the snippet: it is a budget so
   * loose that a runaway response is indistinguishable from a normal one.
   */
  it('gives the snippet a much smaller budget than gap analysis', () => {
    expect(SNIPPET_MAX_TOKENS).toBeLessThan(GAP_ANALYSIS_MAX_TOKENS);
    // Enough for three sentences with room to spare, not enough for an essay.
    expect(SNIPPET_MAX_TOKENS).toBeLessThanOrEqual(500);
  });

  /**
   * Fails against: a prompt that does not state the length §10b specifies.
   *
   * The token ceiling is a backstop, not the instruction. A response truncated
   * at the ceiling is a half-sentence; a response that OBEYS the instruction is
   * two or three whole ones. The prompt has to ask.
   */
  it('asks for the length §10b specifies', () => {
    const prompt = buildSnippetPrompt(SUBJECT);

    expect(prompt).toMatch(/two or three sentences/i);
  });
});

describe('what the prompt asks — instruction, not enforcement', () => {
  /**
   * Fails against: a prompt that does not forbid the contradicting facts.
   *
   * §10b: "It never contradicts entered data. It does not state a pressing, a
   * year, or a price; those are on the record."
   *
   * **This test pins the ASKING and nothing pins the OBEYING.** A snippet that
   * names 1982 for a 1981 pressing is exactly CLAUDE.md §8's worst shape —
   * confidently misleading — and no parser can detect it, because the app has
   * no way to check a claim about music against the world. The mitigation is to
   * withhold the facts (below) and to label the output as generated (§10b,
   * unit 3), not to validate the text.
   */
  it('forbids stating a pressing, a year or a price', () => {
    const prompt = buildSnippetPrompt(SUBJECT);

    expect(prompt).toMatch(/year|pressing|price/i);
    expect(prompt).toMatch(/do not|never|avoid/i);
  });

  /**
   * **Fails against: a prompt that sends the record's own facts.**
   *
   * The strongest available mitigation, and the only ENFORCED one: a model
   * cannot contradict a year it was never told. Sending `release_year` so the
   * model can "avoid contradicting it" would hand it the exact value most
   * likely to be repeated back as an assertion.
   *
   * So the subject is artist and title only. That is a property of the payload,
   * checkable here, unlike compliance with the instruction above.
   */
  it('sends only the artist and title, never the record own facts', () => {
    const prompt = buildSnippetPrompt({
      ...SUBJECT,
      // Deliberately passed as extra keys a careless builder might spread in.
      ...({
        releaseYear: 1982,
        purchasePrice: '1234.56',
        pressingYear: 1981,
        labelName: 'SENTINEL-LABEL-Clay',
        matrixRunout: 'SENTINEL-MATRIX-PORKY',
      } as Partial<SnippetSubject>),
    });

    expect(prompt).toContain('Discharge');
    expect(prompt).toContain('Hear Nothing See Nothing Say Nothing');
    for (const leak of ['1982', '1981', '1234.56', 'SENTINEL-LABEL-Clay', 'SENTINEL-MATRIX-PORKY']) {
      expect(prompt).not.toContain(leak);
    }
  });

  /**
   * Fails against: a prompt that invites the model to fill gaps it is unsure of.
   *
   * A29c's trade, applied one feature over: asking for omission reduces
   * hallucination and does not prevent it. Pinned as an instruction, and — as
   * A29c requires — nothing anywhere reads its presence as a verification.
   */
  it('asks the model to say less rather than guess', () => {
    const prompt = buildSnippetPrompt(SUBJECT);

    expect(prompt).toMatch(/unsure|not confident|say less|leave it out|omit/i);
  });
});

describe('the response boundary', () => {
  /**
   * Fails against: a client that returns the raw response.
   *
   * Plain text, not JSON: §10b wants prose, and a JSON envelope would add a
   * parse failure mode for no benefit. But the empty-versus-unreadable
   * distinction still applies — the same one §9.2's parser draws.
   */
  it('returns the text of a good response', async () => {
    const create = vi.fn().mockResolvedValue({
      content: [{ type: 'text', text: 'A 1982 hardcore record that reshaped the scene.' }],
    });

    const result = await createSnippetClient({ create }).write(SUBJECT);

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('unreachable');
    expect(result.snippet).toContain('hardcore');
  });

  /**
   * Fails against: a client that reports a missing text block as empty text.
   *
   * A response carrying only a refusal has told us nothing about the record, and
   * storing '' would put an empty snippet on the record — indistinguishable from
   * one the user deleted, which §4.2 treats as a deliberate act.
   */
  it.each([
    ['no text block', { content: [] }],
    ['an empty string', { content: [{ type: 'text', text: '' }] }],
    ['whitespace only', { content: [{ type: 'text', text: '   \n  ' }] }],
  ])('treats %s as unreadable, not as an empty snippet', async (_case, response) => {
    const create = vi.fn().mockResolvedValue(response);

    const result = await createSnippetClient({ create }).write(SUBJECT);

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('unreachable');
    expect(result.reason).toBe('unreadable');
  });

  /**
   * Fails against: a client that stores the model's surrounding chatter.
   *
   * Models wrap prose in quotes or preface it. The stored text is rendered
   * directly into a panel, so a leading `Here's a snippet:` becomes part of the
   * record forever.
   */
  it.each([
    ['"A 1982 hardcore record."', 'A 1982 hardcore record.'],
    ['  A 1982 hardcore record.  ', 'A 1982 hardcore record.'],
  ])('trims wrapping from %j', async (raw, expected) => {
    const create = vi.fn().mockResolvedValue({ content: [{ type: 'text', text: raw }] });

    const result = await createSnippetClient({ create }).write(SUBJECT);

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('unreachable');
    expect(result.snippet).toBe(expected);
  });

  /**
   * Fails against: a client sending the wrong budget.
   *
   * The finding-4 decision, asserted at the request rather than only as a
   * constant, so a client that ignores it fails.
   */
  it('sends the snippet budget, not the gap-analysis one', async () => {
    const create = vi.fn().mockResolvedValue({ content: [{ type: 'text', text: 'A record.' }] });

    await createSnippetClient({ create }).write(SUBJECT);

    expect(create.mock.calls[0][0].max_tokens).toBe(SNIPPET_MAX_TOKENS);
  });
});
