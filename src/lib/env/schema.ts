import { z } from 'zod';

/**
 * The environment schema itself, with no `server-only` marker.
 *
 * That marker is what makes src/env.ts unimportable outside a React Server
 * Component context — including from drizzle.config.ts, which drizzle-kit loads
 * as a plain CLI module and which crashes on `server-only`'s throwing entry
 * point. Keeping the schema here lets the migration path validate against the
 * exact same rules as the app instead of re-implementing a weaker check, which
 * is how `db:migrate` ended up accepting connection strings that boot
 * validation rejected.
 *
 * src/env.ts remains the entry point for application code: it re-exports this
 * and adds the `server-only` guard plus the cached getEnv().
 */

/**
 * Postgres connection strings are not plain URLs to Zod's eye — it accepts any
 * scheme — so the scheme is checked explicitly. A password-only URL with no
 * host (`postgresql:///db`) parses as a valid URL but cannot be connected to,
 * hence the hostname check.
 */
const postgresUrl = z
  .string()
  .min(1)
  .refine(
    (value) => {
      let url: URL;
      try {
        url = new URL(value);
      } catch {
        return false;
      }
      const schemeOk = url.protocol === 'postgresql:' || url.protocol === 'postgres:';
      return schemeOk && url.hostname.length > 0;
    },
    { message: 'must be a postgresql:// or postgres:// connection string with a host' },
  );

export const envSchema = z.object({
  DATABASE_URL: postgresUrl,

  // Present only when running against the local Docker Postgres (CLAUDE.md §2).
  TEST_DATABASE_URL: postgresUrl.optional(),

  APP_PASSWORD_HASH: z.string().min(1),

  // 32 chars is the floor for a signing key that is not trivially brute-forced.
  // The Edge subset in ./edge.ts must apply the same floor; a test asserts it.
  SESSION_SECRET: z.string().min(32, 'must be at least 32 characters'),
  CRON_SECRET: z.string().min(32, 'must be at least 32 characters'),

  DISCOGS_TOKEN: z.string().min(1),
  /**
   * §12 step 11: MusicBrainz requires a User-Agent carrying contact
   * information, as a term of use. Optional here rather than required — the
   * app runs without the MusicBrainz import, and a missing value fails loudly
   * at `getMusicBrainzClient()` where the cause is obvious, rather than
   * blocking every deploy that has not configured it.
   */
  MUSICBRAINZ_CONTACT_EMAIL: z.string().optional(),

  /**
   * Optional by DESIGN, not because they are pending.
   *
   * §10's in-store case wants the app usable without every integration
   * configured, and a developer running it locally has the same claim — so a
   * missing key degrades one feature rather than stopping the server.
   *
   * The cost is that each absence must be detected where it is USED, or it
   * surfaces as "Internal server error" for what is a deployment problem.
   * `isBlobConfigured()` does that for uploads; step 12 owes the same for
   * `ANTHROPIC_API_KEY`.
   *
   * (This comment previously read "not required until build steps 12 and 8
   * respectively" — true when written, false once step 8 shipped. A dated claim
   * in the file that enforces it, the same shape as a placeholder assertion.)
   */
  ANTHROPIC_API_KEY: z.string().min(1).optional(),
  BLOB_READ_WRITE_TOKEN: z.string().min(1).optional(),

  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
});

export type Env = z.infer<typeof envSchema>;

/**
 * Zod treats an empty string as present-but-invalid, which for env vars is
 * indistinguishable from absent — `FOO=` in a .env file is a missing value.
 */
function withoutEmptyValues(source: Record<string, string | undefined>) {
  return Object.fromEntries(Object.entries(source).filter(([, value]) => value !== ''));
}

export function parseEnv(source: Record<string, string | undefined>): Env {
  const result = envSchema.safeParse(withoutEmptyValues(source));

  if (!result.success) {
    // Names and reasons only, never values: this message reaches deploy logs.
    const details = result.error.issues
      .map((issue) => {
        const name = issue.path.join('.');
        const reason = issue.code === 'invalid_type' ? 'is missing' : issue.message;
        return `  - ${name} ${reason}`;
      })
      .join('\n');

    throw new Error(`Invalid environment configuration:\n${details}`);
  }

  return result.data;
}
