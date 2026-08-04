import { describe, expect, it } from 'vitest';
import { resolveDriver } from './client';

const NEON_URL = 'postgresql://user:pass@ep-prod.us-east-2.aws.neon.tech/recorddb';
const LOCAL_URL = 'postgresql://postgres:postgres@localhost:5433/record_collection_test';

/**
 * Driver selection is a data-safety boundary, not a convenience. If a test-shaped
 * environment ever resolves to the Neon driver, the reset-between-tests rule
 * (CLAUDE.md §2) truncates the real database. These tests exist to make that
 * failure impossible to introduce silently.
 */
describe('resolveDriver', () => {
  describe('selects the local Postgres driver whenever TEST_DATABASE_URL is set', () => {
    // Playwright does not set NODE_ENV=test, which is exactly the case that
    // makes NODE_ENV an unsafe signal to select on.
    const nodeEnvs = ['test', 'development', 'production', undefined] as const;

    for (const nodeEnv of nodeEnvs) {
      it(`uses pg when TEST_DATABASE_URL is present and NODE_ENV is ${String(nodeEnv)}`, () => {
        const resolved = resolveDriver({
          DATABASE_URL: NEON_URL,
          TEST_DATABASE_URL: LOCAL_URL,
          NODE_ENV: nodeEnv,
        });

        expect(resolved.driver).toBe('pg');
        expect(resolved.connectionString).toBe(LOCAL_URL);
      });
    }
  });

  describe('never resolves a test-shaped environment to Neon', () => {
    it('does not return the neon driver when TEST_DATABASE_URL is present', () => {
      const resolved = resolveDriver({
        DATABASE_URL: NEON_URL,
        TEST_DATABASE_URL: LOCAL_URL,
        NODE_ENV: 'production',
      });

      expect(resolved.driver).not.toBe('neon');
      expect(resolved.connectionString).not.toBe(NEON_URL);
    });

    it('throws rather than using Neon when NODE_ENV is test but TEST_DATABASE_URL is absent', () => {
      // Ambiguous intent: something believes it is running tests, but there is
      // no test database to point at. Falling through to Neon here is the exact
      // data-loss path this guard exists to prevent.
      expect(() =>
        resolveDriver({
          DATABASE_URL: NEON_URL,
          TEST_DATABASE_URL: undefined,
          NODE_ENV: 'test',
        }),
      ).toThrowError(/TEST_DATABASE_URL/);
    });

    it('the thrown error explains why, not just what', () => {
      let message = '';
      try {
        resolveDriver({
          DATABASE_URL: NEON_URL,
          TEST_DATABASE_URL: undefined,
          NODE_ENV: 'test',
        });
      } catch (error) {
        message = error instanceof Error ? error.message : String(error);
      }

      expect(message).toMatch(/NODE_ENV/);
      expect(message).toMatch(/TEST_DATABASE_URL/);
    });
  });

  describe('selects Neon only for a genuinely non-test environment', () => {
    it('uses neon in production with no TEST_DATABASE_URL', () => {
      const resolved = resolveDriver({
        DATABASE_URL: NEON_URL,
        TEST_DATABASE_URL: undefined,
        NODE_ENV: 'production',
      });

      expect(resolved.driver).toBe('neon');
      expect(resolved.connectionString).toBe(NEON_URL);
    });

    it('uses neon in development with no TEST_DATABASE_URL', () => {
      const resolved = resolveDriver({
        DATABASE_URL: NEON_URL,
        TEST_DATABASE_URL: undefined,
        NODE_ENV: 'development',
      });

      expect(resolved.driver).toBe('neon');
      expect(resolved.connectionString).toBe(NEON_URL);
    });
  });

  it('ignores an empty TEST_DATABASE_URL rather than treating it as present', () => {
    // `TEST_DATABASE_URL=` in a .env file is an absent value, and must not be
    // read as "use a test database whose URL is the empty string".
    const resolved = resolveDriver({
      DATABASE_URL: NEON_URL,
      TEST_DATABASE_URL: '',
      NODE_ENV: 'production',
    });

    expect(resolved.driver).toBe('neon');
  });
});
