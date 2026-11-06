import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

/**
 * Read from the config as Playwright loads it, in a child process, and not
 * from its text: the claim is what the server IS given under each setting.
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

/*
  The probe pages open on `E2E_PROBES=1` AND a parsed NODE_ENV that is not production
  (src/lib/probes.ts, Q39). The variable is set here, on the server the config starts, and
  nowhere else: Playwright merges `webServer.env` over its own process env, so every run
  through this config carries it, the capture project and the gates included, and a deploy
  never sees the config. Fails against a config that forgets it (every probe spec then 404s
  under either server) and against one that sets it to anything but "1".
*/
describe('the e2e server opens the probe pages', () => {
  it('carries E2E_PROBES=1 in the webServer env, so the eight probe pages and the error probe are served', () => {
    expect(webServer({}).env).toEqual({ E2E_PROBES: '1' });
  });
});
