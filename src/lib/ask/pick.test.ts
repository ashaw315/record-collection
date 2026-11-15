import { afterEach, describe, expect, it, vi } from 'vitest';
import { askPick, PICK_SCHEMA, pickRequest, readPick, type PickRecordText } from './pick';

/**
 * **Step 3, unit 1: the model pick, server side (§P.2's "the model pick, minimum"; the coordinator, 13 and 14 Nov).**
 * One request carries the phrase and every eligible record's text. The model answers up to five with a reason each,
 * one stand-in flagged as nothing fits or a requirement unmet, or that the run has named everything that fits. Code
 * then checks what structured output cannot: each id is in the pool and not already named, and each claim a reason
 * cites is in that record's text.
 *
 * **These tests stub the model's reply.** A green line here says our code draws what a reply holds and checks it; it
 * does not say the real model returns three when three fit or none when nothing does. That is measured on Adam's run,
 * not here, and the names below say so where it matters.
 */
const POOL: PickRecordText[] = [
  { id: 'a1', text: 'Solo piano, slow and sparse, recorded close in a quiet room. Side two turns darker.' },
  { id: 'b2', text: 'Loud, fast hardcore punk, thin and trebly, every song under two minutes.' },
  { id: 'c3', text: 'Warm country croon over pedal steel and brushed drums, short and unhurried.' },
  { id: 'd4', text: 'Mostly quiet acoustic guitar and voice, with two abrasive electric tracks on side one.' },
  { id: 'e5', text: 'Big-band swing at dance tempos, strings and reeds layered thick.' },
  { id: 'f6', text: 'Long modal jazz sides, a chant building to a storm and settling.' },
];

/** A Responses API reply as the guide shapes it: the JSON text in the message item's output_text content. */
const reply = (body: unknown, extra: Record<string, unknown> = {}) => ({
  status: 'completed',
  output: [{ type: 'reasoning', summary: [] }, { type: 'message', content: [{ type: 'output_text', text: JSON.stringify(body) }] }],
  ...extra,
});
const pick = (id: string, claims: string[], reason = 'Slow and close, for a quiet room.') => ({ id, reason, claims });

describe('the request', () => {
  it('carries the phrase, every eligible record’s text once by its id, the run’s named records as excluded, and a strict schema', () => {
    const body = pickRequest('something calm for a rainy morning', POOL, ['b2'], { model: 'gpt-test', effort: 'low' });
    expect(body.model).toBe('gpt-test');
    expect(body.reasoning).toEqual({ effort: 'low' });
    expect(body.text.format).toMatchObject({ type: 'json_schema', strict: true, schema: PICK_SCHEMA });
    const user = body.input.find((m) => m.role === 'user')?.content ?? '';
    expect(user).toContain('something calm for a rainy morning');
    for (const r of POOL) expect(user.split(r.text).length - 1, r.id).toBe(1);
    expect(user).toMatch(/already named[^\n]*b2/i);
  });

  it('tells the model fewer is correct when fewer fit, that nothing fitting is an answer, never to pad, and to keep caveats', () => {
    const system = pickRequest('x', POOL, [], { model: 'm', effort: 'low' }).input.find((m) => m.role === 'system')?.content ?? '';
    expect(system).toMatch(/up to five/i);
    expect(system).toMatch(/fewer/i);
    expect(system).toMatch(/never pad/i);
    expect(system).toMatch(/nothing fits/i);
    expect(system).toMatch(/caveat/i);
  });
});

describe('reading a stubbed reply (our rule, not the model’s obedience)', () => {
  it('draws a stubbed answer of three as three, never padding it toward five', () => {
    const r = readPick(reply({ verdict: 'answer', picks: [pick('a1', ['Solo piano, slow and sparse']), pick('c3', ['short and unhurried']), pick('d4', ['Mostly quiet acoustic guitar and voice'])] }), POOL, []);
    expect(r).toMatchObject({ ok: true, verdict: 'answer' });
    expect(r.ok && r.picks.map((p) => p.id)).toEqual(['a1', 'c3', 'd4']);
  });

  it('draws a stubbed nothing-fits answer as at most one stand-in, flagged, its reason kept', () => {
    const r = readPick(reply({ verdict: 'nothing-fits', picks: [pick('e5', ['Big-band swing'], 'Not calm, but the closest thing to a room full of people.'), pick('f6', ['Long modal jazz sides'])] }), POOL, []);
    expect(r).toMatchObject({ ok: true, verdict: 'nothing-fits' });
    expect(r.ok && r.picks.map((p) => p.id)).toEqual(['e5']);
    expect(r.ok && r.dropped).toEqual([{ id: 'f6', why: 'a stand-in is one record' }]);
  });

  it('draws a stubbed requirement-unmet answer as one stand-in, flagged apart from nothing fits', () => {
    const r = readPick(reply({ verdict: 'requirement-unmet', picks: [pick('a1', ['Solo piano'], 'Asked for no vocals: this has none, but the closest in feel has them.')] }), POOL, []);
    expect(r).toMatchObject({ ok: true, verdict: 'requirement-unmet' });
    expect(r.ok && r.picks.length).toBe(1);
  });

  it('draws a stubbed run’s end as no record', () => {
    expect(readPick(reply({ verdict: 'run-exhausted', picks: [pick('a1', ['Solo piano'])] }), POOL, [])).toMatchObject({ ok: true, verdict: 'run-exhausted', picks: [] });
  });

  it('keeps no more than five, in the order returned', () => {
    const six = POOL.map((r) => pick(r.id, [r.text.split(',')[0]]));
    const r = readPick(reply({ verdict: 'answer', picks: six }), POOL, []);
    expect(r.ok && r.picks.map((p) => p.id)).toEqual(['a1', 'b2', 'c3', 'd4', 'e5']);
  });
});

describe('what code checks that structured output cannot', () => {
  it('drops a pick whose id is not in the pool, is already named, or repeats, and never fills its place', () => {
    const r = readPick(reply({ verdict: 'answer', picks: [pick('zz', ['anything']), pick('b2', ['Loud, fast hardcore punk']), pick('a1', ['Solo piano']), pick('a1', ['Solo piano'])] }), POOL, ['b2']);
    expect(r.ok && r.picks.map((p) => p.id)).toEqual(['a1']);
    expect(r.ok && r.dropped.map((d) => d.why)).toEqual(['not in the pool', 'already named in this run', 'named twice']);
  });

  it('drops a pick citing a claim its record’s text does not hold, matching case and spacing loosely', () => {
    const r = readPick(reply({ verdict: 'answer', picks: [pick('a1', ['solo  PIANO, slow']), pick('c3', ['gentle and soothing'])] }), POOL, []);
    expect(r.ok && r.picks.map((p) => p.id)).toEqual(['a1']);
    expect(r.ok && r.dropped).toEqual([{ id: 'c3', why: 'cites "gentle and soothing", which its text does not hold' }]);
  });

  /* Existence is the weak check (the coordinator, 13 Nov): a cherry-picked clause passes, so the reader is shown the record's stored text beside the reason. Pinned so nobody reads this check as more than it is. */
  it('passes a claim that exists though the reason leans past it: existence is all code can check', () => {
    const r = readPick(reply({ verdict: 'answer', picks: [pick('d4', ['Mostly quiet acoustic guitar'], 'Gentle all the way through.')] }), POOL, []);
    expect(r.ok && r.picks.map((p) => p.id)).toEqual(['d4']);
  });

  it('refuses an answer with no pick left after the checks, rather than answering with nothing', () => {
    expect(readPick(reply({ verdict: 'answer', picks: [pick('zz', ['x'])] }), POOL, [])).toMatchObject({ ok: false, reason: 'no pick survived the checks' });
  });

  it('reads a refusal, a truncated reply and unparseable text as failures that say which', () => {
    expect(readPick({ status: 'completed', output: [{ type: 'message', content: [{ type: 'refusal', refusal: 'no' }] }] }, POOL, [])).toMatchObject({ ok: false, reason: 'the model refused: no' });
    expect(readPick({ status: 'incomplete', incomplete_details: { reason: 'max_output_tokens' }, output: [] }, POOL, [])).toMatchObject({ ok: false, reason: 'the reply was cut off: max_output_tokens' });
    expect(readPick({ status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: 'not json' }] }] }, POOL, [])).toMatchObject({ ok: false, reason: 'the reply was not the pick’s JSON' });
  });
});

describe('the call', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('refuses before any request when the key is absent, naming the variable', async () => {
    vi.stubEnv('OPENAI_API_KEY', '');
    const fetchImpl = vi.fn();
    await expect(askPick('x', POOL, [], { fetchImpl })).rejects.toThrow(/OPENAI_API_KEY is not set/);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('posts to the Responses endpoint with the configured model and reads the reply', async () => {
    vi.stubEnv('OPENAI_API_KEY', 'sk-test');
    vi.stubEnv('ASK_PICK_MODEL', 'gpt-configured');
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify(reply({ verdict: 'answer', picks: [pick('a1', ['Solo piano'])] })), { status: 200 }));
    const r = await askPick('calm', POOL, [], { fetchImpl });
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toMatch(/\/v1\/responses$/);
    expect(JSON.parse(String(init.body)).model).toBe('gpt-configured');
    expect(r).toMatchObject({ ok: true, verdict: 'answer' });
  });
});
