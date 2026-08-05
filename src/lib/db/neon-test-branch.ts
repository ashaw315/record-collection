import { hasHostQueryParameter, resolveConnectionHost } from './connection-string';

/**
 * Keeps the Neon transaction harness off every database except the throwaway
 * test branch.
 *
 * CLAUDE.md §2 requires transactional code to be verified against the real Neon
 * driver rather than local `pg` alone, because the two differ exactly where
 * correctness is hardest to test. That verification necessarily WRITES, and a
 * rollback test writes deliberately-failing data — so the one thing it must
 * never do is run against the main branch.
 *
 * Structural rather than procedural, deliberately. The manual verification that
 * preceded this ran against main and was safe only because the row was uniquely
 * named and cleaned up by hand. Every guard in this project that relied on
 * carefulness is the one that eventually failed.
 *
 * Both branches expose a database named `neondb`, so a database-name check
 * would happily approve main. The endpoint HOST is the only discriminator.
 */

export function isNeonTestBranchConfigured(url: string | undefined): boolean {
  return url !== undefined && url !== '';
}

/**
 * Returns `candidate` if it addresses the same host as `expected`, and throws
 * otherwise.
 *
 * Compares hosts rather than whole strings so a rotated password or a changed
 * `sslmode` does not trip the guard — a guard that fires on benign changes is
 * one someone eventually disables.
 */
export function assertNeonTestBranch(
  candidate: string | undefined,
  expected: string | undefined,
): string {
  if (!isNeonTestBranchConfigured(expected)) {
    throw new Error(
      'NEON_TEST_DATABASE_URL is not configured, so there is no test branch to compare ' +
        'against. Refusing to run the Neon harness rather than defaulting to allow: an ' +
        'absent expectation must not make this guard disappear.',
    );
  }

  if (!isNeonTestBranchConfigured(candidate)) {
    throw new Error('No connection string supplied for the Neon harness.');
  }

  // The candidate is checked and the expectation is checked. `?host=` overrides
  // the URL authority, so what is validated would not be what the driver
  // connects to — the same bypass assertLocalHost closes.
  for (const [label, url] of [
    ['candidate', candidate as string],
    ['expected NEON_TEST_DATABASE_URL', expected as string],
  ] as const) {
    if (hasHostQueryParameter(url)) {
      throw new Error(
        `Refusing a ${label} connection string carrying a \`host\` query parameter: it ` +
          'overrides the host in the URL authority, so the validated host is not the one ' +
          'connected to.',
      );
    }
  }

  const candidateHost = resolveConnectionHost(candidate as string);
  const expectedHost = resolveConnectionHost(expected as string);

  if (candidateHost !== expectedHost) {
    throw new Error(
      `Refusing to run the Neon transaction harness against "${candidateHost}". It writes ` +
        'and deliberately fails transactions, so it may only ever address the throwaway ' +
        `test branch ("${expectedHost}"). Note both branches expose a database named ` +
        '`neondb`, so the endpoint host is the only thing distinguishing them.',
    );
  }

  return candidate as string;
}
