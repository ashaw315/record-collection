import { describe, expect, it } from 'vitest';
import { renderReview, type ReviewDraft } from './review';

/**
 * **The matched-text review file, for Adam to mark (step 3, unit 4; the coordinator, 14 Nov).** Each sentence carries
 * whether it rests on the supplied material or on the model's own knowledge, so the inferred are read hardest, where the
 * fame bias sits; what was not known is listed, not filled; the ABOUT is shown as the context it was, not as a source.
 */
const drafts: ReviewDraft[] = [
  {
    id: 'e315c6a7-ac45-4dd3-a5d5-d58eeaa608a2', artist: 'The Doors', title: 'The Doors', year: 1967, about: 'A nightclub set pressed to vinyl.', status: 'finished',
    sentences: [{ text: 'Organ carries the hooks and the bass.', basis: 'supported' }, { text: 'Side two ends long and slow.', basis: 'inferred' }],
    unknown: ['how loud the mix runs'],
  },
  { id: 'dbcf97f0-c4fc-40d6-97cc-214e203ce7fe', artist: 'The Ink Spots (3)', title: 'Greatest', year: 1957, about: null, status: 'failed: cut', sentences: [], unknown: [] },
];

describe('renderReview', () => {
  const out = renderReview(drafts, 'Matched text drafts, 15 Nov');

  it('marks every sentence supported or inferred, and says to read the inferred hardest', () => {
    expect(out).toContain('- [supported] Organ carries the hooks and the bass.');
    expect(out).toContain('- [inferred] Side two ends long and slow.');
    expect(out).toMatch(/inferred.*hardest/i);
  });

  it('lists what was not known, shows the ABOUT as context, and gives the id to mark', () => {
    expect(out).toContain('Not known: how loud the mix runs');
    expect(out).toContain('ABOUT, given as context only: A nightclub set pressed to vinyl.');
    expect(out).toContain('`e315c6a7`');
  });

  it('says a draft that did not finish has none, rather than showing nothing', () => {
    expect(out).toMatch(/The Ink Spots \(3\) — Greatest[\s\S]*No draft: failed: cut/);
  });

  /* The same record drafted at two efforts, shown together, each marked so Adam can name which to store. */
  it('shows a record drafted at two efforts together, each under its effort, with how to store either', () => {
    const two = renderReview([
      { ...drafts[0], effort: 'medium' },
      { ...drafts[0], effort: 'high', sentences: [{ text: 'Organ and bass, the drums swinging.', basis: 'inferred' }] },
    ], 'Compared');
    expect(two.match(/## The Doors — The Doors/g)?.length, 'one heading for the record').toBe(1);
    expect(two).toMatch(/At medium:[\s\S]*Organ carries the hooks[\s\S]*At high:[\s\S]*Organ and bass, the drums swinging\./);
    expect(two).toMatch(/e315c6a7 high/);
  });

  /*
    The rerun tests two changes at once (the coordinator, 15 Nov): each draft states its own figures, so the ratio, the
    length that replaces the token estimates, and any number that survived the rule are read off the file, not recounted.
  */
  it('states each draft’s sentence count, characters and supported against inferred', () => {
    expect(out).toMatch(/2 sentences, 66 characters; 1 supported, 1 inferred/);
  });

  /*
    Narrowed (the coordinator's review of the 55, 17 Nov): the first detector fired on 126 of 440 sentences, nearly all
    bare number-words ("one voice with one instrument", "four-piece ... two guitars"), while the rule itself held 55 of
    55. It now fires on a quantity with a unit, a bare figure outside a quoted title, and a people-count larger than the
    names the credits supply; a count the credits can cover, and a side's name, do not fire.
  */
  it('lists a sentence carrying a duration, a tempo, a bare figure or a people-count the credits cannot cover, and not one the credits cover or a side’s name', () => {
    const numbered = renderReview([{ ...drafts[0], credited: 4, sentences: [
      { text: 'The title track runs roughly seven minutes.', basis: 'inferred' },
      { text: 'A forty-piece orchestra plays behind him.', basis: 'inferred' },
      { text: 'It sits around 120 bpm throughout.', basis: 'inferred' },
      { text: 'There are 11 tracks.', basis: 'inferred' },
      { text: 'A four-piece band: two guitars that both sing, bass and drums.', basis: 'supported' },
      { text: 'The core sound is one voice with one instrument at a time.', basis: 'supported' },
      { text: '"Born 2" opens side one, and "When I\'m Sixty-Four" closes side two.', basis: 'supported' },
      { text: 'Placed second on side one, it adds a second guitarist, and Taylor\'s own \'Loss Of Life (Part 2)\' follows.', basis: 'supported' },
    ] }], 'Numbers');
    expect(numbered).toMatch(/Numbers to check: 4\n- The title track runs roughly seven minutes\.\n- A forty-piece orchestra plays behind him\.\n- It sits around 120 bpm throughout\.\n- There are 11 tracks\./);
    expect(out).toMatch(/Numbers to check: none/);
  });

  it('counts an ensemble size against no credits at all where the draft carries none, so it fires', () => {
    const numbered = renderReview([{ ...drafts[0], sentences: [{ text: 'A four-piece band plays.', basis: 'inferred' }] }], 'Numbers');
    expect(numbered).toMatch(/Numbers to check: 1/);
  });

  /* Mandy, Indiana's eighth sentence (17 Nov) described what the material did not say, stored as a citable claim. */
  it('shows a sentence the client dropped for describing the material, so Adam sees the draft is a sentence short', () => {
    const dropped = renderReview([{ ...drafts[0], dropped: ['Which tracks are the quiet ones is not something this material tells you.'] }], 'Dropped');
    expect(dropped).toMatch(/Dropped, for describing the material rather than the record: 1\n- Which tracks are the quiet ones is not something this material tells you\./);
    expect(out).not.toMatch(/Dropped/);
  });
});

