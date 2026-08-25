import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const REPO_ROOT = join(import.meta.dirname, '..', '..');
const MANIFEST = join(REPO_ROOT, '.next', 'server', 'functions-config-manifest.json');

/**
 * **Step 16 unit 1 — the serverless function limits, asserted rather than
 * assumed.**
 *
 * These began as a probe: after adding `export const maxDuration`, I read
 * `.next/server/functions-config-manifest.json` to check the value had actually
 * reached the output Vercel reads. CLAUDE.md §2 requires that probe to become a
 * test rather than a thing that was true once in a session.
 *
 * **Why this is a file assertion and not a behavioural one.** `maxDuration` is
 * a deploy-time contract with the platform. Nothing observable from a running
 * local server distinguishes a route with a 60s limit from one with the 10s
 * default, because neither is enforced by `next start` — the limit exists only
 * where the function is executed by Vercel. Per the standing rule, a file-text
 * assertion is right exactly when the property IS about a file, and this one is.
 *
 * **The failure this exists to catch is silent.** A `maxDuration` that does not
 * reach the manifest — a moved route file, a stray `'use client'`, a value
 * placed in `vercel.json` under a `functions` glob that no longer matches —
 * does not fail the build. The route simply gets the plan default, and the
 * first evidence is a gap analysis killed at 10 seconds in production. That is
 * the shape R6 named: an exit code reporting the last command rather than the
 * chain's purpose.
 */

/** Hobby's ceiling (SPEC.md §12 step 16). There is no larger value to choose. */
const CEILING_SECONDS = 60;

/**
 * The routes that can exceed the 10s default. Three come from R6 finding 4 —
 * both LLM calls (Opus, non-streaming, one measured at 44s) and the lineup walk
 * (~32 sequential MusicBrainz requests paced at 1/sec) — and the fourth is step
 * 16 unit 2's price refresh, which walks the collection at §6's 60/minute and
 * therefore exceeds a minute once ~60 records carry a release id.
 */
const LONG_ROUTES = [
  '/api/suggestions/ai',
  '/api/records/[id]/snippet',
  '/api/artists/[id]/lineup',
  '/api/discogs/refresh-prices',
] as const;

describe('the long routes declare a limit that survives the build', () => {
  /**
   * Fails against: a `maxDuration` export deleted from any of the three route
   * files, or one that the build silently drops.
   *
   * Skipped rather than failed with no build present, because `npm test` runs
   * without one — but never skipped in a state where it could pass vacuously,
   * since the assertions below all read the manifest it guards.
   */
  it.skipIf(!existsSync(MANIFEST))('every long route carries the ceiling', () => {
    const manifest = JSON.parse(readFileSync(MANIFEST, 'utf-8')) as {
      functions?: Record<string, { maxDuration?: number }>;
    };
    const functions = manifest.functions ?? {};

    for (const route of LONG_ROUTES) {
      expect(functions[route], `${route} must declare maxDuration`).toBeDefined();
      expect(functions[route]?.maxDuration, `${route}'s limit`).toBe(CEILING_SECONDS);
    }
  });
});

describe('the route files themselves', () => {
  /**
   * Fails against: the export being removed from a route file.
   *
   * Distinct from the manifest test above, and both are needed. The manifest
   * proves the value reached the BUILD, which is what Vercel reads — but it can
   * only run when a build exists. This one runs always and catches the deletion
   * at source, which is the edit a person actually makes.
   */
  it.each([
    'src/app/api/suggestions/ai/route.ts',
    'src/app/api/records/[id]/snippet/route.ts',
    'src/app/api/artists/[id]/lineup/route.ts',
    'src/app/api/discogs/refresh-prices/route.ts',
  ])('%s exports maxDuration', (path) => {
    const source = readFileSync(join(REPO_ROOT, path), 'utf-8');

    expect(source).toMatch(/export const maxDuration = 60;/);
  });
});

describe('vercel.json', () => {
  /**
   * **Fails against a `functions` block reappearing here**, and that is the
   * point rather than tidiness.
   *
   * `maxDuration` was originally written into `vercel.json` as a `functions`
   * glob. It was moved to route segment exports because Next validates those at
   * build time and surfaces them in the manifest above, whereas a glob that
   * stops matching — a renamed directory, a moved route — fails SILENTLY back
   * to the plan default. Two places declaring one limit is a drift the build
   * cannot see, so there is deliberately only one.
   */
  it('declares no per-function limits, so the route exports are the only source', () => {
    const config = JSON.parse(readFileSync(join(REPO_ROOT, 'vercel.json'), 'utf-8')) as Record<
      string,
      unknown
    >;

    expect(config.functions).toBeUndefined();
  });

  /**
   * Fails against: a `crons` entry added here.
   *
   * The price refresh is driven by GitHub Actions rather than Vercel Cron —
   * decided at step 16 because Hobby limits Vercel crons to once a day and
   * Actions has no such cap. The endpoint's auth is unchanged and caller-
   * agnostic (a `CRON_SECRET` bearer token, constant-time compared), so this
   * asserts only that the schedule lives in one place.
   */
  it('schedules no crons, because GitHub Actions drives the refresh', () => {
    const config = JSON.parse(readFileSync(join(REPO_ROOT, 'vercel.json'), 'utf-8')) as Record<
      string,
      unknown
    >;

    expect(config.crons).toBeUndefined();
  });
});
