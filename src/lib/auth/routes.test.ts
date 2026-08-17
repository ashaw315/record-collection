import { describe, expect, it } from 'vitest';
import { routeAuthMode, MIDDLEWARE_MATCHER, middlewareRuns } from './routes';

/**
 * SPEC.md §3: middleware protects everything except /login and
 * /api/auth/login. /api/discogs/refresh-prices is NOT exempt — it authenticates
 * by CRON_SECRET bearer token instead of by session cookie. Exempting it
 * wholesale would leave it open to the internet.
 */
describe('routeAuthMode', () => {
  describe('public routes', () => {
    it('treats /login as public', () => {
      expect(routeAuthMode('/login')).toBe('public');
    });

    it('treats POST /api/auth/login as public', () => {
      expect(routeAuthMode('/api/auth/login')).toBe('public');
    });
  });

  describe('cron routes', () => {
    it('requires the cron secret for the price refresh endpoint', () => {
      expect(routeAuthMode('/api/discogs/refresh-prices')).toBe('cron');
    });

    it('does not treat the cron endpoint as public', () => {
      expect(routeAuthMode('/api/discogs/refresh-prices')).not.toBe('public');
    });
  });

  describe('protected routes', () => {
    const protectedPaths = [
      '/',
      '/records',
      '/records/abc-123',
      '/want-list',
      '/lookup',
      '/stats',
      '/shelf',
      '/suggestions',
      '/stores',
      '/stats',
      '/manage',
      '/api/records',
      '/api/want-list',
      '/api/auth/logout',
      '/api/auth/session',
      '/api/discogs/search',
      '/api/suggestions',
    ];

    for (const path of protectedPaths) {
      it(`requires a session for ${path}`, () => {
        expect(routeAuthMode(path)).toBe('session');
      });
    }
  });

  describe('does not leak access through path tricks', () => {
    it('does not treat /login-as-admin as public', () => {
      expect(routeAuthMode('/login-as-admin')).toBe('session');
    });

    it('does not treat /api/auth/login/extra as public', () => {
      expect(routeAuthMode('/api/auth/login/extra')).toBe('session');
    });

    it('does not treat a path merely containing /login as public', () => {
      expect(routeAuthMode('/records/login')).toBe('session');
    });

    it('does not treat /api/discogs/refresh-prices/sub as cron', () => {
      expect(routeAuthMode('/api/discogs/refresh-prices/sub')).toBe('session');
    });

    it('handles a trailing slash on /login', () => {
      expect(routeAuthMode('/login/')).toBe('public');
    });
  });
});

/**
 * M1. The matcher decides whether middleware runs AT ALL — a path it excludes
 * never reaches routeAuthMode, so every auth decision above is moot for it.
 *
 * The original excluded `.*\.(svg|png|jpg|jpeg|gif|webp)$` against the whole
 * path rather than against static-asset prefixes, so `/api/records/x.png` and
 * `/api/records/2024-photo.jpeg` bypassed middleware entirely. Nothing was
 * reachable at those paths yet, which is exactly why it would have shipped:
 * SPEC.md §5.9 adds image endpoints at step 8, and user-supplied filenames are
 * precisely where a path ends in an image extension.
 */
describe('middlewareRuns (the matcher)', () => {
  describe('API routes are ALWAYS matched, whatever they end in', () => {
    const apiPaths = [
      '/api/records',
      '/api/records/x.png',
      '/api/images/abc.png',
      '/api/records/2024-photo.jpeg',
      '/api/records/holiday.gif',
      '/api/images/cover.webp',
      '/api/anything.svg',
      '/api/discogs/search',
      '/api/auth/login',
      '/api/discogs/refresh-prices',
      // Uppercase and mixed-case extensions, which the old rule also treated
      // inconsistently (it was case-sensitive).
      '/api/records/x.PNG',
      '/api/records/x.JpEg',
    ];

    for (const path of apiPaths) {
      it(`runs middleware for ${path}`, () => {
        expect(middlewareRuns(path)).toBe(true);
      });
    }
  });

  describe('page routes are matched', () => {
    for (const path of ['/', '/login', '/records', '/records/abc-123', '/lookup', '/manage']) {
      it(`runs middleware for ${path}`, () => {
        expect(middlewareRuns(path)).toBe(true);
      });
    }
  });

  describe('genuine static assets are excluded, so they cost nothing', () => {
    const staticPaths = [
      '/_next/static/chunks/main.js',
      '/_next/image',
      '/_next/image?url=%2Flogo.png',
      '/favicon.ico',
    ];

    for (const path of staticPaths) {
      it(`skips middleware for ${path}`, () => {
        expect(middlewareRuns(path)).toBe(false);
      });
    }
  });

  it('still matches _next/data, which carries real page payloads', () => {
    // Not a static asset: this is the RSC/data request for a page and must be
    // authenticated like the page it serves.
    expect(middlewareRuns('/_next/data/build-id/index.json')).toBe(true);
  });

  describe('the M1 regression, stated directly', () => {
    it('does not exempt a path merely because it ends in an image extension', () => {
      // The single assertion this unit exists for.
      expect(middlewareRuns('/api/anything.png')).toBe(true);
    });

    it('does not exempt a top-level path ending in an image extension', () => {
      // A page route could legitimately end this way; only the static prefixes
      // are exempt, never an extension anywhere in the tree.
      expect(middlewareRuns('/uploads/x.webp')).toBe(true);
      expect(middlewareRuns('/logo.svg')).toBe(true);
    });

    it('does not exempt something that merely contains a static prefix', () => {
      // /api/_next/... and /evil/_next/static/... are application paths.
      expect(middlewareRuns('/api/_next/static/x.js')).toBe(true);
      expect(middlewareRuns('/evil/_next/static/x.js')).toBe(true);
      expect(middlewareRuns('/_next/staticky')).toBe(true);
    });
  });

  /**
   * The pattern is duplicated into src/middleware.ts because Next parses
   * `config.matcher` statically at build time and cannot resolve an imported
   * identifier. Duplication that nothing checks is how the two drift, and a
   * drifted matcher means these tests describe a boundary that is not the one
   * deployed — so the copies are pinned to each other here.
   */
  it('is byte-identical to the matcher registered in src/middleware.ts', async () => {
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const source = readFileSync(
      join(import.meta.dirname, '..', '..', 'middleware.ts'),
      'utf-8',
    );

    const found = source.match(/matcher:\s*\[\s*'([^']+)'\s*\]/);
    expect(found, 'could not find config.matcher in src/middleware.ts').not.toBeNull();

    // The literal in middleware.ts is a TS string, so its \\. escapes render as
    // \. once parsed — compare against the runtime value of the constant.
    const registered = found?.[1].replace(/\\\\/g, '\\') ?? '';
    expect(registered).toBe(MIDDLEWARE_MATCHER);
  });
});
