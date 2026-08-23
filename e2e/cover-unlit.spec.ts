import { expect, test, type Page } from '@playwright/test';
import { registerCleanup, trackArtist } from './cleanup';
import sharp from 'sharp';
import { removeImagesFor, seedImage } from './seed';

/* Records and artists removed after each test — see e2e/cleanup.ts. */
registerCleanup();

/**
 * **A photograph of artwork is rendered unlit, and this measures it.**
 *
 * The rule lives in `surface-kind.ts` and is unit-tested there. What a unit
 * test CANNOT do is prove the rule survives the renderer: the material is
 * chosen in `WallScene`, the texture goes through a colour-space assignment and
 * a UV crop, and the result is composited by WebGL. Every one of those steps
 * can change the pixels, and none of them is visible to a test that reads
 * properties.
 *
 * So this decodes the actual screenshot and compares mean RGB per channel
 * against the source image. It is the only instrument that sees rendered
 * pixels — `getBoundingClientRect` cannot see a canvas\'s contents, which is
 * the failure mode this project has hit repeatedly.
 *
 * **It exists because a probe proved this once and was deleted.** Unit 15
 * measured a basic material on a plane to 1.7 levels with a scratch script; the
 * cover then regressed to a lit material and nothing noticed, because the
 * verification had not survived the session. CLAUDE.md §2 names that shape
 * exactly.
 *
 * **The fixture is a FLAT colour**, not a real sleeve, and deliberately so:
 * a flat field has no crop ambiguity, so a mean that drifts cannot be explained
 * away by the UV window having sampled a different part of the image. Its value
 * sits in the same tonal region as the real covers (46.8 / 39.8 / 31.0) because
 * an additive light term shows up proportionally most in dark tones — measuring
 * against a bright fixture would hide the very error this is for.
 */

const PASSWORD = process.env.E2E_PASSWORD ?? 'test-password-for-e2e';

/** The fixture cover: a flat 47 / 40 / 31, 256 square. */
const COVER_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAQAAAAEACAIAAADTED8xAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAFNElEQVR4nO3csQ3DMAwFUW/CVt3tv11mSMWCD9AAwfkEW+L/+XpjIdBVDb71X2AhkA1AAgTyBiABAvkEIgECOQOQAIEcgkmAQG6BSIBArkFJgEDmACRAIIMwEiCQSTAJEEgUggQIJAtEAgQShiMBAkmDkgCBxKFJgED6ACRAIIUYEiCQRhgJEEglkgQIpBNMghSyleJJ0O1t4F8h9p+BlQ1AAgTyBiABAvkEIgECOQOQAIEcgkmAQG6BSIBArkFJgEDmACRAIIMwEiCQSTAJEEgUggQIJAtEAgQShiMBAkmDkgCBxKFJgED6ACRAIIUYEiCQRhgJEEglkgQIpBNMgtSRleJJ0O1t4F8h9p+BlQ1AAgTyBiABAvkEIgECOQOQAIEcgkmAQG6BSIBArkFJgEDmACRAIIMwEiCQSTAJEEgUggQIJAtEAgQShiMBAkmDkgCBxKFJgED6ACRAIIUYEiCQRhgJEEglkgQIpBNMgtSRleJJ0O1t4F8h9p+BlQ1AAgTyBiABAvkEIgECOQOQAIEcgkmAQG6BSIBArkFJgEDmACRAIIMwEiCQSTAJEEgUggQIJAtEAgQShiMBAkmDkgCBxKFJgED6ACRAIIUYEiCgEUYCBEYlkgQIjE4wCRBQiifBu74N/CvE/jOwsgFIgEDeACRAIJ9AJEAgZwASIJBDMAkQyC0QCRDINSgJEMgcgAQIZBBGAgQyCSYBAolCkACBZIFIgEDCcCRAIGlQEiCQODQJEEgfgAQIpBBDAgTSCCMBAqlEkgCBdIJJkDqyUjwJur0N/CvE/jOwsgFIgEDeACRAIJ9AJEAgZwASIJBDMAkQyC0QCRDINSgJEMgcgAQIZBBGAgQyCSYBAolCkACBZIFIgEDCcCRAIGlQEiCQODQJEEgfgAQIpBBDAgTSCCMBAqlEkgCBdIJJkDqyUjwJur0N/CvE/jOwsgFIgEDeACRAIJ9AJEAgZwASIJBDMAkQyC0QCRDINSgJEMgcgAQIZBBGAgQyCSYBAolCkACBZIFIgEDCcCRAIGlQEiCQODQJEEgfgAQIpBBDAgTSCCMBAqlEkgCBdIJJkDqyUjwJur0N/CvE/jOwsgFIgEDeACRAIJ9AJEAgZwASIJBDMAkQyC0QCRDINSgJEMgcgAQIZBBGAgQyCSYBAolCkACBZIFIgEDCcCRAIGlQEiCQODQJEEgfgAQIpBBDAgTSCCMBAqlEkgCBdIJJkDqyUjwJur0N/CvE/jOwsgFIgEDeACRAIJ9AJEAgZwASIJBDMAkQyC0QCRDINSgJEMgcgAQIZBBGAgQyCSYBAolCkACBZIFIgEDCcCRAIGlQEiCQODQJEEgfgAQIpBBDAgTSCCMBAqlEkgCBdIJJkDqyUjwJur0N/CvE/jOwsgFIgEDeACRAIJ9AJEAgZwASIJBDMAkQyC0QCRDINSgJEMgcgAQIZBBGAgQyCSYBAolCkACBZIFIgEDCcCRAQBqUBAiMODQJEBh9ABIgMAoxJEBgNMJIgMCoRJIAgdEJJgECSvEkeNe3gX+F2H8GVjYACRDIG4AECOQTiAQI5AxAAgRyCCYBArkFIgECuQYlAQKZA5AAgQzCSIBAJsEkQCBRCBIgkCwQCRBIGI4ECCQNSgIEEocmAQLpA5AAgRRiSIBAGmEkQCCVSBIgkE4wCVJHVoonQbe3gX+F2H8GVjYACRDIG4AECOQTiAQI5AxAAgRyCCYBArkFIgECuQYlAQKZA5AAgQzCSIBAJsEkQCBRCBIgkCwQCRDo/23wAxLqBuuT3YqFAAAAAElFTkSuQmCC';
const COVER_URL = `data:image/png;base64,${COVER_PNG_BASE64}`;
const SOURCE = { r: 47, g: 40, b: 31 };

/**
 * How far the render may sit from the source, per channel, in 8-bit levels.
 *
 * Unit 15 measured 1.7 with a basic material on a plane. **This measures 0.0**
 * — the crop is flat, unrotated and unfiltered at rest, so the bytes come back
 * exactly as they went in. 1 is therefore a real bound rather than a generous
 * one: it admits a rounding step and nothing more.
 *
 * The defect it excludes moved the channels by 21.8 / 25.6 / 27.3, so there is
 * no risk of a marginal pass hiding it.
 */
const TOLERANCE = 1;

async function login(page: Page) {
  await page.goto('/login');
  await page.locator('form[data-hydrated="true"]').waitFor({ timeout: 15_000 });
  await page.getByLabel('Password').pressSequentially(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL('/');
}

test('a photographed cover renders at its source luminance, unlit', async ({ page }) => {
  await login(page);

  const run = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;
  const artist = await page.request.post('/api/artists', { data: { name: `Unlit-${run}` } });
  trackArtist(((await artist.json()) as { id: string }).id);
  expect(artist.status(), 'the fixture must exist for this to test anything').toBe(201);
  const artistId = (await artist.json()).id as string;

  const record = await page.request.post('/api/records', {
    data: { title: `Unlit ${run}`, artistId },
  });
  expect(record.status()).toBe(201);
  const recordId = (await record.json()).id as string;

  await seedImage({ recordId, imageType: 'cover', url: COVER_URL });

  /*
    The workbench narrowed to this one artist, so the wall holds exactly this
    record and the pulled cover is unambiguous.
  */
  await page.goto(`/plane?artistId=${artistId}`);

  const scene = page.getByTestId('wall-scene');
  await expect(scene.locator('canvas')).toBeAttached({ timeout: 30_000 });
  await expect(scene).toHaveAttribute('data-pulled', '');

  /*
    **The canvas is the only click target** — hit testing is a raycast, so there
    is no DOM element for a spine to click. The accessible list carries the
    title but is visually hidden and off-viewport, so clicking IT is not a way
    in either. Walking along the first row is what `wall-scene.spec.ts` does,
    and with one record on this wall the first hit is unambiguous.
  */
  const box = await scene.locator('canvas').boundingBox();
  expect(box, 'the canvas must have a measurable box to click into').not.toBeNull();
  if (box === null) return;

  let hit = false;
  for (let offset = 20; offset < 400 && !hit; offset += 12) {
    await page.mouse.click(box.x + offset, box.y + 120);
    hit = (await scene.getAttribute('data-pulled')) === recordId;
  }
  expect(hit, 'the seeded record must be the one pulled').toBe(true);
  await expect(page.getByTestId('record-chrome')).toBeVisible();
  await page.waitForTimeout(900);

  /*
    **The record settles at the VISIBLE viewport centre, not the wall-canvas
    centre** (step 15 placement fix — it floats in front of a frozen wall,
    placed by projection rather than by scrolling its slot to the middle). So a
    screenshot of the whole tall wall element has its geometric centre out on
    the dimmed wall, and the centre-anchored scan below would sample that, not
    the face. Clip the shot to a viewport-sized box centred on the record's
    reported on-screen position, so the centre pixel is the face again. The
    scene exposes that position as `settledScreenY` (page-relative) and
    `settledNdcX` (its horizontal NDC); the record is near enough to the
    horizontal centre that a wide clip keeps the whole face in frame.
  */
  const centreOnScreen = await scene.evaluate((el) => {
    const h = el as HTMLElement;
    const rect = h.querySelector('canvas')!.getBoundingClientRect();
    /* Both are viewport-relative: settledScreenY comes from getBoundingClientRect().top. */
    const screenY = Number(h.dataset.settledScreenY);
    const ndcX = Number(h.dataset.settledNdcX ?? '0');
    const x = rect.left + ((ndcX + 1) / 2) * rect.width;
    return { x, y: screenY };
  });
  const clipHalf = 300;
  const vw = page.viewportSize()!;
  const clip = {
    x: Math.max(0, Math.round(centreOnScreen.x - clipHalf)),
    y: Math.max(0, Math.round(centreOnScreen.y - clipHalf)),
    width: Math.min(2 * clipHalf, vw.width - Math.max(0, Math.round(centreOnScreen.x - clipHalf))),
    height: Math.min(2 * clipHalf, vw.height - Math.max(0, Math.round(centreOnScreen.y - clipHalf))),
  };
  const shot = await page.screenshot({ clip });

  /**
   * **The sample window is FOUND, not assumed.**
   *
   * A centred fraction of the frame is what the first version used, and at
   * 1280x992 a sixth of the short side reached past the record onto the dimmed
   * wall — reporting 24.3 / 21.0 / 18.0 and reading exactly like a render at
   * half brightness. It was a crop error, and it was indistinguishable from the
   * defect this test is for.
   *
   * So the window is derived from the record's actual extent: scan out from the
   * centre pixel while the colour still matches it, then sample well inside
   * that. A test that reports a number must know where the number came from.
   */
  const raw = await sharp(shot).raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = raw.info;
  expect(width, 'the screenshot must have real dimensions').toBeGreaterThan(200);

  const at = (x: number, y: number) => {
    const i = (y * width + x) * channels;
    return [raw.data[i], raw.data[i + 1], raw.data[i + 2]] as const;
  };

  const centre = at(Math.floor(width / 2), Math.floor(height / 2));
  const near = (p: readonly number[]) =>
    Math.abs(p[0] - centre[0]) <= 2 && Math.abs(p[1] - centre[1]) <= 2 && Math.abs(p[2] - centre[2]) <= 2;

  let halfW = 0;
  while (halfW < width / 2 - 1 && near(at(Math.floor(width / 2) + halfW + 1, Math.floor(height / 2)))) halfW += 1;
  let halfH = 0;
  while (halfH < height / 2 - 1 && near(at(Math.floor(width / 2), Math.floor(height / 2) + halfH + 1))) halfH += 1;

  /*
    Guards the scan: a record too small to sample means the pull did not
    produce a face, and a mean taken from it would be a reading of the wall.
  */
  expect(halfW, 'the record must be wide enough to sample inside').toBeGreaterThan(40);
  expect(halfH, 'the record must be tall enough to sample inside').toBeGreaterThan(40);

  /**
   * **The mean is computed from the raw bytes, NOT from `sharp.stats()`.**
   *
   * `stats()` reports its means in LINEAR space. On this exact crop it returns
   * 24.3 / 21.1 / 18.1 where the bytes are 47 / 40 / 31 — the sRGB transfer
   * function applied, and nothing else. The first version of this test compared
   * those linear means against an sRGB source and reported the render at 0.52x
   * source: a confident, reproducible, entirely instrumental result that
   * survived two rounds of looking for it in the renderer.
   *
   * The source is sRGB and the screenshot is sRGB, so the comparison is done in
   * sRGB. The instrument must not silently change the space of one side.
   */
  const side = Math.floor(Math.min(halfW, halfH) * 1.2);
  const left = Math.floor(width / 2 - side / 2);
  const top = Math.floor(height / 2 - side / 2);

  const totals = [0, 0, 0];
  for (let y = top; y < top + side; y += 1) {
    for (let x = left; x < left + side; x += 1) {
      const pixel = at(x, y);
      totals[0] += pixel[0];
      totals[1] += pixel[1];
      totals[2] += pixel[2];
    }
  }

  const count = side * side;
  const [r, g, b] = totals.map((total) => total / count);

  /*
    Reported unconditionally, so a failure says what the render actually was
    rather than only that it was wrong. The numbers are the finding.
  */
  console.info(
    `cover render: ${r.toFixed(1)} / ${g.toFixed(1)} / ${b.toFixed(1)} ` +
      `vs source ${SOURCE.r} / ${SOURCE.g} / ${SOURCE.b}`,
  );

  /**
   * **Per channel, not on a summed distance.** The error this catches was a
   * CAST — an additive term that moved all three channels by a similar absolute
   * amount, which a luminance-only check would partly absorb and a
   * ratio-of-means check would misreport as progressively bluer.
   */
  expect(Math.abs(r - SOURCE.r), `red: ${r.toFixed(1)} vs ${SOURCE.r}`).toBeLessThan(TOLERANCE);
  expect(Math.abs(g - SOURCE.g), `green: ${g.toFixed(1)} vs ${SOURCE.g}`).toBeLessThan(TOLERANCE);
  expect(Math.abs(b - SOURCE.b), `blue: ${b.toFixed(1)} vs ${SOURCE.b}`).toBeLessThan(TOLERANCE);

  await removeImagesFor(recordId);
});
