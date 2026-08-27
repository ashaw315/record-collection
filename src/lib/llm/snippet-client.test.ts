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
   *
   * **The BOUND moved and the principle did not (2026-08-26).** This asserted
   * `<= 500` on the reasoning that ~100 tokens of prose needs no more. Two live
   * snippets then truncated at ~80 and ~96 output tokens — UNDER the old 400
   * ceiling — which disproved the premise rather than the rule: **`max_tokens`
   * bounds THINKING PLUS OUTPUT**, and this client sent no `output_config`, so
   * reasoning consumed the budget before the prose was finished.
   *
   * So the fix is `effort: 'low'` plus room for the thinking that remains. The
   * assertion that survives is the one that was always the point — **the
   * snippet's budget is much smaller than a gap analysis's** — and the number
   * is now 1,200, still 12x a compliant answer and far short of an essay.
   */
  it('gives the snippet a much smaller budget than gap analysis', () => {
    expect(SNIPPET_MAX_TOKENS).toBeLessThan(GAP_ANALYSIS_MAX_TOKENS);
    // Room for low-effort thinking plus three sentences; nowhere near an essay.
    expect(SNIPPET_MAX_TOKENS).toBeLessThanOrEqual(1_500);
  });

  /**
   * **The cause of the truncation, pinned.** Fails against a client that sends
   * no `output_config` — which is how two snippets were cut at ~80 tokens under
   * a 400-token ceiling, and how this differed from §9.2's client for months.
   */
  it('asks for LOW effort, because a two-sentence note is recall not analysis', async () => {
    const create = vi.fn().mockResolvedValue({
      content: [{ type: 'text', text: 'A note.' }],
      stop_reason: 'end_turn',
      usage: { input_tokens: 10, output_tokens: 5 },
    });

    await createSnippetClient({ create }).write(SUBJECT);

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ output_config: { effort: 'low' } }),
    );
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

/**
 * SPEC.md §10b — the snippet inherits what the transport observes.
 *
 * **Adam found this by using it.** *"The Hurdy Gurdy Man"* stored a snippet
 * ending mid-sentence, and "Write a new one" 502'd undiagnosably — A37 and A38
 * fixed on the gap-analysis route and not on this one, which shares the
 * transport and the quota.
 *
 * **A truncated snippet is worse than a failed one**, which is why this is a
 * refusal rather than a warning: a half-sentence is stored on the record and
 * displayed as finished prose, and nothing distinguishes it from a good note.
 * §4.2 treats stored snippet text as something the user may take ownership of,
 * so writing an incomplete one puts text in that position which should never
 * have been offered.
 */
describe('a truncated response is never stored', () => {
  const truncating = () =>
    vi.fn().mockResolvedValue({
      content: [{ type: 'text', text: 'moves between Eastern-tinged mysticism and lighter acoustic pieces. It' }],
      stop_reason: 'max_tokens',
      usage: { input_tokens: 300, output_tokens: 400 },
    });

  /**
   * Fails against the shipped client, which reads only the text and returns
   * `ok: true` for a half-sentence.
   */
  it('refuses a response that ran out of room', async () => {
    const result = await createSnippetClient({ create: truncating() }).write(SUBJECT);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('cut');
  });

  /** And carries what it observed, so the route can log why (A38's half). */
  it('carries stop_reason and tokens on the refusal', async () => {
    const result = await createSnippetClient({ create: truncating() }).write(SUBJECT);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.stopReason).toBe('max_tokens');
    expect(result.outputTokens).toBe(400);
  });

  /** A complete response is unaffected — and carries its usage too. */
  it('stores a response that finished, with its usage', async () => {
    const create = vi.fn().mockResolvedValue({
      content: [{ type: 'text', text: 'A complete note about the record.' }],
      stop_reason: 'end_turn',
      usage: { input_tokens: 300, output_tokens: 40 },
    });

    const result = await createSnippetClient({ create }).write(SUBJECT);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.snippet).toBe('A complete note about the record.');
    expect(result.outputTokens).toBe(40);
  });
});
