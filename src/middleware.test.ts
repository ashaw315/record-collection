import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { middleware } from './middleware';
import { createSessionToken, SESSION_COOKIE_NAME } from '@/lib/auth/session';

/**
 * H1: middleware runs in the Edge runtime, which cannot import src/env.ts, so
 * nothing validated the variables it read. The failure mode was silent — a
 * missing SESSION_SECRET meant every session cookie failed verification, so a
 * successful login bounced straight back to /login forever with nothing logged.
 *
 * On a local `next start` this case is masked: instrumentation.ts validates at
 * Node boot and kills the process first. It is NOT masked on Vercel, where Edge
 * middleware and Node functions are configured separately and one can have a
 * variable the other lacks. That is the case these tests cover, by invoking the
 * middleware function directly with a controlled environment.
 */

const SECRET = 'a-session-secret-that-is-at-least-32-chars';
const CRON = 'a-cron-secret-that-is-at-least-32-characters';

function request(path: string, init?: { cookie?: string; headers?: Record<string, string> }) {
  const headers = new Headers(init?.headers);
  if (init?.cookie !== undefined) headers.set('cookie', init.cookie);
  return new NextRequest(new URL(path, 'https://example.test'), { headers });
}

const ORIGINAL = { ...process.env };

beforeEach(() => {
  process.env.SESSION_SECRET = SECRET;
  process.env.CRON_SECRET = CRON;
  // Middleware logs an operator-facing error on misconfiguration; silence it so
  // the expected failures do not look like test noise.
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  process.env = { ...ORIGINAL };
  vi.restoreAllMocks();
});

describe('middleware environment validation', () => {
  for (const variable of ['SESSION_SECRET', 'CRON_SECRET']) {
    it(`returns 500, not a redirect, when ${variable} is missing`, async () => {
      delete process.env[variable];

      const response = await middleware(request('/'));

      // The point of the fix: a misconfiguration must never present as "your
      // password is wrong" or an endless bounce to /login.
      expect(response.status).toBe(500);
      expect(response.headers.get('location')).toBeNull();

      const body = await response.json();
      expect(body.error.code).toBe('CONFIGURATION_ERROR');
    });

    it(`returns 500 when ${variable} is present but too short to be a signing key`, async () => {
      process.env[variable] = 'short';

      const response = await middleware(request('/'));

      expect(response.status).toBe(500);
    });
  }

  it('names the offending variable in the log, never in the response', async () => {
    delete process.env.SESSION_SECRET;
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});

    const response = await middleware(request('/'));
    const body = await response.json();

    expect(logged.mock.calls.flat().join(' ')).toContain('SESSION_SECRET');
    // The response goes to whoever asked, including an unauthenticated caller.
    expect(JSON.stringify(body)).not.toContain('SESSION_SECRET');
  });

  it('never leaks a secret value into the log', async () => {
    process.env.SESSION_SECRET = 'short-but-secret-value';
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});

    await middleware(request('/'));

    expect(logged.mock.calls.flat().join(' ')).not.toContain('short-but-secret-value');
  });

  it('applies the same 500 to API routes as to pages', async () => {
    delete process.env.SESSION_SECRET;

    const response = await middleware(request('/api/records'));

    expect(response.status).toBe(500);
  });

  it('leaves public routes reachable, so a misconfigured deploy is still diagnosable', async () => {
    // /login must not 500 from middleware: locking the operator out of the one
    // page that could help would make a bad deploy worse. (A Node-side boot
    // failure is a separate, louder matter — see instrumentation.ts.)
    delete process.env.SESSION_SECRET;

    const response = await middleware(request('/login'));

    expect(response.status).toBe(200);
  });
});

describe('middleware auth decisions with a valid environment', () => {
  it('redirects an unauthenticated page request to /login', async () => {
    const response = await middleware(request('/'));

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toContain('/login');
  });

  it('returns a JSON 401 for an unauthenticated API request', async () => {
    const response = await middleware(request('/api/records'));

    expect(response.status).toBe(401);
    expect((await response.json()).error.code).toBe('UNAUTHORIZED');
  });

  it('admits a request carrying a valid session cookie', async () => {
    const token = await createSessionToken(SECRET);

    const response = await middleware(
      request('/', { cookie: `${SESSION_COOKIE_NAME}=${token}` }),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('location')).toBeNull();
  });

  it('rejects a session cookie signed with a different secret', async () => {
    const foreign = await createSessionToken('a-completely-different-secret-32-chars');

    const response = await middleware(
      request('/', { cookie: `${SESSION_COOKIE_NAME}=${foreign}` }),
    );

    expect(response.status).toBe(307);
  });

  it('rejects an expired session cookie', async () => {
    const expired = await createSessionToken(SECRET, {
      expiresAt: new Date(Date.now() - 1000),
    });

    const response = await middleware(
      request('/', { cookie: `${SESSION_COOKIE_NAME}=${expired}` }),
    );

    expect(response.status).toBe(307);
  });

  it('lets the public login route through without a cookie', async () => {
    expect((await middleware(request('/login'))).status).toBe(200);
    expect((await middleware(request('/api/auth/login'))).status).toBe(200);
  });
});

describe('middleware cron authentication', () => {
  const CRON_PATH = '/api/discogs/refresh-prices';

  it('rejects the cron endpoint with no authorization header', async () => {
    const response = await middleware(request(CRON_PATH));

    expect(response.status).toBe(401);
  });

  it('rejects the cron endpoint with a wrong bearer token', async () => {
    const response = await middleware(
      request(CRON_PATH, { headers: { authorization: 'Bearer wrong-secret' } }),
    );

    expect(response.status).toBe(401);
  });

  it('admits the cron endpoint with the correct bearer token', async () => {
    const response = await middleware(
      request(CRON_PATH, { headers: { authorization: `Bearer ${CRON}` } }),
    );

    expect(response.status).toBe(200);
  });

  it('does not accept a session cookie in place of the cron secret', async () => {
    // SPEC.md §3: the cron endpoint is not reachable by session cookie.
    const token = await createSessionToken(SECRET);

    const response = await middleware(
      request(CRON_PATH, { cookie: `${SESSION_COOKIE_NAME}=${token}` }),
    );

    expect(response.status).toBe(401);
  });
});
