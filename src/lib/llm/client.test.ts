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
  genres: [
    { name: 'Punk', parent: null },
    { name: 'UK82', parent: 'Punk' },
    { name: 'D-beat', parent: 'UK82' },
    { name: 'US Hardcore', parent: 'Punk' },
  ],
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
   * Fails against: a prompt forbidding recommendation of anything by an owned
   * ARTIST, or asserting a record-level rule the payload cannot support.
   *
   * **R5's finding 3, decided at the artist level.** §9.2 said "do not recommend
   * anything they already own" without saying whether "anything" meant the
   * artist or the record — and the payload settles it: the artists section
   * carries `a.name`, a count and genre names, and **no record titles at all**.
   * A record-level rule is unenforceable by construction, so a prompt asserting
   * one asks the model to honour a constraint neither side can check.
   *
   * The live run made the case concrete. It suggested Dire Straits — *Brothers
   * in Arms* with the reason "The collector already owns Dire Straits", which is
   * a GOOD suggestion, not a defect: a different record by an artist you collect
   * is exactly the gap this feature exists to name.
   *
   * So the prompt now says a different record by an owned artist is welcome, and
   * reserves the prohibition for the case the payload CAN express.
   */
  it('welcomes a different record by an artist already owned', () => {
    const prompt = buildPrompt(SUMMARY);

    expect(prompt).toMatch(/different record|another record|record by an artist they (already )?own/i);
    // And it must not forbid the artist wholesale.
    expect(prompt).not.toMatch(/do not recommend .*by (an )?artists? they/i);
  });

  /**
   * Fails against: dropping the want-list prohibition along with the owned one.
   *
   * **The asymmetry is the point.** The want list carries `artist` AND `title`
   * (`collection-summary.ts`), so "already on their want list" IS checkable from
   * the payload at record level — the model is given both halves. Only the owned
   * side lacks titles, so only that side loosens.
   */
  it('still forbids recommending something already on the want list', () => {
    const prompt = buildPrompt(SUMMARY);

    expect(prompt).toMatch(/want list/i);
    expect(prompt).toContain('Raped Ass');
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
      genres: [{ name: 'UK82', parent: null }],
    };

    await expect(getGapAnalysisClient().analyse(summary)).rejects.toThrow(/api\.anthropic\.com/);
  });
});

/**
 * R5's F1, first part: **`isAnthropicConfigured` must mean more than
 * non-empty.**
 *
 * The live run failed because `.env.local` held a PLACEHOLDER — 160 characters,
 * beginning `sk-ant-` and ending `-put-your-key-here`. Every existing check
 * passed it: non-empty, trimmed, present. The app then claimed a rate-limit
 * slot and sent the collection summary to an API that rejected the credential.
 *
 * A predicate cannot verify a key without spending a call, and it must not try.
 * What it CAN do is reject the shapes that are definitionally not credentials —
 * which is what the placeholder was.
 */
describe('configuration rejects a placeholder, not only an absence', () => {
  /**
   * Fails against: `(process.env.ANTHROPIC_API_KEY ?? '').trim() !== ''`.
   *
   * The exact value that broke the live run, reconstructed from its measured
   * shape. `sk-ant-` prefix, plausible length, and a tail that says it was never
   * filled in.
   */
  it.each([
    ['sk-ant-api03-xxxxxxxxxxxxxxxxxxxxxxxx-put-your-key-here'],
    ['sk-ant-api03-replace-me'],
    ['your-api-key-here'],
    ['sk-ant-YOUR_KEY_HERE'],
    ['<your-anthropic-api-key>'],
  ])('rejects the placeholder %j', (value) => {
    vi.stubEnv('ANTHROPIC_API_KEY', value);

    expect(isAnthropicConfigured()).toBe(false);
  });

  /**
   * Fails against: a check so eager it rejects real keys.
   *
   * **The inverse, and it is the one that matters most.** A predicate that
   * refuses a valid credential turns a working deployment into a dead feature,
   * which is worse than the bug being fixed. Shaped like the key that actually
   * worked in the live run: `sk-ant-` prefix, 108 characters, opaque tail.
   */
  it.each([
    ['sk-ant-api03-' + 'A1b2C3d4E5f6G7h8'.repeat(5) + 'wXyZ3wAA'],
    ['sk-ant-api03-Zm9vYmFyYmF6cXV1eA0987654321AbCdEfGhIjKlMnOpQrStUvWxYz3wAA'],
  ])('accepts a real-shaped key', (value) => {
    vi.stubEnv('ANTHROPIC_API_KEY', value);

    expect(isAnthropicConfigured()).toBe(true);
  });
});

/**
 * R5's F2: **A29d claimed the prompt supplies the genre hierarchy, and it sent
 * a flat comma list.**
 *
 * `Punk, UK82, US Hardcore, Rock` tells the model nothing about which term is a
 * parent, while the very next paragraph instructs it not to flatten a scene into
 * a parent term. The instruction named a relationship the payload did not carry.
 */
const HIERARCHY: CollectionSummary = {
  artists: [
    { name: 'Discharge', recordCount: 4, genres: ['UK82'] },
    { name: 'Minor Threat', recordCount: 3, genres: ['US Hardcore'] },
  ],
  labels: [],
  wantList: [],
  genreVocabulary: ['Punk', 'UK82', 'US Hardcore', 'Rock'],
  genres: [
    { name: 'Punk', parent: null },
    { name: 'UK82', parent: 'Punk' },
    { name: 'US Hardcore', parent: 'Punk' },
    { name: 'Rock', parent: null },
  ],
};

describe('the prompt supplies the hierarchy A29d claims it does', () => {
  /**
   * Fails against: `summary.genreVocabulary.join(', ')`.
   *
   * The relationship must be legible, not merely the names. A model told
   * "UK82 (a kind of Punk)" can obey "do not flatten a scene into a parent
   * term"; a model given a comma list cannot know which of the four is the
   * parent it must avoid.
   */
  it('shows which genres are children of which', () => {
    const prompt = buildPrompt(HIERARCHY);

    expect(prompt).toMatch(/UK82[^\n]*Punk/);
    expect(prompt).toMatch(/US Hardcore[^\n]*Punk/);
  });

  /**
   * Fails against: a prompt that drops parents once it renders a tree.
   *
   * **`Punk` MUST remain offerable.** A collection that legitimately tags
   * records at a parent has to be able to receive `Punk` as an answer, and
   * A29d's validation reads the same vocabulary. Removing parents is the
   * plausible wrong fix sitting next to the right one — it would turn a correct
   * suggestion into a dropped one for any collection organised at the top level.
   */
  it('still offers every genre name, parents included', () => {
    const prompt = buildPrompt(HIERARCHY);

    for (const name of HIERARCHY.genreVocabulary) {
      expect(prompt).toContain(name);
    }
  });

  /**
   * Fails against: a prompt that names a parent but not its own depth.
   *
   * A grandchild must read as a child of its PARENT, not of the root, or the
   * prompt describes a tree the user does not have.
   */
  it('renders depth beyond two levels', () => {
    const prompt = buildPrompt({
      ...HIERARCHY,
      genreVocabulary: ['Punk', 'Hardcore', 'Powerviolence'],
      genres: [
        { name: 'Punk', parent: null },
        { name: 'Hardcore', parent: 'Punk' },
        { name: 'Powerviolence', parent: 'Hardcore' },
      ],
    });

    expect(prompt).toMatch(/Powerviolence[^\n]*Hardcore/);
  });

  /**
   * Fails against: a prompt that breaks when nothing has a parent.
   *
   * **The common case, and it must not become noisier.** Most collections are
   * flat — dev's was, before R5 built a hierarchy for the review. A flat list
   * should still read as a plain list rather than as a tree with every node at
   * the root.
   */
  it('reads plainly when the collection is flat', () => {
    const prompt = buildPrompt({
      ...HIERARCHY,
      genreVocabulary: ['AOR', 'Rock'],
      genres: [
        { name: 'AOR', parent: null },
        { name: 'Rock', parent: null },
      ],
    });

    expect(prompt).toContain('AOR');
    expect(prompt).toContain('Rock');
    // No parenthetical relationship where there is no relationship.
    expect(prompt).not.toMatch(/AOR[^\n]*a kind of/);
  });
});
