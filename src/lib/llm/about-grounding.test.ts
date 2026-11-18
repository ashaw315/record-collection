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

  /*
    The side-positions audit of the 55 (17 Nov): Carpenters' stored release (Discogs 10490333) files its medley as an
    index entry with an empty position and six sub-tracks positioned B4.a to B4.f; the prompt showed it unplaced, the
    one gap in 55 records, and it was the data's reader and not the data. The entry's position is its sub-tracks' shared
    one. Fails against a reader of the top-level position alone. The fixture is three entries of that payload as stored.
  */
  it('takes an index entry’s position from its sub-tracks, so a medley sits on its side', () => {
    const facts = groundingFromPayload({
      id: 10490333, title: 'Carpenters', tracklist: [
        { title: 'One Love', type_: 'track', position: 'B3' },
        { title: 'Bacharach-David Medley', type_: 'index', position: '', sub_tracks: [
          { title: 'Knowing When To Leave', type_: 'track', position: 'B4.a' }, { title: 'Make It Easy On Yourself', type_: 'track', position: 'B4.b' },
          { title: "(There's) Always Something There To Remind Me", type_: 'track', position: 'B4.c' }, { title: "I'll Never Fall In Love Again", type_: 'track', position: 'B4.d' },
          { title: 'Walk On By', type_: 'track', position: 'B4.e' }, { title: 'Do You Know The Way To San Jose', type_: 'track', position: 'B4.f' },
        ], extraartists: [{ name: 'Burt Bacharach', role: 'Written-By' }] },
        { title: 'Sometimes', type_: 'track', position: 'B5' },
      ],
    });
    expect(facts?.tracks).toEqual([{ position: 'B3', title: 'One Love' }, { position: 'B4', title: 'Bacharach-David Medley' }, { position: 'B5', title: 'Sometimes' }]);
    /* The entry's credits sit at the same derived position, so a credit on a medley is placed as the medley is. */
    expect(facts?.trackCredits).toEqual([{ position: 'B4', name: 'Burt Bacharach', role: 'Written-By' }]);
  });

  it('leaves an index entry unplaced where its sub-tracks do not share a position, and where it has none', () => {
    const split = groundingFromPayload({ id: 1, title: 'Split', tracklist: [{ title: 'Suite', type_: 'index', position: '', sub_tracks: [{ title: 'i', position: 'A4.a' }, { title: 'ii', position: 'B1.a' }] }] });
    expect(split?.tracks).toEqual([{ position: '', title: 'Suite' }]);
    expect(groundingFromPayload({ id: 1, title: 'Bare', tracklist: [{ title: 'Heading', type_: 'heading', position: '' }] })?.tracks).toEqual([{ position: '', title: 'Heading' }]);
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

  /* The matched text's prompt (15 Nov): a release's performers are usually credited on its tracks, not the release, and Traffic's prompt carried only its producers and engineers. */
  it('reads each track’s own credits with the track’s position', () => {
    const facts = groundingFromPayload({ id: 1, title: 'T', tracklist: [
      { position: 'A1', title: 'Glad', extraartists: [{ name: 'Steve Winwood', role: 'Organ, Piano' }, { name: 'Chris Wood', role: 'Saxophone' }] },
      { position: 'B2', title: 'John Barleycorn', extraartists: [{ name: 'Jim Capaldi', role: 'Vocals' }] },
      { position: 'B3', title: 'Every Mother’s Son' },
    ] });
    expect(facts?.trackCredits).toEqual([
      { position: 'A1', name: 'Steve Winwood', role: 'Organ, Piano' },
      { position: 'A1', name: 'Chris Wood', role: 'Saxophone' },
      { position: 'B2', name: 'Jim Capaldi', role: 'Vocals' },
    ]);
  });
});

