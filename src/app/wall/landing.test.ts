import { describe, expect, it } from 'vitest';
import { ARROW_LANE, LANDED_SIZE, LANDING_PAD, offsetOf, parseMatrix } from './landing';

describe('what survives of the landing (§W.9, §W.19)', () => {
  it('keeps the page’s padding, the arrow lane and the landed size as the figures they are', () => {
    expect(LANDING_PAD).toBe(34);
    expect(ARROW_LANE).toBe(56);
    expect(LANDED_SIZE).toBe(560);
  });

  it('reads a matrix', () => {
    expect(parseMatrix('matrix(1 2 3 4 5 6)')).toEqual([1, 2, 3, 4, 5, 6]);
    expect(parseMatrix('matrix(0.866, -0.5, 0, 1, 10, -20)')).toEqual([0.866, -0.5, 0, 1, 10, -20]);
  });
});

/**
 * §W.29, the person's scroll wins: when the arrival is skipped the server's
 * offset is still cleared, and the scroll takes the offset's amount so what
 * is under the person's eye does not move. The composition's translate is
 * the arrival negated, so the scroll that replaces it is the translate
 * negated back. Fails against `offsetOf` in `landing.ts`.
 */
describe('offsetOf: the arrival offset as the scroll that replaces it', () => {
  it('negates the composition’s translate', () => {
    expect(offsetOf('translate(-5px, -75px)')).toEqual([5, 75]);
    expect(offsetOf('translate(0px, -120.5px)')).toEqual([-0, 120.5]);
  });
  it('is nothing when there is no offset, cleared or never emitted', () => {
    expect(offsetOf('')).toEqual([0, 0]);
    expect(offsetOf('none')).toEqual([0, 0]);
  });
});
