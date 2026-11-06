import 'server-only';
import { getEnv } from '@/env';

/**
 * **Whether the probe pages are open: the eight harness routes and the error
 * probe, which 404 everywhere else.**
 *
 * They gated on `process.env.NODE_ENV === 'production'`, and `next build`
 * inlines that literal as "production" into the server bundles too, whatever
 * `next start` is given: the first build-served run found every probe closed
 * (Q39, 5 Nov, 109 tests in 18 files). The fix was not allowed to be "read
 * the runtime env instead" (the coordinator): the gate is two conditions,
 * independent, closed by default.
 *
 * 1. `E2E_PROBES=1`, exactly. Set by `playwright.config.ts` on the server it
 *    starts and by nothing else; Vercel never sets it.
 * 2. The PARSED env's `NODE_ENV` is not production. Vercel always sets
 *    production, so a stray paste of the first variable into a deploy opens
 *    nothing. Read through `getEnv()` and not the literal, which is how the
 *    login route's cookie came out right under the same build that closed
 *    the pages: the parsed object a build cannot inline.
 *
 * The first is read alone and first, so a build with the variable unset
 * never parses the env: the root layout asks, `/_not-found` is rendered at
 * build time, and the unit job builds with no database.
 *
 * Verified where it matters: the build-served e2e run (every probe spec), and
 * a curl of all nine paths against the production URL after the deploy,
 * recorded in NOTES.
 */
export function probesOpen(
  source: Record<string, string | undefined> = process.env,
  nodeEnv: () => string = () => getEnv().NODE_ENV,
): boolean {
  if (source.E2E_PROBES !== '1') return false;
  return nodeEnv() !== 'production';
}
