import { config } from 'dotenv';
import { closeTestDb, getTestDb, releaseTestDatabase } from '../test/helpers/db';
import { compareLedgers, fixtureVocabulary, judgeGenres, loadStart, readLedger } from './ledger';

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

  /*
    The ledger's end, read before the database is released. Printed whatever
    it says, so a clean run says so too; a genre left behind fails the run
    by name. This error ends the run non-zero AFTER Playwright has printed
    its summary line, so a reader of that line alone does not see it: read
    the `[ledger]` lines.
  */
  let failure: string | null = null;
  const start = loadStart();
  if (start === null) process.stdout.write('[ledger] no start was recorded; nothing compared\n');
  else {
    const { genresLeft, moved } = compareLedgers(start, await readLedger(getTestDb()));
    for (const m of moved) process.stdout.write(`[ledger] ${m.table}: ${m.start} at the start, ${m.end} at the end\n`);
    if (moved.length === 0) process.stdout.write('[ledger] every table holds what it held at the start\n');
    const { fromFixtures, leaked } = judgeGenres(genresLeft, fixtureVocabulary());
    if (fromFixtures.length > 0) process.stdout.write(`[ledger] genres the app made from Discogs fixtures, which stand: ${fromFixtures.join(', ')}\n`);
    if (leaked.length > 0) failure = `[ledger] FAILED: ${leaked.length} genres left behind: ${leaked.join(', ')}`;
    else process.stdout.write('[ledger] genres: none left behind by a spec\n');
  }

  await releaseTestDatabase();
  await closeTestDb();
  if (failure !== null) {
    process.stdout.write(`${failure}\n`);
    throw new Error(failure);
  }
}
