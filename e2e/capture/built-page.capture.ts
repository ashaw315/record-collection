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
 *
 * **Written into `docs/captures/` and committed**, with the record and the
 * viewport in each filename. Three sets sent through the conversation did
 * not arrive and neither end could see why; a file in the repo can be
 * opened from the repo.
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
  /*
    **A second record with an ORDINARY two-line title.** The extremes show
    the collapse and the wide grids; what neither shows is the case 16 of 17
    records are in — where §4.2's gap between the title block and the pressing
    block is large, because `justify-content: space-between` distributes all
    the slack into it. Whether the pressing block should stay pinned to the
    cell's floor with that void above it, or follow the title, changes every
    record but the worst, and it is Design's to rule from a capture.
  */
  const ordinaryArtist = await post('/api/artists', { name: 'Cocteau Twins' });
  trackArtist(ordinaryArtist.id as string);
  /* Its own label and pressing: reusing the other record's showed Casablanca 1979 under a 1990 title. */
  const ordinaryLabel = await post('/api/labels', { name: '4AD' });
  const ordinaryPressing = await post('/api/pressings', {
    catalogNumber: 'CAD 0007',
    yearPressed: 1990,
    countryPressed: 'United Kingdom',
    pressingPlant: 'Damont',
    vinylWeightGrams: 140,
    colorVariant: 'Black',
  });
  const ordinaryGenres: string[] = [];
  for (const name of ['Dream Pop', 'Shoegaze']) ordinaryGenres.push((await post('/api/genres', { name })).id);
  const ordinary = await post('/api/records', {
    title: 'Heaven or Las Vegas',
    artistId: ordinaryArtist.id,
    labelId: ordinaryLabel.id,
    pressingId: ordinaryPressing.id,
    formatId: format.id,
    genreIds: ordinaryGenres,
    releaseYear: 1990,
  });
  const ordinaryId = ordinary.id as string;
  await seedImage({ recordId: ordinaryId, imageType: 'cover' });
  await getTestDb().execute(sql`UPDATE records SET spine_colour = ${'#6a7f8c'} WHERE id = ${ordinaryId}::uuid`);

  for (const [width, height] of [[1440, NO_SCROLL_HEIGHT], [390, 844]] as const) {
    await page.setViewportSize({ width, height });
    await page.goto(`/records/${ordinaryId}`);
    await page.locator('[data-track="content"]').waitFor({ timeout: 20_000 });
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(400);
    /* Next's dev-mode compile badge is chrome, not the page. */
    await page.addStyleTag({ content: 'nextjs-portal{display:none!important}' });
    await page.screenshot({ path: `docs/captures/record-detail-ordinary-two-line-title-${width}.png`, fullPage: true });
  }

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

    await page.addStyleTag({ content: 'nextjs-portal{display:none!important}' });
    await page.screenshot({ path: `docs/captures/record-detail-worst-title-${width}.png`, fullPage: true });
  }
});
