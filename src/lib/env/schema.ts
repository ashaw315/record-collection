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

/**
 * `$2[aby]$` covers every prefix bcryptjs emits, and the 53 trailing characters
 * are bcrypt's own base64 alphabet (`./A-Za-z0-9`) — not standard base64, so
 * `+` and `=` never appear. 60 characters in total.
 */
const BCRYPT_HASH = /^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/;

/**
 * Collapses `\$` to `$` so the two env loaders agree on one value.
 *
 * They do not agree on their own, and R6 measured both halves rather than
 * assuming either. **Next expands `$VAR` references in env values**, so
 * `.env.test` and `.env.local` must escape a bcrypt hash as `\$2b\$10\$…` —
 * unescaping it makes `next dev` fail to boot. **dotenv — which vitest and
 * drizzle-kit use — neither expands nor unescapes**, so it hands the same file's
 * value over with the backslashes intact, 63 characters long.
 *
 * Normalising here rather than accepting both shapes downstream is what keeps
 * the check honest: the schema still demands exactly 60 characters of real
 * bcrypt, and a value that is mis-escaped for the runtime that reads it still
 * fails. What this removes is only the backslash, which no bcrypt hash contains
 * and which is therefore unambiguous.
 *
 * A Vercel value needs no escaping (the dashboard does not expand), and passes
 * through untouched.
 */
function unescapeDollars(value: string): string {
  return value.replaceAll('\\$', '$');
}

export const envSchema = z.object({
  DATABASE_URL: postgresUrl,

  // Present only when running against the local Docker Postgres (CLAUDE.md §2).
  TEST_DATABASE_URL: postgresUrl.optional(),

  /**
   * A bcrypt hash, checked for SHAPE rather than mere presence.
   *
   * `.min(1)` was the third instance in this project of an is-configured check
   * testing presence where the failure mode is malformation — after a
   * placeholder Anthropic key that passed every check and spent a rate-limit
   * slot, and a shell-escaped hash that passed and broke every login. See
   * NOTES.md, "presence is not shape".
   *
   * This one is the worst of the three because it is SILENT. Next expands
   * `$VAR` references in env values, truncating an unescaped 60-character hash
   * to 46 (.env.example documents the trap); bcryptjs then returns `false`
   * rather than throwing, and the login route — deliberately vague, and not
   * wrapped in withErrorHandling — answers 401 "Incorrect password" and logs
   * nothing. The result is a deploy that boots green, renders a normal /login,
   * and rejects the correct password forever.
   *
   * Checking here does NOT weaken that vague 401: this fails at boot, naming
   * the variable to an operator reading deploy logs, and says nothing to
   * whoever is at the login form.
   *
   * The value is unescaped before it is checked — see unescapeDollars for why
   * the two env loaders disagree and why normalising is safe.
   */
  APP_PASSWORD_HASH: z
    .string()
    .transform(unescapeDollars)
    .refine((value) => BCRYPT_HASH.test(value), {
      message: 'must be a 60-character bcrypt hash (see .env.example: escape every $ as \\$)',
    }),

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
   * `isBlobConfigured()` does that for uploads, and `isAnthropicConfigured()`
   * does it for §9.2's gap analysis and §10b's snippet.
   *
   * (This previously read "step 12 owes the same for `ANTHROPIC_API_KEY`" —
   * a debt assigned to a step that was retired at step 13 and will never
   * arrive, which is the untriggered-deferral shape in a source file. Step 14
   * paid it; the sentence now names the function rather than a future.)
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
