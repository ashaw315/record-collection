import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * **The gate runs against a build, not `next dev` (Q39, the coordinator,
 * 5 Nov).** The app ships as a build on Vercel, and every first response from
 * a dev server under four workers is a compile: record-navigation:295 missed
 * its 60s budget on both attempts at four workers, against 11.1s and 17.5s at
 * one (NOTES, the runs table). `E2E_SERVER=build` makes the config's
 * webServer build and then start, under the same `NODE_ENV=test` the dev
 * command carries so `.env.test` is loaded and `.next-test` is the build
 * directory. A build inside the command rather than beside it, so a run can
 * never meet a stale build: the trap `reuseExistingServer: false` already
 * closes for a stale server.
 *
 * Read from the config as Playwright loads it, in a child process, and not
 * from its text: the claim is what the server command IS under each setting.
 * Fails against: a config with no switch (the build command is the dev
 * command); a build command that forgets `NODE_ENV=test` or the port; a
 * timeout that a build cannot meet; an unknown value accepted as dev.
 */
function webServer(env: Record<string, string | undefined>) {
  /* tsx hands the file over as CommonJS, so the config is `default.default`. */
  const out = execFileSync('node', ['--import', 'tsx', '-e', "import('./playwright.config.ts').then((m) => console.log(JSON.stringify((m.default.default ?? m.default).webServer)))"], {
    encoding: 'utf8',
    env: { ...process.env, E2E_SERVER: undefined, E2E_PORT: undefined, ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  return JSON.parse(out.trim().split('\n').at(-1) ?? '') as { command: string; timeout: number; stdout?: string; env?: Record<string, string> };
}

describe('the e2e server, chosen by E2E_SERVER', () => {
  it('is next dev on the port by default, as before', () => {
    const server = webServer({});
    expect(server.command).toBe('NODE_ENV=test npm run dev -- --port 3100');
    expect(server.timeout).toBe(120_000);
  });

  it('under E2E_SERVER=build, builds under NODE_ENV=test and then starts the build on the port, with time for the build and its output in the log', () => {
    const server = webServer({ E2E_SERVER: 'build', E2E_PORT: '3101' });
    expect(server.command).toBe('NODE_ENV=test npm run build && NODE_ENV=test npm run start -- --port 3101');
    /* CI's build took 29s and 31s on 5 Nov (runs 42108198297 and 42115186427, the unit job); a cold cache could double it. */
    expect(server.timeout).toBeGreaterThanOrEqual(300_000);
    /* The build's own "Compiled" line lands in the log, so the build's cost is read and not inferred. */
    expect(server.stdout).toBe('pipe');
  });

  it('refuses a value that is neither dev nor build, naming it', () => {
    expect(() => webServer({ E2E_SERVER: 'prod' })).toThrow(/E2E_SERVER[\s\S]*prod[\s\S]*dev[\s\S]*build/);
  });
});

/*
  The probe pages open on `E2E_PROBES=1` AND a parsed NODE_ENV that is not production
  (src/lib/probes.ts, Q39). The variable is set here, on the server the config starts, and
  nowhere else: Playwright merges `webServer.env` over its own process env, so every run
  through this config carries it, the capture project and the gates included, and a deploy
  never sees the config. Fails against a config that forgets it on either command (every probe
  spec then 404s under that server) and against one that sets it to anything but "1".
*/
describe('the e2e server opens the probe pages', () => {
  it('carries E2E_PROBES=1 in the webServer env under either command, so the eight probe pages and the error probe are served', () => {
    expect(webServer({}).env).toEqual({ E2E_PROBES: '1' });
    expect(webServer({ E2E_SERVER: 'build' }).env).toEqual({ E2E_PROBES: '1' });
  });
});

/*
  The two gates are the channel that carries the claim "the gate runs against a build", and a
  workflow file has no other layer to read than its text. Named for the text they check.
*/
describe('the gates set E2E_SERVER=build', () => {
  it('gate.yml’s Playwright step carries E2E_SERVER: build in its env', () => {
    const yml = readFileSync('.github/workflows/gate.yml', 'utf8');
    const step = yml.slice(yml.indexOf('- name: Playwright, ${{ matrix.project }}'));
    const env = step.slice(0, step.indexOf('run: |'));
    expect(env).toMatch(/E2E_SERVER:\s*build/);
  });

  it('gate.sh exports E2E_SERVER=build before its Playwright half', () => {
    const sh = readFileSync('scripts/gate.sh', 'utf8');
    const exportAt = sh.indexOf('export E2E_SERVER=build');
    expect(exportAt).toBeGreaterThan(-1);
    /* The half's own command line, not the header comment that names the same command. */
    expect(exportAt).toBeLessThan(sh.indexOf('npx tsx scripts/run-tests.ts npx playwright test'));
  });
});
