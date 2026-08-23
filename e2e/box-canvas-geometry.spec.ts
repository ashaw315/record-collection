import { expect, test, type Page } from '@playwright/test';
import { registerCleanup, trackArtist } from './cleanup';

/**
 * **`BoxCanvas`'s filling variant must take its geometry from its container.**
 *
 * It asserted its own instead: `aspect-square w-[min(70vw,70vh,560px)]`. Two
 * consequences, and the second is the one that matters:
 *
 * 1. The width is a viewport-derived CONSTANT, so every instance renders at the
 *    same size whatever container it is placed in — 273px at 390x844, 560px at
 *    1280x900.
 * 2. **`aspect-square` means it cannot represent a non-square frame at all.**
 *
 * Found while comparing three pulled-record sizes side by side (NOTES, step 15
 * unit 4): the three wrappers were correctly sized to 405, 187 and 292px and
 * all three canvases rendered at 273x273. The page printed accurate captions
 * beside renders that did not match them — "the truth in text and a lie in
 * pixels".
 *
 * ## Why this is an E2E test rather than a unit test
 *
 * The defect is CSS resolved by a browser. A unit test could assert the
 * className string, which is exactly the class-name-instead-of-geometry shape
 * this suite has been caught by twice (unit 20's breakout classes were all
 * present and cancelled by a fourth declaration; the nav's `flex-wrap` proves
 * nothing without a rendered box). Only a layout engine knows whether a child
 * filled its parent.
 *
 * The subject is `BoxCanvas`'s filling variant, exercised through `/plane`,
 * which is the workbench route that renders it (§12 step 13, units 15-19).
 */

const PASSWORD = process.env.E2E_PASSWORD ?? 'test-password-for-e2e';

/**
 * **`/plane` renders nothing without records, and the E2E database is empty.**
 *
 * Both components under test are gated on `records.length > 0` — correctly, a
 * workbench with no record to put on it has nothing to show. Step 15 unit 1's
 * per-spec cleanup means every spec now starts from an empty database, so a
 * test that assumed a populated one fails with "element(s) not found", which
 * reads as a broken page rather than a missing fixture.
 *
 * Seeded through the API rather than straight to the database: two records is
 * not bulk scenery, and the API path is the one that computes what the
 * workbench reads.
 */
async function seedTwoRecords(page: Page): Promise<string> {
  const run = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;
  const artist = await page.request.post('/api/artists', { data: { name: `BoxGeom-${run}` } });
  expect(artist.status(), 'the fixture must exist for this to test anything').toBe(201);
  const artistId = (await artist.json()).id as string;
  trackArtist(artistId);

  for (const n of [0, 1]) {
    const record = await page.request.post('/api/records', {
      data: { title: `BoxGeom ${run} ${n}`, artistId },
    });
    expect(record.status()).toBe(201);
  }
  return artistId;
}

async function login(page: Page) {
  await page.goto('/login');
  await page.locator('form[data-hydrated="true"]').waitFor({ timeout: 15_000 });
  await page.getByLabel('Password').pressSequentially(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL('/');
}

let artistId: string;

test.beforeEach(async ({ page }) => {
  await login(page);
  artistId = await seedTwoRecords(page);
});

/*
  Cleaned up per spec, per step 15 unit 1: a run that leaves records behind
  slows every later spec's `login()` until it times out.
*/
/* Records and artist removed after each test by the shared tracker. */
registerCleanup();

test('a filling record adopts its container, including a non-square one', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/plane?artistId=${artistId}`);

  const probe = page.getByTestId('box-geometry-probe');
  await expect(probe).toBeVisible({ timeout: 40_000 });

  /*
    Three containers with deliberately different shapes, including two that are
    NOT square. The probe renders one filling BoxCanvas in each.
  */
  const measured = await probe.evaluate((root) => {
    const out: { key: string; hostW: number; hostH: number; boxW: number; boxH: number }[] = [];
    for (const cell of root.querySelectorAll('[data-probe-cell]')) {
      const host = cell as HTMLElement;
      const box = host.querySelector('[data-testid^="probe-box-"]') as HTMLElement | null;
      out.push({
        key: host.dataset.probeCell ?? '?',
        hostW: Math.round(host.clientWidth),
        hostH: Math.round(host.clientHeight),
        boxW: Math.round(box?.clientWidth ?? -1),
        boxH: Math.round(box?.clientHeight ?? -1),
      });
    }
    return out;
  });

  expect(measured.length, 'the probe renders three cells').toBe(3);

  for (const cell of measured) {
    /*
      **The container's size, not a constant.** Fails against
      `w-[min(70vw,70vh,560px)]`, which renders 273px in every cell at this
      viewport regardless of how wide the cell is.
    */
    expect(
      cell.boxW,
      `${cell.key}: box is ${cell.boxW}px wide in a ${cell.hostW}px container`,
    ).toBeCloseTo(cell.hostW, 0);

    expect(
      cell.boxH,
      `${cell.key}: box is ${cell.boxH}px tall in a ${cell.hostH}px container`,
    ).toBeCloseTo(cell.hostH, 0);
  }

  /*
    **The non-square case, asserted on its own.** This is what `aspect-square`
    makes impossible, and it is the reason the fill comparison could not show
    three different shapes. Without this, a component that adopted its
    container's WIDTH while forcing a square height would pass everything above
    for the square cell and still be unable to express the thing under study.
  */
  const wide = measured.find((c) => c.key === 'wide');
  const tall = measured.find((c) => c.key === 'tall');
  expect(wide, 'a wide cell is measured').toBeDefined();
  expect(tall, 'a tall cell is measured').toBeDefined();
  if (!wide || !tall) return;

  expect(wide.boxW / wide.boxH, 'the wide cell renders wider than tall').toBeGreaterThan(1.4);
  expect(tall.boxW / tall.boxH, 'the tall cell renders taller than wide').toBeLessThan(0.7);

  /*
    And the constant is gone: two differently-sized containers must not produce
    the same rendered width. This is the assertion the three identical 273px
    canvases would fail.
  */
  expect(wide.boxW, 'different containers render different sizes').not.toBeCloseTo(tall.boxW, 0);
});

/**
 * **The three fill candidates must render at THREE DIFFERENT sizes.**
 *
 * They did not. The comparison sized its wrappers to 405, 187 and 292px and
 * every canvas rendered at 273x273, because `BoxCanvas` asserted its own
 * geometry — so the page showed one size three times while printing three
 * different correct captions beside it.
 *
 * The developer could not tell them apart on a phone and said so; the numbers
 * confirmed it. This is the assertion that would have caught it without a
 * person having to distrust an accurate label.
 *
 * **Asserted on the RENDERED box, and on the pair.** What is being judged is a
 * record against its frame with the card beneath it, so the test measures the
 * record as a fraction of the frame — the same quantity the eye is comparing —
 * rather than a raw pixel width that says nothing about how big it looks.
 */
test('the three candidates render at three different sizes', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/plane?artistId=${artistId}`);

  await expect(page.getByTestId('fill-comparison')).toBeVisible({ timeout: 40_000 });

  const seen: { key: string; fraction: number }[] = [];

  for (const key of ['A', 'B', 'C'] as const) {
    await page.getByTestId(`fill-pick-${key}`).click();
    await expect(page.getByTestId(`fill-box-${key}`)).toBeVisible({ timeout: 20_000 });
    await page.waitForTimeout(400);

    const fraction = await page.evaluate(() => {
      const frame = document.querySelector('[data-fill-frame]') as HTMLElement | null;
      const box = document.querySelector('[data-fill-box]') as HTMLElement | null;
      if (!frame || !box || frame.clientWidth === 0) return -1;
      return box.clientWidth / frame.clientWidth;
    });

    expect(fraction, `${key}: measurable`).toBeGreaterThan(0);
    seen.push({ key, fraction });
  }

  const summary = seen.map((s) => `${s.key}=${(s.fraction * 100).toFixed(0)}%`).join(' ');

  /*
    Every pair distinct. `toBeCloseTo(…, 1)` would allow a 5% gap to pass as
    equal, so the comparison is explicit: any two candidates within 4
    percentage points of each other are indistinguishable to an eye, which is
    the failure this test exists to catch.
  */
  for (let i = 0; i < seen.length; i += 1) {
    for (let j = i + 1; j < seen.length; j += 1) {
      expect(
        Math.abs(seen[i].fraction - seen[j].fraction),
        `${seen[i].key} and ${seen[j].key} render the same size (${summary})`,
      ).toBeGreaterThan(0.04);
    }
  }

  /*
    And the card is present in every one of them, because the question is about
    the PAIR: a record judged without its facts beneath it is the comparison
    that produced a number working on desktop and failing on a phone.
  */
  for (const key of ['A', 'B', 'C'] as const) {
    await page.getByTestId(`fill-pick-${key}`).click();
    await expect(page.getByTestId(`fill-card-${key}`)).toBeVisible();
  }
});

/**
 * **The caption's two numbers must agree with each other.**
 *
 * The page prints an INTENDED size from `occupancy()` and a MEASURED one read
 * back off the DOM after layout — two numbers from two sources, so that
 * disagreement is visible rather than needing a person to distrust an accurate
 * label (NOTES: "the truth in text and a lie in pixels").
 *
 * That check found two real faults in the page it was printed on:
 *
 *   1. Padding on the frame made `width: 86%` resolve against the content box
 *      (308px of 340), so every candidate rendered ~10% small.
 *   2. The heights were different QUANTITIES — `occupancy().height` is a
 *      fraction of the 3D frustum, the measurement a square CSS box over the
 *      CSS frame — and could not agree while the frame's aspect was not the
 *      viewport's.
 *
 * This test is what stops either returning. It fails against a frame with
 * padding, and against a frame whose `aspectRatio` is not the viewport's.
 *
 * **A is exempt BY NAME, with its reason**, never by loosening the tolerance:
 * it intends 119% and is clamped to 100% because it genuinely overflows, which
 * is the defect under study rather than an instrument fault.
 */
test('the caption\'s intended and measured sizes agree', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/plane?artistId=${artistId}`);

  const section = page.getByTestId('fill-comparison');
  await expect(section).toBeVisible({ timeout: 40_000 });

  for (const key of ['B', 'C'] as const) {
    await page.getByTestId(`fill-pick-${key}`).click();
    await expect(page.getByTestId(`fill-box-${key}`)).toBeVisible({ timeout: 20_000 });
    await page.waitForTimeout(400);

    const caption = await section.locator('p.font-mono').innerText();
    expect(caption, `${key}: the caption must not report a disagreement`).not.toContain(
      'DISAGREE',
    );

    /*
      And the numbers themselves, not just the absence of a warning — a caption
      that stopped printing the flag would pass the assertion above while saying
      nothing true.
    */
    const measuredPair = await page.evaluate(() => {
      const frame = document.querySelector('[data-fill-frame]') as HTMLElement | null;
      const box = document.querySelector('[data-fill-box]') as HTMLElement | null;
      if (!frame || !box || frame.clientWidth === 0) return null;
      return {
        w: (box.clientWidth / frame.clientWidth) * 100,
        h: (box.clientHeight / frame.clientHeight) * 100,
        boxW: box.clientWidth,
        boxH: box.clientHeight,
        frameAspect: frame.clientWidth / frame.clientHeight,
      };
    });
    expect(measuredPair, `${key}: measurable`).not.toBeNull();
    if (!measuredPair) continue;
    const frameAspect = measuredPair.frameAspect;

    /* The square, in pixels — the plainest form of the same assertion. */
    expect(
      measuredPair.boxH,
      `${key}: ${measuredPair.boxW}x${measuredPair.boxH} is not square`,
    ).toBeCloseTo(measuredPair.boxW, 0);

    /*
      **Width only, because the record's HEIGHT is no longer stated as a
      fraction.** The caption used to print an intended `W% × H%` from
      `occupancy()`; the size rule now names a width and derives the square from
      it, so a height fraction would be a second producer of one number.
    */
    const intended = caption.match(/record (\d+)% of frame width/);
    expect(intended, `${key}: the caption states an intended width`).not.toBeNull();
    if (!intended) continue;

    expect(
      measuredPair.w,
      `${key}: intended ${intended[1]}% wide, rendered ${measuredPair.w.toFixed(0)}%`,
    ).toBeCloseTo(Number(intended[1]), 0);

    /*
      The record is SQUARE, so its rendered height must equal its rendered
      width in pixels — asserted against the frame's own aspect rather than a
      stated fraction. This is what caught `aspectRatio: 1` producing a 593x877
      "square" at 1280.
    */
    expect(
      measuredPair.h,
      `${key}: the record renders square (w ${measuredPair.w.toFixed(1)}%, h ${measuredPair.h.toFixed(1)}%)`,
    ).toBeCloseTo(measuredPair.w * frameAspect, 1);
  }
});

/**
 * **The frame is the viewport's shape**, which is what makes the two caption
 * numbers comparable at all and what makes a choice made here valid on the
 * device that made it.
 *
 * Fails against the `min(78svh, 780px)` frame this page had, whose aspect was
 * 0.518 against a viewport of 0.462 — and which resolved differently on a phone
 * than in a desktop window of the same nominal size, so a number chosen on one
 * was wrong on the other.
 */
test('the comparison frame has the viewport\'s aspect', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/plane?artistId=${artistId}`);
  await expect(page.getByTestId('fill-comparison')).toBeVisible({ timeout: 40_000 });
  await page.waitForTimeout(400);

  const ratios = await page.evaluate(() => {
    const frame = document.querySelector('[data-fill-frame]') as HTMLElement | null;
    if (!frame || frame.clientHeight === 0) return null;
    return {
      frame: frame.clientWidth / frame.clientHeight,
      viewport: window.innerWidth / window.innerHeight,
    };
  });

  expect(ratios, 'the frame is measurable').not.toBeNull();
  if (!ratios) return;

  expect(
    ratios.frame,
    `frame aspect ${ratios.frame.toFixed(3)} vs viewport ${ratios.viewport.toFixed(3)}`,
  ).toBeCloseTo(ratios.viewport, 2);
});
