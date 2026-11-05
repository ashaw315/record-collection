import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { discographyOf, groundingFromPayload } from './about-grounding';
import { buildSnippetPrompt } from './snippet-client';

/**
 * The ABOUT, grounded (the coordinator, 4 Nov). The ungrounded sample placed a
 * 2026 record "before the full-length arrived" when the band's debut was 2023:
 * the facts were recalled, and wrong. The cached release payload already holds
 * the label, country, format, year, credits and companies; the artist's
 * discography is one endpoint, `/artists/{id}/releases`. Put in the prompt,
 * they stop being recalled and start being read. Fails against a reader that
 * returns nothing, a discography unsorted or with appearances kept, and a
 * prompt that carries no facts or loses its voice lines.
 */
const PAYLOAD = JSON.parse(readFileSync('test/fixtures/discogs/collection-release-33132765.json', 'utf8'));

describe('groundingFromPayload', () => {
  it('reads the label, country, year, format, credits and companies, and the community figures', () => {
    const g = groundingFromPayload(PAYLOAD);
    expect(g).not.toBeNull();
    expect(g?.label).toBe('W.25th');
    expect(g?.country).toBe('US');
    expect(g?.year).toBe(2025);
    expect(g?.format).toBe('Vinyl, LP, Album, Stereo');
    expect(g?.artistId).toBe(1409072);
    expect(g?.credits.length).toBeGreaterThan(0);
    expect(g?.credits[0]).toEqual({ name: expect.any(String), role: expect.any(String) });
    expect(g?.companies.some((c) => c.role === 'Pressed By')).toBe(true);
    expect(g?.community).toEqual({ have: 7342, want: 1681, rating: 4.75, ratings: 528 });
  });

  it('returns null for a payload that is not a release', () => {
    expect(groundingFromPayload(null)).toBeNull();
    expect(groundingFromPayload({ id: 1 })).toBeNull();
  });
});

describe('discographyOf', () => {
  const RELEASES = {
    releases: [
      { id: 3, title: 'URGH', year: 2026, type: 'master', role: 'Main', format: 'LP' },
      { id: 1, title: "i've seen a way", year: 2023, type: 'master', role: 'Main', format: 'LP, Album' },
      { id: 2, title: '…', year: 2021, type: 'master', role: 'Main', format: 'EP' },
      { id: 4, title: 'Some Compilation', year: 2022, type: 'release', role: 'Appearance', format: 'LP, Comp' },
      { id: 5, title: 'Remix 12"', year: 2024, type: 'release', role: 'Remix', format: '12"' },
    ],
  };
  it('keeps the artist’s own masters, oldest first, each with its year and format', () => {
    expect(discographyOf(RELEASES)).toEqual([
      { title: '…', year: 2021, format: 'EP' },
      { title: "i've seen a way", year: 2023, format: 'LP, Album' },
      { title: 'URGH', year: 2026, format: 'LP' },
    ]);
  });
  it('returns nothing for a payload of another shape', () => {
    expect(discographyOf({ pagination: {} })).toEqual([]);
    expect(discographyOf('no')).toEqual([]);
  });
});

describe('groundingFromPayload: the tracklist (5 Nov)', () => {
  /*
    The fact-check pass on the 45 found a bonus track named as on the LP and a side's order
    reversed, both checkable against the tracklist already in the cache that the checker never
    read. Fails against a reader that leaves `tracks` empty on a payload holding 32 of them.
  */
  it('reads every track by position and title, in the payload’s order', () => {
    const facts = groundingFromPayload(PAYLOAD);
    expect(facts?.tracks.length).toBe(32);
    expect(facts?.tracks[0]).toEqual({ position: 'A1', title: 'Diamond Jubilee' });
    expect(facts?.tracks[2]).toEqual({ position: 'A3', title: 'Baby Blue' });
  });
  it('reads no tracks from a release that carries none, and says so by an empty list', () => {
    expect(groundingFromPayload({ id: 1, title: 'Bare' })?.tracks).toEqual([]);
  });
});

describe('buildSnippetPrompt with grounding', () => {
  const subject = { artist: 'Mandy, Indiana', title: 'URGH' };
  const grounding = {
    facts: { label: 'Fire Talk', country: 'US', year: 2026, format: 'Vinyl, LP, Album', artistId: 1, credits: [{ name: 'Scott Fair', role: 'Guitar, Electronics' }], companies: [{ name: 'Fire Talk', role: 'Phonographic Copyright (p)' }], community: null, tracks: [] },
    discography: [{ title: '…', year: 2021, format: 'EP' }, { title: "i've seen a way", year: 2023, format: 'LP, Album' }, { title: 'URGH', year: 2026, format: 'LP' }],
  };
  it('carries the facts and the discography, says they are the record’s and the artist’s, and asks that nothing contradict them', () => {
    const prompt = buildSnippetPrompt(subject, grounding);
    expect(prompt).toContain('Fire Talk');
    expect(prompt).toContain('2026');
    expect(prompt).toContain('Scott Fair');
    expect(prompt).toMatch(/i've seen a way.*2023/);
    expect(prompt).toMatch(/contradict/i);
  });
  it('keeps the voice: the ten lines, the forbidden fact classes, and less rather than a guess, and asks that the facts not be recited', () => {
    const prompt = buildSnippetPrompt(subject, grounding);
    expect(prompt).toContain('about 535 characters');
    expect(prompt).toContain('Do not state a pressing, a catalogue number');
    expect(prompt).toContain('say less rather');
    expect(prompt).toMatch(/not (a )?list|do not recite|not a catalogue entry/i);
  });
  /*
    The coordinator, 5 Nov, on why Smerz kept its voice and the other two thinned: their credits
    read as things to mention. Not a cap on names but a principle: the facts are already in the
    database and searchable, so naming them adds nothing a reader could not find by typing the
    name; the note's job is what no field holds. Fails against the 4 Nov prompt, which asked only
    that the facts not be recited.
  */
  it('says the facts are already searchable, so naming them adds nothing, and the note’s job is what no field holds', () => {
    const prompt = buildSnippetPrompt(subject, grounding);
    expect(prompt).toMatch(/already (in the (collector’s )?(database|catalogue)|stored)[^.]*searchable/i);
    expect(prompt).toMatch(/adds nothing[^.]*typing/i);
    expect(prompt).toMatch(/no field holds/i);
    expect(prompt).toMatch(/what (the record|it) sounds like/i);
    expect(buildSnippetPrompt(subject)).not.toMatch(/no field holds/i);
  });
  it('is the ungrounded prompt without grounding, unchanged', () => {
    const prompt = buildSnippetPrompt(subject);
    expect(prompt).not.toMatch(/contradict/i);
    expect(prompt).toContain('ARTIST: Mandy, Indiana');
  });
});
