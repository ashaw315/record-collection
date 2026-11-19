import { describe, expect, it } from 'vitest';
import { disagreements } from './consistency';

/**
 * **The self-consistency check (the coordinator, 18 Nov): a draft read against itself, no model, no material.** The
 * adversarial pass flagged Smerz's "everything themselves" while the next two sentences named outside players, and
 * Whiteman's Cuban Overture "into the middle of the side" while the sentence before gave that side two pieces: errors
 * a reader finds without the tracklist, because the draft contradicts itself. Each shape below is one of those two
 * real drafts, reduced; the last test states the limit, which is Hello Mary's shape.
 */
describe('disagreements', () => {
  /* Fails against a detector that never pairs an exclusivity claim with a later named player: consistency.ts, the EVERYTHING branch. */
  it('pairs "everything themselves" with a sentence naming someone the claim does not include, the Smerz shape', () => {
    const found = disagreements([
      'The core is a duo, Catharina Stoltenberg and Henriette Motzfeldt, who write, produce, perform and engineer everything themselves.',
      'Around them sits a tiny acoustic chamber group, two violins, cello and flute.',
      'Against that, there is programmed drum machine work (Kasper Marott credited with additional drum programming) and touches from Peder Mannerfelt on three tracks.',
    ]);
    expect(found).toEqual([{ a: 1, b: 3, why: 'sentence 1 says everything is theirs alone; sentence 3 names Kasper Marott, Peder Mannerfelt' }]);
  });

  /*
    Found by the sweep after the redraft (18 Nov): Smerz's error came back as "built by the duo themselves ... perform all
    of it", and the first pattern read only "everything themselves". The claim is the same; the wording is not the test.
  */
  it('reads "themselves ... all of it" as the same claim, the Smerz redraft’s shape', () => {
    const found = disagreements([
      'Smerz\'s "Believer" is built by the duo themselves — Catharina Stoltenberg and Henriette Motzfeldt write, produce, engineer and perform all of it — so the voices sit close together.',
      'Acoustic strings and flute run through the record: cello, two violins and flute are credited.',
      'Three side-one tracks carry additional production or mixing from Peder Mannerfelt.',
    ]);
    expect(found).toEqual([{ a: 1, b: 3, why: 'sentence 1 says everything is theirs alone; sentence 3 names Peder Mannerfelt' }]);
  });

  /* Fails against a detector that counts the claim's own people as outsiders: the names in the exclusive sentence are excluded. */
  it('does not pair the claim with a sentence naming only the people the claim is about, so ABBA’s Benny Andersson is not an outsider', () => {
    expect(disagreements([
      "A full pop band with Benny Andersson's piano, the two writers producing and arranging everything themselves.",
      'The middle of side two drops the voices for "Intermezzo No. 1", an instrumental featuring Benny Andersson.',
    ])).toEqual([]);
  });

  /* Fails against a detector that reads a side's count and a middle placement separately: a side of one or two has no middle. */
  it('pairs a side given one or two pieces with a track placed in that side’s middle, the Whiteman shape', () => {
    const found = disagreements([
      'Side one is given over entirely to a single long work, Rhapsody In Blue.',
      'Side two breaks the long form into two shorter pieces, the orchestral Cuban Overture and then I Got Rhythm.',
      'The Cuban Overture brings Latin percussion into the middle of the side, giving side two a brighter character.',
    ]);
    expect(found).toEqual([{ a: 2, b: 3, why: 'sentence 2 gives side two 2 pieces; sentence 3 places something in the middle of side two' }]);
  });

  it('leaves a middle placement alone where the side it names was not counted, or holds more than two', () => {
    expect(disagreements([
      'Side two breaks the long form into two shorter pieces.',
      'The middle of side one goes quieter with two slow songs.',
    ])).toEqual([]);
    expect(disagreements([
      'Side one holds six songs.',
      '"SOS", placed mid-side, is the dynamic peak and the one track on side one with strings.',
    ])).toEqual([]);
  });

  /* Fails against a detector that reads only one phrasing of a size claim: "the shorter side", "more tracks than", "a shorter first side and a longer second". */
  it('pairs two sentences that size the sides in opposite directions', () => {
    const found = disagreements([
      'Side one is the shorter and more compact side, opening with a Chuck Berry cover.',
      'The band self-produced it.',
      'Side two holds fewer tracks than side one and is the looser half.',
    ]);
    expect(found).toEqual([{ a: 1, b: 3, why: 'sentence 1 has side one the shorter; sentence 3 has side two the shorter' }]);
  });

  /*
    The limit, stated as a test so it is not forgotten: Hello Mary's sentences 5 and 8 both make side two the longer, and
    both are wrong against the tracklist (A1 to A6 against B7 to B11). A draft consistent with itself and wrong is the
    pass's to find, not this check's; it reports nothing here, and nothing here is confirmation.
  */
  it('reports nothing for two sentences that size the sides the same way, even where both are wrong: Hello Mary’s shape is beyond it', () => {
    expect(disagreements([
      'Side two holds a few more tracks than side one and is the looser, more exploratory half.',
      'The LP sequencing, a shorter, tighter first side and a longer second, means the two sides reward being played in order.',
    ])).toEqual([]);
  });

  it('reports nothing for a draft with no such claims', () => {
    expect(disagreements(['Organ carries the hooks and the bass.', 'Side two ends long and slow.'])).toEqual([]);
  });
});
