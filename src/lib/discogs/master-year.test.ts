import { describe, expect, it } from 'vitest';
import type { DiscogsClient } from './client';
import { askMaster, masterYear } from './master-year';

/*
  Three states, not two (CLAUDE.md §2): a master with no year, a master that could not be read,
  and a year. The import folds the first two into null, since a failed master must not cost a
  record; the backfill's dry run must not, since a failed call counted as "no year" made two runs
  of the same data disagree, 1 against 4, on 3 Nov.
*/
const client = (answer: () => unknown): DiscogsClient => ({ get: async () => answer() as never, fetchImage: async () => { throw new Error('unused'); } }) as unknown as DiscogsClient;

describe('askMaster', () => {
  it('returns the year', async () => {
    expect(await askMaster(client(() => ({ year: 1970 })), 5)).toEqual({ kind: 'year', year: 1970 });
  });
  it('tells a master with no year from one that could not be read', async () => {
    expect(await askMaster(client(() => ({ year: 0 })), 5)).toEqual({ kind: 'none' });
    expect(await askMaster(client(() => { throw new Error('429'); }), 5)).toEqual({ kind: 'failed', reason: 'Error: 429' });
  });
  it('asks nothing without a master', async () => {
    expect(await askMaster(client(() => { throw new Error('must not be called'); }), null)).toEqual({ kind: 'none' });
  });
});

describe('masterYear, the import’s reading', () => {
  it('folds no year and a failed read into null, so a record is not lost to its master', async () => {
    expect(await masterYear(client(() => ({ year: 0 })), 5)).toBeNull();
    expect(await masterYear(client(() => { throw new Error('500'); }), 5)).toBeNull();
    expect(await masterYear(client(() => ({ year: 1970 })), 5)).toBe(1970);
  });
});
