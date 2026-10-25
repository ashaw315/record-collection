import Anthropic from '@anthropic-ai/sdk';
import { describe, expect, it, vi } from 'vitest';
import { MOODS } from '@/lib/moods/moods';
import { buildMoodPrompt, createMoodTagger, MOOD_TAGGER_MODEL } from './mood-tagger-client';

/**
 * SPEC.md §7.12 (A76): the tagger, which owns the call. Whether a reply is a
 * legal mood set is `tagging.ts`'s to decide; this file proves the call
 * reports what came back, and why nothing did.
 */

const RECORD = { id: 'r1', artist: 'Miles Davis', title: 'Kind of Blue' };

const respond = (text: string | undefined, extra: Record<string, unknown> = {}) =>
  vi.fn().mockResolvedValue({
    content: text === undefined ? [] : [{ type: 'text', text }],
    stop_reason: 'end_turn',
    usage: { input_tokens: 300, output_tokens: 40 },
    ...extra,
  });

describe('the prompt', () => {
  it('offers every mood on the list, by its own spelling', () => {
    const prompt = buildMoodPrompt(RECORD);

    for (const mood of MOODS) expect(prompt).toContain(`- ${mood}\n`);
  });

  /**
   * No year, by decision (24 Oct): on a quarter of the collection the year
   * held is the pressing's (Gaucho 1987, Wowee Zowee 2016), and a mood does
   * not depend on it, so it could only mislead.
   */
  it('names the record by artist and title, and never its year', () => {
    const prompt = buildMoodPrompt(RECORD);

    expect(prompt).toContain('THE RECORD: Miles Davis — Kind of Blue\n');
    expect(prompt).not.toMatch(/\b(19|20)\d\d\b/);
  });

  /**
   * §7.12: a flat count is the failure the run refuses, so the prompt must not
   * ask for one, and it leans neither way. Run 1's "most records suit two to
   * four" made the model pad; run 2's "prefer fewer" made it prune honest
   * moods, "sleepy" going from three records to none (24 Oct). Run 3 keeps
   * only the instruction not to pad.
   */
  it('names no number and leans toward neither more moods nor fewer', () => {
    const prompt = buildMoodPrompt(RECORD);

    expect(prompt).toMatch(/never pad/i);
    expect(prompt).not.toMatch(/two to four/i);
    expect(prompt).not.toMatch(/fewer|prefer/i);
  });

  /** On 15 of 22 records in the first run, "zone out" picked out almost nothing. */
  it('defines zone out as a record you disappear into, not one that is merely atmospheric', () => {
    const prompt = buildMoodPrompt(RECORD);

    expect(prompt).toMatch(/zone out.*disappear into/i);
    expect(prompt).toMatch(/merely atmospheric/i);
  });
});

describe('the call', () => {
  /** §7.12's larger model, and what `tagged_by_model` records. */
  it('asks Opus 5.5, and reports that as its model', async () => {
    const create = respond('{"moods":["smooth"]}');
    const tagger = createMoodTagger({ create });

    await tagger.tag(RECORD);

    expect(MOOD_TAGGER_MODEL).toBe('claude-opus-5-5');
    expect(tagger.model).toBe(MOOD_TAGGER_MODEL);
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ model: MOOD_TAGGER_MODEL }));
  });

  it('states its reasoning effort, because the type requires it', async () => {
    const create = respond('{"moods":["smooth"]}');

    await createMoodTagger({ create }).tag(RECORD);

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ output_config: { effort: expect.any(String) } }),
    );
  });

  it('hands back the parsed reply, fenced or not', async () => {
    const plain = await createMoodTagger({ create: respond('{"moods":["smooth","zone out"]}') }).tag(RECORD);
    const fenced = await createMoodTagger({ create: respond('```json\n{"moods":["sleepy"]}\n```') }).tag(RECORD);

    expect(plain).toEqual({ ok: true, payload: { moods: ['smooth', 'zone out'] } });
    expect(fenced).toEqual({ ok: true, payload: { moods: ['sleepy'] } });
  });

  it('reports a reply cut at the ceiling as cut, not as what it held', async () => {
    const create = respond('{"moods":["smooth"]}', { stop_reason: 'max_tokens' });

    expect(await createMoodTagger({ create }).tag(RECORD)).toEqual({ ok: false, reason: 'cut' });
  });

  /**
   * No fallback is asked for, so a refusal stops here and the record is
   * named. A fallback's answer stored under this model's name would make
   * `tagged_by_model` lie.
   */
  it('reports a refusal as refused', async () => {
    const create = respond(undefined, { stop_reason: 'refusal' });

    expect(await createMoodTagger({ create }).tag(RECORD)).toEqual({ ok: false, reason: 'refused' });
  });

  it('reports no text, and text that is not JSON, as unreadable', async () => {
    expect(await createMoodTagger({ create: respond(undefined) }).tag(RECORD)).toEqual({ ok: false, reason: 'unreadable' });
    expect(await createMoodTagger({ create: respond('smooth, mostly') }).tag(RECORD)).toEqual({ ok: false, reason: 'unreadable' });
  });

  /** One failed call is one record with no mood, not a run that stops. */
  it('reports an API error as failed, by status or class, never by message', async () => {
    const offline = vi.fn().mockRejectedValue(new Anthropic.APIConnectionError({ message: 'detail with a secret' }));
    const limited = vi.fn().mockRejectedValue(new Anthropic.RateLimitError(429, undefined, 'detail', new Headers()));

    expect(await createMoodTagger({ create: offline }).tag(RECORD)).toEqual({ ok: false, reason: 'call failed: APIConnectionError' });
    expect(await createMoodTagger({ create: limited }).tag(RECORD)).toEqual({ ok: false, reason: 'call failed: 429' });
  });

  /** Anything else is a fault in this code, not a record the model could not answer, and stops the run. */
  it('lets any other error through', async () => {
    const create = vi.fn().mockRejectedValue(new TypeError('a bug'));

    await expect(createMoodTagger({ create }).tag(RECORD)).rejects.toThrow('a bug');
  });
});

/**
 * CLAUDE.md §2 and SPEC.md §11: every test above injects a fake, so none
 * says anything about the real path. This one does.
 */
describe('the real tagger cannot reach Anthropic from a test', () => {
  it('refuses to reach api.anthropic.com, naming the host', async () => {
    const { getMoodTagger } = await import('./mood-tagger-client');

    await expect(getMoodTagger().tag(RECORD)).rejects.toThrow(/api\.anthropic\.com/);
  });
});
