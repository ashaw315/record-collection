import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { assertLocalHost } from '../../src/lib/db/connection-string';

const REPO_ROOT = join(import.meta.dirname, '..', '..');
const ENV_TEST = join(REPO_ROOT, '.env.test');

/**
 * `.env.test` is committed deliberately — its values are throwaway credentials
 * for a local dev server, and committing them is what makes E2E runs
 * reproducible. The risk that creates: it is the file most likely to acquire a
 * real connection string when someone debugs against a live database, and its
 * "committed deliberately" header discourages the scrutiny that would catch it.
 *
 * These tests make that mistake fail the suite instead of reaching a commit.
 */

function envValues(contents: string): Map<string, string> {
  const values = new Map<string, string>();
  for (const line of contents.split('\n')) {
    const trimmed = line.trim();
    if (trimmed === '' || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    values.set(trimmed.slice(0, eq).trim(), trimmed.slice(eq + 1).trim());
  }
  return values;
}

describe('.env.test contains nothing that could reach a real database', () => {
  const contents = existsSync(ENV_TEST) ? readFileSync(ENV_TEST, 'utf-8') : '';
  const values = envValues(contents);

  it('exists', () => {
    expect(existsSync(ENV_TEST)).toBe(true);
  });

  for (const key of ['DATABASE_URL', 'TEST_DATABASE_URL']) {
    it(`${key} points at the local test database`, () => {
      const value = values.get(key);
      expect(value, `${key} missing from .env.test`).toBeDefined();

      // The same guard the destructive helpers use, so a ?host= override or a
      // remote host in this file is rejected by identical logic.
      expect(() => assertLocalHost(value)).not.toThrow();
    });
  }

  it('carries no host query parameter on any value', () => {
    // Belt and braces: catches a ?host= smuggled onto a variable this test does
    // not specifically know about.
    for (const [key, value] of values) {
      expect(value.toLowerCase(), `${key} carries a host override`).not.toMatch(
        /[?&]host=/,
      );
    }
  });

  it('contains no Neon or other remote-looking connection string', () => {
    expect(contents).not.toMatch(/neon\.tech/i);
    expect(contents).not.toMatch(/amazonaws\.com/i);
    expect(contents).not.toMatch(/\.rds\./i);
  });

  it('contains no real-looking Anthropic or Discogs credential', () => {
    // Live keys belong in .env.local, which is gitignored.
    expect(contents).not.toMatch(/sk-ant-api/i);
    const discogs = values.get('DISCOGS_TOKEN') ?? '';
    expect(discogs.length).toBeLessThan(30);
  });
});
