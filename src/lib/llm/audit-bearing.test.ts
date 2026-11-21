import { describe, expect, it } from 'vitest';
import type { ReleaseFacts } from './about-grounding';
import { bearing, bearingCount } from './audit-bearing';

/**
 * **The denominator of an ABOUT audit (the coordinator, 21 Nov): how many of its sentences the material could in
 * principle bear on.** An ABOUT claims things no tracklist reaches (when a scene opened, how a record was received), so
 * the material kind cannot fire on most of it; the count beside the two kinds says how much was checkable at all.
 * Mechanical: a sentence bears when it names a track, a credited person, the label, a company, the format's words, a
 * side or a position. Fails against a classifier that counts a sentence about reception as checkable, or misses one
 * naming a track.
 */
const facts: ReleaseFacts = {
  label: 'Clay Records',
  country: 'UK',
  year: 1982,
  format: 'Vinyl, LP, Album, Stereo',
  artistId: 1,
  credits: [{ name: 'Mike Stone', role: 'Producer' }],
  companies: [{ name: 'Porky Prime Cuts', role: 'Lacquer Cut At' }],
  community: null,
  tracks: [{ position: 'A1', title: 'Hear Nothing See Nothing Say Nothing' }, { position: 'B4', title: 'The Possibility of Life’s Destruction' }],
  trackCredits: [{ position: 'A1', name: 'Cal Morris', role: 'Vocals' }],
};

describe('bearing', () => {
  it('a sentence naming a track, a credited person, the label, a company or the format bears', () => {
    expect(bearing('It opens with Hear Nothing See Nothing Say Nothing at full tilt.', facts)).toBe(true);
    expect(bearing('Mike Stone produced it in a week.', facts)).toBe(true);
    expect(bearing('Cal Morris barks every line.', facts)).toBe(true);
    expect(bearing('Clay Records put it out without ceremony.', facts)).toBe(true);
    expect(bearing('The lacquer was cut at Porky Prime Cuts.', facts)).toBe(true);
    expect(bearing('A stereo LP, as it always was.', facts)).toBe(true);
  });

  it('a sentence placing something on a side or at a position bears', () => {
    expect(bearing('Side two is the harder half.', facts)).toBe(true);
    expect(bearing('The closing track leaves nothing standing.', facts)).toBe(true);
    expect(bearing('B4 is where it finally slows.', facts)).toBe(true);
  });

  it('a sentence about history, reception or meaning does not bear', () => {
    expect(bearing('The scene was opening up around them in 1982.', facts)).toBe(false);
    expect(bearing('It was received as a provocation and sold accordingly.', facts)).toBe(false);
    expect(bearing('Put it on when the flat needs clearing.', facts)).toBe(false);
  });

  it('with no material nothing bears, and the count follows the sentences', () => {
    expect(bearing('It opens with Hear Nothing See Nothing Say Nothing.', null)).toBe(false);
    expect(bearingCount(['The scene was opening.', 'Side two is harder.', 'Mike Stone produced it.'], facts)).toEqual({ bearing: 2, of: 3 });
  });
});
