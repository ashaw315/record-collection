import { describe, expect, it } from 'vitest';
import { buildMatchedTextPrompt, createMatchedTextClient, type MatchedTextSubject } from './matched-text-client';
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

  it('gives the ABOUT as context only, never as a source of musical claims', () => {
    expect(prompt).toContain(subject.about ?? '');
    expect(prompt).toMatch(/context only/i);
    expect(prompt).toMatch(/not a source of (musical )?claims/i);
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

  it('reads a reply with no sentences as blank, never as an empty text to store', async () => {
    expect(await createMatchedTextClient(transport(JSON.stringify({ sentences: [], unknown: ['everything'] }))).write(subject, facts)).toMatchObject({ ok: true, text: null, unknown: ['everything'] });
  });

  it('refuses a cut reply and an unreadable one rather than storing part of a description', async () => {
    expect(await createMatchedTextClient(transport(reply.slice(0, 40), 'max_tokens')).write(subject, facts)).toMatchObject({ ok: false, reason: 'cut' });
    expect(await createMatchedTextClient(transport('Here is a description of the record.')).write(subject, facts)).toMatchObject({ ok: false, reason: 'unreadable' });
    expect(await createMatchedTextClient(transport(JSON.stringify({ sentences: [{ text: 'x', basis: 'guessed' }], unknown: [] }))).write(subject, facts)).toMatchObject({ ok: false, reason: 'unreadable' });
  });
});
