import { describe, expect, it } from 'vitest';
import { ARROW_LANE, LANDED_SIZE, LANDING_PAD, parseMatrix } from './landing';

describe('what survives of the landing (§11.9, §11.19)', () => {
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
