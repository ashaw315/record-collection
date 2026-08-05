import { describe, expect, it } from 'vitest';
import { assertNeonTestBranch, isNeonTestBranchConfigured } from './neon-test-branch';

/**
 * The guard that keeps the Neon transaction harness off any database except the
 * throwaway test branch.
 *
 * This is structural rather than procedural on purpose. The by-hand
 * verification that preceded it ran against the MAIN Neon database and was safe
 * only because the row was uniquely named and cleaned up afterwards — i.e. safe
 * by carefulness. Every other guard in this project that depended on
 * carefulness has eventually been the thing that failed.
 *
 * Both Neon databases are named `neondb`, so a database-name check would pass
 * for main. The endpoint HOST is the only discriminator, and these tests pin
 * that.
 */

// Shapes only — neither is a real credential.
const TEST_BRANCH =
  'postgresql://user:pw@ep-solitary-frost-aumk8atg-pooler.c-10.us-east-1.aws.neon.tech/neondb?sslmode=require';
const MAIN_BRANCH =
  'postgresql://user:pw@ep-royal-rain-auyyxko8-pooler.c-10.us-east-1.aws.neon.tech/neondb?sslmode=require';

describe('assertNeonTestBranch', () => {
  it('accepts the configured test branch', () => {
    expect(assertNeonTestBranch(TEST_BRANCH, TEST_BRANCH)).toBe(TEST_BRANCH);
  });

  /**
   * The case that matters. Same driver, same database NAME, same everything
   * except the endpoint — and this harness writes and rolls back, so pointing
   * it at main is exactly the accident the branch exists to prevent.
   */
  it('REFUSES the main branch even though both databases are named neondb', () => {
    expect(() => assertNeonTestBranch(MAIN_BRANCH, TEST_BRANCH)).toThrow(/test branch/i);
  });

  it('names the offending host so the refusal is diagnosable', () => {
    expect(() => assertNeonTestBranch(MAIN_BRANCH, TEST_BRANCH)).toThrow(/ep-royal-rain/);
  });

  it('refuses any host that is not the configured one', () => {
    for (const other of [
      'postgresql://user:pw@ep-somewhere-else-pooler.c-10.us-east-1.aws.neon.tech/neondb',
      'postgresql://user:pw@localhost:5433/record_collection_test',
      'postgresql://user:pw@db.internal/prod',
    ]) {
      expect(() => assertNeonTestBranch(other, TEST_BRANCH), other).toThrow();
    }
  });

  /**
   * The `?host=` bypass the local guard already closes: the parameter overrides
   * the authority, so what is validated is not what the driver connects to.
   */
  it('refuses a connection string smuggling a host query parameter', () => {
    const smuggled = `${TEST_BRANCH}&host=ep-royal-rain-auyyxko8-pooler.c-10.us-east-1.aws.neon.tech`;

    expect(() => assertNeonTestBranch(smuggled, TEST_BRANCH)).toThrow(/host/i);
  });

  /**
   * Asserts the MESSAGE, not merely that something was thrown.
   *
   * Removing this branch still throws — but from a TypeError inside
   * resolveConnectionHost ("Cannot read properties of undefined"), which a
   * bare .toThrow() accepts. That is the masked-guard pattern from NOTES.md:
   * the right outcome by the wrong mechanism, and here the difference is a
   * diagnosable refusal versus an unreadable crash.
   */
  it('refuses with an actionable message when the expected branch is missing', () => {
    for (const missing of [undefined, '']) {
      expect(() => assertNeonTestBranch(TEST_BRANCH, missing)).toThrow(
        /NEON_TEST_DATABASE_URL is not configured/,
      );
    }
  });

  it('refuses an empty or missing candidate, by name', () => {
    for (const missing of [undefined, '']) {
      expect(() => assertNeonTestBranch(missing, TEST_BRANCH)).toThrow(
        /No connection string supplied/,
      );
    }
  });

  it('compares the host only, ignoring credentials and query parameters', () => {
    // A rotated password or a changed sslmode must not break the guard — it
    // would push someone toward disabling it.
    const sameHostDifferentRest =
      'postgresql://other:rotated@ep-solitary-frost-aumk8atg-pooler.c-10.us-east-1.aws.neon.tech/neondb?sslmode=prefer';

    expect(assertNeonTestBranch(sameHostDifferentRest, TEST_BRANCH)).toBe(sameHostDifferentRest);
  });
});

describe('isNeonTestBranchConfigured', () => {
  it('is false when unset, so the harness can skip rather than fail', () => {
    // CI and a fresh clone have no Neon branch. The harness must skip loudly
    // there, not fail — but see the repo test that asserts the skip is loud.
    expect(isNeonTestBranchConfigured(undefined)).toBe(false);
    expect(isNeonTestBranchConfigured('')).toBe(false);
  });

  it('is true when a branch URL is present', () => {
    expect(isNeonTestBranchConfigured(TEST_BRANCH)).toBe(true);
  });
});
