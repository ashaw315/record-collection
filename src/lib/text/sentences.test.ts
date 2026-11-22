import { describe, expect, it } from 'vitest';
import { sentencesOf } from './sentences';

/**
 * **One sentence rule, held once (the coordinator, 21 Nov).** The pick's claim check, the ABOUT's fact checker and the
 * self-reference report each held their own copy of the splitter, which agreed until one was edited; and the rule they
 * held ended a sentence at any full stop before a space, so "Rev. Gary Davis" was two sentences, "Stop! Stop!" inside
 * a quoted title was two, and a sentence closing inside quotes ("... With You." Side C ...) was none. Over the 55 matched
 * texts the copies counted 446 sentences against the drafting model's own 439, and on a bench run the claim check
 * dropped Hot Tuna's whole sentence as "not a whole sentence": the pick lost a correct record to its own instrument.
 * Each case below is one of the eleven boundaries, or one of the four, read from the stored texts; each fails against
 * the one-line split on `(?<=[.!?])\s+`.
 */
describe('sentencesOf', () => {
  it('ends a sentence at . ! or ? before a space, trimmed, with no empty fragment', () => {
    expect(sentencesOf('Solo piano, slow.  Side two turns darker! Does it settle? It does.')).toEqual(['Solo piano, slow.', 'Side two turns darker!', 'Does it settle?', 'It does.']);
    expect(sentencesOf('  One sentence, no stop  ')).toEqual(['One sentence, no stop']);
    expect(sentencesOf('')).toEqual([]);
  });

  it('does not end a sentence after a title or an abbreviation that a name or number follows', () => {
    expect(sentencesOf('It ends with Rev. Gary Davis\'s "Death Don\'t Have No Mercy," the gravest thing on the side. Side two opens quietly.')).toEqual([
      'It ends with Rev. Gary Davis\'s "Death Don\'t Have No Mercy," the gravest thing on the side.',
      'Side two opens quietly.',
    ]);
    for (const text of ['Intermezzo No. 1 closes the side.', 'The medley runs to "St. Louis Blues" near the end.', 'Mr. DJ is the loosest track.', 'Fred Carter, Jr. on guitars.', 'Hester, Pt. 1 and Pt. 2 bookend it.', 'A Sgt. Pepper reprise ends it.', 'Vol. 2 is the quieter one.', 'Dr. John sits in on piano.']) {
      expect(sentencesOf(text), text).toEqual([text]);
    }
  });

  it('does not end a sentence where the next word is lowercase: the stop was not a sentence’s', () => {
    expect(sentencesOf('Older blues, i.e. borrowed songs, then his own.')).toEqual(['Older blues, i.e. borrowed songs, then his own.']);
  });

  it('ends a sentence that closes inside quotation marks, the mark staying with its sentence', () => {
    expect(sentencesOf('Side B settles into "Tonight I\'ll Be Staying Here With You." Side C is the darkest stretch.')).toEqual([
      'Side B settles into "Tonight I\'ll Be Staying Here With You."',
      'Side C is the darkest stretch.',
    ]);
    expect(sentencesOf('It closes on “Mann’s Fate.” Dynamics stay low.')).toEqual(['It closes on “Mann’s Fate.”', 'Dynamics stay low.']);
  });

  it('does not end a sentence inside an open quotation: a title’s own stop is not the sentence’s', () => {
    expect(sentencesOf('Side two runs to "Stop! Stop!", "English Wipeout" and "Shake" and ends on "Boiler". Then quiet.')).toEqual([
      'Side two runs to "Stop! Stop!", "English Wipeout" and "Shake" and ends on "Boiler".',
      'Then quiet.',
    ]);
    expect(sentencesOf('The chant “Why? Why?” builds. Then quiet.')).toEqual(['The chant “Why? Why?” builds.', 'Then quiet.']);
  });
});
