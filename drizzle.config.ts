import { defineConfig } from 'drizzle-kit';
import { config } from 'dotenv';
import { parseEnv } from './src/lib/env/schema';
import { resolveDriver } from './src/lib/db/connection-string';

// Drizzle Kit runs as a standalone CLI outside Next.js, so it does not inherit
// the .env loading Next does for the app.
//
// .env.test is loaded first and only under NODE_ENV=test, mirroring what Next
// does in that mode. Without it, `NODE_ENV=test npm run db:migrate` reads the
// developer's own DATABASE_URL from .env.local and migrates the real database.
// dotenv never overwrites an already-set value, so the first file to define a
// variable wins and anything already in process.env still beats every file.
if (process.env.NODE_ENV === 'test') {
  config({ path: '.env.test', quiet: true });
}
config({ path: '.env.local', quiet: true });
config({ path: '.env', quiet: true });

// One schema governs every path. This previously re-implemented both the env
// check and the driver selection, so `db:migrate` accepted connection strings
// that boot validation would reject — the weakest validation in the project
// sitting on the one command that writes schema.
//
// parseEnv and resolveDriver are imported from ./src/lib/**, not from
// ./src/env.ts or ./src/db/client.ts: those carry `import 'server-only'`, whose
// entry point throws outside a React Server Component context and would break
// the CLI outright.
const env = parseEnv(process.env);

// And one selection function, so migrations and queries can never disagree
// about which database they address. resolveDriver also verifies that a
// TEST_DATABASE_URL genuinely points at the local container.
const { connectionString } = resolveDriver(env);

export default defineConfig({
  schema: ['./src/db/schema.ts', './src/db/relations.ts'],
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: { url: connectionString },
  strict: true,
  verbose: true,
});
