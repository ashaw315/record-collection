import { expect, test, type Page } from '@playwright/test';
import { removeImagesFor, seedDiscogsCache, seedImage } from './seed';

/**
 * SPEC.md §11, E2E #9: "Upload an image to a record and verify it appears in
 * the gallery."
 *
 * **The uploaded bytes are a real PNG, constructed here rather than read from
 * disk.** The server sniffs the magic number (§5.9), so a placeholder of
 * arbitrary bytes would be refused and the test would be exercising the
 * rejection path while claiming to test the happy one.
 *
 * **Nothing reaches Vercel Blob**: `BLOB_READ_WRITE_TOKEN` is absent here, so a
 * real upload fails at the storage call. The rows are therefore seeded straight
 * into Postgres.
 *
 * A first version stubbed the browser's POST instead, and it proved nothing:
 * the gallery is SERVER-rendered and `router.refresh()` re-fetches from the
 * server, which sees no row and correctly renders "no images yet". The stub
 * returned 201, the assertion failed, and it read exactly like a broken gallery
 * — a test whose seam is on the wrong side of the thing it is testing. Measured
 * with a probe rather than reasoned about.
 *
 * What each test proves, kept honest:
 *   - the GALLERY renders what the database holds — seeded rows, real render;
 *   - the CLIENT refuses an oversized file before sending it — real upload path,
 *     stopped before the network;
 *   - the storage seam itself is covered by unit tests driving the SDK fake.
 */

const PASSWORD = process.env.E2E_PASSWORD ?? 'test-password-for-e2e';

/**
 * The smallest valid PNG: signature, IHDR for a 1×1 image, one IDAT, IEND.
 * Built from bytes so no tooling can normalise it into something that is no
 * longer a PNG — the NFD lesson from NOTES, applied to binary.
 */
const ONE_PIXEL_PNG = Buffer.from(
  '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154' +
    '789c63000100000500010d0a2db40000000049454e44ae426082',
  'hex',
);

async function login(page: Page) {
  await page.goto('/login');

  // Waits for hydration before typing: this form is CONTROLLED, so a value
  // typed into the DOM before React attaches never reaches state and the submit
  // sees an empty password. See the note on the login page.
  await page.locator('form[data-hydrated="true"]').waitFor({ timeout: 15_000 });
  await page.getByLabel('Password').pressSequentially(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL('/');
}

function suffix(): string {
  return `e2ei${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;
}

/** A record with nothing attached, returning its id. */
async function seedRecord(page: Page): Promise<{ recordId: string; run: string }> {
  const run = suffix();

  const artist = await page.request.post('/api/artists', { data: { name: `Gallery-${run}` } });
  expect(artist.status()).toBe(201);

  const record = await page.request.post('/api/records', {
    data: { title: `Sleeve ${run}`, artistId: (await artist.json()).id },
  });
  expect(record.status()).toBe(201);

  return { recordId: (await record.json()).id, run };
}

test.beforeEach(async ({ page }) => {
  await login(page);
});

test('flow 9: an uploaded image appears in the gallery', async ({ page }) => {
  const { recordId } = await seedRecord(page);

  await page.goto(`/records/${recordId}`);

  // The empty state says what to do rather than showing nothing at all.
  await expect(page.getByTestId('image-gallery')).toContainText('No images yet');

  await seedImage({ recordId, imageType: 'cover' });
  await page.reload();

  await expect(page.getByTestId('gallery-image')).toHaveCount(1);
  await expect(page.getByRole('heading', { name: 'Cover' })).toBeVisible();
  // The rendered <img> carries the stored URL, rather than the row merely
  // existing in the DOM as text.
  await expect(page.getByTestId('gallery-image').locator('img')).toHaveAttribute(
    'src',
    /^data:image\/png/,
  );

  await removeImagesFor(recordId);
});

test('the gallery groups by type, in examination order', async ({ page }) => {
  /**
   * §4.2's five types rendered as sections. The order is the one someone
   * examines a record in — front, back, centre label, dead wax — and it is
   * asserted here as RENDERED headings, not just as the pure function's output.
   */
  const { recordId } = await seedRecord(page);

  await seedImage({ recordId, imageType: 'matrix' });
  await seedImage({ recordId, imageType: 'cover' });
  await seedImage({ recordId, imageType: 'label' });

  await page.goto(`/records/${recordId}`);

  const headings = await page
    .getByTestId('image-gallery')
    .getByRole('heading', { level: 3 })
    .allInnerTexts();

  /**
   * Compared case-insensitively. `innerText` returns text as RENDERED, and the
   * headings carry `uppercase` — so an exact comparison would pin a styling
   * choice rather than the ORDER, which is what this test is about. (The
   * uppercase-vs-DOM difference is the same `innerText`/`textContent` gap as
   * the collection-widths rule, seen from the other side.)
   */
  expect(headings.map((heading) => heading.toLowerCase())).toEqual([
    'cover',
    'label',
    'matrix / runout',
  ]);
  await expect(page.getByTestId('gallery-image')).toHaveCount(3);

  await removeImagesFor(recordId);
});

test('an untyped image is still shown, rather than silently dropped', async ({ page }) => {
  // image_type is nullable (§4.2). A stored file the gallery does not render is
  // indistinguishable from a failed upload.
  const { recordId } = await seedRecord(page);

  await seedImage({ recordId, imageType: null });

  await page.goto(`/records/${recordId}`);

  await expect(page.getByTestId('gallery-image')).toHaveCount(1);
  await expect(page.getByRole('heading', { name: 'Other' })).toBeVisible();

  await removeImagesFor(recordId);
});

test('the gallery states §5.9’s limits before the server refuses', async ({ page }) => {
  /**
   * A file picker communicates nothing about what it accepts. Finding out by
   * having a 12MB photo rejected — after uploading it — is a bad way to learn,
   * and on a phone connection an expensive one.
   */
  const { recordId } = await seedRecord(page);

  await page.goto(`/records/${recordId}`);

  await expect(page.getByTestId('image-gallery')).toContainText('JPEG, PNG or WebP');
  await expect(page.getByTestId('image-gallery')).toContainText('10MB');
});

test('an oversized file is refused without being uploaded', async ({ page }) => {
  /**
   * The client-side size check. It is not the authority — the server rejects
   * the same file — but it saves sending 10MB to be told no, which is the
   * whole reason it exists.
   */
  const { recordId, run } = await seedRecord(page);

  let uploadAttempted = false;
  await page.route(`**/api/records/${recordId}/images`, async (route) => {
    uploadAttempted = true;
    await route.fulfill({ status: 201, json: {} });
  });

  await page.goto(`/records/${recordId}`);

  const oversized = Buffer.alloc(10 * 1024 * 1024 + 1);
  ONE_PIXEL_PNG.copy(oversized, 0);

  await page.getByLabel('Add an image').setInputFiles({
    name: `${run}-huge.png`,
    mimeType: 'image/png',
    buffer: oversized,
  });

  // Scoped to the gallery: Next renders a route announcer with role="alert"
  // too, so an unscoped role query is a strict-mode violation rather than a
  // missing element — the failure reads as absence and is not.
  await expect(page.getByTestId('image-gallery').getByRole('alert')).toContainText('10MB');
  expect(uploadAttempted, 'the oversized file must not be sent at all').toBe(false);
});

test('deleting an image names what is being lost', async ({ page }) => {
  /**
   * §7.5's rule for destructive actions. "Delete this image?" does not
   * distinguish the cover from a photograph of the dead wax, and the second is
   * the one that took effort to take.
   */
  const { recordId } = await seedRecord(page);
  await seedImage({ recordId, imageType: 'matrix' });

  await page.goto(`/records/${recordId}`);
  await expect(page.getByTestId('gallery-image')).toHaveCount(1);

  let prompt = '';
  page.on('dialog', async (dialog) => {
    prompt = dialog.message();
    await dialog.dismiss();
  });

  await page.getByRole('button', { name: /Delete this matrix \/ runout image/i }).click();

  expect(prompt, 'the prompt names WHICH image').toContain('matrix / runout');
  // Dismissed, so it is still there — a cancelled delete must delete nothing.
  await expect(page.getByTestId('gallery-image')).toHaveCount(1);

  await removeImagesFor(recordId);
});

test('confirming the delete removes it, and the gallery reflects that', async ({ page }) => {
  // The other half: the cancelled path above passes equally well against a
  // delete button that does nothing at all.
  const { recordId } = await seedRecord(page);
  await seedImage({ recordId, imageType: 'cover' });

  await page.goto(`/records/${recordId}`);
  await expect(page.getByTestId('gallery-image')).toHaveCount(1);

  page.on('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: /Delete this cover image/i }).click();

  await expect(page.getByTestId('gallery-image')).toHaveCount(0, { timeout: 15_000 });
  await expect(page.getByTestId('image-gallery')).toContainText('No images yet');
});

test('a cover that cannot be fetched does not fail the import', async ({ page }) => {
  /**
   * The requirement the whole cover path is built around: **a record must never
   * be lost to a failed image fetch.** The record is what the user typed; the
   * cover is a convenience.
   *
   * This environment provides the failure for free and for two independent
   * reasons — there is no `BLOB_READ_WRITE_TOKEN`, and `no-live-calls` refuses
   * `i.discogs.com` outright. Both are correct, and either one is enough to
   * exercise the path.
   *
   * Was a throwaway probe. CLAUDE.md §2: the verification that convinced me the
   * branch works has to survive the session, or it did not happen.
   */
  const releaseId = await seedDiscogsCache('release-discharge-hear-nothing');

  const artist = await page.request.post('/api/artists', {
    data: { name: `Cover-${suffix()}` },
  });
  const artistId = (await artist.json()).id;

  await page.goto(`/records/new?discogsReleaseId=${releaseId}`);
  await page.locator('[data-hydrated="true"]').first().waitFor({ timeout: 15_000 });
  await page.getByLabel('Artist', { exact: true }).selectOption(artistId);

  /**
   * `/api/discogs/import`, not `/api/records`.
   *
   * §5.7's stage two: a create that came from a Discogs release now posts to
   * the import endpoint with the user's corrections as `overrides`. This spec
   * asserted the old destination and is updated rather than relaxed — it was
   * evidence the rewiring took effect, not an obstacle to it.
   */
  const created = page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' && response.url().endsWith('/api/discogs/import'),
  );
  await page.getByRole('button', { name: /Add record|Add to collection/ }).click();

  const response = await created;
  expect(response.status(), 'the record is created regardless').toBe(201);
  /**
   * **`unconfigured`, not `failed` — and this spec previously asserted the
   * wrong one.** Its own docblock above says this environment has no
   * `BLOB_READ_WRITE_TOKEN`, which is a DEPLOYMENT fact rather than a fetch
   * failure. `'failed'` was the only reason that existed, so the spec encoded
   * the defect as expected behaviour: the user was told Discogs could not be
   * reached — it was reached fine — and offered an upload that fails on the
   * same missing token.
   *
   * The unconfigured check runs before the fetch, so it is what this
   * environment reports.
   */
  expect((await response.json()).cover, 'and it says WHY the cover did not arrive').toEqual({
    attached: false,
    reason: 'unconfigured',
  });

  // The record exists and is reachable — not a 500, not a rolled-back save.
  await expect(page).toHaveURL(/\/records\/[0-9a-f-]{36}/, { timeout: 20_000 });

  /**
   * QA finding: never failing the import is not the same as never telling.
   *
   * The record saved, the gallery was empty, and nothing on screen
   * distinguished "Discogs had no cover for this release" from "we tried to
   * fetch one and could not". The second is worth knowing — it is retryable,
   * and the user might otherwise photograph a sleeve they did not need to.
   */
  await expect(page.getByTestId('cover-notice-unconfigured')).toContainText(/image storage/i);
  await expect(
    page.getByTestId('cover-notice-unconfigured'),
    'and it does not blame Discogs, which answered fine',
  ).not.toContainText(/could not be fetched from Discogs/i);
  await expect(page.getByTestId('image-gallery')).toContainText('No images yet');
});

test('a release with no cover says nothing, rather than reporting a failure', async ({ page }) => {
  /**
   * The discriminating half. A notice shown whenever the gallery is empty would
   * pass the test above while telling every user their cover failed — including
   * the ones whose release simply has no images. `reason: 'none'` is not a
   * failure and must read as silence.
   */
  const { recordId } = await seedRecord(page);

  await page.goto(`/records/${recordId}`);

  await expect(page.getByTestId('image-gallery')).toContainText('No images yet');
  await expect(page.getByTestId('cover-notice')).toHaveCount(0);
});
