import { test, expect } from '@playwright/test';
import { getTestDb } from '../../test/helpers/db';
import { sql } from 'drizzle-orm';
import { seedImage } from '../seed';
import { trackArtist } from '../cleanup';
import { NO_SCROLL_HEIGHT } from '../../src/app/records/[id]/band-geometry';

/**
 * **The built page at §28's two named viewports, on a real route.**
 *
 * Not the probe: the probe renders a fixed case into the frame, and what
 * Adam has not seen is `/records/[id]` as the app serves it — the five rows,
 * the figures and flats where §26 puts them, and the same page reflowed to
 * §28's one fluid column at 390.
 *
 * Full page rather than the fold, because §26's region is the half that
 * changed and most of it is below 900.
 */
const PASSWORD = process.env.E2E_PASSWORD ?? 'test-password-for-e2e';

test('capture the built record page at 1440 and 390', async ({ page }) => {
  test.skip(process.env.CAPTURE !== '1', 'A capture tool: run with CAPTURE=1');
  test.setTimeout(180_000);

  await page.goto('/login');
  await page.locator('form[data-hydrated="true"]').waitFor({ timeout: 15_000 });
  await page.getByLabel('Password').pressSequentially(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL('/');

  /* A record with something in every section, so the rows show what they hold. */
  const post = async (path: string, data: unknown) => (await page.request.post(path, { data })).json();
  /*
    **The isolation suffix goes on nothing the page displays.** §27's rule is
    about fixtures, but a CAPTURE has the same problem in a worse place: a
    suffix on the artist, label, catalogue and format renders on the page, so
    the screenshot shows `Donna Summer capmueqcjti` and Adam judges type he
    will never ship. The record's id is already unique, so the names do not
    need to be.
  */
  const artist = await post('/api/artists', { name: 'Donna Summer' });
  trackArtist(artist.id as string);
  const label = await post('/api/labels', { name: 'Casablanca' });
  const pressing = await post('/api/pressings', {
    catalogNumber: 'NBLP 7119',
    yearPressed: 1979,
    countryPressed: 'United States',
    pressingPlant: 'Monarch',
    vinylWeightGrams: 140,
    colorVariant: 'Black',
  });
  const format = await post('/api/formats', { name: 'Vinyl, LP, Album' });
  const genreIds: string[] = [];
  for (const name of ['Disco', 'Soul', 'Pop']) genreIds.push((await post('/api/genres', { name })).id);
  const record = await post('/api/records', {
    title: 'On The Radio: Greatest Hits Vol. 1 & 2',
    artistId: artist.id,
    labelId: label.id,
    pressingId: pressing.id,
    formatId: format.id,
    genreIds,
    releaseYear: 1979,
  });
  const id = record.id as string;

  await seedImage({ recordId: id, imageType: 'cover' });
  await seedImage({ recordId: id, imageType: 'matrix' });
  await seedImage({ recordId: id, imageType: 'back' });
  /*
    The snippet is written directly: §10b generates it through Anthropic, and
    a local capture has no key — the section would render "not configured",
    which is a deployment state rather than the page Adam is judging.
  */
  await getTestDb().execute(sql`
    UPDATE records SET
      spine_colour = ${'#a25829'},
      notes = ${'Bought for the B-side. Sleeve has a split at the bottom seam.'},
      snippet = ${'Her last album for Casablanca, and the one where the disco machinery starts to sound like a band. The long version of the title track runs past seventeen minutes without repeating itself.'},
      snippet_edited_at = NOW()
    WHERE id = ${id}::uuid`);
  await page.request.post(`/api/records/${id}/journal`, {
    data: { entryDate: '2026-09-14', note: 'Played it twice through on the Saturday. The long version still earns its seventeen minutes.' },
  });
  /* `recordedAt` is the endpoint's to set — sending it is a validation failure, and a silent one. */
  /* Money crosses this boundary as a STRING — §4's money schema, so a float is a 400. */
  for (const [price, source] of [['3.95', 'Amoeba'], ['4.50', 'Discogs']] as const) {
    const posted = await page.request.post(`/api/records/${id}/prices`, { data: { price, priceType: 'used', source } });
    expect(posted.status(), `the price seeded: ${await posted.text()}`).toBe(201);
  }

  /*
    §28's two named viewports, plus §30's wide references — the section
    requires the page viewed at 1680 × 1050 and 1920 × 1080 before merging,
    and 1920 × 950 is the real maximised window where the floor is a stated
    known miss.
  */
  for (const [width, height] of [[1440, NO_SCROLL_HEIGHT], [390, 844], [1680, 1050], [1920, 1080]] as const) {
    await page.setViewportSize({ width, height });
    await page.goto(`/records/${id}`);
    await page.locator('[data-section]').first().waitFor({ timeout: 20_000 });

    /*
      The cover must have DECODED, not merely finished requesting: `complete`
      goes true on failure too, which once captured a broken-image marker.
    */
    await page.waitForFunction(
      () => {
        const img = document.querySelector('[data-cell="sleeve"] img');
        return img === null || (img as HTMLImageElement).naturalWidth > 0;
      },
      undefined,
      { timeout: 20_000 },
    );
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(400);

    await page.screenshot({ path: `docs/record-detail/built/page-${width}.png`, fullPage: true });
  }
});
