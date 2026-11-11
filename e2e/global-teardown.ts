import { config } from 'dotenv';
import { closeTestDb, getTestDb, releaseTestDatabase } from '../test/helpers/db';
import { compareLedgers, fixtureLabelNames, fixtureReleaseIds, fixtureVocabulary, judgeGenres, judgeLabels, judgeReleases, loadStart, readLedger } from './ledger';

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
    const { genresLeft, recordsLeft, releasesLeft, pressingsLeft, labelsLeft, moved } = compareLedgers(start, await readLedger(getTestDb()));
    for (const m of moved) process.stdout.write(`[ledger] ${m.table}: ${m.start} at the start, ${m.end} at the end\n`);
    if (moved.length === 0) process.stdout.write('[ledger] every table holds what it held at the start\n');
    const { fromFixtures, leaked } = judgeGenres(genresLeft, fixtureVocabulary());
    if (fromFixtures.length > 0) process.stdout.write(`[ledger] genres the app made from Discogs fixtures, which stand: ${fromFixtures.join(', ')}\n`);
    /* Named, so the run says which spec seeded without tracking (10 Nov); a leaked record is §T.6's source for every spec after it. */
    if (recordsLeft.length > 0) failure = `[ledger] FAILED: ${recordsLeft.length} record${recordsLeft.length === 1 ? '' : 's'} left behind: ${recordsLeft.join('; ')}`;
    /* Releases by id (Q67): a fixture's own id stands, shared between the workers as the fixtures' genres are; a run's own id left is a seed no test tracked. */
    const releases = judgeReleases(releasesLeft, fixtureReleaseIds());
    if (releases.fromFixtures.length > 0) process.stdout.write(`[ledger] releases cached from Discogs fixtures under their own ids, which stand: ${releases.fromFixtures.join(', ')}\n`);
    if (releases.leaked.length > 0) failure = `${failure === null ? '' : `${failure}\n`}[ledger] FAILED: ${releases.leaked.length} release${releases.leaked.length === 1 ? '' : 's'} left behind: ${releases.leaked.join(', ')}`;
    /* Pressings by id (Q67's pressing half, 11 Nov): found-or-created with a record and not shared, so nothing stands; the cleanup deletes a tracked record's pressing when nothing references it after. */
    if (pressingsLeft.length > 0) failure = `${failure === null ? '' : `${failure}\n`}[ledger] FAILED: ${pressingsLeft.length} pressing${pressingsLeft.length === 1 ? '' : 's'} left behind: ${pressingsLeft.join('; ')}`;
    /* Labels by name (Q67's labels half, 11 Nov): a Discogs fixture's label stands, shared between the workers as its genres are; a name a spec posted and did not register is a leak. */
    const labels = judgeLabels(labelsLeft, fixtureLabelNames());
    if (labels.fromFixtures.length > 0) process.stdout.write(`[ledger] labels the app made from Discogs fixtures, which stand: ${labels.fromFixtures.join(', ')}\n`);
    if (labels.leaked.length > 0) failure = `${failure === null ? '' : `${failure}\n`}[ledger] FAILED: ${labels.leaked.length} label${labels.leaked.length === 1 ? '' : 's'} left behind: ${labels.leaked.join(', ')}`;
    if (leaked.length > 0) failure = `${failure === null ? '' : `${failure}\n`}[ledger] FAILED: ${leaked.length} genres left behind: ${leaked.join(', ')}`;
    else process.stdout.write('[ledger] genres: none left behind by a spec\n');
  }

  await releaseTestDatabase();
  await closeTestDb();
  if (failure !== null) {
    process.stdout.write(`${failure}\n`);
    throw new Error(failure);
  }
}
