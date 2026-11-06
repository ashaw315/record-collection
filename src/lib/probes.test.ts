import { describe, expect, it } from 'vitest';
import { probesOpen } from './probes';

/**
 * The eight probe pages and the error probe are test harnesses, and they
 * gated on `process.env.NODE_ENV === 'production'`, which `next build`
 * inlines as "production" into the server bundles too: under a build every
 * probe answered 404 whatever the runtime said (Q39, 5 Nov, 109 tests in 18
 * files). The gate is now two conditions read at run time, and the fix was
 * not allowed to be "read the runtime env instead" (the coordinator, 5 Nov):
 * `E2E_PROBES=1`, which only a test harness sets, AND a parsed env whose
 * NODE_ENV is not production, which Vercel always sets. Closed by default;
 * one mistake cannot open them.
 *
 * Each test names the implementation it fails against.
 */
describe('the probe pages open only for a test harness', () => {
  /* Fails against a gate that opens on NODE_ENV alone, as the old literal did. */
  it('are closed with nothing set: the default is 404', () => {
    expect(probesOpen({}, () => 'test')).toBe(false);
    expect(probesOpen({}, () => 'development')).toBe(false);
  });

  /* Fails against a gate that reads E2E_PROBES alone: a stray paste into a deploy would open them. */
  it('are closed on a production deployment even if E2E_PROBES=1 reached it', () => {
    expect(probesOpen({ E2E_PROBES: '1' }, () => 'production')).toBe(false);
  });

  /* Fails against a gate that reads the inlined literal: under a build the parsed env says test and the literal says production. */
  it('open when E2E_PROBES is exactly "1" and the parsed env is not production', () => {
    expect(probesOpen({ E2E_PROBES: '1' }, () => 'test')).toBe(true);
    expect(probesOpen({ E2E_PROBES: '1' }, () => 'development')).toBe(true);
  });

  /* Fails against a truthiness check: "true", "yes" and "0" all open it. */
  it('read E2E_PROBES as exactly "1": any other value is closed', () => {
    expect(probesOpen({ E2E_PROBES: 'true' }, () => 'test')).toBe(false);
    expect(probesOpen({ E2E_PROBES: '0' }, () => 'test')).toBe(false);
    expect(probesOpen({ E2E_PROBES: '' }, () => 'test')).toBe(false);
  });

  /*
    The root layout asks, and `/_not-found` is rendered at build time: the unit job builds with no
    database (gate.yml, `env -u DATABASE_URL`), so parsing the env there throws. Fails against a
    gate that parses the env before reading E2E_PROBES.
  */
  it('never parse the env while E2E_PROBES is unset, so a build with no database still renders the layout', () => {
    expect(probesOpen({}, () => { throw new Error('the env was parsed'); })).toBe(false);
  });
});
