import { describe, expect, it, vi } from 'vitest';
import { buildGenreParentPrompt, createGenreParentClient } from './genre-parent-client';

/**
 * SPEC.md §12c (A44) — proposing a genre hierarchy the user confirms.
 *
 * **This is the THIRD LLM caller, and it is the proof of the transport work.**
 * A38's diagnostics and A37's bound were fixed at the call site during
 * incidents; `callAnthropic` was built so a third caller inherits them by
 * construction rather than by being remembered. If this file had to remember
 * anything, the layer rule failed its own test.
 */

const GENRES = [
  { name: 'Rock', recordCount: 10, examples: ['Dire Straits — Dire Straits'] },
  { name: 'UK82', recordCount: 1, examples: ['Discharge — Grave New World'] },
  { name: 'Punk', recordCount: 0, examples: [] },
  { name: 'US Hardcore', recordCount: 0, examples: [] },
];

describe('the prompt', () => {
  /**
   * **§8: the vocabulary is the user's.** A model proposing "Post-Punk" adds a
   * term the user never chose — taxonomy authorship rather than structuring.
   *
   * Fails against a prompt that permits inventing a parent.
   */
  it('forbids proposing a parent that is not already a genre', () => {
    const prompt = buildGenreParentPrompt(GENRES);

    expect(prompt).toMatch(/only.*(genres|names) (listed|above)|must already exist/i);
    expect(prompt).toMatch(/do not invent|never invent|do not create/i);
  });

  /**
   * **A constraint that cannot express its own edge case turns silence into a
   * lie** (Adam). Told to use existing names only, a model facing a genre
   * nothing parents must either propose something wrong or say nothing — and
   * saying nothing is indistinguishable from having no opinion.
   *
   * Fails against a prompt with no way to report a missing parent.
   */
  it('lets the model say no existing genre fits, rather than forcing a bad fit', () => {
    const prompt = buildGenreParentPrompt(GENRES);

    expect(prompt).toMatch(/no existing genre fits|none of the genres above/i);
  });

  /**
   * The records are what distinguish a general music fact from a fact about
   * THIS shelf. Measured: `Rock` carries 10 records across 10 artists, which
   * only the examples reveal.
   */
  it('sends each genre with its record count and examples', () => {
    const prompt = buildGenreParentPrompt(GENRES);

    expect(prompt).toContain('Discharge — Grave New World');
    expect(prompt).toMatch(/Rock.*10/);
  });

  /**
   * **A genre with no records is not omitted.** `Punk` and `US Hardcore` carry
   * zero and exist BECAUSE the user created them as intended parents — they are
   * the parents the tree needs, and dropping them for lack of evidence would
   * remove the answer.
   */
  it('includes genres carrying no records, because those are the intended parents', () => {
    const prompt = buildGenreParentPrompt(GENRES);

    expect(prompt).toContain('Punk');
    expect(prompt).toContain('US Hardcore');
  });

  /**
   * **The app must not ask the model to grade itself** (Adam). A count is a
   * fact the user weighs; a confidence score is the app judging its own output.
   *
   * Fails against a prompt requesting certainty, confidence or a rating.
   */
  it('never asks the model to rate its own confidence', () => {
    const prompt = buildGenreParentPrompt(GENRES);

    expect(prompt).not.toMatch(/confidence|how (sure|certain)|score|rate (your|each)/i);
  });
});

describe('the client is the transport work proving itself', () => {
  const respond = (body: unknown, extra: Record<string, unknown> = {}) =>
    vi.fn().mockResolvedValue({
      content: [{ type: 'text', text: JSON.stringify(body) }],
      stop_reason: 'end_turn',
      usage: { input_tokens: 400, output_tokens: 120 },
      ...extra,
    });

  /**
   * **The assertion this whole unit exists to make.** A38's diagnostics were
   * written into the gap-analysis path during an incident and the snippet
   * shipped without them. This caller never calls `observeUsage` — it gets
   * usage because `callAnthropic` returns it.
   *
   * Fails against a client that calls `transport.create` directly.
   */
  it('carries stop_reason and tokens without being asked to', async () => {
    const create = respond({ pairings: [{ genre: 'UK82', parent: 'Punk' }] });

    const result = await createGenreParentClient({ create }).propose(GENRES);

    expect(result.ok).toBe(true);
    expect(result.stopReason).toBe('end_turn');
    expect(result.outputTokens).toBe(120);
  });

  /** A37's bound, inherited: effort is required by the type, so it is stated. */
  it('states its reasoning effort, because the type requires it', async () => {
    const create = respond({ pairings: [] });

    await createGenreParentClient({ create }).propose(GENRES);

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ output_config: expect.objectContaining({ effort: expect.any(String) }) }),
    );
  });

  /**
   * A truncated tree is a partial taxonomy, and accepting one would nest some
   * genres and silently leave others — worse than proposing nothing.
   */
  it('refuses a response that ran out of room', async () => {
    const create = vi.fn().mockResolvedValue({
      content: [{ type: 'text', text: '{"pairings":[{"genre":"UK8' }],
      stop_reason: 'max_tokens',
      usage: { input_tokens: 400, output_tokens: 800 },
    });

    const result = await createGenreParentClient({ create }).propose(GENRES);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('cut');
  });
});

describe('what comes back is constrained to the user vocabulary', () => {
  const respond = (body: unknown) =>
    vi.fn().mockResolvedValue({
      content: [{ type: 'text', text: JSON.stringify(body) }],
      stop_reason: 'end_turn',
      usage: { input_tokens: 400, output_tokens: 120 },
    });

  /**
   * **The prompt asks; the parser ENFORCES.** A29d's lesson: an instruction is
   * not a verification. A parent the user does not have is dropped, whatever
   * the prompt said.
   *
   * Fails against a client that trusts the model's output.
   */
  it('drops a pairing naming a parent the user does not have', async () => {
    const create = respond({
      pairings: [
        { genre: 'UK82', parent: 'Punk' },
        { genre: 'UK82', parent: 'Post-Punk' },
      ],
    });

    const result = await createGenreParentClient({ create }).propose(GENRES);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.pairings).toHaveLength(1);
    expect(result.dropped).toBe(1);
  });

  /** And a CHILD that is not the user's genre either. */
  it('drops a pairing naming a child the user does not have', async () => {
    const create = respond({ pairings: [{ genre: 'Shoegaze', parent: 'Rock' }] });

    const result = await createGenreParentClient({ create }).propose(GENRES);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.pairings).toHaveLength(0);
    expect(result.dropped).toBe(1);
  });

  /** A genre cannot parent itself — §4.1's rule, enforced before it reaches a user. */
  it('drops a self-parenting pairing', async () => {
    const create = respond({ pairings: [{ genre: 'Rock', parent: 'Rock' }] });

    const result = await createGenreParentClient({ create }).propose(GENRES);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.pairings).toHaveLength(0);
  });

  /**
   * **"No existing genre fits" is a RESULT, carried as one** — not an absence.
   * Same shape as A43's "any copy is fine": a constraint that cannot express
   * its edge case turns silence into a lie.
   */
  it('carries an explicit "no parent fits" answer distinctly from silence', async () => {
    const create = respond({
      pairings: [{ genre: 'UK82', parent: 'Punk' }],
      // A genre from THIS fixture: naming one the user does not have would be
      // dropped as unknown, which is correct and would test the wrong thing.
      noParentFits: ['Rock'],
    });

    const result = await createGenreParentClient({ create }).propose(GENRES);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.noParentFits).toEqual(['Rock']);
  });
});

/**
 * CLAUDE.md §2: **no test may make a live external call.**
 *
 * Every other LLM client here carries this test, and the third caller needs it
 * for the same reason: `assertNoLiveCall` fires at the REQUEST SITE, so every
 * test above — which injects a fake — is exempt by design and proves nothing
 * about the real path. **`getGenreParentClient()` is the only path that could
 * reach Anthropic, and it is the one no other test touches.**
 *
 * The guard's own comment predicted it would cover clients written later. This
 * project has been caught trusting predictions in comments, so it is measured.
 */
describe('the real client cannot reach Anthropic from a test', () => {
  it('refuses to reach api.anthropic.com, naming the host', async () => {
    const { getGenreParentClient } = await import('./genre-parent-client');

    await expect(
      getGenreParentClient().propose([{ name: 'UK82', recordCount: 1, examples: [] }]),
    ).rejects.toThrow(/api\.anthropic\.com/);
  });
});
