import { expect, test, type Page } from '@playwright/test';
import { NO_SCROLL_HEIGHT } from '../src/app/records/[id]/band-geometry';
import { registerCleanup, trackArtist } from './cleanup';
import { login } from './sign-in';

registerCleanup();

/**
 * **§10b's About, read and written in one place (§53, step 60a).** "The
 * About cell is the About's only place: it reads, writes, edits and deletes
 * it, and the lower About row is removed." The E2E deployment has no writing
 * key (`.env.test`), so what runs here is the unconfigured path: reading,
 * editing, deleting and the absence state without a control. The configured
 * controls are held at the component layer.
 */

async function post(page: Page, path: string, data: unknown) {
  const response = await page.request.post(path, { data, failOnStatusCode: false });
  expect(response.status(), `${path} ${JSON.stringify(data)}`).toBe(201);
  return response.json();
}

async function seedEditedRecord(page: Page, suffix: string) {
  const artist = await post(page, '/api/artists', { name: `Discharge ${suffix}` });
  trackArtist(artist.id as string);
  const record = await post(page, '/api/records', { title: `Why ${suffix}`, artistId: artist.id });
  const id = record.id;
  await page.request.patch(`/api/records/${id}/snippet`, { data: { snippet: `My own words ${suffix}` }, failOnStatusCode: false });
  return id;
}

const cell = (page: Page) => page.getByTestId('record-page-8a').locator('[data-cell="note"]');

test('an edited About is read in the frame cell and labelled the user’s own there; the page has no lower About row', async ({ page }) => {
  await login(page);
  const suffix = `snip-${Date.now()}`;
  const id = await seedEditedRecord(page, suffix);
  await page.goto(`/records/${id}`);

  await expect(cell(page).locator('[data-field="about"]')).toContainText(`My own words ${suffix}`);
  await expect(cell(page).getByTestId('snippet-yours'), 'the by-line, in the cell').toHaveText('Your own note');
  await expect(cell(page).getByTestId('snippet-generated-label')).toHaveCount(0);
  await expect(cell(page).getByTestId('snippet-edit')).toBeVisible();
  await expect(cell(page).getByTestId('snippet-delete')).toBeVisible();
  /* §53: the lower row is removed. Its section, its heading and its unconfigured notice are gone with it. */
  await expect(page.locator('[data-section="snippet"]'), 'no lower About row').toHaveCount(0);
  await expect(page.getByText('About this record', { exact: true }), 'no second heading for the About').toHaveCount(0);
  await expect(page.getByTestId('snippet-unconfigured'), 'no control and no notice where writing is not configured').toHaveCount(0);
  await expect(page.getByTestId('snippet-generate')).toHaveCount(0);
  await expect(cell(page).locator('[data-field="about-qualifier"]'), 'the sentence goes with the generate control').toHaveCount(0);
  expect(await cell(page).locator('[title]').count(), 'never a title attribute').toBe(0);
});

test('a record with no About shows the diagonal and, unconfigured, no Write one', async ({ page }) => {
  await login(page);
  const suffix = `snipa-${Date.now()}`;
  const artist = await post(page, '/api/artists', { name: `Anti-Cimex ${suffix}` });
  trackArtist(artist.id as string);
  const record = await post(page, '/api/records', { title: `Raped Ass ${suffix}`, artistId: artist.id });
  await page.goto(`/records/${record.id}`);

  await expect(cell(page).locator('[data-diagonal]')).toHaveCount(1);
  await expect(page.locator('[data-field="about-write"]')).toHaveCount(0);
  await expect(page.getByTestId('snippet-absent'), 'no absence message: the diagonal is the absence state').toHaveCount(0);
});

test('editing replaces the prose in place: the textarea takes the region’s height, the budget line and Save/Cancel take the control line, and Save writes back', async ({ page }) => {
  await login(page);
  await page.setViewportSize({ width: 1440, height: NO_SCROLL_HEIGHT });
  const suffix = `snipe-${Date.now()}`;
  const id = await seedEditedRecord(page, suffix);
  await page.goto(`/records/${id}`);
  const region = cell(page).locator('[data-field="about"]');
  await expect(region).toBeVisible();
  const before = await region.evaluate((el) => el.getBoundingClientRect());
  const footBefore = await cell(page).locator('[data-field="images-foot"]').evaluate((el) => el.getBoundingClientRect().top);
  const controlsBefore = await cell(page).locator('[data-field="about-controls"]').evaluate((el) => el.getBoundingClientRect().height);

  await cell(page).getByTestId('snippet-edit').click();
  const draft = cell(page).getByTestId('snippet-draft');
  await expect(draft, 'the textarea, in the cell').toBeVisible();
  await expect(region, 'in place of the prose region').toHaveCount(0);
  const after = await draft.evaluate((el) => el.getBoundingClientRect());
  expect(Math.abs(after.top - before.top), 'the textarea starts where the region did').toBeLessThan(1);
  /*
    §53: "the textarea takes the prose region's height" and "nothing else in
    the cell moves". On this record the rest line is one row (YOUR OWN NOTE ·
    EDIT · DELETE, unconfigured) and editing needs two (the budget row, then
    Save and Cancel), so the textarea gives up exactly that row and the foot
    keeps the cell's floor. Where the control block does not grow, the two
    heights are equal.
  */
  const controls = cell(page).locator('[data-field="about-controls"]');
  const grew = (await controls.evaluate((el) => el.getBoundingClientRect().height)) - controlsBefore;
  expect(grew, 'the control block grew by whole rows or not at all').toBeGreaterThanOrEqual(0);
  expect(Math.abs(after.height - (before.height - grew)), 'the textarea takes the region’s height less what the control block grew by').toBeLessThan(1);
  await expect(cell(page).getByTestId('about-budget'), 'the budget line, where the control line was').toBeVisible();
  await expect(cell(page).getByTestId('snippet-save')).toBeVisible();
  await expect(cell(page).getByTestId('snippet-cancel')).toBeVisible();
  await expect(cell(page).getByTestId('snippet-edit'), 'Edit and Delete give way').toHaveCount(0);
  await expect(cell(page).getByTestId('snippet-delete')).toHaveCount(0);
  const footAfter = await cell(page).locator('[data-field="images-foot"]').evaluate((el) => el.getBoundingClientRect().top);
  expect(Math.abs(footAfter - footBefore), `nothing else in the cell moves (the foot went from ${footBefore.toFixed(1)} to ${footAfter.toFixed(1)}; region was ${before.height.toFixed(1)} tall, textarea ${after.height.toFixed(1)})`).toBeLessThan(1);

  await draft.fill(`Rewritten words ${suffix}`);
  await cell(page).getByTestId('snippet-save').click();
  await expect(cell(page).locator('[data-field="about"]')).toContainText(`Rewritten words ${suffix}`);
  await expect(cell(page).getByTestId('snippet-yours')).toHaveText('Your own note');
  await expect(cell(page).getByTestId('snippet-draft')).toHaveCount(0);
});

test('Cancel restores the prose unchanged', async ({ page }) => {
  await login(page);
  const suffix = `snipc-${Date.now()}`;
  const id = await seedEditedRecord(page, suffix);
  await page.goto(`/records/${id}`);
  await cell(page).getByTestId('snippet-edit').click();
  await cell(page).getByTestId('snippet-draft').fill('Discarded');
  await cell(page).getByTestId('snippet-cancel').click();
  await expect(cell(page).locator('[data-field="about"]')).toContainText(`My own words ${suffix}`);
  await expect(cell(page).getByTestId('snippet-draft')).toHaveCount(0);
});

test('deleting an About from the cell removes the text and leaves the diagonal', async ({ page }) => {
  await login(page);
  const suffix = `snipd-${Date.now()}`;
  const id = await seedEditedRecord(page, suffix);
  await page.goto(`/records/${id}`);
  await cell(page).getByTestId('snippet-delete').click();

  await expect(cell(page).locator('[data-diagonal]')).toHaveCount(1);
  await expect(cell(page).locator('[data-field="about"]')).toHaveCount(0);
  await expect(page.getByText(`My own words ${suffix}`)).toHaveCount(0);
});
