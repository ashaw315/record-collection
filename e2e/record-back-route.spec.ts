import { expect, test, type Page } from '@playwright/test';
import { registerCleanup, trackArtist } from './cleanup';
import { NO_SCROLL_HEIGHT } from '../src/app/records/[id]/band-geometry';

registerCleanup();

/**
 * **§8.1: one route to the collection, and it is the chrome's.**
 *
 * "Navigation is constant across records (§3), so it lives in AppHeader and
 * nowhere else; the 10px ← Collection is deleted." The build still drew it,
 * which §12 lists as a build-vs-ruling defect.
 *
 * The test asserts BOTH halves, because deleting a link is only correct if the
 * capability survives: the record screen must still reach the collection in
 * one click, and it must do so through the chrome rather than through a second
 * control that says the same thing far below it. A test that only checked the
 * link was gone would pass on a page with no way back at all.
 *
 * `record-navigation.spec.ts` covers the arrows between records; this covers
 * the way out of the screen entirely.
 */
const PASSWORD = process.env.E2E_PASSWORD ?? 'test-password-for-e2e';

async function login(page: Page) {
  await page.goto('/login');
  await page.locator('form[data-hydrated="true"]').waitFor({ timeout: 15_000 });
  await page.getByLabel('Password').pressSequentially(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL('/');
}

test('the collection is reached through the chrome, and nowhere else (§8.1)', async ({ page }) => {
  await login(page);
  const s = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  const a = await page.request.post('/api/artists', { data: { name: `back-${s}` } });
  const { id: artistId } = await a.json();
  trackArtist(artistId);
  const r = await page.request.post('/api/records', {
    data: { artistId, title: `Back ${s}`, releaseYear: 1979 },
  });
  const { id } = await r.json();

  await page.setViewportSize({ width: 1440, height: NO_SCROLL_HEIGHT });
  await page.goto(`/records/${id}`);
  await expect(page.getByTestId('record-controls')).toBeVisible();

  /* The deleted control: no link anywhere on the page carries the back arrow. */
  const arrowed = await page.evaluate(() =>
    Array.from(document.querySelectorAll('a'))
      .filter((el) => /←\s*Collection/.test(el.textContent ?? ''))
      .map((el) => el.getAttribute('href') ?? ''),
  );
  expect(arrowed, '§8.1 deletes the 10px ← Collection link').toEqual([]);

  /*
    The capability, which must NOT go with it. The header's own link is the one
    route, asserted by role so that plain text cannot satisfy it — the same
    failure this component's history records three times.
  */
  const header = page.getByRole('banner');
  const collection = header.getByRole('link', { name: 'Collection', exact: true });
  await expect(collection, 'AppHeader carries the one route').toHaveAttribute('href', '/');

  await collection.click();
  await expect(page, 'and it reaches the collection in one click').toHaveURL('/');
});
