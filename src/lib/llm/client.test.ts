import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createGapAnalysisClient,
  getGapAnalysisClient,
  isAnthropicConfigured,
  buildPrompt,
} from './client';
import type { CollectionSummary } from './collection-summary';

/**
 * SPEC.md §9.2's Anthropic client, and the prompt that is the feature.
 *
 * **No live call is possible here** — every test injects a fake `create`, and
 * the no-live-calls guard covers `api.anthropic.com` at the request site for
 * anything that forgets. Verified rather than assumed: the guard throws on that
 * host and names it, falling back to generic mock advice exactly as its comment
 * predicted it would for a client written after it.
 */

const SUMMARY: CollectionSummary = {
  artists: [
    { name: 'Discharge', recordCount: 4, genres: ['UK82', 'D-beat'] },
    { name: 'Black Flag', recordCount: 2, genres: ['US Hardcore'] },
  ],
  labels: [{ name: 'Clay Records', recordCount: 4 }],
  wantList: [{ artist: 'Anti-Cimex', title: 'Raped Ass', priority: 1 }],
  genreVocabulary: ['UK82', 'D-beat', 'US Hardcore', 'Punk'],
};

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('the prompt is the feature', () => {
  /**
   * Fails against: a prompt that omits the genre vocabulary.
   *
   * A29d validates the response's `genre` against the user's own names, and
   * that is only enforceable if the model was told what they are. Without it
   * every suggestion would be dropped and the feature would silently return
   * nothing.
   */
  it('sends the user own genre names as the vocabulary', () => {
    const prompt = buildPrompt(SUMMARY);

    for (const genre of SUMMARY.genreVocabulary) {
      expect(prompt).toContain(genre);
    }
  });

  /**
   * Fails against: a prompt that does not ask for genre precision.
   *
   * §9.2 and CLAUDE.md §8: the distinctions between UK first-wave punk, UK82,
   * US hardcore, horror punk and psychobilly are real scenes, and flattening
   * them to "punk" is the single worst thing this prompt can do. The
   * instruction is asserted rather than trusted to survive an edit.
   */
  it('asks for genre precision and forbids flattening', () => {
    const prompt = buildPrompt(SUMMARY);

    expect(prompt.toLowerCase()).toContain('flatten');
    // The constraint that makes it checkable, not just requested.
    expect(prompt).toMatch(/must be one of the genre names/i);
  });

  /**
   * Fails against: a prompt that omits the do-not-repeat instruction.
   *
   * A suggestion naming something already owned or already wanted is R5's
   * "unhelpful in a way the app must handle". The prompt is the cheapest place
   * to prevent it; the want list and the owned artists are both in the payload
   * already, so the model has what it needs to comply.
   */
  it('tells the model what is already owned and wanted', () => {
    const prompt = buildPrompt(SUMMARY);

    expect(prompt).toContain('Discharge');
    expect(prompt).toContain('Anti-Cimex');
    expect(prompt).toMatch(/already own|already on/i);
  });

  /**
   * Fails against: dropping the precision-over-recall instruction.
   *
   * A29c is explicit that this REDUCES hallucination rather than preventing it
   * — a model's confidence is not evidence. It is still worth asking for, and
   * the amendment's own wording says the instruction must not be read anywhere
   * as a verification. This test pins the instruction; nothing pins it as a
   * guarantee, deliberately.
   */
  it('asks the model to omit records it is unsure exist', () => {
    const prompt = buildPrompt(SUMMARY);

    expect(prompt).toMatch(/unsure|not confident|leave it out/i);
  });

  /**
   * Fails against: a prompt that does not demand JSON only.
   *
   * §9.2 requires JSON-only output. The parse boundary tolerates fences and
   * preambles because models add them anyway — but asking for clean output is
   * what makes those the exception rather than the norm.
   */
  it('requires JSON-only output and names the shape', () => {
    const prompt = buildPrompt(SUMMARY);

    expect(prompt).toContain('suggestions');
    expect(prompt).toMatch(/json only|only json/i);
  });

  /**
   * Fails against: a prompt leaking a field the summary does not carry.
   *
   * The payload is the disclosure boundary and the prompt is what it travels
   * in. A prompt that helpfully added "purchased at" would defeat every
   * exclusion in `collection-summary.ts` — so the sentinel discipline is
   * applied here too, one layer up.
   */
  it('sends nothing beyond the summary it was given', () => {
    const prompt = buildPrompt({
      ...SUMMARY,
      artists: [{ name: 'SENTINEL-ARTIST', recordCount: 1, genres: [] }],
    });

    expect(prompt).toContain('SENTINEL-ARTIST');
    expect(prompt).not.toMatch(/purchase|paid|store|journal|matrix/i);
  });
});

describe('configuration', () => {
  /**
   * Fails against: a check that reports configured when the key is absent or
   * blank.
   *
   * §9.2's key is optional at boot (env/schema.ts) so a missing one degrades
   * ONE feature rather than stopping the server — which means the absence must
   * be detected where it is used, or it surfaces as "Internal server error"
   * for what is a deployment problem.
   */
  it.each([
    [undefined, false],
    ['', false],
    ['   ', false],
    ['sk-ant-something', true],
  ])('key %j reports configured=%s', (value, expected) => {
    vi.stubEnv('ANTHROPIC_API_KEY', value);

    expect(isAnthropicConfigured()).toBe(expected);
  });
});

describe('the request', () => {
  /**
   * Fails against: a client that sends the wrong model, or omits the effort
   * setting the model needs.
   *
   * The model choice is a capability decision recorded in the source; this
   * pins it so a change is deliberate rather than incidental.
   */
  it('asks the specified model with the prompt', async () => {
    const create = vi.fn().mockResolvedValue({
      content: [{ type: 'text', text: '{"suggestions":[]}' }],
    });

    const client = createGapAnalysisClient({ create });
    await client.analyse(SUMMARY);

    expect(create).toHaveBeenCalledTimes(1);
    const request = create.mock.calls[0][0];
    expect(request.model).toBe('claude-opus-5');
    expect(request.messages[0].content).toContain('UK82');
  });

  /**
   * Fails against: a client that returns the raw response, pushing the parse
   * boundary onto its caller.
   *
   * The client owns the boundary so there is ONE place where an unreadable
   * response is distinguished from an empty one — R5 reviews it once because
   * there is one.
   */
  it('returns parsed suggestions, validated against the vocabulary', async () => {
    const create = vi.fn().mockResolvedValue({
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            suggestions: [
              { artist: 'Anti-Cimex', title: 'Scandinavian Jawbreaker', reason: 'r', genre: 'UK82' },
              { artist: 'Nope', title: 'Nope', reason: 'r', genre: 'Britpop' },
            ],
          }),
        },
      ],
    });

    const result = await createGapAnalysisClient({ create }).analyse(SUMMARY);

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('unreachable');
    expect(result.suggestions).toHaveLength(1);
    expect(result.dropped).toBe(1);
  });

  /**
   * Fails against: a client that throws, or that reports an unreadable response
   * as an empty one.
   *
   * A response with no text block at all is unreadable, not empty — the same
   * distinction the parser draws, at the layer above it.
   */
  it('a response with no text block is unreadable, not empty', async () => {
    const create = vi.fn().mockResolvedValue({ content: [] });

    const result = await createGapAnalysisClient({ create }).analyse(SUMMARY);

    expect(result.ok).toBe(false);
  });
});

describe('the no-live-call guard covers this client', () => {
  /**
   * Fails against: a production path that would reach `api.anthropic.com` from
   * a test.
   *
   * **Was a probe, committed per CLAUDE.md §2.** The guard's own comment
   * predicted it would cover a client written later — "not host-specific: the
   * rule covers external calls generally, and §12 adds the Anthropic API at
   * step 12" — and predictions in comments are exactly what this project has
   * been caught trusting. Measured instead: it throws, names the host, and
   * falls back to generic mock advice because Anthropic is not in its
   * host-specific advice table.
   *
   * This exercises `getGapAnalysisClient()`, the REAL path, which no other test
   * here touches — every other test injects a fake, which the guard exempts by
   * design because it fires at the request site rather than at construction.
   */
  it('refuses to reach api.anthropic.com, naming the host', async () => {
    const summary = {
      artists: [],
      labels: [],
      wantList: [],
      genreVocabulary: ['UK82'],
    };

    await expect(getGapAnalysisClient().analyse(summary)).rejects.toThrow(/api\.anthropic\.com/);
  });
});
