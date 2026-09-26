import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { registerCleanup, trackArtist } from './cleanup';
import { getTestDb } from '../test/helpers/db';
import { seedImage, seedRecordWithId } from './seed';
import { sql } from 'drizzle-orm';

registerCleanup();
const PASSWORD = process.env.E2E_PASSWORD ?? 'test-password-for-e2e';
async function login(page: Page) {
  await page.goto('/login');
  await page.locator('form[data-hydrated="true"]').waitFor({ timeout: 15_000 });
  await page.getByLabel('Password').pressSequentially(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL('/');
}
const post = async (page: Page, path: string, data: unknown) => { const j = await (await page.request.post(path, { data })).json(); return { id: (j.id ?? j.error?.existingId) as string }; };

/**
 * §36 -- the About's lower row survives as its editor and its full reading;
 * the frame cell gains one link, never a control.
 *
 * On the collection's real rows: The Hurdy Gurdy Man (745 characters,
 * fourteen lines) is clamped by the frame, so the row carries the full text;
 * Loss Of Life (482, nine lines) fits, so the row carries the by-line and
 * controls only. Real About text, stand-in fields otherwise.
 */
test('the row carries the full text only for a record whose frame clamps its About (§36)', async ({ page }) => {
  await login(page);
  const rows: Array<{ id: string; title: string; about: string | null }> = JSON.parse(readFileSync('docs/captures/real-records.json', 'utf8'));
  const artist = await post(page, '/api/artists', { name: 'MGMT' });
  trackArtist(artist.id);
  const db = getTestDb();
  for (const title of ['The Hurdy Gurdy Man', 'Loss Of Life']) {
    const r = rows.find((x) => x.title === title);
    expect(r?.about, `${title} has its real About`).toBeTruthy();
    if (r === undefined) continue;
    const existing = await db.execute<{ id: string }>(sql`SELECT id FROM records WHERE id = ${r.id}::uuid`);
    if (existing.rows.length === 0) {
      await seedRecordWithId({ id: r.id, artistId: artist.id, title: r.title, releaseYear: 2024, genreIds: [] });
      await seedImage({ recordId: r.id, imageType: 'cover' });
      await db.execute(sql`UPDATE records SET spine_colour = ${'#a25829'}, snippet = ${r.about}, snippet_edited_at = NOW() WHERE id = ${r.id}::uuid`);
    }
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`/records/${r.id}`);
    await page.locator('[data-field="eyebrow"]').waitFor({ timeout: 20_000 });
    await page.waitForTimeout(750);
    const clamped = await page.locator('[data-field="about"]').getAttribute('data-clamped');
    const full = page.getByTestId('snippet-full');
    if (title === 'The Hurdy Gurdy Man') {
      expect(clamped, 'the frame clamps it').not.toBeNull();
      await expect(page.locator('[data-field="about-more"]')).toHaveAttribute('href', '#snippet');
      await expect(full, 'the row carries the full reading').toHaveText(r.about ?? '');
      const order = await page.evaluate(() => { const s = document.querySelector('section#snippet') as HTMLElement; return { full: s.innerHTML.indexOf('snippet-full'), byline: s.innerHTML.search(/snippet-(generated-label|yours)/) }; });
      expect(order.full, 'above the by-line').toBeLessThan(order.byline);
    } else {
      expect(clamped, 'the frame holds it whole').toBeNull();
      await expect(full, 'no second copy of a text the frame shows whole').toHaveCount(0);
    }
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
test('the absence state links "Write one ↓" to the row only where writing is configured (§36)', async ({ page }) => {
  await login(page);
  await page.goto('/wall/probe/page8a?case=emptiest');
  await page.getByTestId('record-page-8a').waitFor({ timeout: 20_000 });
  await expect(page.locator('[data-cell="note"] [data-diagonal]'), 'the diagonal stays').toHaveCount(1);
  await expect(page.locator('[data-field="about-write"]'), 'no key, no link').toHaveCount(0);

  await page.goto('/wall/probe/page8a?case=emptiest&configured=1');
  await page.getByTestId('record-page-8a').waitFor({ timeout: 20_000 });
  const link = page.locator('[data-field="about-write"]');
  await expect(link).toHaveText('Write one ↓');
  await expect(link).toHaveAttribute('href', '#snippet');
  await expect(page.locator('[data-cell="note"] button'), 'a link, never a control, in the frame cell').toHaveCount(0);
  await expect(page.locator('[data-cell="note"] [data-diagonal]'), 'the diagonal stays beneath it').toHaveCount(1);
  const order = await page.evaluate(() => { const c = document.querySelector('[data-cell="note"]') as HTMLElement; return { label: c.innerHTML.indexOf('>About<'), link: c.innerHTML.indexOf('about-write'), diagonal: c.innerHTML.indexOf('data-diagonal') }; });
  expect(order.link, 'below the label').toBeGreaterThan(order.label);
  expect(order.link, 'ahead of the diagonal').toBeLessThan(order.diagonal);
});
