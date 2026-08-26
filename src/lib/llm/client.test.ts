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
    { name: 'Discharge', recordCount: 4, genres: ['UK82', 'D-beat'], titles: ['Hear Nothing See Nothing Say Nothing', 'Why'] },
    { name: 'Black Flag', recordCount: 2, genres: ['US Hardcore'], titles: ['Damaged'] },
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
   * **A37 (2026-08-26): the prompt asks for a bounded number of suggestions.**
   *
   * Measured, not assumed. A real gap analysis over 17 records was truncated:
   * `stop_reason=max_tokens out_tokens=4000 max_tokens=4000`, the ceiling hit
   * exactly, with input only 1,533 tokens — so the pressure is entirely on
   * output and a count fixes it at any collection size where raising the
   * ceiling would not.
   *
   * Fails against a prompt with no count, which is what produced 34 suggestions
   * on R5's smaller collection and the truncation on this one.
   */
  it('asks for a bounded number of suggestions', () => {
    const prompt = buildPrompt(SUMMARY);

    expect(prompt).toMatch(/\bsix\b|\b6\b/i);
    expect(prompt).toMatch(/suggestion/i);
  });

  /**
   * The count must be stated as a LIMIT rather than a target, so a collection
   * with fewer real gaps than six is not padded to reach it. Inventing two
   * weak suggestions to fill a quota is the same failure as the fabricated
   * weight: output that looks considered and was produced to fill a slot.
   */
  it('states the count as a maximum, not a quota to fill', () => {
    const prompt = buildPrompt(SUMMARY);

    expect(prompt).toMatch(/at most|no more than|up to|fewer/i);
  });

  /**
   * **A29g's cost, addressed as copy rather than as a spec change** (Adam,
   * 2026-08-26, after reading a real suggestion).
   *
   * A29g asks the model to disclose when it is naming a different record by an
   * owned artist, and that disclosure is correct and stays. But the reason it
   * produced read as an APOLOGY — "a different record by an artist they own" —
   * when the same fact is the strongest argument for the suggestion: you
   * collect this artist and this record is missing.
   *
   * So the prompt now asks for the reason to be phrased as the POINT. Fails
   * against reverting to a bare "say so" instruction, which is what produced
   * the apologetic phrasing.
   *
   * **What this test canNOT check** is whether the next real gap analysis
   * actually reads that way — that is judgeable only by running one against a
   * real collection. It pins the instruction, not the output.
   */
  /**
   * **A29g's defect, found by Adam on a real run and fixed here (2026-08-26).**
   *
   * The prompt's example sentence used to be `"You own Miles Davis but not this
   * one"`, and the model reproduced its form faithfully — producing *"You own
   * one Miles Davis but not the record that founded the Fusion lineage"* about
   * a record he owns.
   *
   * **"but not X" asserts non-ownership of a specific record, and the payload
   * cannot support that**: owned artists are sent as a name, a count and
   * genres, with no titles (A29g). The old wording — "a different record by an
   * artist they own" — was true BY CONSTRUCTION; the example replaced it with
   * the first falsifiable claim in that sentence.
   *
   * **This test pins TRUTHFULNESS where the one below pins tone.** A tone test
   * cannot catch a truth defect, which is exactly why the defect shipped.
   *
   * Fails against any example or instruction telling the model to say what is
   * NOT owned.
   */
  it('never invites a claim about which records are missing', () => {
    const prompt = buildPrompt(SUMMARY);

    /*
     * Checked on the EXAMPLE SENTENCE rather than the whole prompt, because the
     * prohibition necessarily quotes the phrase it forbids — naming the exact
     * shape is what makes a rule concrete for a model, and a test that banned
     * the string outright would forbid explaining the rule. Same shape as the
     * `.env.test` comment that tripped its own credential guard (A39).
     *
     * The example is what the model imitates, so the example is what must be
     * clean. Fails against restoring "You own Miles Davis but not this one".
     */
    const example = prompt.match(/"[^"]*is the/)?.[0] ?? '';

    expect(example, 'the sentence the model copies must assert nothing unowned').not.toMatch(
      /but not/i,
    );
    expect(example).toMatch(/you own/i);
  });

  /**
   * And says so as a RULE, not merely by omission — "make ownership the reason"
   * otherwise reads as licence to reason about what is absent.
   *
   * **Rewritten at A41 (2026-08-26), because its premise stopped being true.**
   * It asserted the prompt tells the model it CANNOT KNOW which records are
   * owned — accurate while titles were withheld, and false once A41 sends them.
   * A test whose premise the contract has overturned must change with the
   * contract, and the reasoning belongs here rather than in a commit message.
   *
   * **What survives is the behaviour, not the justification.** The model still
   * must not tell the user which records they lack: the list is what they own,
   * not an inventory of what they have heard or once owned, so an absence there
   * is not a fact about their shelves. Fails against dropping that instruction.
   */
  it('tells the model not to claim which records are missing', () => {
    const prompt = buildPrompt(SUMMARY);

    expect(prompt).toMatch(/do not tell them which records they lack/i);
    // And says WHY, so the rule is followable rather than arbitrary.
    expect(prompt).toMatch(/not everything they have heard|not a fact about their shelves/i);
  });

  /**
   * **A41: the ownership rule is now stated at RECORD level**, because the
   * payload can support it. Fails against leaving A29g's artist-level wording
   * in place after titles started being sent — the mismatch that produced the
   * duplicate suggestion.
   */
  it('forbids recommending a record the collection already contains', () => {
    /*
     * Newlines collapsed before matching: the prompt is assembled from an array
     * of lines, so a rule that reads as one sentence to the model spans two
     * entries here. Asserting the source's line breaks would pin formatting
     * rather than content.
     */
    const flat = buildPrompt(SUMMARY).replace(/\s+/g, ' ');

    expect(flat).toMatch(/listed with the records they own/i);
    expect(flat).toMatch(/do not recommend a record that appears there/i);
  });

  /**
   * And the titles are actually rendered — the rule is worthless if the data it
   * refers to never reaches the prompt. Fails against a builder that carries
   * titles and a renderer that drops them.
   */
  it('renders the owned titles it tells the model to check against', () => {
    const prompt = buildPrompt(SUMMARY);

    expect(prompt).toContain('Hear Nothing See Nothing Say Nothing');
    expect(prompt).toContain('Damaged');
  });

  it('asks for the owned-artist disclosure to read as a reason, not an admission', () => {
    const prompt = buildPrompt(SUMMARY);

    expect(prompt).toMatch(/reason to want it|why it belongs|the point|makes the case/i);
    /*
     * The example phrasing is what makes the instruction concrete. Updated
     * 2026-08-26: it used to assert "own … but not this one", which was the
     * defect — the example now leads with what IS owned and spends the rest on
     * why the record matters.
     */
    expect(prompt).toMatch(/you own [^"]*, and this is/i);
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
      artists: [{ name: 'SENTINEL-ARTIST', recordCount: 1, genres: [], titles: [] }],
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
    { name: 'Discharge', recordCount: 4, genres: ['UK82'], titles: ['Why'] },
    { name: 'Minor Threat', recordCount: 3, genres: ['US Hardcore'], titles: ['Out of Step'] },
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

/**
 * SPEC.md §4.3 (A38) — usage survives the CLIENT, on success as well as failure.
 *
 * **Written after a mutation exposed a hollow test.** The first version of this
 * assertion lived in the route's integration tests, which mock `analyse`
 * directly — so it never executed the ternary in `client.ts` that drops usage,
 * and restoring the defective line left all 15 route tests green. The
 * assertion has to sit where the code under test actually runs, which is here,
 * driving `analyse` through a fake transport.
 *
 * CLAUDE.md §2: "For every test, name the line of source it would fail
 * against." This one fails against `analyse`'s return statement.
 */
describe('what the call cost survives the client', () => {
  const respond = (body: unknown, extra: Record<string, unknown> = {}) =>
    vi.fn().mockResolvedValue({
      content: [{ type: 'text', text: JSON.stringify(body) }],
      ...extra,
    });

  /**
   * **The defect A38 fixes, pinned at its source.** Fails against
   * `return parsed.ok ? parsed : { ...parsed, ...observed }` — the shipped line
   * that recorded nothing for a completed run and left the headroom estimate
   * with no baseline.
   */
  it('carries stop_reason and tokens on a SUCCESSFUL parse', async () => {
    const create = respond(
      { suggestions: [{ artist: 'Crass', title: 'Feeding', reason: 'r', genre: 'UK82' }] },
      { stop_reason: 'end_turn', usage: { input_tokens: 1533, output_tokens: 530 } },
    );

    const result = await createGapAnalysisClient({ create }).analyse(SUMMARY);

    expect(result.ok).toBe(true);
    expect(result.stopReason).toBe('end_turn');
    expect(result.outputTokens, 'the baseline a completed run must record').toBe(530);
    expect(result.inputTokens).toBe(1533);
  });

  /** And on a failure, which already worked — asserted so it cannot regress. */
  it('carries stop_reason and tokens on a TRUNCATED response', async () => {
    const create = vi.fn().mockResolvedValue({
      content: [{ type: 'text', text: '{"suggestions":[{"artist":"Cra' }],
      stop_reason: 'max_tokens',
      usage: { input_tokens: 1533, output_tokens: 4000 },
    });

    const result = await createGapAnalysisClient({ create }).analyse(SUMMARY);

    expect(result.ok).toBe(false);
    expect(result.stopReason).toBe('max_tokens');
    expect(result.outputTokens).toBe(4000);
  });

  /**
   * NULL is "not measured", never zero — a transport that reports no usage must
   * not have zeros invented for it.
   */
  it('reports null rather than zero when the transport omits usage', async () => {
    const create = respond({ suggestions: [] });

    const result = await createGapAnalysisClient({ create }).analyse(SUMMARY);

    expect(result.outputTokens).toBeNull();
    expect(result.stopReason).toBeNull();
  });
});
