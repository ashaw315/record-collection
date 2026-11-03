import type { DiscogsClient } from './client';

/**
 * The album's year, from its master (§4.2): `release_year` is the original year, and a master is
 * the album across its pressings. Takes the client it is given, so the call spends from the
 * shared bucket.
 *
 * Three states, not two (CLAUDE.md §2): a year, a master with no year, and a master that could
 * not be read. `askMaster` keeps them apart; the backfill's dry run needs to, because a failed call
 * counted as "no year" made two runs of the same data disagree. `masterYear` is the import's
 * reading, which folds the last two into null: a failed master must not cost a record.
 */
export type MasterAnswer = { kind: 'year'; year: number } | { kind: 'none' } | { kind: 'failed'; reason: string };

export async function askMaster(client: DiscogsClient, masterId: number | null): Promise<MasterAnswer> {
  if (masterId === null) return { kind: 'none' };
  try {
    const { year } = await client.get<{ year?: number }>(`/masters/${masterId}`);
    return typeof year === 'number' && year > 0 ? { kind: 'year', year } : { kind: 'none' };
  } catch (cause) {
    return { kind: 'failed', reason: String(cause).slice(0, 200) };
  }
}

export async function masterYear(client: DiscogsClient, masterId: number | null): Promise<number | null> {
  const answer = await askMaster(client, masterId);
  return answer.kind === 'year' ? answer.year : null;
}
