import { describe, expect, it } from 'vitest';
import { checkNote } from './about-check';

/**
 * Grounding reduces errors rather than ending them (the coordinator, 4 Nov),
 * so every note is checked against the data after it is written and the
 * conflicts stand beside it, never suppressed: sequence claims, dates and
 * date-ish phrasing, the label, and personnel. Descriptive claims are not
 * checkable and are not flagged. The records a note is most likely wrong
 * about are the ones Adam is least equipped to check, and a machine check
 * does not care how well he knows the record. Fails against a checker that
 * passes URGH's two false sentences, or flags Smerz's true ones.
 */
const MANDY = {
  subject: { artist: 'Mandy, Indiana', title: 'URGH' },
  year: 2026,
  facts: { label: 'Fire Talk', country: 'US', year: 2026, format: 'Vinyl, LP, Album', artistId: 1, credits: [{ name: 'Valentine Caulfield', role: 'Vocals' }, { name: 'Scott Fair', role: 'Guitar' }], companies: [], community: null, tracks: [] },
  discography: [{ title: '…', year: 2021, format: 'EP' }, { title: "i've seen a way", year: 2023, format: 'LP, Album' }, { title: 'URGH', year: 2026, format: 'LP, Album' }],
};
const URGH_NOTE = "Mandy, Indiana are a Manchester outfit built around Valentine Caulfield's French-language vocals and Scott Fair's guitar and electronics. This belongs to their early-2020s run, when the band were making their name on short, violent releases before the full-length arrived. Caulfield's delivery functions as rhythm as much as language.";

const SMERZ = {
  subject: { artist: 'Smerz', title: 'Believer' },
  year: 2021,
  facts: { label: 'XL Recordings', country: 'UK', year: 2021, format: 'Vinyl, LP, Album', artistId: 2, credits: [{ name: 'Catharina Stoltenberg', role: 'Written-By' }, { name: 'Henriette Motzfeldt', role: 'Written-By' }], companies: [], community: null, tracks: [] },
  discography: [{ title: 'Okey', year: 2016, format: 'EP' }, { title: 'Have fun', year: 2018, format: 'EP' }, { title: 'Believer', year: 2021, format: 'LP, Album' }],
};
const SMERZ_NOTE = 'Debut album proper from the Norwegian duo Catharina Stoltenberg and Henriette Motzfeldt, arriving after the Okey and Have fun EPs. Issued on XL, it caught that label’s appetite for pop pulled out of shape, and it has quietly shadowed a lot of the Scandinavian art-pop that came after.';

describe('checkNote: sequence claims against the discography', () => {
  it('flags "before the full-length arrived" on a record later than the artist’s first album', () => {
    const conflicts = checkNote(URGH_NOTE, MANDY);
    const sequence = conflicts.filter((c) => c.kind === 'sequence');
    expect(sequence.length).toBeGreaterThanOrEqual(1);
    expect(sequence[0].claim).toMatch(/before the full-length arrived/);
    expect(sequence[0].fact).toMatch(/i've seen a way.*2023/);
  });
  it('accepts "debut album" on the artist’s first album, and flags it on a later one', () => {
    expect(checkNote(SMERZ_NOTE, SMERZ).filter((c) => c.kind === 'sequence')).toEqual([]);
    const later = checkNote('Their debut album, and a quiet one.', { ...SMERZ, year: 2024, discography: [...SMERZ.discography, { title: 'Big city life', year: 2024, format: 'LP, Album' }], subject: { artist: 'Smerz', title: 'Big city life' } });
    expect(later.filter((c) => c.kind === 'sequence').map((c) => c.fact)).toEqual([expect.stringMatching(/Believer.*2021/)]);
  });
});

describe('checkNote: what the first grounded run taught it (5 Nov)', () => {
  it('names an earlier release of unknown format as unchecked, not as a conflict and not as a pass: the endpoint gives no format for a master', () => {
    const smerz = { ...SMERZ, discography: [{ title: 'Okey', year: 2016, format: '' }, { title: 'Have Fun', year: 2018, format: '' }, { title: 'Believer', year: 2021, format: '' }] };
    const result = checkNote('Their first full-length, after two EPs had already sketched the method.', smerz);
    expect(result.filter((c) => c.kind === 'sequence')).toEqual([]);
    expect(result.filter((c) => c.kind === 'unchecked').map((c) => c.fact)).toEqual([expect.stringMatching(/Okey \(2016\).*format/)]);
  });
  it('tells an EP by its title where the format is blank, so "... EP" is never the first album', () => {
    const mandy = { ...MANDY, discography: [{ title: '... EP', year: 2021, format: '' }, { title: "I've Seen A Way", year: 2023, format: '' }, { title: 'URGH', year: 2026, format: '' }] };
    const result = checkNote('Their debut, and a loud one.', { ...mandy, subject: { artist: 'Mandy, Indiana', title: "I've Seen A Way" }, year: 2023 });
    expect(result.filter((c) => c.kind === 'sequence' || c.kind === 'unchecked')).toEqual([]);
  });
  it('does not read a reference to the debut as a claim that this record is it', () => {
    const mandy = { ...MANDY, discography: [{ title: '... EP', year: 2021, format: '' }, { title: "I've Seen A Way", year: 2023, format: 'LP, Album' }, { title: 'URGH', year: 2026, format: 'LP, Album' }] };
    const note = "Their second album, arriving three years on from I've Seen A Way. If the debut was a band learning how loud a room can get, this is them choosing the rooms.";
    expect(checkNote(note, mandy).filter((c) => c.kind === 'sequence')).toEqual([]);
  });
  it('does not read a sentence’s opening capitals or a language as a person', () => {
    expect(checkNote('Whispered Norwegian and English, drums that arrive late or not at all.', SMERZ).filter((c) => c.kind === 'personnel')).toEqual([]);
  });
});

describe('checkNote: dates and date-ish phrasing against the record’s year', () => {
  it('flags "early-2020s" on a 2026 record, naming the year', () => {
    const date = checkNote(URGH_NOTE, MANDY).filter((c) => c.kind === 'date');
    expect(date.map((c) => c.claim)).toEqual([expect.stringMatching(/early-2020s/)]);
    expect(date[0].fact).toMatch(/2026/);
  });
  it('accepts a decade phrase the year falls in, and a year the data holds', () => {
    expect(checkNote('An early-2020s record, as 2021 releases go.', SMERZ).filter((c) => c.kind === 'date')).toEqual([]);
    expect(checkNote('Arriving after the 2018 EP.', SMERZ).filter((c) => c.kind === 'date')).toEqual([]);
  });
  it('flags a bare year the data does not hold', () => {
    const date = checkNote('Recorded in 2019 and shelved.', SMERZ).filter((c) => c.kind === 'date');
    expect(date.map((c) => c.claim)).toEqual([expect.stringMatching(/2019/)]);
  });
});

describe('checkNote: the label', () => {
  it('accepts "Issued on XL" against XL Recordings, and flags a label the data does not name', () => {
    expect(checkNote(SMERZ_NOTE, SMERZ).filter((c) => c.kind === 'label')).toEqual([]);
    const wrong = checkNote('Issued on 4AD, it sat beside the label’s other oddities.', SMERZ).filter((c) => c.kind === 'label');
    expect(wrong.map((c) => c.fact)).toEqual([expect.stringMatching(/XL Recordings/)]);
  });
});

describe('checkNote: personnel', () => {
  it('flags a named person the credits do not hold, and not the artist, the title or a credited name', () => {
    const personnel = checkNote("Produced by Mike Stone (2) with Scott Fair's guitar.", MANDY).filter((c) => c.kind === 'personnel');
    expect(personnel.map((c) => c.claim)).toEqual(['Mike Stone']);
    expect(checkNote(SMERZ_NOTE, SMERZ).filter((c) => c.kind === 'personnel')).toEqual([]);
  });
});

/**
 * The tracklist (the coordinator, 5 Nov). The fact-check pass on the 45 found two errors the
 * checker missed, both checkable against the tracks already cached for every release, which it
 * never read: the "data you already paid for, unread" shape. Each rule below carries the defect
 * that motivated it, per the ASSERTIONS-spec rule.
 */
const NINE_NINE_NINE = {
  subject: { artist: '999', title: 'The Biggest Prize In Sport' },
  year: 1980,
  facts: {
    label: 'Polydor', country: 'UK', year: 1980, format: 'Vinyl, LP, Album', artistId: 3, credits: [{ name: 'Vic Maile', role: 'Producer' }], companies: [], community: null,
    tracks: [['A1', 'Boys In The Gang'], ['A2', 'Inside Out'], ['A3', 'Trouble'], ['A4', 'So Long'], ['A5', 'Fun Thing'], ['A6', 'The Biggest Prize In Sport'], ['B1', 'Hollywood'], ['B2', 'Stranger'], ['B3', 'Stop! Stop!'], ['B4', 'English Wipeout'], ['B5', 'Shake'], ['B6', 'Boiler']].map(([position, title]) => ({ position, title })),
  },
  /* The 1979 single is in the discography, as it is in the data: the first build held it there and missed the defect. */
  discography: [{ title: '999', year: 1978, format: 'LP, Album' }, { title: 'Found Out Too Late', year: 1979, format: '' }, { title: 'The Biggest Prize In Sport', year: 1980, format: 'LP, Album' }],
};
const CARLY = {
  subject: { artist: 'Carly Simon', title: 'No Secrets' },
  year: 1972,
  facts: {
    label: 'Elektra', country: 'US', year: 1972, format: 'Vinyl, LP, Album', artistId: 6, credits: [{ name: 'Richard Perry', role: 'Producer' }], companies: [], community: null,
    tracks: [['A1', 'The Right Thing To Do'], ['A2', 'The Carter Family'], ['A3', "You're So Vain"], ['A4', 'His Friends Are More Than Fond Of Robin'], ['A5', 'We Have No Secrets'], ['B1', 'Embrace Me, You Child']].map(([position, title]) => ({ position, title })),
  },
  discography: [{ title: 'No Secrets', year: 1972, format: '' }],
};
const DOORS = {
  subject: { artist: 'The Doors', title: 'The Doors' },
  year: 1967,
  facts: {
    label: 'Elektra', country: 'US', year: 1967, format: 'Vinyl, LP, Album', artistId: 4, credits: [{ name: 'Paul A. Rothchild', role: 'Producer' }], companies: [], community: null,
    tracks: [['A1', 'Break On Through (To The Other Side)'], ['A2', 'Soul Kitchen'], ['A3', 'The Crystal Ship'], ['A4', 'Twentieth Century Fox'], ['A5', 'Alabama Song (Whisky Bar)'], ['A6', 'Light My Fire'], ['B1', 'Back Door Man'], ['B2', 'I Looked At You'], ['B3', 'End Of The Night'], ['B4', 'Take It As It Comes'], ['B5', 'The End']].map(([position, title]) => ({ position, title })),
  },
  discography: [{ title: 'The Doors', year: 1967, format: '' }],
};
const JONI = {
  subject: { artist: 'Joni Mitchell', title: 'Ladies Of The Canyon' },
  year: 1970,
  facts: {
    label: 'Reprise', country: 'US', year: 1970, format: 'Vinyl, LP, Album', artistId: 5, credits: [{ name: 'Henry Lewy', role: 'Engineer' }], companies: [], community: null,
    tracks: [['A1', 'Morning Morgantown'], ['A2', 'For Free'], ['A3', 'Conversation'], ['A4', 'Ladies Of The Canyon'], ['A5', 'Willy'], ['A6', 'The Arrangement'], ['B1', 'Rainy Night House'], ['B2', 'The Priest'], ['B3', 'Blue Boy'], ['B4', 'Big Yellow Taxi'], ['B5', 'Woodstock'], ['B6', 'The Circle Game']].map(([position, title]) => ({ position, title })),
  },
  discography: [{ title: 'Clouds', year: 1969, format: '' }, { title: 'Ladies Of The Canyon', year: 1970, format: '' }],
};

describe('checkNote: the tracklist clears a title read as a person, and nothing else (rule 1, 5 Nov)', () => {
  /* Five of the eight personnel flags on the 45 were titles: Big Yellow (Taxi), Tuxedo Junction, Bad Girls on the tracklist, Blow By (Blow) in the discography. */
  it('does not flag a track title near "with" or "by" as a person', () => {
    const note = 'Woodstock here is slow and haunted, Big Yellow Taxi is pop with a sting, produced by nobody in particular.';
    expect(checkNote(note, JONI).filter((c) => c.kind === 'personnel')).toEqual([]);
  });
  it('does not flag an earlier record of the artist’s named in the note', () => {
    const beck = { ...JONI, subject: { artist: 'Jeff Beck', title: 'Wired' }, discography: [{ title: 'Blow By Blow', year: 1975, format: '' }, { title: 'Wired', year: 1976, format: '' }] };
    expect(checkNote('The follow-up to Blow By Blow, produced with a rougher hand.', beck).filter((c) => c.kind === 'personnel')).toEqual([]);
  });
  it('still flags a person the credits do not hold, in the same sentence as a track title: the rule is not inert', () => {
    const note = 'Big Yellow Taxi is pop with a sting, produced by Mike Stone with a heavy hand.';
    expect(checkNote(note, JONI).filter((c) => c.kind === 'personnel').map((c) => c.claim)).toEqual(['Mike Stone']);
  });
  it('still leaves a band named as an influence to a person: no data holds it', () => {
    const weezer = { ...JONI, subject: { artist: 'Weezer', title: 'Weezer' }, facts: { ...JONI.facts, tracks: [{ position: 'A4', title: 'Buddy Holly' }] }, discography: [] };
    const flagged = checkNote('Harmonies that owe as much to the Beach Boys as to any amp-worship, with hooks to spare.', weezer).filter((c) => c.kind === 'personnel');
    expect(flagged.map((c) => c.claim)).toEqual(['Beach Boys']);
  });
});

describe('checkNote: a song named as on this record that its tracklist does not hold (rule 2, 5 Nov)', () => {
  /* The defect: 999's note said "Boys In The Gang, Trouble and Found Out Too Late carry it"; Found Out Too Late is the 1999 CD's bonus track, not on the 1980 LP. */
  it('flags "Found Out Too Late" on The Biggest Prize In Sport, and not the two titles the LP holds', () => {
    const track = checkNote('Boys In The Gang, Trouble and Found Out Too Late carry it; the rest keeps pace.', NINE_NINE_NINE).filter((c) => c.kind === 'track');
    expect(track.map((c) => c.claim)).toEqual(['Found Out Too Late']);
    expect(track[0].fact).toMatch(/not on this release’s tracklist/);
    expect(track[0].fact, 'the discography holding the single is the fact, not a reason to stay quiet').toMatch(/artist’s 1979 release/);
  });
  it('does not read a person the personnel rule flagged as a song, nor a phrase after "a", nor a sentence’s opening words', () => {
    /* Mick Jagger stood as both a person and a missing track on the first rechecked 45; "a Bay Area bar band" and "Not the Decca sides" were missing tracks. */
    const carly = checkNote("You're So Vain opens it out — that bass figure, the sneer kept elegant, Mick Jagger ghosting the chorus — but the record's spine is quieter, songs about wanting and doubting in the same breath.", CARLY);
    expect(carly.filter((c) => c.kind === 'personnel').map((c) => c.claim)).toEqual(['Mick Jagger']);
    expect(carly.filter((c) => c.kind === 'track')).toEqual([]);
    expect(checkNote('Nine tracks, no fat: a Bay Area bar band that had learned how to make a single land.', CARLY).filter((c) => c.kind === 'track')).toEqual([]);
    expect(checkNote('Not the Decca sides but a later studio pass at the songs.', CARLY).filter((c) => c.kind === 'track')).toEqual([]);
  });
  it('accepts a song the tracklist holds, under either spelling of its case', () => {
    expect(checkNote('Moonlight Serenade opens the evening and tuxedo junction struts; the title track closes it.', { ...JONI, facts: { ...JONI.facts, tracks: [{ position: 'A1', title: 'Moonlight Serenade' }, { position: 'A2', title: 'Tuxedo Junction' }, { position: 'B6', title: 'Ladies Of The Canyon' }] } }).filter((c) => c.kind === 'track')).toEqual([]);
  });
  it('names a song claim as unchecked, not as a conflict, where the release’s tracklist is not cached: absent is not broken', () => {
    const bare = { ...NINE_NINE_NINE, facts: { ...NINE_NINE_NINE.facts, tracks: [] } };
    const result = checkNote('Boys In The Gang and Found Out Too Late carry it.', bare);
    expect(result.filter((c) => c.kind === 'track')).toEqual([]);
    expect(result.filter((c) => c.kind === 'unchecked').map((c) => c.fact)).toEqual([expect.stringMatching(/no tracklist/)]);
  });
  it('reads only a sentence that presents the phrase as a song: a person in a sentence about the sound is not a track', () => {
    expect(checkNote('The guitars are dry and sharp, and Nick Cash barks over the top of tunes closer to rock’n’roll than to sloganeering.', NINE_NINE_NINE).filter((c) => c.kind === 'track')).toEqual([]);
  });
});

describe('checkNote: the pointer on a side run from one thing to another (5 Nov): not a check, no verdict', () => {
  /*
    Rule 3, an order check against the ordinals, was built and dropped the same day: across the 45
    it met one position claim by a named title (Joni Mitchell's "The Circle Game closes it", true)
    and invented one finding from "opens it out", a phrasal verb, which reached Adam as a
    correction; and its test asserted that false positive as correct behaviour, a test written
    from the build in the turn the build was made. The Doors' sentence, the real error, refers to
    tracks by description and is a class no check reaches. What stays points at it.
  */
  it('names the Doors sentence as it was written as unchecked, with the tracklist beside it and no verdict', () => {
    const result = checkNote("Side one runs from the hit's long solo trade to a Brecht-Weill cabaret turn; side two ends in eleven minutes of drone and theatre.", DOORS);
    const pointer = result.filter((c) => c.kind === 'unchecked');
    expect(pointer.length).toBe(1);
    expect(pointer[0].fact).toMatch(/^a pointer, not a check/);
    expect(pointer[0].fact).toMatch(/A5 Alabama Song \(Whisky Bar\), A6 Light My Fire/);
    expect(result.map((c) => c.kind)).not.toContain('order');
  });
  it('says nothing about a position claim by a named title, true or false: "opens it out" is a phrasal verb and "The Circle Game closes it" is a reader’s to check', () => {
    expect(checkNote("You're So Vain opens it out — that bass figure, the sneer kept elegant.", CARLY).filter((c) => c.kind !== 'personnel')).toEqual([]);
    expect(checkNote('Woodstock is slow and haunted, and The Circle Game closes it like a door shutting on youth.', JONI)).toEqual([]);
    expect(checkNote('Willy opens it and Blue Boy closes it.', JONI)).toEqual([]);
  });
  it('points at nothing where the tracklist is not cached, since there is nothing to read it against', () => {
    expect(checkNote('Side one runs from a ballad to a riot.', { ...DOORS, facts: { ...DOORS.facts, tracks: [] } }).filter((c) => c.kind === 'unchecked')).toEqual([]);
  });
});

describe('checkNote: descriptive claims are not flagged', () => {
  it('leaves "has quietly shadowed a lot of the Scandinavian art-pop" alone', () => {
    expect(checkNote(SMERZ_NOTE, SMERZ)).toEqual([]);
  });
});
