import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/*
 * **Loaded through a variable specifier, deliberately.**
 *
 * `tsc` rejects a literal import path ending in `.mts` under this tsconfig
 * (TS5097, no `allowImportingTsExtensions`) and cannot resolve the extensionless
 * form either — but the file must be loaded WITH its real extension for vite to
 * find it. Holding the specifier in a variable defers resolution to runtime,
 * where vite resolves it correctly.
 *
 * The config is then typed structurally rather than imported as a type: this
 * guard only reads `test.projects` and `test.globalSetup`, and asserting the
 * shape it depends on is the entire point of the file.
 */
type ProbeRelevantConfig = {
  test?: {
    globalSetup?: unknown;
    projects?: unknown[];
  };
};

const CONFIG_SPECIFIER = '../../vitest.config.mts';
const base: ProbeRelevantConfig = (
  (await import(/* @vite-ignore */ CONFIG_SPECIFIER)) as { default: ProbeRelevantConfig }
).default;

const REPO_ROOT = join(import.meta.dirname, '..', '..');

/**
 * The `env-loading` probe reaches INTO `vitest.config.mts`'s shape, and this
 * asserts the two properties it depends on.
 *
 * **Written after that probe hung four times in one session.** The A46 component
 * layer moved `globalSetup` and `include` from `test` into `test.projects[]`,
 * and the probe's
 *
 *     const { globalSetup: _omit, ...test } = base.test ?? {};
 *
 * silently stopped stripping anything — it removed a key that was no longer
 * there. The probe then spawned a full two-project run whose global setup threw
 * on the very variable the test had removed, under a parent blocked on
 * `execFileSync` with no timeout.
 *
 * **Nothing failed. It HUNG**, which is why A46's own run did not catch it.
 *
 * > A test that couples to another file's SHAPE needs a test on that shape, or
 * > it degrades silently when the shape moves. The coupling is legitimate here —
 * > the probe must run the REAL config or it proves nothing — so the coupling
 * > gets a guard rather than being removed.
 */
describe('the env-loading probe can still isolate itself', () => {
  /**
   * Fails against today's regression: `globalSetup` living somewhere the
   * probe's destructure cannot reach.
   */
  it('knows where globalSetup actually lives', () => {
    /*
     * A project entry may be a glob STRING rather than an inline config, so this
     * narrows to the object form before reaching for `.test`. `tsc` rejects the
     * unguarded version, and it would throw at runtime the day someone adds a
     * path-based project.
     */
    const projects = base.test?.projects ?? [];
    const server = projects.find(
      (p): p is { test: { globalSetup?: unknown } } =>
        typeof p === 'object' && p !== null && 'test' in p,
    );
    const serverSetup = server?.test?.globalSetup;

    expect(base.test, 'not at the top level — the probe must not look there').not.toHaveProperty(
      'globalSetup',
    );
    expect(serverSetup, 'in the server project, where the probe strips it').toBeDefined();
  });

  /**
   * The probe overrides `include` to run ONE file. A sibling `projects` key
   * wins over `include`, so a probe config that keeps `projects` runs the whole
   * suite recursively — which is the hang.
   */
  it('has projects, so a probe config must drop them rather than add include', () => {
    expect(base.test?.projects, 'the shape the probe must account for').toBeDefined();
    expect(Array.isArray(base.test?.projects)).toBe(true);
  });

  /**
   * **The stash must not outlive a killed run.** `finally` does not run on a
   * kill, so a probe that MOVES `.env.local` can strand it — which is exactly
   * what happened, from Aug 25 to Aug 28, invisibly.
   *
   * Fails against a probe that reintroduces the rename.
   */
  it('never moves .env.local out of the way', async () => {
    const source = await import('node:fs').then((fs) =>
      fs.readFileSync(join(REPO_ROOT, 'test/repo/env-loading.test.ts'), 'utf-8'),
    );

    expect(source, 'a rename can strand the file on a kill').not.toMatch(/renameSync/);
    expect(source, 'and the stash name must be gone with it').not.toMatch(
      /env-loading-test-stash/,
    );
  });

  /**
   * Every child process the probe spawns must be bounded. A hang inside a test
   * is reported as a stalled suite, which reads as "still running" rather than
   * as a failure — the reporting shape this project keeps refusing.
   */
  it('bounds every spawned child with a timeout', async () => {
    const source = await import('node:fs').then((fs) =>
      fs.readFileSync(join(REPO_ROOT, 'test/repo/env-loading.test.ts'), 'utf-8'),
    );

    const spawns = source.match(/execFileSync\(/g) ?? [];
    const timeouts = source.match(/timeout:\s*\d/g) ?? [];

    expect(spawns.length, 'the probe spawns children').toBeGreaterThan(0);
    expect(timeouts.length, 'and each one is bounded').toBeGreaterThanOrEqual(spawns.length);
  });

  /**
   * **THE PROBE CONFIG MUST NOT INHERIT `projects`, AND THIS IS THE MECHANISM
   * RATHER THAN THE MEMORY OF ONE.**
   *
   * The fix for the fork bomb prevents recursion BY CONSTRUCTION: the probe
   * config is written out explicitly, with no `projects` key, so the child runs
   * one file. **But construction is not a constraint.** A future edit that
   * reintroduces `...base.test` — the most natural way to "keep the real config"
   * — puts `projects` back, and `projects` beats a sibling `include`, so the
   * child runs the WHOLE suite including this very file, which spawns another
   * child, forever.
   *
   * **Verified: with the four guards above in place and a `...base.test` spread
   * reintroduced, all five passed.** The gap was real, which is why this exists.
   *
   * **What the recursion actually looked like**, observed 2026-08-28 and worse
   * than the first diagnosis recorded: not one child hung for 21 minutes, but a
   * new child every ~5 seconds, each at 0.0% CPU — 45+ processes in two minutes
   * and still climbing when the run was killed.
   *
   * So this asserts on the SOURCE that generates the config, because the config
   * is a string written at runtime and there is no object to inspect until the
   * probe has already spawned.
   */
  it('writes a probe config that cannot inherit projects', async () => {
    const source = await import('node:fs').then((fs) =>
      fs.readFileSync(join(REPO_ROOT, 'test/repo/env-loading.test.ts'), 'utf-8'),
    );

    const configLiteral = source.match(/PROBE_CONFIG,\s*`([\s\S]*?)`/)?.[1];
    expect(configLiteral, 'the probe writes a config literal').toBeDefined();

    /*
     * A spread of the real `test` block is the regression: it carries
     * `projects`, and `projects` wins over `include`. Spreading the top-level
     * `base` is fine and deliberate — `resolve` aliases are what let the probe
     * load at all — so only the inner spread is forbidden.
     */
    expect(
      configLiteral,
      'spreading base.test carries projects, which beats include and recurses',
    ).not.toMatch(/\.\.\.\s*base\.test/);
    expect(
      configLiteral,
      'nor may it name projects itself',
    ).not.toMatch(/projects/);

    /*
     * And the include must be the single probe file. A config that inherits the
     * real `include` runs `test/**` — this file among them.
     */
    expect(configLiteral, 'runs exactly one file').toMatch(
      /include:\s*\['test\/repo\/\.env-loading-probe\/probe\.test\.ts'\]/,
    );
  });

  it('leaves no probe directory behind', () => {
    expect(existsSync(join(REPO_ROOT, 'test/repo/.env-loading-probe'))).toBe(false);
    expect(existsSync(join(REPO_ROOT, '.env.local.env-loading-test-stash'))).toBe(false);
  });
});
