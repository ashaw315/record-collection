import { expect, type Page } from '@playwright/test';

const PASSWORD = process.env.E2E_PASSWORD ?? 'test-password-for-e2e';

/**
 * How long a sign-in may take to arrive at `/`.
 *
 * The wait covers a chain and not one thing: a `bcryptjs` comparison on the
 * server, then `/`, which awaits the shelf, the records and the facets, and
 * which the login page asks for twice (`router.replace` then
 * `router.refresh`). Read from the traces of two failures on 8 Oct, the
 * comparison took 4.74s in one and the two renders 2.6s each in the other,
 * against the 5 second default every copy of this function then used. The
 * budget is for the chain on a shared machine, the same figure the wall's
 * measured wait has, and a sign-in that is working returns long before it.
 */
export const SIGN_IN_ARRIVAL = 30_000;

/**
 * Signs in through the form. The one way in for every spec and capture
 * (`test/repo/sign-in.test.ts`); the sheets have their own, for the real
 * collection.
 */
export async function login(page: Page): Promise<void> {
  await page.goto('/login');
  /*
    The form is CONTROLLED, so a value typed before React attaches never
    reaches state and the submit sees an empty password. The input is in the
    server's markup; this attribute is set by an effect, so only it says
    React is listening. See the note on the login page.
  */
  await page.locator('form[data-hydrated="true"]').waitFor({ timeout: SIGN_IN_ARRIVAL });
  await page.getByLabel('Password').pressSequentially(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page, 'the sign-in arrives at /').toHaveURL('/', { timeout: SIGN_IN_ARRIVAL });
}
