import { expect, test } from '@playwright/test';
import { login } from './sign-in';

/**
 * Step 75, §G.5: "The header is on every screen a signed-in reader can
 * reach, and absent only on Login ... A 404 carries it: a reader who follows
 * a dead record link gets Next's default page, which has no way back. So the
 * app gets a not-found page of its own, with the header and one line saying
 * what was not found."
 *
 * Two ways in, because they reach the page differently: a path no route
 * matches, and a record route whose id is a well-formed UUID that names no
 * record, which the record page answers with notFound().
 */

const DEAD_RECORD = '/records/00000000-0000-4000-8000-000000000000';

test.beforeEach(async ({ page }) => login(page));

for (const [name, path] of [
  ['a path no route matches', '/no-such-screen'],
  ['a dead record link', DEAD_RECORD],
] as const) {
  /* Fails against the app without a not-found page: Next's default renders "404 | This page could not be found." with no header. */
  test(`${name} answers 404 with the header and one line naming what was not found`, async ({ page }) => {
    const response = await page.goto(path);
    expect(response?.status(), 'still a 404, so nothing caches it as a page').toBe(404);
    await expect(page.getByRole('navigation', { name: 'Main' }), 'the header, so there is a way back').toBeVisible();
    const line = page.getByTestId('not-found-line');
    await expect(line, 'one line').toHaveCount(1);
    await expect(line, 'naming the address that was not found').toContainText(path);
  });
}

/* A guard, not a fail-first test: Login has no header today, and §G.5 keeps it that way. */
test('Login still has no header', async ({ page, context }) => {
  await context.clearCookies();
  await page.goto('/login');
  await expect(page.getByRole('navigation', { name: 'Main' })).toHaveCount(0);
});
