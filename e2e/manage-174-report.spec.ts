import { expect, test, type Page } from '@playwright/test';
import { registerCleanup, trackArtist, trackCreated } from './cleanup';
import { login } from './sign-in';

/**
 * **Step 174's two history cases, ruled (Design, "Row entry reopens", 11 Nov; step 177).** They were observed first,
 * as report-only tests, because the entry the row adds could not satisfy "closing it by any means removes it" for
 * Forward after a close or a reload with a row open: Forward landed on a dead entry and a reload lost the row. §T.6 now
 * rules that "the row’s entry names the row it opened, and landing on it opens that row with its saved values: by
 * Forward after a close, and after a reload with the row open." The two observations are these assertions, inverted:
 * each fails against the build before 177, which ignored a landing. Unsaved edits are never restored; a row that no
 * longer exists replaces its entry and stays closed; an entry from another section re-enters that section first.
 *
 * The tall-form finding is an assertion with its figures reported beside it (the coordinator, 11 Nov); nothing here
 * scrolls to the line, as the step asks, and the link exit's wait is asserted as an ordering.
 */
registerCleanup();
test.use({ hasTouch: true, viewport: { width: 390, height: 844 } });

const CONFIRM = '[data-manage-confirm]';

/** A stamp no other worker shares: the projects run this file at once, and a clock stamp alone collided (409 on the artist). */
const stamp = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

async function seedStore(page: Page, stamp: string): Promise<{ name: string; id: string }> {
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
  const id = await post('/api/stores', { name, city: 'Leeds', country: 'UK', isFavorite: true });
  return { name, id };
}

async function toSection(page: Page, label: string) {
  await page.getByRole('navigation', { name: 'Resource' }).getByRole('button', { name: label, exact: true }).click();
}

/** From the collection to manage, so Back has a screen to leave to; the store's row opened in its section. */
async function openStore(page: Page, store: string) {
  await page.goto('/');
  await page.goto('/manage');
  await toSection(page, 'Stores');
  const row = page.locator('[data-manage-list]:visible [data-manage-row]').filter({ hasText: store });
  await row.locator('[data-manage-open]').click();
  await expect(row.locator('[data-manage-form]')).toBeVisible();
  return row;
}

test('Forward after a close reopens the row with its saved values, and never the unsaved edit', async ({ page }) => {
  await login(page);
  const store = await seedStore(page, stamp());
  const row = await openStore(page, store.name);
  const form = row.locator('[data-manage-form]');
  const city = form.getByLabel(`${store.name} city`, { exact: true });
  await city.fill('York');
  /* Closed by hand over a change: the line asks, DISCARD closes and pops the entry, which stands in the forward list. */
  await row.locator('[data-manage-open]').click();
  await form.locator(CONFIRM).getByRole('button', { name: 'Discard changes' }).click();
  await expect(form).toHaveCount(0);
  await page.goForward();
  await expect(page).toHaveURL(/\/manage$/);
  /* Fails against a landing the list ignores (ResourceList before 177), which left the row closed. */
  await expect(form, 'Forward re-enters the entry and the row it names is open').toBeVisible();
  await expect(city, 'with its saved value, not the discarded edit').toHaveValue('Leeds');
  /* The reopened row's entry is the one landed on: one Back closes it, another leaves. */
  await page.goBack();
  await expect(form).toHaveCount(0);
  await expect(page).toHaveURL(/\/manage$/);
  await page.goBack();
  await expect(page).toHaveURL(/\/$/);
});

test('after a reload with a row open, the row is open with its saved values, and one Back closes it', async ({ page }) => {
  await login(page);
  const store = await seedStore(page, stamp());
  await openStore(page, store.name);
  await page.reload();
  const form = page.locator('[data-manage-list]:visible [data-manage-row]').filter({ hasText: store.name }).locator('[data-manage-form]');
  /* Fails against a load that never read the entry (before 177), which drew the first section with nothing open. */
  await expect(form, 'the reload lands on the row’s entry and opens the row').toBeVisible();
  await expect(form.getByLabel(`${store.name} city`, { exact: true })).toHaveValue('Leeds');
  await page.goBack();
  await expect(form, 'one Back closes it').toHaveCount(0);
  await expect(page).toHaveURL(/\/manage$/);
  await page.goBack();
  await expect(page, 'and the next leaves').toHaveURL(/\/$/);
});

test('Forward after a change of section re-enters the row’s section and opens the row', async ({ page }) => {
  await login(page);
  const store = await seedStore(page, stamp());
  const row = await openStore(page, store.name);
  /* An unchanged row open, the section changed: the list unmounts and pops its entry, which stands in the forward list. */
  await toSection(page, 'Tags');
  await expect(page.getByRole('region', { name: 'Tags' })).toBeVisible();
  await page.goForward();
  /* Fails against a screen that never reads a landing (ManageClient before 177), which stayed on Tags. */
  await expect(page.getByRole('region', { name: 'Stores' }), 'the entry’s section is shown').toBeVisible();
  await expect(row.locator('[data-manage-form]'), 'and its row is open').toBeVisible();
});

test('a row that no longer exists: Forward replaces its entry and stays closed', async ({ page }) => {
  await login(page);
  const store = await seedStore(page, stamp());
  const row = await openStore(page, store.name);
  await row.locator('[data-manage-open]').click();
  await expect(row.locator('[data-manage-form]')).toHaveCount(0);
  const deleted = await page.request.delete(`/api/stores/${store.id}`);
  expect(deleted.status()).toBe(200);
  /* The list's rows are the page's: reloaded, so the row is gone from them as it is from the table. */
  await page.reload();
  await page.goForward();
  await expect(page).toHaveURL(/\/manage$/);
  await expect(page.locator('[data-manage-form]'), 'nothing opens for a row that is gone').toHaveCount(0);
  /* Fails against an entry left naming the row (before 177). */
  const state = await page.evaluate(() => window.history.state as { manageRow?: string } | null);
  expect(state?.manageRow, 'the entry no longer names the row').toBeUndefined();
});

/**
 * **The link exit's wait, asserted as an ordering and not an end state (the coordinator, 11 Nov).** 174's line says "a
 * link followed on DISCARD waits for the pop to land before it navigates, so the two history operations never race";
 * the one-gesture test asserts only where the stack ends up, which a navigation that stopped waiting would also reach
 * most of the time. This records every history operation from the page's first script and asserts the order after
 * DISCARD: the close's back, its popstate, and only then the navigation's push. Fails against a `leave` that performs
 * the exit at once instead of in the popstate handler (ResourceList.tsx, `leave` and `onPop`): staged, the push came
 * before the pop.
 */
test('DISCARD CHANGES on a link navigates only after the close’s pop has landed: back, then popstate, then the push', async ({ page }) => {
  await page.addInitScript(() => {
    const log: string[] = [];
    (window as unknown as { __history177: string[] }).__history177 = log;
    const back = window.history.back.bind(window.history);
    window.history.back = () => {
      log.push('back');
      back();
    };
    const push = window.history.pushState.bind(window.history);
    window.history.pushState = (data: unknown, unused: string, url?: string | URL | null) => {
      log.push(`push ${url === undefined || url === null ? '' : String(url)}`);
      push(data, unused, url);
    };
    window.addEventListener('popstate', () => log.push('pop'));
  });
  await login(page);
  const store = await seedStore(page, stamp());
  const row = await openStore(page, store.name);
  const form = row.locator('[data-manage-form]');
  await form.getByLabel(`${store.name} city`, { exact: true }).fill('York');
  await page.getByRole('button', { name: 'Menu' }).click();
  await page.getByRole('link', { name: 'Want list', exact: true }).click();
  const confirm = form.locator(CONFIRM);
  await expect(confirm).toBeVisible();
  /* From DISCARD on: nothing before it is the exit's. */
  await page.evaluate(() => { (window as unknown as { __history177: string[] }).__history177.length = 0; });
  await confirm.getByRole('button', { name: 'Discard changes' }).click();
  /* The order is read once the navigation's push is recorded, before the end state is asked for: a race is visible here even when it happens to land. */
  const recorded = () => page.evaluate(() => (window as unknown as { __history177: string[] }).__history177);
  await expect.poll(recorded, { message: 'the navigation’s push is recorded after DISCARD (staged without the wait, it never came: the pop landed on the navigation and the page stayed on manage)' }).toEqual(expect.arrayContaining([expect.stringMatching(/^push .*\/want-list/)]));
  const order = await recorded();
  const push = order.findIndex((entry) => entry.startsWith('push ') && entry.includes('/want-list'));
  expect(order.slice(0, push + 1), 'the close’s back, its pop, then the push, in that order').toEqual(['back', 'pop', order[push]]);
  await expect(page).toHaveURL(/\/want-list$/);
});

/**
 * **The asking line's visibility on the tallest form, asserted (the coordinator, 11 Nov).** The line is in view when an
 * exit at the top is pressed because its first button takes focus (step 137) and the browser scrolls a focused control
 * into view; nothing tied the two until this. Fails against a line that no longer takes focus (ResourceList.tsx, the
 * confirm's `autoFocus`): staged, the line stood 275px below the fold at 844 and 452px at 667. The figures are reported
 * beside the assertion, for Design's ruling on whether this is the scroll it wants; nothing here scrolls to the line.
 */
test('the asking line is in view when an exit at the top of the tallest form is pressed, by the focus it takes', async ({ page }, testInfo) => {
  await login(page);
  const store = await seedStore(page, stamp());
  const lines: string[] = [];
  for (const height of [844, 667]) {
    await page.setViewportSize({ width: 390, height });
    const row = await openStore(page, store.name);
    const form = row.locator('[data-manage-form]');
    await form.getByLabel(`${store.name} city`, { exact: true }).fill('York');
    /*
      The exit pressed at the top: the section names, with the page at its head. The press is dispatched on the button
      itself, since a Playwright click scrolls its target into view first and that would move the page before the measure.
    */
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.getByRole('navigation', { name: 'Resource' }).getByRole('button', { name: 'Tags', exact: true }).evaluate((button) => (button as HTMLButtonElement).click());
    const confirm = form.locator(CONFIRM);
    await expect(confirm).toHaveCount(1);
    const scrollY = await page.evaluate(() => window.scrollY);
    const formBox = await form.boundingBox();
    const lineBox = await confirm.boundingBox();
    if (formBox === null || lineBox === null) throw new Error('the form or the line has no box');
    /* The build moves focus to the line's first button (step 137), and the browser scrolls a focused control into view: both the scrolled position and the unscrolled one are reported. */
    const belowFold = Math.max(0, Math.round(lineBox.y + lineBox.height - height));
    const unscrolledTop = Math.round(lineBox.y + scrollY);
    const unscrolledBelow = Math.max(0, Math.round(unscrolledTop + lineBox.height - height));
    lines.push(`[174-tall] window 390 × ${height}: form ${Math.round(formBox.height)} tall from ${Math.round(formBox.y + scrollY)} unscrolled; the page scrolled ${scrollY} by the focus the line takes, so the line (${Math.round(lineBox.height)} tall) is at ${Math.round(lineBox.y)} and ${belowFold === 0 ? 'in view' : `${belowFold}px below the fold`}; unscrolled it would stand at ${unscrolledTop}, ${unscrolledBelow === 0 ? 'in view' : `${unscrolledBelow}px below the fold`}`);
    expect(lineBox.y, `at ${height} the line’s top is within the window`).toBeGreaterThanOrEqual(0);
    expect(belowFold, `at ${height} the line is wholly in view (${lines[lines.length - 1]})`).toBe(0);
    await confirm.getByRole('button', { name: 'Keep editing' }).click();
    await form.getByLabel(`${store.name} city`, { exact: true }).fill('Leeds');
    await row.locator('[data-manage-open]').click();
    await expect(form).toHaveCount(0);
  }
  for (const line of lines) testInfo.annotations.push({ type: 'report', description: line });
  process.stdout.write(`${lines.join('\n')}\n`);
});
