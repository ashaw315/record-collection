import type { DiscogsClient } from './client';

/**
 * The album's year, from its master (§4.2): `release_year` is the original year,
 * and a master is the album across its pressings. Null when there is no master,
 * it has no year, or it cannot be read: a failed master must not cost a record.
 * Takes the client it is given, so the call spends from the shared bucket.
 */
export async function masterYear(client: DiscogsClient, masterId: number | null): Promise<number | null> {
  if (masterId === null) return null;
  try {
    const { year } = await client.get<{ year?: number }>(`/masters/${masterId}`);
    return typeof year === 'number' && year > 0 ? year : null;
  } catch {
    return null;
  }
}
