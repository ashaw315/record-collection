import { describe, expect, it } from 'vitest';
import { aboutHash, planEmbedding } from './plan';

/**
 * **Q22's first unit: the embedding run re-embeds only what changed (the coordinator, 11 Nov).** One vector per record,
 * keyed to its ABOUT's text hash; a run embeds the records whose stored hash is missing or differs, and `--record <id>`
 * narrows the run to one. Each case fails against a plan that embeds everything, one that embeds nothing, or a hash
 * that ignores the text.
 */
describe('aboutHash', () => {
  it('is the same for the same text and differs on one character', () => {
    expect(aboutHash('A record about rain.')).toBe(aboutHash('A record about rain.'));
    expect(aboutHash('A record about rain.')).not.toBe(aboutHash('A record about rain!'));
    expect(aboutHash('x')).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('planEmbedding', () => {
  const rows = [
    { recordId: 'a', about: 'Rain on a tin roof.', storedHash: null },
    { recordId: 'b', about: 'Late-night drive.', storedHash: aboutHash('Late-night drive.') },
    { recordId: 'c', about: 'Sunday morning, rewritten.', storedHash: aboutHash('Sunday morning.') },
  ];

  it('embeds a record with no vector and one whose ABOUT changed, and skips one whose hash matches', () => {
    const plan = planEmbedding(rows);
    expect(plan.toEmbed.map((r) => r.recordId)).toEqual(['a', 'c']);
    expect(plan.skipped).toBe(1);
  });

  it('narrows to one record by id, and names an id the collection does not hold', () => {
    expect(planEmbedding(rows, 'c').toEmbed.map((r) => r.recordId)).toEqual(['c']);
    expect(planEmbedding(rows, 'b').toEmbed).toEqual([]);
    expect(planEmbedding(rows, 'b').skipped).toBe(1);
    expect(() => planEmbedding(rows, 'zzz')).toThrow(/no record zzz with an ABOUT/);
  });

  it('carries each record’s current hash, so the store keys the vector to the text it embeds', () => {
    const [a] = planEmbedding(rows, 'a').toEmbed;
    expect(a.hash).toBe(aboutHash('Rain on a tin roof.'));
  });
});
