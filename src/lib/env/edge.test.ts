import { describe, expect, it } from 'vitest';
import { parseEdgeEnv, EDGE_ENV_KEYS } from './edge';

/**
 * H1: middleware reads process.env directly, because the `server-only` guard on
 * src/env.ts makes it unimportable in the Edge runtime. Nothing validated those
 * reads, so a missing or mismatched SESSION_SECRET produced an infinite
 * redirect loop — login succeeds, middleware rejects the cookie it just
 * issued, browser returns to /login — with nothing logged anywhere.
 *
 * A misconfiguration must be loud. These tests pin that.
 */

function validEdgeEnv(): Record<string, string | undefined> {
  return {
    SESSION_SECRET: 'a-session-secret-that-is-at-least-32-chars',
    CRON_SECRET: 'a-cron-secret-that-is-at-least-32-characters',
  };
}

describe('parseEdgeEnv', () => {
  it('accepts a fully populated edge environment', () => {
    const parsed = parseEdgeEnv(validEdgeEnv());

    expect(parsed.SESSION_SECRET).toBe('a-session-secret-that-is-at-least-32-chars');
    expect(parsed.CRON_SECRET).toBe('a-cron-secret-that-is-at-least-32-characters');
  });

  describe('fails loudly, naming the offending variable', () => {
    for (const key of EDGE_ENV_KEYS) {
      it(`throws and names ${key} when absent`, () => {
        const source = validEdgeEnv();
        delete source[key];

        expect(() => parseEdgeEnv(source)).toThrowError(new RegExp(key));
      });

      it(`throws and names ${key} when empty`, () => {
        // `FOO=` in a deploy config is a missing value, not the empty string.
        expect(() => parseEdgeEnv({ ...validEdgeEnv(), [key]: '' })).toThrowError(
          new RegExp(key),
        );
      });

      it(`throws and names ${key} when shorter than 32 characters`, () => {
        // A weak signing key is a security defect, not a convenience.
        expect(() => parseEdgeEnv({ ...validEdgeEnv(), [key]: 'too-short' })).toThrowError(
          new RegExp(key),
        );
      });
    }

    it('names every offending variable at once, not just the first', () => {
      let message = '';
      try {
        parseEdgeEnv({});
      } catch (error) {
        message = error instanceof Error ? error.message : String(error);
      }

      expect(message).toContain('SESSION_SECRET');
      expect(message).toContain('CRON_SECRET');
    });

    it('does not echo secret values in the error', () => {
      // Middleware errors reach logs and, on a 500, potentially a response.
      let message = '';
      try {
        parseEdgeEnv({ SESSION_SECRET: 'short', CRON_SECRET: 'alsoshort' });
      } catch (error) {
        message = error instanceof Error ? error.message : String(error);
      }

      expect(message).not.toContain('alsoshort');
    });
  });

  it('ignores unrelated variables rather than rejecting them', () => {
    // The Edge runtime exposes its own variables; the schema must not be strict.
    expect(() =>
      parseEdgeEnv({ ...validEdgeEnv(), NEXT_RUNTIME: 'edge', VERCEL: '1' }),
    ).not.toThrow();
  });
});

/**
 * The Edge subset and the full server schema must agree on the variables they
 * share. If they drift — different length floors, one optional in one place —
 * a value could pass boot validation and fail in middleware, or vice versa.
 * Same anti-drift reasoning as Unit 2's parser corpus.
 */
describe('the edge subset agrees with the full server schema', () => {
  it('applies the same rules as parseEnv for the variables it covers', async () => {
    const { parseEnv } = await import('@/env');

    const fullEnv = {
      DATABASE_URL: 'postgresql://user:pass@ep-test.aws.neon.tech/recorddb',
      // 60 characters exactly. This was 61 — not a bcrypt hash — and passed
      // only while the schema checked `.min(1)`.
      APP_PASSWORD_HASH: '$2b$12$abcdefghijklmnopqrstuvwxyz0123456789ABCDEFGHIJKLMNOPQ',
      DISCOGS_TOKEN: 'token',
      ...validEdgeEnv(),
    };

    // Both accept the same good values.
    expect(() => parseEnv(fullEnv)).not.toThrow();
    expect(() => parseEdgeEnv(fullEnv)).not.toThrow();

    // Both reject the same bad ones.
    for (const key of EDGE_ENV_KEYS) {
      const tooShort = { ...fullEnv, [key]: 'short' };
      expect(() => parseEnv(tooShort), `parseEnv accepted a short ${key}`).toThrow();
      expect(() => parseEdgeEnv(tooShort), `parseEdgeEnv accepted a short ${key}`).toThrow();
    }
  });

  it('does not import server-only, so it can load in the Edge runtime', async () => {
    // The whole reason this module exists. If someone adds a server-only import
    // to it, middleware breaks at runtime rather than here.
    //
    // Matches an import STATEMENT, not the bare phrase — the module comments
    // explain why the marker is absent, and a substring check flagged those.
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const source = readFileSync(join(import.meta.dirname, 'edge.ts'), 'utf-8');

    expect(source).not.toMatch(/^\s*import\s+['"]server-only['"]/m);
    expect(source).not.toMatch(/from\s+['"]server-only['"]/);
  });

  it('is transitively free of server-only, so middleware can load it', async () => {
    // A clean edge.ts is not enough: importing anything that itself pulls in
    // server-only breaks middleware just the same. This is the property that
    // actually matters, asserted against the real module graph.
    const { readFileSync } = await import('node:fs');
    const { join, dirname, resolve } = await import('node:path');

    const ROOT = resolve(import.meta.dirname, '..', '..', '..');
    const seen = new Set<string>();

    function resolveImport(spec: string, fromFile: string): string | undefined {
      const base = spec.startsWith('@/')
        ? join(ROOT, 'src', spec.slice(2))
        : spec.startsWith('.')
          ? resolve(dirname(fromFile), spec)
          : undefined;
      if (base === undefined) return undefined;
      for (const candidate of [`${base}.ts`, `${base}.tsx`, join(base, 'index.ts')]) {
        try {
          readFileSync(candidate, 'utf-8');
          return candidate;
        } catch {
          continue;
        }
      }
      return undefined;
    }

    function walk(file: string): void {
      if (seen.has(file)) return;
      seen.add(file);
      const source = readFileSync(file, 'utf-8');

      expect(source, `${file} imports server-only`).not.toMatch(
        /^\s*import\s+['"]server-only['"]/m,
      );

      for (const match of source.matchAll(/from\s+['"]([^'"]+)['"]/g)) {
        const target = resolveImport(match[1], file);
        if (target !== undefined) walk(target);
      }
    }

    walk(join(ROOT, 'src', 'middleware.ts'));
    // Sanity: the walk actually traversed the graph rather than silently
    // resolving nothing.
    expect(seen.size).toBeGreaterThan(3);
  });
});
