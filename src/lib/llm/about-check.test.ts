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
  facts: { label: 'Fire Talk', country: 'US', year: 2026, format: 'Vinyl, LP, Album', artistId: 1, credits: [{ name: 'Valentine Caulfield', role: 'Vocals' }, { name: 'Scott Fair', role: 'Guitar' }], companies: [], community: null },
  discography: [{ title: '…', year: 2021, format: 'EP' }, { title: "i've seen a way", year: 2023, format: 'LP, Album' }, { title: 'URGH', year: 2026, format: 'LP, Album' }],
};
const URGH_NOTE = "Mandy, Indiana are a Manchester outfit built around Valentine Caulfield's French-language vocals and Scott Fair's guitar and electronics. This belongs to their early-2020s run, when the band were making their name on short, violent releases before the full-length arrived. Caulfield's delivery functions as rhythm as much as language.";

const SMERZ = {
  subject: { artist: 'Smerz', title: 'Believer' },
  year: 2021,
  facts: { label: 'XL Recordings', country: 'UK', year: 2021, format: 'Vinyl, LP, Album', artistId: 2, credits: [{ name: 'Catharina Stoltenberg', role: 'Written-By' }, { name: 'Henriette Motzfeldt', role: 'Written-By' }], companies: [], community: null },
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

describe('checkNote: descriptive claims are not flagged', () => {
  it('leaves "has quietly shadowed a lot of the Scandinavian art-pop" alone', () => {
    expect(checkNote(SMERZ_NOTE, SMERZ)).toEqual([]);
  });
});
