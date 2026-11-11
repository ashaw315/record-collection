import { expect, test, type Page } from '@playwright/test';
import { registerCleanup, trackArtist, trackCreated } from './cleanup';
import { login } from './sign-in';

/**
 * **Step 174's escalation list, observed rather than approximated (the coordinator, 7 and 11 Nov).** "If the history
 * mechanism cannot satisfy 'closing it by any means removes it' … that goes back to Design rather than being
 * approximated." Two of the four cases are not satisfiable by the entry the row adds, and these two report what the
 * build does in each so Design rules on a measurement: the probe that showed it survives as the test that records it.
 * Report-only: each asserts the behaviour as it is, named as the observation, not as a rule.
 */
registerCleanup();
test.use({ hasTouch: true, viewport: { width: 390, height: 844 } });

async function seedStore(page: Page, stamp: string): Promise<string> {
  const post = async (path: string, data: unknown) => {
    const response = await page.request.post(path, { data });
    expect(response.status(), path).toBe(201);
    const body = (await response.json()) as { id: string };
    trackCreated(path, body);
    return body.id;
  };
  const artist = await post('/api/artists', { name: `Exits174r-${stamp}` });
  trackArtist(artist);
  await post('/api/records', { title: `Exits report ${stamp}`, artistId: artist });
  const name = `A Shop With A Long Name ${stamp}`;
  await post('/api/stores', { name, city: 'Leeds', country: 'UK', isFavorite: true });
  return name;
}

async function openStore(page: Page, store: string) {
  await page.getByRole('navigation', { name: 'Resource' }).getByRole('button', { name: 'Stores', exact: true }).click();
  const row = page.locator('[data-manage-list]:visible [data-manage-row]').filter({ hasText: store });
  await row.locator('[data-manage-open]').click();
  await expect(row.locator('[data-manage-form]')).toBeVisible();
  return row;
}

test('174, observed: Forward after a close by hand lands on the row’s old entry with the row closed, a dead step', { tag: '@report-only' }, async ({ page }) => {
  await login(page);
  const store = await seedStore(page, Date.now().toString(36));
  await page.goto('/');
  await page.goto('/manage');
  const row = await openStore(page, store);
  /* Closed by hand: the entry is popped, so it stands in the forward list. */
  await row.locator('[data-manage-open]').click();
  await expect(row.locator('[data-manage-form]')).toHaveCount(0);
  await page.goForward();
  await expect(page).toHaveURL(/\/manage$/);
  /* The observation: the browser's Forward moved to the entry, and the row it stood for is not open. */
  await expect(row.locator('[data-manage-form]'), 'Forward re-enters the entry without the row: the state is not in the entry').toHaveCount(0);
});

test('174, observed: after a reload with a row open, the entry survives and the row does not, so one Back stays on manage', { tag: '@report-only' }, async ({ page }) => {
  await login(page);
  const store = await seedStore(page, Date.now().toString(36));
  await page.goto('/');
  await page.goto('/manage');
  await openStore(page, store);
  await page.reload();
  await expect(page.locator('[data-manage-form]'), 'the reload loses the open row').toHaveCount(0);
  await page.goBack();
  /* The observation: the first Back pops the surviving entry and the screen does not change; a second leaves. */
  await expect(page, 'one Back after a reload stays on manage').toHaveURL(/\/manage$/);
  await page.goBack();
  await expect(page).toHaveURL(/\/$/);
});
