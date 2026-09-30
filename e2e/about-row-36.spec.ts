import { expect, test, type Page } from '@playwright/test';
import { NO_SCROLL_HEIGHT } from '../src/app/records/[id]/band-geometry';
import { readSeventeen } from './seventeen';

/* Reads the run-level seventeen (`seventeen.ts`); it seeded them itself until 29 Sep, a path global setup had made dead. */
const PASSWORD = process.env.E2E_PASSWORD ?? 'test-password-for-e2e';
async function login(page: Page) {
  await page.goto('/login');
  await page.locator('form[data-hydrated="true"]').waitFor({ timeout: 15_000 });
  await page.getByLabel('Password').pressSequentially(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL('/');
}

/**
 * §36 -- the About's lower row survives as its editor and its full reading;
 * the frame cell gains one link, never a control.
 *
 * On the collection's real rows: The Hurdy Gurdy Man (745 characters,
 * fourteen lines) is clamped by the frame, so the row carries the full text;
 * Loss Of Life (482, nine lines) fits, so the row carries the by-line and
 * controls only. Real About text, stand-in fields otherwise.
 */
/* §42 (step 50): the row keeps no copy of the text; the frame scrolls a long About and holds a short one whole. */
test('the page carries no reading copy; the frame holds the whole text, at least seven lines of it, and scrolls the rest (§42, §53)', async ({ page }) => {
  await login(page);
  const rows = readSeventeen();
  for (const title of ['The Hurdy Gurdy Man', 'Loss Of Life']) {
    const r = rows.find((x) => x.title === title);
    expect(r?.about, `${title} has its real About`).toBeTruthy();
    if (r === undefined) continue;
    await page.setViewportSize({ width: 1440, height: NO_SCROLL_HEIGHT });
    await page.goto(`/records/${r.id}`);
    await page.locator('[data-field="eyebrow"]').waitFor({ timeout: 20_000 });
    await page.waitForTimeout(750);
    const scrolls = await page.locator('[data-field="about"]').getAttribute('data-scrolls');
    await expect(page.getByTestId('snippet-full'), `${title}: the row carries no reading copy`).toHaveCount(0);
    await expect(page.locator('[data-field="about-more"]'), 'and there is no more link').toHaveCount(0);
    await expect(page.locator('[data-field="about"]'), 'the frame holds the whole text').toContainText((r.about ?? '').slice(-40).trim());
    /*
      §53 (step 60a): the control line sits under the prose, so the region at
      1440 × 900 holds eight lines where §42 measured ten, and Loss Of Life's
      482 characters no longer fit whole -- the seven-line floor is what §53
      rules, not any record's fit. The claim that survives: the text is whole
      in the region, the region holds at least seven lines, and it scrolls
      exactly when the text exceeds them.
    */
    const budget = Number(await page.locator('[data-field="about"]').getAttribute('data-line-budget'));
    expect(budget, `${title}: the region holds §53's seven lines or more`).toBeGreaterThanOrEqual(7);
    const overflows = await page.locator('[data-field="about"]').evaluate((el) => el.scrollHeight > el.clientHeight + 1);
    expect(scrolls !== null, `${title}: scrolls exactly when the text exceeds the ${budget} lines held`).toBe(overflows);
    if (title === 'The Hurdy Gurdy Man') expect(scrolls, 'the frame scrolls it').not.toBeNull();
    await expect(page.getByTestId('snippet-edit')).toBeVisible();
    await expect(page.getByTestId('snippet-delete')).toBeVisible();
  }
});

/**
 * §36's absence state, on the probe's emptiest fixture: "Write one ↓" links
 * to the row where writing is configured, and is absent where it is not --
 * the same key that decides whether the row's button renders. The E2E
 * deployment has no key, so the probe page takes `?configured=1` to render
 * the configured form.
 */
test('the absence state carries Write one as the button itself, only where writing is configured (§53)', async ({ page }) => {
  await login(page);
  await page.goto('/wall/probe/page8a?case=emptiest');
  await page.getByTestId('record-page-8a').waitFor({ timeout: 20_000 });
  await expect(page.locator('[data-cell="note"] [data-diagonal]'), 'the diagonal stays').toHaveCount(1);
  await expect(page.locator('[data-field="about-write"]'), 'no key, no control').toHaveCount(0);

  await page.goto('/wall/probe/page8a?case=emptiest&configured=1');
  await page.getByTestId('record-page-8a').waitFor({ timeout: 20_000 });
  const button = page.locator('button[data-field="about-write"]');
  await expect(button, 'the button itself, in the frame cell').toHaveText('Write one');
  await expect(page.locator('a[data-field="about-write"]'), 'no longer a link to a row').toHaveCount(0);
  await expect(page.locator('[data-cell="note"] [data-diagonal]'), 'the diagonal stays beneath it').toHaveCount(1);
  const order = await page.evaluate(() => { const c = document.querySelector('[data-cell="note"]') as HTMLElement; return { label: c.innerHTML.indexOf('>About<'), button: c.innerHTML.indexOf('about-write'), diagonal: c.innerHTML.indexOf('data-diagonal') }; });
  expect(order.button, 'below the label').toBeGreaterThan(order.label);
  expect(order.button, 'ahead of the diagonal').toBeLessThan(order.diagonal);
  /* §53: the qualifier is the generate control's own visible sentence, beside Write one; never a hover title. */
  await expect(page.locator('[data-cell="note"] [data-field="about-qualifier"]')).toHaveText('about the music, not a fact this app checked');
  expect(await page.locator('[data-cell="note"] [title]').count(), 'no title attribute carries it').toBe(0);
});

test('the qualifier is beside Save and Cancel while editing and not in the resting line; the configured resting prose holds eight lines at 1440 (§53)', async ({ page }) => {
  await login(page);
  await page.setViewportSize({ width: 1440, height: NO_SCROLL_HEIGHT });
  await page.goto('/wall/probe/page8a?case=richest&configured=1');
  await page.getByTestId('record-page-8a').waitFor({ timeout: 20_000 });
  await page.waitForTimeout(500);
  const cell = page.locator('[data-cell="note"]');
  /* §53: without the sentence the resting line is 51 characters on two rows at 1440, and the prose holds eight lines -- the margin, not just the floor. */
  const rows = await cell.locator('[data-field="about-controls"]').evaluate((el) => Math.round(el.getBoundingClientRect().height / parseFloat(getComputedStyle(el).lineHeight)));
  const held = Number(await cell.locator('[data-field="about"]').getAttribute('data-line-budget'));
  console.log(`  §53 CONFIGURED CONTROL LINE at 1440 × 900: ${rows} rows; the prose region holds ${held} lines`);
  expect(rows, 'two rows at 1440').toBe(2);
  expect(held, 'eight lines with the control line in').toBe(8);
  await expect(cell.getByTestId('snippet-generate')).toHaveText('Write a new one');
  await expect(cell.locator('[data-field="about-qualifier"]'), 'no sentence in the resting line').toHaveCount(0);
  await expect(cell.getByTestId('snippet-generated-label'), 'the short by-line is the disclosure').toHaveText('Written by Claude');
  expect(await cell.locator('[title]').count(), 'never a title attribute').toBe(0);
  await cell.getByTestId('snippet-edit').click();
  await expect(cell.getByTestId('snippet-draft')).toBeVisible();
  await expect(cell.locator('[data-field="about-qualifier"]'), 'beside Save and Cancel while editing').toHaveText('about the music, not a fact this app checked');
  await expect(cell.getByTestId('snippet-save')).toBeVisible();
});
