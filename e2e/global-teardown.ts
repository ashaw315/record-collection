import { config } from 'dotenv';
import { closeTestDb, releaseTestDatabase } from '../test/helpers/db';

/**
 * Releases the database hold `global-setup.ts` took (A47).
 *
 * **Without this the hold outlives the run and blocks the next one** — a guard
 * against false failures becoming a source of them. `currentHolder` also sweeps
 * a hold whose process is gone, which covers the run killed before this hook
 * gets to execute; this is the ordinary path, that is the safety net.
 */
export default async function globalTeardown(): Promise<void> {
  config({ path: '.env.test', quiet: true });

  await releaseTestDatabase();
  await closeTestDb();
}
