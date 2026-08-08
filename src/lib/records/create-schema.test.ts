import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { recordCreateSchema } from './create-schema';
import { createSchema as recordsEndpointSchema } from '@/app/api/records/route';
import { MAX_NESTED_IDS } from '@/lib/db/queries/nested';

/**
 * SPEC.md §5.3: the acquire body is "the same shape as `POST /api/records`,
 * **from one shared schema definition, not two that agree today**".
 *
 * The emphasis is the whole point of this file. Before unit 2 there WERE two
 * definitions, and they did agree — field for field, bound for bound. Nothing
 * failed. A reviewer comparing them would have found no difference, and the
 * step 6 report claimed they were shared on exactly that basis.
 *
 * So these tests are not written to catch a disagreement that exists. They are
 * written so that a FUTURE disagreement fails here instead of being noticed.
 * That is a different goal, and it rules out the obvious test: listing the
 * fields and asserting each one is present would need updating by the same
 * person making the change, which is the failure mode, not the guard.
 */

/** The one definition. Identity, not equivalence — see the comment above. */
describe('one definition, not two that agree', () => {
  it('is the SAME schema object both endpoints parse against', () => {
    /**
     * The strongest available assertion, and the reason this file leads with
     * it: two schemas cannot drift if they are one object. Every test below
     * this one is defence in depth for the case where someone re-introduces a
     * second definition — this is the one that says they did.
     */
    expect(recordsEndpointSchema).toBe(recordCreateSchema);
  });

  it('bounds nested arrays by the query layer constant, not a copy of its value', () => {
    /**
     * `MAX_NESTED` was a hand-copied `200` under a comment reading "Matches
     * MAX_NESTED_IDS in @/lib/db/queries/nested". Changing the real constant
     * would leave the schema accepting arrays the transaction then rejects —
     * the comment asserting the match is what makes it invisible.
     *
     * Asserted by DERIVING the boundary from the imported constant rather than
     * writing 200 here, which would just move the copy into the test.
     */
    const id = () => '00000000-0000-4000-8000-000000000000';
    const atLimit = Array.from({ length: MAX_NESTED_IDS }, id);
    const overLimit = Array.from({ length: MAX_NESTED_IDS + 1 }, id);

    const base = { title: 'Hear Nothing', artistId: id() };

    expect(recordCreateSchema.safeParse({ ...base, genreIds: atLimit }).success).toBe(true);
    expect(recordCreateSchema.safeParse({ ...base, genreIds: overLimit }).success).toBe(false);
    expect(recordCreateSchema.safeParse({ ...base, tagIds: atLimit }).success).toBe(true);
    expect(recordCreateSchema.safeParse({ ...base, tagIds: overLimit }).success).toBe(false);
  });
});

/**
 * Both endpoints accept identical inputs.
 *
 * Kept even though the identity test above makes them redundant TODAY: if
 * someone re-introduces a local schema, the identity test tells them the
 * objects differ and these tell them how. The parse results are compared
 * structurally, so a field added to one and not the other fails here without
 * anyone having listed the fields.
 */
describe('the two endpoints accept identical inputs', () => {
  const ID = '00000000-0000-4000-8000-000000000000';

  const cases: Array<[string, unknown]> = [
    ['the minimum payload', { title: 'Hear Nothing', artistId: ID }],
    [
      'every field at once',
      {
        title: 'Hear Nothing',
        artistId: ID,
        labelId: ID,
        formatId: ID,
        pressingId: ID,
        storeId: ID,
        releaseYear: 1982,
        conditionMedia: 'VG+',
        conditionSleeve: 'VG',
        purchasePrice: '24.50',
        purchaseDate: '2026-08-08',
        notes: 'Porky stamp',
        genreIds: [ID],
        tagIds: [ID],
      },
    ],
    ['explicit nulls', { title: 'X', artistId: ID, labelId: null, purchasePrice: null }],
    /**
     * Boundary values, not just malformed ones. Without these, a drifted BOUND
     * (max(500) becoming max(9999)) is invisible to every case above — each
     * one sits well inside both limits, so both schemas accept it and the
     * comparison agrees. NOTES' fixture rule: check the alternatives produce
     * different output before trusting the assertion.
     */
    ['a title at the 500 limit', { title: 'x'.repeat(500), artistId: ID }],
    ['a title one over the limit', { title: 'x'.repeat(501), artistId: ID }],
    ['notes at the 10,000 limit', { title: 'X', artistId: ID, notes: 'x'.repeat(10_000) }],
    ['notes one over the limit', { title: 'X', artistId: ID, notes: 'x'.repeat(10_001) }],
    ['a price at 8 digits', { title: 'X', artistId: ID, purchasePrice: '12345678.90' }],
    ['a price of 9 digits', { title: 'X', artistId: ID, purchasePrice: '123456789.00' }],
    ['an unknown key', { title: 'X', artistId: ID, colour: 'red' }],
    ['a missing title', { artistId: ID }],
    ['a non-uuid artist', { title: 'X', artistId: 'not-a-uuid' }],
    ['a year below the floor', { title: 'X', artistId: ID, releaseYear: 1800 }],
    ['a bad condition grade', { title: 'X', artistId: ID, conditionMedia: 'VG++' }],
    ['a float-shaped price', { title: 'X', artistId: ID, purchasePrice: '24.5.0' }],
    ['a non-uuid in genreIds', { title: 'X', artistId: ID, genreIds: ['nope'] }],
    ['a non-uuid in tagIds', { title: 'X', artistId: ID, tagIds: ['nope'] }],
  ];

  it.each(cases)('agrees on %s', (_label, payload) => {
    const acquire = recordCreateSchema.safeParse(payload);
    const create = recordsEndpointSchema.safeParse(payload);

    expect(create.success).toBe(acquire.success);

    if (create.success && acquire.success) {
      expect(create.data).toStrictEqual(acquire.data);
      return;
    }

    // Same rejection, not merely both rejected — a bare "both failed" would
    // pass even if they rejected for different reasons on different fields.
    const paths = (result: z.ZodSafeParseResult<unknown>) =>
      result.success ? [] : result.error.issues.map((issue) => issue.path.join('.')).sort();

    expect(paths(create)).toStrictEqual(paths(acquire));
  });
});
