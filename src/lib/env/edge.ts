import { z } from 'zod';

/**
 * Environment validation for the Edge runtime.
 *
 * `src/env.ts` is marked `import 'server-only'` (CLAUDE.md §6), which makes it
 * unimportable from middleware — so middleware read `process.env` raw and
 * nothing checked it. The failure that produced was silent and confusing: a
 * missing or mismatched SESSION_SECRET meant every session cookie failed
 * verification, so a successful login bounced straight back to /login forever,
 * with no error logged anywhere.
 *
 * This module carries no `server-only` import and no Node built-ins, so it
 * loads in Edge. It covers only the variables middleware actually reads; the
 * full schema in src/env.ts still governs the Node runtime, and a test asserts
 * the two agree on everything they share.
 */

/** Exactly the variables middleware reads. Kept in sync with src/env.ts. */
export const EDGE_ENV_KEYS = ['SESSION_SECRET', 'CRON_SECRET'] as const;

const SECRET_MIN_LENGTH = 32;

const edgeEnvSchema = z.object({
  SESSION_SECRET: z.string().min(SECRET_MIN_LENGTH, 'must be at least 32 characters'),
  CRON_SECRET: z.string().min(SECRET_MIN_LENGTH, 'must be at least 32 characters'),
});

export type EdgeEnv = z.infer<typeof edgeEnvSchema>;

/**
 * An empty value is an absent one — `FOO=` in a deploy config means unset, and
 * reporting it as "too short" would send someone hunting for the wrong problem.
 */
function withoutEmptyValues(source: Record<string, string | undefined>) {
  return Object.fromEntries(Object.entries(source).filter(([, value]) => value !== ''));
}

export function parseEdgeEnv(source: Record<string, string | undefined>): EdgeEnv {
  const result = edgeEnvSchema.safeParse(withoutEmptyValues(source));

  if (!result.success) {
    // Names and reasons only — never values. This message reaches logs and, on
    // a 500, the operator looking at the response.
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
