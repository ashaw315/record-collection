import { describe, expect, it, vi } from 'vitest';
import { observeUsage, type AnthropicRequest, type AnthropicResponse } from './transport';

/**
 * SPEC.md §4.3 / §9.2 / §10b — what every Anthropic call observes about itself.
 *
 * **Written after the snippet carried both defects the gap analysis had just
 * been fixed for.** A37's length bound and A38's `stop_reason` logging are
 * properties of CALLING ANTHROPIC — every caller needs them and none of them is
 * about gap analysis or about snippets. They were written into the gap-analysis
 * path because that is where the failure was observed, not because that is
 * where they live.
 *
 * So they live here now, and a caller cannot forget them: `observeUsage` is the
 * one place a raw response becomes an observed one.
 */
describe('what the transport observes', () => {
  const response = (over: Partial<AnthropicResponse> = {}): AnthropicResponse => ({
    content: [{ type: 'text', text: 'a note' }],
    stop_reason: 'end_turn',
    usage: { input_tokens: 100, output_tokens: 20 },
    ...over,
  });

  it('carries stop_reason and both token counts', () => {
    expect(observeUsage(response())).toEqual({
      stopReason: 'end_turn',
      inputTokens: 100,
      outputTokens: 20,
    });
  });

  /**
   * **NULL is "not measured", never zero** — the A38 constraint, now shared. A
   * transport reporting no usage must not have zeros invented for it, because a
   * zero is a measurement and an absence is not.
   */
  it('reports null rather than zero when usage is absent', () => {
    expect(observeUsage(response({ usage: null, stop_reason: null }))).toEqual({
      stopReason: null,
      inputTokens: null,
      outputTokens: null,
    });
  });

  it('survives a response missing the fields entirely', () => {
    expect(observeUsage({ content: [] })).toEqual({
      stopReason: null,
      inputTokens: null,
      outputTokens: null,
    });
  });
});

describe('truncation is detectable by every caller', () => {
  /**
   * **The snippet defect, in one assertion.** A response stopped at the ceiling
   * is incomplete whatever the caller does with the text — the gap analysis
   * discovered it through unparseable JSON, and the snippet had no parse step
   * so it discovered nothing and stored a half-sentence.
   *
   * `stop_reason` answers it for both, which is why it belongs here rather than
   * in either caller's parser.
   *
   * Fails against a helper that reads only the text.
   */
  it('says a response ran out of room', async () => {
    const { ranOutOfRoom } = await import('./transport');

    expect(ranOutOfRoom({ stopReason: 'max_tokens', inputTokens: 1, outputTokens: 400 })).toBe(true);
    expect(ranOutOfRoom({ stopReason: 'end_turn', inputTokens: 1, outputTokens: 20 })).toBe(false);
  });

  /**
   * Unknown is NOT truncated. A transport that reports no stop reason has told
   * us nothing, and treating silence as truncation would reject good snippets —
   * absent versus unknown, which this project keeps meeting.
   */
  it('does not treat an unreported stop reason as truncation', async () => {
    const { ranOutOfRoom } = await import('./transport');

    expect(ranOutOfRoom({ stopReason: null, inputTokens: null, outputTokens: null })).toBe(false);
  });
});

/**
 * SPEC.md §9.2 / §10b — **effort is REQUIRED, not defaulted.**
 *
 * **The trap this closes, and it was left open by the fix that found it.** The
 * snippet truncated because `max_tokens` bounds THINKING PLUS OUTPUT and the
 * client sent no `output_config`, so reasoning consumed the budget before the
 * prose finished. Both existing callers now set it — and `output_config` stayed
 * OPTIONAL, so a third caller would compile, pass review, and lose its output
 * budget silently. Exactly the state the snippet was in for months.
 *
 * **There is no safe default.** `low` would degrade a gap analysis, which
 * reasons across a whole collection; `high` is what truncated a two-sentence
 * note. The callers genuinely need different values, so the answer is not a
 * default but a REQUIREMENT: omitting it must fail to compile rather than
 * truncate at runtime.
 *
 * **This test cannot fail at runtime** — a required property is enforced by the
 * compiler, and `@ts-expect-error` is the assertion. It fails at TYPECHECK if
 * the field becomes optional again, which is where the defect would return.
 */
describe('every call must state its reasoning effort', () => {
  it('rejects a request that omits effort', () => {
    const withoutEffort = () => {
      // @ts-expect-error output_config is required: a caller that omits it
      // loses its output budget to reasoning, silently (see the docblock).
      const request: AnthropicRequest = {
        model: 'claude-opus-5',
        max_tokens: 400,
        messages: [{ role: 'user', content: 'hello' }],
      };
      return request;
    };

    expect(withoutEffort).toBeTypeOf('function');
  });

  it('accepts a request that states it', () => {
    const request: AnthropicRequest = {
      model: 'claude-opus-5',
      max_tokens: 400,
      output_config: { effort: 'low' },
      messages: [{ role: 'user', content: 'hello' }],
    };

    expect(request.output_config.effort).toBe('low');
  });
});

/**
 * SPEC.md §4.3 — **the transport PERFORMS the call**, so diagnostics cannot be
 * forgotten.
 *
 * **The layer rule failing its own test, and Adam caught it.** `transport.ts`
 * enforced `output_config` by type — omission is a compile error — but
 * `observeUsage`, `ranOutOfRoom` and the failure logging were still assembled by
 * hand in every caller. So a third caller inherited the effort guard BY
 * CONSTRUCTION and the diagnostics only BY REMEMBERING, which is precisely the
 * shape that let the snippet ship without A38's logging for months.
 *
 * **Tools that must be assembled by hand are documentation with a type
 * signature.** A caller cannot forget if there is nothing to forget, so the
 * transport now makes the call and hands back text plus what it observed.
 */
describe('the transport makes the call and observes it', () => {
  const REQUEST = {
    model: 'claude-opus-5',
    max_tokens: 400,
    output_config: { effort: 'low' as const },
    messages: [{ role: 'user' as const, content: 'hello' }],
  };

  it('returns the text and what it observed, in one shape', async () => {
    const { callAnthropic } = await import('./transport');
    const create = vi.fn().mockResolvedValue({
      content: [{ type: 'text', text: 'a note' }],
      stop_reason: 'end_turn',
      usage: { input_tokens: 100, output_tokens: 20 },
    });

    const result = await callAnthropic({ create }, REQUEST);

    expect(result.text).toBe('a note');
    expect(result.observed).toEqual({
      stopReason: 'end_turn',
      inputTokens: 100,
      outputTokens: 20,
    });
  });

  /**
   * **Truncation is REPORTED, not decided.** The two existing callersdiffer here and
   * both are right: the snippet REFUSES a cut response because a half-sentence
   * reaches the record as finished prose, while the gap analysis lets its parser
   * discover the cut through unparseable JSON. A transport that forced either
   * behaviour would break the other.
   *
   * So it hands back the fact and each caller decides — which is the difference
   * between a shared layer and a shared opinion.
   */
  it('reports truncation rather than deciding what to do about it', async () => {
    const { callAnthropic } = await import('./transport');
    const create = vi.fn().mockResolvedValue({
      content: [{ type: 'text', text: 'cut off half' }],
      stop_reason: 'max_tokens',
      usage: { input_tokens: 100, output_tokens: 400 },
    });

    const result = await callAnthropic({ create }, REQUEST);

    expect(result.ranOutOfRoom).toBe(true);
    // And the text is still handed back: refusing it here would take the
    // decision away from the caller.
    expect(result.text).toBe('cut off half');
  });

  /**
   * A response with no text block is a real case — a refusal, or thinking only.
   * The transport reports `undefined` and does not invent an empty string,
   * because empty and absent mean different things to both callers.
   */
  it('distinguishes no text block from empty text', async () => {
    const { callAnthropic } = await import('./transport');
    const create = vi.fn().mockResolvedValue({
      content: [{ type: 'thinking' }],
      stop_reason: 'end_turn',
      usage: { input_tokens: 10, output_tokens: 1 },
    });

    const result = await callAnthropic({ create }, REQUEST);

    expect(result.text).toBeUndefined();
    expect(result.observed.stopReason).toBe('end_turn');
  });

  /**
   * **The enforcement, and the point of the whole change.** There is no path to
   * a response that skips observation: `callAnthropic` returns `observed`
   * unconditionally, so a caller that wanted to omit diagnostics would have to
   * discard a value it was handed rather than merely forget to compute one.
   *
   * Fails against a transport that returns bare text.
   */
  it('has no path that returns text without observation', async () => {
    const { callAnthropic } = await import('./transport');
    const create = vi.fn().mockResolvedValue({ content: [{ type: 'text', text: 'x' }] });

    const result = await callAnthropic({ create }, REQUEST);

    expect(result).toHaveProperty('observed');
    expect(result.observed).toEqual({
      stopReason: null,
      inputTokens: null,
      outputTokens: null,
    });
  });
});
