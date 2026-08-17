import { expect, test, type Page } from '@playwright/test';

/**
 * Every screen must render the app header, so there is always a way back.
 *
 * `/manage` shipped without it and had no route to the collection except the
 * browser's back button — which does nothing on a fresh tab or a shared link.
 * Found by using the app, not by any test.
 *
 * **This replaces a unit test that read the source files.** That version did
 * `expect(readFileSync(page)).toContain('<AppHeader />')`, which is the
 * file-text shape NOTES records as a past defect in this project: asserting
 * that a string appears in a file is not asserting that a user can see
 * anything. It would have passed on a page importing `AppHeader` and rendering
 * it inside a conditional that is never true, or behind a `hidden` class, or
 * above an error boundary that swallows it — the same distinction as DOM
 * presence not being visibility, which this suite has already been caught by
 * once.
 *
 * The subject of this test is whether a screen is REACHABLE FROM. That is a
 * property of the rendered page, so the trade of unit-test speed for
 * behavioural truth is the right one — the same argument
 * `records-routing.spec.ts` makes about route precedence: only a real request
 * can distinguish the two cases.
 *
 * `/login` is exempt: it is the unauthenticated screen and its nav would link
 * to pages the visitor cannot reach.
 */

const PASSWORD = process.env.E2E_PASSWORD ?? 'test-password-for-e2e';

async function login(page: Page) {
  await page.goto('/login');

  // Waits for hydration before typing: this form is CONTROLLED, so a value
  // typed into the DOM before React attaches never reaches state and the submit
  // sees an empty password.
  await page.locator('form[data-hydrated="true"]').waitFor({ timeout: 15_000 });
  await page.getByLabel('Password').pressSequentially(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL('/');
}

/**
 * The static routes, listed rather than globbed.
 *
 * The unit test walked `src/app` for `page.tsx` files, which had one genuine
 * advantage — a new screen was covered automatically — and one fatal flaw: it
 * could only check the file, never the page. The vacuity guard below replaces
 * that advantage: it asserts the count, so adding a screen without adding it
 * here fails rather than silently going unchecked.
 */
const STATIC_ROUTES = [
  '/',
  '/lookup',
  '/manage',
  '/records/new',
  '/stats',
  '/want-list',
  '/want-list/new',
] as const;

/** Every `page.tsx` under `src/app`, minus `/login`, must appear above. */
const EXPECTED_PAGE_COUNT = STATIC_ROUTES.length + 2 /* /records/:id and its /edit */;

test.beforeEach(async ({ page }) => {
  await login(page);
});

test('the route list has not fallen behind the app', async () => {
  /**
   * The vacuity guard, and it is doing the job the old test's directory walk
   * did. `src/app` has 11 `page.tsx` files: the eight static routes above, the
   * two record routes covered below, and `/login`, which is exempt.
   *
   * If a screen is added and not listed here, this fails — which is the whole
   * reason the count is asserted rather than left implicit.
   */
  const { readdirSync, statSync } = await import('node:fs');
  const { join } = await import('node:path');

  const findPages = (dir: string): string[] => {
    const found: string[] = [];
    for (const entry of readdirSync(dir)) {
      const path = join(dir, entry);
      if (statSync(path).isDirectory()) found.push(...findPages(path));
      else if (entry === 'page.tsx') found.push(path);
    }
    return found;
  };

  const pages = findPages('src/app').filter((p) => !p.includes(join('app', 'login')));

  expect(
    pages.length,
    `src/app has ${pages.length} non-login pages; this spec covers ${EXPECTED_PAGE_COUNT}. Add the new route to STATIC_ROUTES.`,
  ).toBe(EXPECTED_PAGE_COUNT);
});

for (const route of STATIC_ROUTES) {
  test(`${route} renders the main nav`, async ({ page }) => {
    await page.goto(route);

    /**
     * `toBeVisible`, not `toHaveCount(1)`. The whole point of moving off the
     * file-text check is that presence is not reachability — a nav rendered
     * inside a false conditional is absent, and a nav rendered with `hidden` is
     * present and useless. Only visibility answers "can the user get back".
     */
    const nav = page.getByRole('navigation', { name: 'Main' });
    await expect(nav, `${route} has no visible main nav`).toBeVisible();

    // And it actually goes somewhere: a nav with no collection link is a nav
    // that does not solve the problem this test exists for.
    await expect(nav.getByRole('link').first()).toBeVisible();
  });
}

test('the record detail and edit screens render the main nav', async ({ page }) => {
  /**
   * These two need a real record, so they are separate from the static list.
   * They are also the screens a user is most likely to arrive at from a link,
   * which is exactly the case the browser back button does not cover.
   *
   * `page.request`, NOT the standalone `request` fixture: the latter is a
   * separate context with no session cookie, so every call it makes is a 401
   * and `recordId` arrives as `undefined`. `manage.spec.ts` records the same
   * trap — a test using it was skipped for long enough that nobody noticed it
   * had never worked.
   */
  const suffix = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

  const artist = await page.request.post('/api/artists', { data: { name: `Nav-${suffix}` } });
  const record = await page.request.post('/api/records', {
    data: { title: `Nav Record ${suffix}`, artistId: (await artist.json()).id },
  });
  expect(record.status(), 'the fixture record must exist for this to test anything').toBe(201);
  const recordId = (await record.json()).id;

  for (const route of [`/records/${recordId}`, `/records/${recordId}/edit`]) {
    await page.goto(route);
    await expect(
      page.getByRole('navigation', { name: 'Main' }),
      `${route} has no visible main nav`,
    ).toBeVisible();
  }
});

test('/login deliberately has no main nav', async ({ page, context }) => {
  /**
   * The exemption, asserted rather than assumed — otherwise "every page has a
   * nav" quietly becomes "every page I remembered to list", and the reason
   * `/login` is different stops being recorded anywhere a test can see.
   *
   * Its nav would link to pages the visitor cannot reach.
   */
  await context.clearCookies();
  await page.goto('/login');

  await expect(page.getByRole('navigation', { name: 'Main' })).toHaveCount(0);
});
