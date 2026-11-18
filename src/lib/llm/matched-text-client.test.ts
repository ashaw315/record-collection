import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildMatchedTextPrompt, createMatchedTextClient, MATCHED_TEXT_MAX_TOKENS, matchedTextTransport, type MatchedTextSubject } from './matched-text-client';
import type { ReleaseFacts } from './about-grounding';

/**
 * **Step 3, unit 4: the matched text, drafted (SPEC §4.6; the coordinator, 13 and 14 Nov).** The text the model pick
 * reads: concrete sound, how a record changes across a side and between sides, written as whole sentences, each marked
 * as resting on the supplied material or inferred from the model's own knowledge, with what is not known left out and
 * listed. The ABOUT is context, never a source of musical claims. The model's reply is stubbed at the transport: these
 * hold the prompt's instructions and the parse, not what the model writes, which Adam's review reads.
 */
const facts: ReleaseFacts = {
  label: 'Columbia', country: 'US', year: 1969, format: 'Vinyl, LP, Album', artistId: 1,
  credits: [{ name: 'Charlie McCoy', role: 'Harmonica' }, { name: 'Pete Drake', role: 'Pedal Steel Guitar' }],
  companies: [], community: null,
  tracks: [{ position: 'A1', title: 'Girl From The North Country' }, { position: 'A2', title: 'Nashville Skyline Rag' }, { position: 'B1', title: 'Lay Lady Lay' }],
};
const subject: MatchedTextSubject = { artist: 'Bob Dylan', title: 'Nashville Skyline', year: 1969, about: 'Melancholy in a warm room, and Dylan sounding happy.' };

const transport = (text: string, stopReason = 'end_turn') => ({
  create: async () => ({ content: [{ type: 'text', text }], stop_reason: stopReason, usage: { input_tokens: 10, output_tokens: 20 } }),
});

describe('the prompt', () => {
  const prompt = buildMatchedTextPrompt(subject, facts);

  it('asks for concrete sound and how it changes across and between sides, never a pile of mood words or an average', () => {
    expect(prompt).toMatch(/instruments/i);
    expect(prompt).toMatch(/pace/i);
    expect(prompt).toMatch(/density/i);
    expect(prompt).toMatch(/dynamics/i);
    expect(prompt).toMatch(/side/i);
    expect(prompt).toMatch(/exception/i);
    expect(prompt).toMatch(/not .*mood adjectives|no pile of mood/i);
  });

  it('says to leave out what is not known rather than write plausible language, and to list it', () => {
    expect(prompt).toMatch(/leave it out/i);
    expect(prompt).toMatch(/never guess/i);
    expect(prompt).toMatch(/"unknown"/);
  });

  /*
    The ABOUT, used and marked honestly (the coordinator, 16 Nov). "Not a source of musical claims" was ignored: the
    model restated the ABOUT as sound and marked it supported, because it sat in the material. The ABOUT is itself
    model-written, the same class as inferred, so it may be used and anything resting on it is inferred; supported
    covers the tracklist, the credits and the format only.
  */
  it('lets the ABOUT be used, marks anything resting on it inferred, and keeps supported to the tracklist, credits and format', () => {
    expect(prompt).toContain(subject.about ?? '');
    expect(prompt).not.toMatch(/not a source of/i);
    expect(prompt).toMatch(/"supported" only where the tracklist, the credits or the format/i);
    expect(prompt).toMatch(/anything resting on the ABOUT[^.]*"inferred"/i);
  });

  it('carries each track’s credits under its position, where the performers are, and says none only where neither kind was supplied', () => {
    const withTracks = buildMatchedTextPrompt(subject, { ...facts, credits: [], trackCredits: [{ position: 'A1', name: 'Charlie McCoy', role: 'Harmonica' }, { position: 'B1', name: 'Pete Drake', role: 'Pedal Steel Guitar' }] });
    expect(withTracks).toContain('A1: Charlie McCoy, Harmonica');
    expect(withTracks).toContain('B1: Pete Drake, Pedal Steel Guitar');
    expect(withTracks).not.toMatch(/Its credits:\nnone supplied/);
  });

  /* The coordinator, 15 Nov: "roughly seven minutes", "a forty-piece orchestra" were inferred, specific enough to be wrong, and the pick's claim check would accept them. Qualitative inference stays; numbers come from the material or not at all. */
  it('forbids a number the material does not give, durations, tempos and sizes among them, and keeps qualitative description', () => {
    expect(prompt).toMatch(/never (write|give|invent) a number/i);
    expect(prompt).toMatch(/duration/i);
    expect(prompt).toMatch(/tempo/i);
    expect(prompt).toMatch(/size/i);
    expect(prompt).toMatch(/mid-tempo|sparse|builds slowly/i);
  });

  /*
    Length (the coordinator, 15 Nov): six to eight sentences, chosen by what a phrase can reach. A bare cap keeps
    whatever came first; the prompt says what to keep, sound and occasion, and personnel, format and sequence only
    where they bear on the sound, and the count follows.
  */
  it('asks for six to eight sentences, sound and occasion first, personnel, format and sequence only where they bear on the sound', () => {
    expect(prompt).toMatch(/six to eight sentences/i);
    expect(prompt).toMatch(/how it sounds and (the )?occasion/i);
    expect(prompt).toMatch(/personnel, format (and|or) sequence[^.]*only where (it|they) bears? on how (it|the record) sounds/i);
  });

  /*
    The coordinator's review of the 55 (17 Nov): one sentence described what the material did not say, two records
    asserted in the body what their own unknown list disclaimed, and the sides were named three ways, which fragments
    the vocabulary a phrase has to reach.
  */
  it('says a sentence never describes what the material does not say and never asserts what is listed under unknown', () => {
    expect(prompt).toMatch(/never (write|writes) a sentence about what the material does not (say|tell|give)/i);
    expect(prompt).toMatch(/never asserts? what you list under "unknown"/i);
  });

  /* The coordinator, 17 Nov: five or six of the 55 spent their last slot on a mastering credit. A format observation that bears on the sound (mono, a stereo spread) is not a credit and stays. */
  it('says a mastering, lacquer, design or label credit is never worth a sentence, and names only credits', () => {
    expect(prompt).toMatch(/a mastering, lacquer, design or label credit is never worth a sentence/i);
  });

  /*
    The side-placement rule (the coordinator, 17 Nov). The number rule held on 55 of 55; nothing equivalent stopped a
    model with no positions writing "side one opens with X". A side the material does not give stays unknown, and a
    record without sides keeps its album-level description with fewer sentences, as a consequence of the rule and not a
    range the prompt permits: the target stays eight. Synthetic: no real payload of the 55 lacks positions (the audit of
    17 Nov found 54 fully lettered and one medley placed by its sub-tracks), so this holds the rule's text, not a draft.
  */
  it('says a side the tracklist does not give is never placed, goes under unknown, and a record without sides carries fewer sentences rather than invented ones', () => {
    expect(prompt).toMatch(/where the tracklist gives no side for a track, do not place it/i);
    expect(prompt).toMatch(/a side you were not given goes under "unknown", and no sentence names it/i);
    expect(prompt).toMatch(/gives no sides at all, describe the record as a whole and write nothing about its sides/i);
    expect(prompt).toMatch(/carries fewer sentences/i);
    /* The target is unchanged: no floor is added for a case that today affects no record. */
    expect(prompt).toMatch(/six to eight sentences/i);
    expect(prompt).not.toMatch(/where the material reaches/i);
  });

  it('pins the sides’ names to side one, side two, side three and side four', () => {
    expect(prompt).toMatch(/call the sides side one, side two, side three and side four/i);
    expect(prompt).toMatch(/never side A/i);
  });

  it('carries the tracklist by side and the credits, and asks each sentence to be whole and marked supported or inferred', () => {
    expect(prompt).toContain('A1 Girl From The North Country');
    expect(prompt).toContain('B1 Lay Lady Lay');
    expect(prompt).toContain('Pete Drake: Pedal Steel Guitar');
    expect(prompt).toMatch(/whole sentence/i);
    expect(prompt).toMatch(/"supported"/);
    expect(prompt).toMatch(/"inferred"/);
  });
});

describe('the reply, stubbed', () => {
  const reply = JSON.stringify({
    sentences: [
      { text: 'Acoustic guitar, harmonica and pedal steel, played close and unhurried.', basis: 'supported' },
      { text: 'Side one is brisk and light; side two slows into crooned ballads.', basis: 'inferred' },
    ],
    unknown: ['how loud the mix runs'],
  });

  it('joins the sentences into the text to store, keeping each sentence’s basis and the unknowns for the review', async () => {
    const r = await createMatchedTextClient(transport(reply)).write(subject, facts);
    expect(r).toMatchObject({
      ok: true,
      text: 'Acoustic guitar, harmonica and pedal steel, played close and unhurried. Side one is brisk and light; side two slows into crooned ballads.',
      sentences: [{ basis: 'supported' }, { basis: 'inferred' }],
      unknown: ['how loud the mix runs'],
    });
  });

  it('drops a sentence that describes what the material does not say, keeps the rest, and reports the dropped one', async () => {
    const r = await createMatchedTextClient(transport(JSON.stringify({ sentences: [
      { text: 'Pedal steel and harmonica, close and unhurried.', basis: 'supported' },
      { text: 'Which tracks are the quiet ones is not something this material tells you.', basis: 'supported' },
      { text: 'The sound is a trio core, with no sung lyric credited on side two.', basis: 'supported' },
    ], unknown: [] }))).write(subject, facts);
    expect(r).toMatchObject({
      ok: true,
      text: 'Pedal steel and harmonica, close and unhurried. The sound is a trio core, with no sung lyric credited on side two.',
      dropped: ['Which tracks are the quiet ones is not something this material tells you.'],
    });
  });

  it('reads a reply with no sentences as blank, never as an empty text to store', async () => {
    expect(await createMatchedTextClient(transport(JSON.stringify({ sentences: [], unknown: ['everything'] }))).write(subject, facts)).toMatchObject({ ok: true, text: null, unknown: ['everything'] });
  });

  it('refuses a cut reply and an unreadable one rather than storing part of a description', async () => {
    expect(await createMatchedTextClient(transport(reply.slice(0, 40), 'max_tokens')).write(subject, facts)).toMatchObject({ ok: false, reason: 'cut' });
    expect(await createMatchedTextClient(transport('Here is a description of the record.')).write(subject, facts)).toMatchObject({ ok: false, reason: 'unreadable' });
    expect(await createMatchedTextClient(transport(JSON.stringify({ sentences: [{ text: 'x', basis: 'guessed' }], unknown: [] }))).write(subject, facts)).toMatchObject({ ok: false, reason: 'unreadable' });
  });
});

/* Drafting effort is measured, not assumed (the coordinator, 15 Nov): the first ten are drafted at medium and the next step up, side by side. */
describe('the effort', () => {
  it('drafts at medium by default and at the effort asked for', async () => {
    const seen: string[] = [];
    const t = { create: async (req: { output_config: { effort: string } }) => { seen.push(req.output_config.effort); return { content: [{ type: 'text', text: JSON.stringify({ sentences: [], unknown: [] }) }], stop_reason: 'end_turn', usage: {} }; } };
    const client = createMatchedTextClient(t as never);
    await client.write(subject, facts);
    await client.write(subject, facts, { effort: 'high' });
    expect(seen).toEqual(['medium', 'high']);
  });
});

/*
  The production transport (15 Nov): it dropped output_config, so every draft ran at the model's default effort, and its
  1,500 limit cut nine of twelve drafts in thinking. Every test above injects a fake transport, so none could see it;
  this drives the real one against a stubbed fetch and reads the body it sends.
*/
describe('the production transport', () => {
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });

  it('sends the effort asked for, and a limit with room for thinking and the answer', async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', 'sk-ant-test');
    const bodies: Array<{ output_config?: { effort?: string }; max_tokens?: number }> = [];
    const fetchImpl = vi.fn(async (_url: unknown, init?: RequestInit) => {
      bodies.push(JSON.parse(String(init?.body)));
      return new Response(JSON.stringify({ id: 'm', type: 'message', role: 'assistant', model: 'claude-opus-5', content: [{ type: 'text', text: JSON.stringify({ sentences: [], unknown: [] }) }], stop_reason: 'end_turn', usage: { input_tokens: 1, output_tokens: 1 } }), { status: 200, headers: { 'content-type': 'application/json' } });
    });
    await createMatchedTextClient(matchedTextTransport({ fetch: fetchImpl as unknown as typeof fetch })).write(subject, facts, { effort: 'high' });
    expect(bodies[0]?.output_config).toEqual({ effort: 'high' });
    /* Measured 15 Nov: the largest call, thinking and answer together, was 3,588 output tokens at high. */
    expect(bodies[0]?.max_tokens).toBe(MATCHED_TEXT_MAX_TOKENS);
    expect(MATCHED_TEXT_MAX_TOKENS).toBeGreaterThanOrEqual(3_588 * 4);
  });
});

