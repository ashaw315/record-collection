import { describe, expect, it } from 'vitest';
import { cosine } from '@/lib/ask/rank';
import { STUB_DIMS, stubEmbedding } from './stub-embedding';

/**
 * **The test environment's embedding model (Q22's control, 12 Nov).** The suites have no provider key by design, so
 * the phrase path cannot reach OpenAI from the build; the e2e server points the client at a stub route that answers
 * with this function, a hashed bag of words. It is not a model of meaning: it is deterministic, so a test can seed a
 * record's stored vector and know which phrase lands nearest. Each case fails against a stub that is random, that
 * changes with word order or case, or whose vectors are not unit length (cosine then reads magnitude as nearness).
 */
describe('stubEmbedding', () => {
  it('is deterministic, unit length, and of the declared dimension', () => {
    const a = stubEmbedding('warm late-night jazz');
    expect(a).toEqual(stubEmbedding('warm late-night jazz'));
    expect(a).toHaveLength(STUB_DIMS);
    expect(Math.hypot(...a)).toBeCloseTo(1, 6);
  });

  it('reads words, not their order or case', () => {
    expect(stubEmbedding('Jazz for a late night')).toEqual(stubEmbedding('late night jazz for a'));
    expect(cosine(stubEmbedding('LATE NIGHT JAZZ'), stubEmbedding('late night jazz'))).toBeCloseTo(1, 6);
  });

  it('puts a phrase nearer the text that shares its words than one that shares none', () => {
    const phrase = stubEmbedding('late night jazz');
    const shares = stubEmbedding('a late night record of cool jazz');
    const disjoint = stubEmbedding('loud fast hardcore punk');
    expect(cosine(phrase, shares)).toBeGreaterThan(cosine(phrase, disjoint));
    expect(cosine(phrase, disjoint)).toBeCloseTo(0, 6);
  });

  it('embeds an empty text as the zero vector, which cosine reads as nothing near', () => {
    expect(stubEmbedding('').every((x) => x === 0)).toBe(true);
    expect(cosine(stubEmbedding(''), stubEmbedding('jazz'))).toBe(0);
  });
});
