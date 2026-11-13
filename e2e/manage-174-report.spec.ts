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
  /*
    Fails against an entry left naming the row (before 177). Polled: the landing replaces the entry in an effect after
    the page has drawn, and "nothing opens" is already true before it runs, so a single read raced it (1 in 8 on
    chromium, 12 Nov, the source untouched).
  */
  await expect.poll(() => page.evaluate(() => (window.history.state as { manageRow?: string } | null)?.manageRow), { timeout: 5_000, message: 'the entry no longer names the row' }).toBeUndefined();
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

/*
  §T.6 (Table and Grid card, 6819d53f, "Asking line in view", 12 Nov): "When the line asks, the page scrolls the least
  that brings it into view, because the exit waits on it." Ruled, not inherited from focus, so it is asserted with the
  focus the line takes and with that focus suppressed, at 390 × 667, the height it is judged at, and 390 × 844, on a
  store's form, the tallest. Until this step the line was in view only by the browser scrolling a focused control in;
  this test's predecessor asserted that and named it ("by the focus it takes"), which the ruling replaces.
*/
const exitAtTop = async (page: Page) => {
  /* The exit pressed at the top with the page at its head, dispatched on the button: a Playwright click scrolls its target into view first. */
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.getByRole('navigation', { name: 'Resource' }).getByRole('button', { name: 'Tags', exact: true }).evaluate((button) => (button as HTMLButtonElement).click());
};
/* Focus suppressed: nothing the page does can move focus, so no scroll comes from it. Reverted by `allowFocus`. */
const suppressFocus = (page: Page) =>
  page.evaluate(() => {
    const w = window as unknown as { __focus?: typeof HTMLElement.prototype.focus };
    w.__focus = HTMLElement.prototype.focus;
    HTMLElement.prototype.focus = function focusSuppressed() {};
  });
const allowFocus = (page: Page) =>
  page.evaluate(() => {
    const w = window as unknown as { __focus?: typeof HTMLElement.prototype.focus };
    if (w.__focus !== undefined) HTMLElement.prototype.focus = w.__focus;
  });
const focusedInLine = (page: Page) => page.evaluate((sel) => document.querySelector(sel)?.contains(document.activeElement) ?? false, CONFIRM);

test('the asking line comes wholly into view when an exit at the top of the tallest form is pressed, at 390 × 667 and 390 × 844, with focus moved and with focus suppressed', async ({ page }, testInfo) => {
  await login(page);
  const store = await seedStore(page, stamp());
  const lines: string[] = [];
  for (const height of [667, 844]) {
    for (const focus of ['moved', 'suppressed'] as const) {
      await page.setViewportSize({ width: 390, height });
      const row = await openStore(page, store.name);
      const form = row.locator('[data-manage-form]');
      await form.getByLabel(`${store.name} city`, { exact: true }).fill('York');
      if (focus === 'suppressed') await suppressFocus(page);
      await exitAtTop(page);
      const confirm = form.locator(CONFIRM);
      await expect(confirm).toHaveCount(1);
      expect(await focusedInLine(page), `the precondition at ${height}: focus ${focus === 'moved' ? 'is in the line' : 'never reached the line'}`).toBe(focus === 'moved');
      /* The least scroll may animate where motion is allowed: the line is read once the page has stopped. */
      await expect.poll(async () => {
        const box = await confirm.boundingBox();
        return box !== null && box.y >= 0 && box.y + box.height <= height;
      }, { timeout: 5_000, message: `at ${height} with focus ${focus}, the line is wholly within the window` }).toBe(true);
      const box = await confirm.boundingBox();
      const scrollY = await page.evaluate(() => window.scrollY);
      lines.push(`[183-line] 390 × ${height}, focus ${focus}: the page scrolled ${scrollY}; the line stands ${Math.round(box?.y ?? -1)} to ${Math.round((box?.y ?? 0) + (box?.height ?? 0))}`);
      await allowFocus(page);
      await confirm.getByRole('button', { name: 'Keep editing' }).click();
      await form.getByLabel(`${store.name} city`, { exact: true }).fill('Leeds');
      await row.locator('[data-manage-open]').click();
      await expect(form).toHaveCount(0);
    }
  }
  for (const line of lines) testInfo.annotations.push({ type: 'report', description: line });
  process.stdout.write(`${lines.join('\n')}\n`);
});

/*
  "Least": the line is brought to the window's foot and no further, so the form above it stays as much in view as it
  can, with focus moved and with it suppressed. The browser's own scroll for a focused control overshot by 40 at 667
  (the line at 583 to 627 with focus moved, 623 to 667 without), so the focus is moved without scrolling and the one
  scroll is the least.
*/
test('the scroll is the least that brings the line into view: its foot stands at the window’s foot, with focus moved and with focus suppressed', async ({ page }) => {
  await login(page);
  const store = await seedStore(page, stamp());
  await page.setViewportSize({ width: 390, height: 667 });
  for (const focus of ['moved', 'suppressed'] as const) {
    const row = await openStore(page, store.name);
    const form = row.locator('[data-manage-form]');
    await form.getByLabel(`${store.name} city`, { exact: true }).fill('York');
    if (focus === 'suppressed') await suppressFocus(page);
    await exitAtTop(page);
    const confirm = form.locator(CONFIRM);
    await expect.poll(async () => { const b = await confirm.boundingBox(); return b === null ? null : Math.round(b.y + b.height); }, { timeout: 5_000, message: `focus ${focus}: the line's foot at the window's foot` }).toBe(667);
    await page.waitForTimeout(500);
    const settled = await confirm.boundingBox();
    expect(Math.round((settled?.y ?? 0) + (settled?.height ?? 0)), `focus ${focus}: and it stays there`).toBe(667);
    await allowFocus(page);
    await confirm.getByRole('button', { name: 'Keep editing' }).click();
    await form.getByLabel(`${store.name} city`, { exact: true }).fill('Leeds');
    await row.locator('[data-manage-open]').click();
    await expect(form).toHaveCount(0);
  }
});

/* "Under reduced motion it jumps": the line is in place in the first frames after it appears, and nothing moves after. */
test('under reduced motion the line jumps into view: in place within two frames and still a second later', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await login(page);
  const store = await seedStore(page, stamp());
  await page.setViewportSize({ width: 390, height: 667 });
  const row = await openStore(page, store.name);
  const form = row.locator('[data-manage-form]');
  await form.getByLabel(`${store.name} city`, { exact: true }).fill('York');
  await suppressFocus(page);
  await page.evaluate(() => window.scrollTo(0, 0));
  const read = await page.getByRole('navigation', { name: 'Resource' }).getByRole('button', { name: 'Tags', exact: true }).evaluate(async (button, sel) => {
    const frame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    (button as HTMLButtonElement).click();
    for (let i = 0; i < 30 && document.querySelector(sel) === null; i += 1) await frame();
    await frame();
    await frame();
    const early = window.scrollY;
    await new Promise((resolve) => setTimeout(resolve, 1_000));
    return { early, late: window.scrollY };
  }, CONFIRM);
  expect(read.late, 'the page scrolled to bring the line in').toBeGreaterThan(0);
  expect(read.early, 'the scroll was whole within two frames: a jump, not an animation').toBe(read.late);
});

test('when the line appears focus is on KEEP EDITING, and Enter keeps the edits', async ({ page }) => {
  await login(page);
  const store = await seedStore(page, stamp());
  await page.setViewportSize({ width: 390, height: 844 });
  const row = await openStore(page, store.name);
  const form = row.locator('[data-manage-form]');
  const city = form.getByLabel(`${store.name} city`, { exact: true });
  await city.fill('York');
  await exitAtTop(page);
  const confirm = form.locator(CONFIRM);
  await expect(confirm.getByRole('button', { name: 'Keep editing' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(confirm).toHaveCount(0);
  await expect(city, 'the edit is kept').toHaveValue('York');
  await expect(page.getByRole('navigation', { name: 'Resource' }).getByRole('button', { name: 'Stores', exact: true }), 'the section did not change').toHaveAttribute('aria-current', /.+/);
});

/* Design's resend of 11 Nov, carried by "Asking line in view" as Change 1b: the link exit leaves no Forward, and Back is manage with the row closed. */
test('after DISCARD on a link, Forward from the new screen is unavailable, and Back lands on manage with the row closed', async ({ page }) => {
  await login(page);
  const store = await seedStore(page, stamp());
  const row = await openStore(page, store.name);
  const form = row.locator('[data-manage-form]');
  await form.getByLabel(`${store.name} city`, { exact: true }).fill('York');
  await page.getByRole('button', { name: 'Menu' }).click();
  await page.getByRole('link', { name: 'Want list', exact: true }).click();
  await form.locator(CONFIRM).getByRole('button', { name: 'Discard changes' }).click();
  await expect(page).toHaveURL(/\/want-list$/);
  const forward = await page.goForward({ timeout: 5_000 }).catch(() => null);
  expect(forward, 'Forward navigated nowhere').toBeNull();
  await expect(page, 'Forward left the new screen where it was').toHaveURL(/\/want-list$/);
  await page.goBack();
  await expect(page).toHaveURL(/\/manage/);
  await expect(page.getByRole('heading', { name: /manage/i }).or(page.locator('[data-manage-list]')).first()).toBeVisible();
  await expect(page.locator('[data-manage-form]'), 'the row is closed').toHaveCount(0);
});
