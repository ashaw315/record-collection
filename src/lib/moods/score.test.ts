import { describe, expect, it } from 'vitest';
import { topTier } from './score';

/**
 * Target §P.2: "The ask leans; it does not filter. Each record in the pool is
 * scored by how many of the selected moods it carries, and the pick is drawn
 * at random from the highest score. A record carrying none of them is never
 * drawn. So an ask has an answer whenever any record in the pool carries any
 * selected mood, at two moods or at eight."
 */
const pool = [
  { id: 'a', moods: ['sleepy'] },
  { id: 'b', moods: ['sleepy', 'smooth'] },
  { id: 'c', moods: ['dancing', 'sunny', 'loud and dirty'] },
  { id: 'd', moods: ['sleepy', 'smooth', 'sunny'] },
];

describe('topTier', () => {
  it('is empty with no mood selected: ASK is inert then, and nothing leans', () => {
    expect(topTier(pool, [])).toEqual([]);
  });

  it('holds every record carrying the one selected mood, and none that does not', () => {
    expect(topTier(pool, ['sleepy'])).toEqual(['a', 'b', 'd']);
  });

  it('leans rather than filters: four moods return records where requiring all four returns none', () => {
    const four = ['sleepy', 'smooth', 'sunny', 'dancing'];
    expect(pool.filter((r) => four.every((m) => r.moods.includes(m))), 'the precondition: no record carries all four').toEqual([]);
    expect(topTier(pool, four), 'the highest score, three of four, is d alone').toEqual(['d']);
  });

  it('never draws a record carrying none of the selected moods, even when it is all the pool holds', () => {
    expect(topTier(pool, ['jacked up'])).toEqual([]);
    expect(topTier([{ id: 'x', moods: ['sunny'] }], ['sleepy', 'smooth'])).toEqual([]);
  });

  it('adding a mood can shrink the tier where some records carry both, and never empties it', () => {
    expect(topTier(pool, ['sleepy', 'smooth'])).toEqual(['b', 'd']);
    expect(topTier(pool, ['sleepy', 'smooth', 'sunny'])).toEqual(['d']);
  });

  it('counts a mood once however often it is selected or carried', () => {
    expect(topTier([{ id: 'a', moods: ['sleepy', 'sleepy'] }, { id: 'b', moods: ['sleepy', 'smooth'] }], ['sleepy', 'sleepy', 'smooth'])).toEqual(['b']);
  });
});
