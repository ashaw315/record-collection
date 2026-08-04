import 'server-only';
import { z } from 'zod';

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

const envSchema = z.object({
  DATABASE_URL: postgresUrl,

  // Present only when running against the local Docker Postgres (CLAUDE.md §2).
  TEST_DATABASE_URL: postgresUrl.optional(),

  APP_PASSWORD_HASH: z.string().min(1),

  // 32 chars is the floor for a signing key that is not trivially brute-forced.
  SESSION_SECRET: z.string().min(32, 'must be at least 32 characters'),
  CRON_SECRET: z.string().min(32, 'must be at least 32 characters'),

  DISCOGS_TOKEN: z.string().min(1),

  // Not required until build steps 12 and 8 respectively; the dev server must
  // start without them.
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

let cached: Env | undefined;

/**
 * Validates `process.env` on first access and caches the result. Call this from
 * server entry points so a misconfigured deploy fails fast with a message
 * naming the offending variable (SPEC.md §2).
 *
 * Deliberately not a module-level `const`: that would run validation as an
 * import side effect, making the module impossible to import in a test or
 * tooling context without a fully populated environment.
 */
export function getEnv(): Env {
  cached ??= parseEnv(process.env);
  return cached;
}
