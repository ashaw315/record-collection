#!/usr/bin/env node --experimental-strip-types
/**
 * Asserts that a database's migration ledger agrees with the repo's journal.
 *
 * **Why this exists (NOTES: "'The script ran' is not 'the script did what it is
 * for'").** `drizzle-kit migrate` derives its work from the ledger and the
 * journal, and a failed run changes neither — so when they diverge it recomputes
 * the same batch, dies on `42701`, rolls back, prints "migrations applied
 * successfully" and exits 0. Permanently, with no signal anywhere. Three
 * databases in this project reached that state, and the production one is the
 * version with no cheap recovery.
 *
 * So `db:migrate` no longer reports the exit code of its last command. It runs
 * this, which asserts the STATE.
 *
 * **Why a script rather than a vitest file like `db:verify`.** That one targets
 * the local container, because vitest loads `.env.test`. This has to verify
 * whichever database `db:migrate` just migrated — including production — so it
 * resolves its target exactly the way drizzle.config.ts does, from the same
 * `parseEnv` and `resolveDriver`. A verifier pointed at a different database
 * from the migration it verifies is worse than none.
 *
 * **No new dependency.** Node 24 strips TypeScript natively, so the shared
 * comparison is imported rather than reimplemented — a second copy of this
 * logic in JavaScript is exactly how two callers end up disagreeing.
 *
 * **This never writes.** It reads the journal, reads the ledger, and compares.
 */
import process from 'node:process';
import { config } from 'dotenv';
import pg from 'pg';
import { compareMigrationState } from '../src/lib/db/migration-state.ts';
import { readJournal, readLedger } from '../src/lib/db/migration-state-io.ts';
import { parseEnv } from '../src/lib/env/schema.ts';
import { resolveDriver } from '../src/lib/db/connection-string.ts';

// The same loading order as drizzle.config.ts, and for the same reason: without
// the NODE_ENV=test branch this reads .env.local and inspects Neon while the
// migration it is verifying ran against the local container.
if (process.env.NODE_ENV === 'test') {
  config({ path: '.env.test', quiet: true });
}
config({ path: '.env.local', quiet: true });
config({ path: '.env', quiet: true });

const { connectionString } = resolveDriver(parseEnv(process.env));

const client = new pg.Client({ connectionString });
await client.connect();

try {
  const journal = readJournal(process.cwd());
  const ledger = await readLedger(client);
  const { consistent, missing } = compareMigrationState({ journal, ledger });

  if (!consistent) {
    /*
     * Named individually. "The database is behind" sends someone to compare two
     * lists by hand; naming the files is the difference between a message that
     * reports a problem and one that can be acted on.
     */
    console.error(
      `Migration state is INCONSISTENT: ${missing.length} of ${journal.length} journal entries have no matching row in the database ledger.\n` +
        missing.map((tag) => `  - ${tag}`).join('\n') +
        `\n\nThis is the state in which \`drizzle-kit migrate\` prints success and applies\n` +
        `nothing, permanently — re-running it will not help. See NOTES.md,\n` +
        `"the absence-as-success family gains its worst member".`,
    );
    process.exit(1);
  }

  // Says what it checked, not merely that it passed: a bare "ok" from a script
  // that found an empty journal would look identical to a real verification.
  console.log(
    `Migration state consistent: ${journal.length} of ${journal.length} migrations applied.`,
  );
} finally {
  await client.end();
}
