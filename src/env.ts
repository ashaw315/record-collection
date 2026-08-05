import 'server-only';
import { parseEnv, type Env } from '@/lib/env/schema';

/**
 * Server-side entry point for environment access.
 *
 * The schema and parseEnv live in @/lib/env/schema, without the `server-only`
 * marker, so that drizzle.config.ts can validate against the identical rules —
 * drizzle-kit loads its config as a plain CLI module and `server-only` throws
 * on import there. This module keeps the marker, so application code importing
 * `@/env` still cannot leak into a client bundle (CLAUDE.md §6).
 */

export { parseEnv };
export type { Env };

let cached: Env | undefined;

/**
 * Validates `process.env` on first access and caches the result. Call this from
 * server entry points so a misconfigured deploy fails fast with a message
 * naming the offending variable (SPEC.md §2).
 *
 * Deliberately not a module-level `const`: that would run validation as an
 * import side effect, making the module impossible to import in a test or
 * tooling context without a fully populated environment.
 *
 * Note this covers the Node runtime only. Middleware runs in Edge and cannot
 * import this file at all; it validates through @/lib/env/edge instead.
 */
export function getEnv(): Env {
  cached ??= parseEnv(process.env);
  return cached;
}
