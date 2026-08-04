import { defineConfig } from 'drizzle-kit';
import { config } from 'dotenv';

// Drizzle Kit runs as a standalone CLI outside Next.js, so it does not inherit
// the .env loading Next does for the app.
config({ path: '.env.local', quiet: true });
config({ path: '.env', quiet: true });

// Migrations are applied to the local Docker Postgres when running against the
// test database, and to Neon otherwise. Mirrors the selection in src/db/client.ts.
const url =
  process.env.NODE_ENV === 'test' && process.env.TEST_DATABASE_URL
    ? process.env.TEST_DATABASE_URL
    : process.env.DATABASE_URL;

if (!url) {
  throw new Error(
    'Invalid environment configuration:\n  - DATABASE_URL is missing (or TEST_DATABASE_URL when NODE_ENV=test)',
  );
}

export default defineConfig({
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: { url },
  strict: true,
  verbose: true,
});
