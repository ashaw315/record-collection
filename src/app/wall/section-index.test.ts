import { describe, expect, it } from 'vitest';
import { sectionIndices } from './section-index';

/**
 * The runs need the boundaries between sections, and the screen must never
 * show their names (§10b). So the query exposes an ORDINAL per record — the
 * dense rank of its section in wall order — and drops the name.
 */
describe('sectionIndices', () => {
  it('ranks sections densely in the order they arrive, records without a section last as their own', () => {
    expect(sectionIndices(['Jazz', 'Jazz', 'Rock', 'Rock', 'Rock', null, null])).toEqual([0, 0, 1, 1, 1, 2, 2]);
  });

  it('is a boundary marker, not a name: two names, two indices, nothing of the names', () => {
    expect(sectionIndices(['Punk', 'Soul'])).toEqual([0, 1]);
    expect(sectionIndices([])).toEqual([]);
    expect(sectionIndices([null])).toEqual([0]);
  });
});
