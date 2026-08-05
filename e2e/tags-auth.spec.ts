import { expect, test } from '@playwright/test';

/**
 * SPEC.md §5.4 reference resources sit behind the §3 auth middleware. The
 * integration suite asserts that middleware *classifies* /api/tags as
 * session-protected, which is the meaningful unit-level check — a 401
 * assertion against a directly-invoked handler would pass whether or not the
 * route were actually protected, because handlers never see middleware.
 *
 * This is the end-to-end counterpart: a real request over HTTP with no session
 * cookie, through the real middleware, to a real route. It proves the
 * protection engages rather than merely being configured.
 *
 * /api/tags is the first reference resource; the five that follow are covered
 * by the same middleware matcher and the same routeAuthMode default, so this
 * covers the class rather than only this path.
 */

test('returns 401 JSON for /api/tags with no session cookie', async ({ request }) => {
  const response = await request.get('/api/tags', { failOnStatusCode: false });

  expect(response.status()).toBe(401);

  const body = await response.json();
  expect(body.error.code).toBe('UNAUTHORIZED');

  // No data leaked alongside the refusal.
  expect(body.data).toBeUndefined();
});

test('returns 401 for a write to /api/tags with no session cookie', async ({ request }) => {
  // The unauthenticated GET above returns before touching the database. A write
  // is the case that would actually mutate state if the middleware were
  // bypassed, so it is asserted separately rather than assumed to follow.
  const response = await request.post('/api/tags', {
    data: { name: 'should-never-be-created' },
    failOnStatusCode: false,
  });

  expect(response.status()).toBe(401);
  expect((await response.json()).error.code).toBe('UNAUTHORIZED');
});

test('returns 401 for /api/tags/:id with no session cookie', async ({ request }) => {
  // The dynamic segment is a separate route file and so a separate chance to
  // fall outside the matcher.
  const response = await request.get('/api/tags/00000000-0000-4000-8000-000000000000', {
    failOnStatusCode: false,
  });

  expect(response.status()).toBe(401);
  expect((await response.json()).error.code).toBe('UNAUTHORIZED');
});
