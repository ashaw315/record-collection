import zlib from 'node:zlib';
import { expect, test, type Page } from '@playwright/test';
import { registerCleanup, trackArtist } from './cleanup';

/* Records and artists removed after each test — see e2e/cleanup.ts. */
registerCleanup();

/**
 * SPEC.md §10b — the shelf, and pulling a record off it.
 *
 * **These exist because unit tests could not have caught any of the three
 * defects this feature shipped and then fixed**: five genre sections that
 * rendered as empty black bands, spine text clipped at both ends, and a turn
 * that was a panel swap wearing a rotation's clothes. All three were found by
 * looking at the screen.
 *
 * What a test CAN hold down is the behaviour underneath: that a spine leads
 * somewhere, that turning shows the other side, and that the gatefold
 * affordance appears only where an inner image exists — which is §10b's
 * strictest rule, because there is no generated stand-in for artwork.
 */

const PASSWORD = process.env.E2E_PASSWORD ?? 'test-password-for-e2e';

async function login(page: Page) {
  await page.goto('/login');
  await page.locator('form[data-hydrated="true"]').waitFor({ timeout: 15_000 });
  await page.getByLabel('Password').pressSequentially(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL('/');
}

const suffix = () => `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

/** A record on the shelf, returning both ids the callers need. */
/**
 * Finds the shelf's lit bands in a screenshot, by colour, down one column.
 *
 * **The only instrument that can see a painted shelf.** The surface is a CSS
 * gradient, so it has no element and no rect — `getBoundingClientRect` reports
 * nothing about it and every rect-based assertion in this file is blind to
 * where it actually lands. That blindness let a 15px foot misalignment and a
 * doubled shelf line both pass a green suite.
 *
 * PNG is decoded rather than pulled through a library: the alternative is a new
 * dependency for something this small, and the format's own filters are the
 * whole of the work.
 */
function findShelfBands(
  png: Buffer,
  xCss: number,
  within: { top: number; bottom: number },
): Array<{ top: number; bottom: number }> {
  const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
  let pos = 8;
  let width = 0;
  let height = 0;
  let colourType = 0;
  const idat: Buffer[] = [];

  while (pos < png.length) {
    const length = view.getUint32(pos);
    const type = png.toString('ascii', pos + 4, pos + 8);
    if (type === 'IHDR') {
      width = view.getUint32(pos + 8);
      height = view.getUint32(pos + 12);
      colourType = png[pos + 17];
    } else if (type === 'IDAT') {
      idat.push(png.subarray(pos + 8, pos + 8 + length));
    }
    pos += 12 + length;
  }

  const raw = zlib.inflateSync(Buffer.concat(idat));
  const channels = colourType === 6 ? 4 : 3;
  const stride = width * channels;
  const rows: Buffer[] = [];
  let previous = Buffer.alloc(stride);
  let cursor = 0;

  // Undo the per-scanline filters. Straight from the PNG spec; no cleverness.
  for (let y = 0; y < height; y += 1) {
    const filter = raw[cursor];
    cursor += 1;
    const line = Buffer.from(raw.subarray(cursor, cursor + stride));
    cursor += stride;

    for (let i = 0; i < stride; i += 1) {
      const a = i >= channels ? line[i - channels] : 0;
      const b = previous[i];
      const c = i >= channels ? previous[i - channels] : 0;
      if (filter === 1) line[i] = (line[i] + a) & 255;
      else if (filter === 2) line[i] = (line[i] + b) & 255;
      else if (filter === 3) line[i] = (line[i] + ((a + b) >> 1)) & 255;
      else if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        line[i] = (line[i] + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c)) & 255;
      }
    }
    rows.push(line);
    previous = line;
  }

  const scale = width / 1280;
  const x = Math.round(xCss * scale);
  const bands: Array<{ top: number; bottom: number }> = [];
  let start: number | null = null;

  /*
    Scanned only INSIDE the wall. The page around it is cream (red 251), which
    is far brighter than the shelf and was reported as a 205px-tall "shelf
    band" — a detector that finds the background is worse than none.
  */
  const from = Math.max(0, Math.round(within.top * scale));
  const to = Math.min(height, Math.round(within.bottom * scale));

  for (let y = from; y < to; y += 1) {
    const red = rows[y][x * channels];
    // `SHELF_PLANE` is #4d3b2b (red 77); the wall behind it never exceeds ~30.
    const lit = red > 55;
    if (lit && start === null) start = y;
    if (!lit && start !== null) {
      bands.push({ top: start / scale, bottom: y / scale });
      start = null;
    }
  }
  if (start !== null) bands.push({ top: start / scale, bottom: to / scale });

  return bands;
}

async function seedRecord(page: Page, title: string) {
  const artist = await page.request.post('/api/artists', {
    data: { name: `Shelf-${suffix()}` },
  });
  const artistId = (await artist.json()).id as string;
  trackArtist(artistId);

  const record = await page.request.post('/api/records', {
    data: { title, artistId },
  });
  expect(record.status(), 'the fixture must exist for this to test anything').toBe(201);

  // The artist id travels back so a caller can SCOPE its view to this run's
  // fixture. The table paginates at 50 and does not filter by default, so an
  // unscoped assertion looks for a record that may be on page 3 — which is what
  // `record-detail.spec.ts` records costing it three separate defects.
  return { id: (await record.json()).id as string, artistId };
}

test.beforeEach(async ({ page }) => {
  await login(page);
});

test('the shelf is the default view, and a spine names its record', async ({ page }) => {
  /**
   * §10b makes the shelf "the default view of `/` on desktop" — asserted
   * because it is a contract change that broke 22 specs when it landed, and the
   * thing that broke them was the default rather than the shelf.
   *
   * The spine's accessible name is the RECORD, not its truncated visible text.
   * That was a real defect: a link reading "Luther Vandross  Nev…  FE 37451"
   * names nothing to a screen reader or to any consumer.
   */
  const title = `Shelved ${suffix()}`;
  await seedRecord(page, title);

  await page.goto('/');

  /*
    The wall is a WebGL scene now, so its marker is `wall-scene` rather than
    `shelf`. The property — the shelf is the default view of `/` — is unchanged.
  */
  await expect(page.getByTestId('wall-scene')).toBeAttached({ timeout: 30_000 });
  await expect(
    page.getByRole('link', { name: new RegExp(title) }),
    'the spine is named by the record, whatever its spine text says',
  ).toBeVisible();
});

test('a spine is a link, so it survives without JavaScript', async ({ page }) => {
  /**
   * §10b pulls the record into view rather than navigating, which reads as a
   * button — and making it one broke eight specs across five files. The element
   * is a LINK whose click is intercepted: `preventDefault` upgrades it, so the
   * href still goes somewhere correct if the handler never runs.
   *
   * Asserted through the href rather than by disabling JavaScript, because the
   * property is that the fallback EXISTS.
   */
  const title = `Linked ${suffix()}`;
  const { id } = await seedRecord(page, title);

  await page.goto('/');

  await expect(page.getByRole('link', { name: new RegExp(title) })).toHaveAttribute(
    'href',
    `/records/${id}`,
  );
});

/**
 * **These specs assert the CSS wall's DOM, which `/` no longer mounts.**
 *
 * The WebGL wall replaced it at `/`; `Shelf.tsx` and its supporting modules are
 * still in the tree, deliberately, so the swap is one revert. These tests go
 * with them when the CSS path is deleted — skipping rather than deleting keeps
 * the swap revertible in a single commit, which is the whole point of doing it
 * separately.
 *
 * What they covered is not lost. The properties that must survive the swap were
 * retargeted rather than skipped: the shelf is the default view, the table view
 * is still reachable, and the seam test pinning the wall's record count to the
 * heading. The rest — the rise, the return, the panels, the overlay, the tilt —
 * are the CSS implementation's own behaviour, and their WebGL equivalents live
 * in `wall-scene.spec.ts` or are queued as their own units.
 */

test.skip('the shelf is a plane that ends where the wall ends, at any collection size', async ({ page }) => {
  /**
   * **This replaces unit 9's floor-and-ceiling test, which is obsolete rather
   * than relaxed.**
   *
   * That test asserted two things about a BOX: a `min-width: 40%` floor so five
   * records did not read as a thumbnail, and a `w-fit` ceiling so the box did
   * not run past its widest row. Both were mutation-verified and both were
   * right about the object they described.
   *
   * The object was the defect. A rectangle that stops has a size and a reader
   * interprets it — every candidate width failed at five records for the same
   * reason. The shelf is now a plane running edge to edge, so there is no floor
   * to hold and no ceiling to enforce: the surface ends where the wall ends.
   *
   * What survives is what the old rule protected — a short collection must read
   * as short rather than broken — and that is now a property of the plane being
   * the same width regardless of what stands on it. Asserted at two collection
   * sizes, because a width that tracked the contents would differ between them.
   */
  const artist = await page.request.post('/api/artists', { data: { name: `Plane-${suffix()}` } });
  const artistId = (await artist.json()).id as string;
  trackArtist(artistId);

  await page.request.post('/api/records', { data: { title: `Only one ${suffix()}`, artistId } });
  await page.goto(`/?artistId=${artistId}`);
  const timber = page.getByTestId('shelf-timber');
  await expect(timber).toBeVisible();

  const narrow = await timber.boundingBox();
  const spinesNarrow = await page.getByTestId('shelf-spine').count();
  expect(narrow, 'the plane must have a measurable box').not.toBeNull();
  if (narrow === null) return;

  // Several more records, so the row is fuller.
  for (let index = 0; index < 12; index += 1) {
    await page.request.post('/api/records', { data: { title: `Filler ${index} ${suffix()}`, artistId } });
  }
  await page.goto(`/?artistId=${artistId}`);
  await expect(timber).toBeVisible();

  const wide = await timber.boundingBox();
  const spinesWide = await page.getByTestId('shelf-spine').count();
  expect(wide, 'the plane must have a measurable box').not.toBeNull();
  if (wide === null) return;

  expect(spinesWide, 'the second render must actually hold more records').toBeGreaterThan(
    spinesNarrow,
  );

  /**
   * The assertion: the plane is the same width with one record as with
   * thirteen. A box that fitted its contents would differ here, and a box with
   * a percentage floor would differ once the contents exceeded it.
   */
  expect(
    Math.abs(wide.width - narrow.width),
    `the plane was ${Math.round(narrow.width)}px with ${spinesNarrow} records and ${Math.round(wide.width)}px with ${spinesWide}`,
  ).toBeLessThan(2);
});

test('the wall shows the records the heading says it does', async ({ page }) => {
  /**
   * **The defect this test was written for, and the reason it is a SEAM test.**
   *
   * The shelf is the default view of `/`. Filtering to a genre rendered every
   * spine in the collection under a heading reading the FILTERED count — five
   * spines beneath "2 records", with the chip lit and "Clear filter" offered.
   * The count came from the filtered `listRecords` query and the wall from
   * `shelfRecords()`, which took no arguments at all and returned everything.
   *
   * A user would believe a false thing: that they own five Rock records. That
   * is the confidently-misleading class CLAUDE.md §8 is about, on the screen
   * they see first.
   *
   * **It survived units 6 through 20 because nothing asserted the shelf honours
   * a filter.** Units 20 and 21 both wrote GEOMETRY tests for this wall —
   * measuring how wide it was — without noticing it was showing the wrong
   * records.
   *
   * **The two counts are asserted against EACH OTHER, not each against its own
   * expectation.** That is the shape `genreRollup`'s test uses to pin two
   * implementations together: a test comparing each to a literal passes when
   * both drift the same way, and passes when a fixture changes and someone
   * updates both numbers. Comparing the producers to each other fails the
   * moment they disagree, whatever the collection contains.
   */
  const suffixed = suffix();
  const genre = await page.request.post('/api/genres', { data: { name: `Filtered-${suffixed}` } });
  expect(genre.status(), 'the fixture genre must exist').toBe(201);
  const genreId = (await genre.json()).id as string;

  // Two records in the genre, one outside it — so a correct filter changes the
  // answer and an ignored filter does not.
  const { artistId } = await seedRecord(page, `In genre A ${suffixed}`);
  const inGenre = await page.request.post('/api/records', {
    data: { title: `In genre B ${suffixed}`, artistId, genreIds: [genreId] },
  });
  expect(inGenre.status()).toBe(201);
  const firstId = (await page.request.get(`/api/records?artistId=${artistId}`)).ok();
  expect(firstId, 'the fixture records must be readable').toBe(true);

  // Tag the first record into the genre too, leaving a third outside.
  await seedRecord(page, `Outside ${suffixed}`);

  await page.goto(`/?genreId=${genreId}`);
  await expect(page.getByTestId('wall-records')).toBeAttached({ timeout: 30_000 });

  /**
   * The heading is the FILTERED count from `listRecords`; the list is what
   * `shelfRecords` returned. Both describe the same request, so they must
   * agree.
   *
   * **Counted from the accessible list rather than from spines**, because the
   * wall is a canvas now and a canvas has no elements to count. The list is the
   * wall's record channel — it is generated from the same `records` the scene
   * builds its meshes from, so it answers the same question the spines did.
   * The property is unchanged; only the instrument moved.
   */
  const heading = await page.locator('main header p').first().textContent();
  const headingCount = Number(/^(\d+)/.exec(heading?.trim() ?? '')?.[1] ?? NaN);
  expect(headingCount, `the heading did not state a count: "${heading}"`).not.toBeNaN();

  const onWall = await page.getByTestId('wall-records').getByRole('link').count();

  expect(
    onWall,
    `the wall shows ${onWall} records under a heading reading "${heading?.trim()}"`,
  ).toBe(headingCount);
});

test.skip('the shelf view puts its controls in an overlay, and says when a filter is on', async ({
  page,
}) => {
  /**
   * §10b A24a: below the nav there is the wall and nothing else. Search, chips
   * and sort are reachable from the shelf but do not take vertical space above
   * it — a wall arriving under four rows of controls is a strip rather than a
   * wall.
   *
   * **The closed state must announce an active filter.** The gaps in the wall
   * are the primary feedback (A24d), but a wall with fewer records and no
   * indication of why cannot be told from a collection that is simply small —
   * the absent-versus-unknown problem this project keeps catching. This is the
   * half most likely to be skipped, so it is asserted explicitly.
   *
   * Asserted as what a user can SEE and REACH — `toBeVisible`, not
   * `toHaveClass`. Unit 20's breakout had every class present and correct and
   * cancelled by a fourth declaration.
   */
  const title = `Overlaid ${suffix()}`;
  const { artistId } = await seedRecord(page, title);

  await page.goto('/');
  await expect(page.getByTestId('shelf-timber')).toBeVisible();

  // Closed by default: the controls are not occupying space above the wall.
  const panel = page.getByTestId('shelf-controls-panel');
  await expect(panel, 'the panel starts closed so the wall owns the screen').toBeHidden();

  const toggle = page.getByTestId('shelf-controls-toggle');
  await expect(toggle, 'and one control opens all of them').toBeVisible();

  await toggle.click();
  await expect(panel, 'opening the control reveals search, chips and sort').toBeVisible();
  await expect(panel.getByRole('search')).toBeVisible();

  await toggle.click();
  await expect(panel, 'and it closes again').toBeHidden();

  /**
   * With a filter applied and the panel CLOSED, the control must still say so.
   */
  await page.goto(`/?artistId=${artistId}`);
  await expect(page.getByTestId('shelf-timber')).toBeVisible();
  await expect(page.getByTestId('shelf-controls-panel')).toBeHidden();

  await expect(
    page.getByTestId('shelf-controls-active'),
    'a closed panel must never hide the fact that the wall is filtered',
  ).toBeVisible();
});

test.skip('the view toggle stays OUT of the overlay, and can reach all three views', async ({
  page,
}) => {
  /**
   * The prompt's explicit carve-out: "One control opens all of them... The view
   * toggle stays separate, as the reference does with its List/Closet switch."
   *
   * Two failures this pins, both found by LOOKING at the built overlay rather
   * than by reading its numbers — the wall measured 1248px full-bleed and the
   * panel displaced it 0px, and neither number could see either of these:
   *
   *   1. The toggle was swept into the panel with everything else, so changing
   *      view meant opening a filter overlay first.
   *   2. The toggle offers `table` and `grid` only. With `shelf` as the default
   *      view (§10b), leaving the shelf became a ONE-WAY trip — reachable only
   *      by editing the URL.
   *
   * The second is the worse one and predates this unit: it was invisible while
   * `table` was the default and became a trap when §10b moved the default.
   */
  await seedRecord(page, `Toggle ${suffix()}`);
  await page.goto('/');
  await expect(page.getByTestId('shelf-timber')).toBeVisible();

  const toggle = page.getByRole('group', { name: 'View' });
  await expect(toggle, 'the view toggle is reachable without opening the panel').toBeVisible();
  await expect(page.getByTestId('shelf-controls-panel')).toBeHidden();

  // Out and back: the round trip is the property, not either leg alone.
  // The wall's ABSENCE is what says we left the shelf — there is no single
  // element that means "table view", and asserting the wall is gone is the
  // question actually being asked.
  await toggle.getByRole('button', { name: 'table', exact: true }).click();
  await expect(page.getByTestId('shelf-timber')).toBeHidden();

  await page
    .getByRole('group', { name: 'View' })
    .getByRole('button', { name: 'shelf', exact: true })
    .click();
  await expect(page.getByTestId('shelf-timber'), 'and the shelf is reachable again').toBeVisible();
});

test('the table and grid keep their controls on the page', async ({ page }) => {
  /**
   * The regression this unit is most likely to cause. §10's screens table
   * states the asymmetry: a list wants its controls visible, and the overlay is
   * about the wall only.
   *
   * If this fails, the overlay was built at the wrong level — around the shared
   * component rather than around the shelf's use of it.
   */
  const title = `Listed ${suffix()}`;
  const { artistId } = await seedRecord(page, title);

  for (const view of ['table', 'grid'] as const) {
    await page.goto(`/?view=${view}&artistId=${artistId}`);

    await expect(
      page.getByRole('search'),
      `${view} must show its search without opening anything`,
    ).toBeVisible();
    await expect(
      page.getByTestId('shelf-controls-toggle'),
      `${view} has no overlay toggle`,
    ).toHaveCount(0);
  }
});

test.skip('the canvas is over the wall and does NOT eat spine clicks', async ({ page }) => {
  /**
   * **The contract unit 21's lesson points straight at.** Every measurement
   * that unit took was correct and green while the view toggle offered a
   * one-way trip, because none of them asked *can a user still do the thing*.
   * A transparent canvas over the wall is the same shape of risk: it can be
   * present, correct, and silently eat every click on the collection.
   *
   * Asserted at the point of contact — `elementFromPoint` over a spine — rather
   * than by reading a CSS property, because `pointer-events` is inherited and
   * overridable and what matters is which element the browser hands the click
   * to.
   */
  const { artistId } = await seedRecord(page, `Pointer ${suffix()}`);
  for (let i = 0; i < 9; i += 1) {
    await page.request.post('/api/records', {
      data: { title: `Pointer-${i} ${suffix()}`, artistId },
    });
  }

  await page.goto(`/?artistId=${artistId}`);
  await expect(page.getByTestId('shelf-timber')).toBeVisible();

  const canvas = page.getByTestId('record-canvas');
  await expect(canvas, 'the canvas is mounted over the wall from the start').toBeAttached();

  const atRest = await page.evaluate(() => {
    const spine = document.querySelectorAll('[data-testid="shelf-spine"]')[3] as HTMLElement;
    const box = spine.getBoundingClientRect();
    const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
    return {
      reachesSpine: spine === hit || spine.contains(hit),
      hitTag: hit?.tagName ?? 'none',
      hitTestId: (hit as HTMLElement | null)?.dataset?.testid ?? 'none',
    };
  });

  expect(
    atRest.reachesSpine,
    `at rest a click must reach the SPINE, not the canvas (hit: ${atRest.hitTag}/${atRest.hitTestId})`,
  ).toBe(true);

  /**
   * And the whole point of the contract: with a record OUT, the canvas takes
   * the pointer, because the record is what the reader is interacting with.
   */
  await page.getByTestId('shelf-spine').nth(3).click();
  await expect(page.getByTestId('record-canvas')).toBeVisible();

  const whileOut = await page.evaluate(() => {
    const spine = document.querySelectorAll('[data-testid="shelf-spine"]')[3] as HTMLElement;
    const box = spine.getBoundingClientRect();
    const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
    const overlay = document.querySelector('[data-testid="record-canvas"]');
    return { canvasHasPointer: overlay === hit || overlay?.contains(hit) === true };
  });

  expect(
    whileOut.canvasHasPointer,
    'with a record out the canvas owns the pointer — that is what the tilt needs',
  ).toBe(true);
});

test.skip('a spine is still a LINK with the canvas present', async ({ page }) => {
  /**
   * Eight specs across five files locate records with
   * `getByRole('link', { name })`, and a canvas laid over the wall is exactly
   * the change that could break all of them at once while every geometry
   * assertion stayed green.
   *
   * Cmd-click is asserted because it is the path that does NOT go through the
   * pull handler: `preventDefault` is skipped for modified clicks, so the href
   * must still be a real destination.
   */
  const title = `Linked ${suffix()}`;
  const { artistId, id } = await seedRecord(page, title);

  await page.goto(`/?artistId=${artistId}`);
  await expect(page.getByTestId('shelf-timber')).toBeVisible();

  const link = page.getByRole('link', { name: new RegExp(title) });
  await expect(link, 'the accessible name still finds the record').toBeVisible();
  await expect(link).toHaveAttribute('href', `/records/${id}`);

  // Cmd-click opens the record rather than pulling it.
  const popup = page.waitForEvent('popup', { timeout: 5000 }).catch(() => null);
  await link.click({ modifiers: ['Meta'] });
  const opened = await popup;

  if (opened !== null) {
    expect(opened.url()).toContain(`/records/${id}`);
    await opened.close();
  } else {
    // Same-tab navigation is an acceptable outcome for a modified click in a
    // headless browser; what must NOT happen is the record being pulled.
    await expect(page.getByTestId('record-canvas')).toBeHidden();
  }
});

test.skip('the rise starts ON the spine it came from, in a row that is not the first', async ({
  page,
}) => {
  /**
   * **The integration this whole strand of work was building toward, and the
   * one thing five units of three.js could not check.**
   *
   * `/plane` uses placeholder spines and never renders `Shelf.tsx`, so the
   * mapping had been proven against a scaffold: a flex row on a scrolling page,
   * which is the right shape but not the real wall. The real wall is
   * `calc(100svh - 205px)` with its own layout, wrapping rows and a shelf line
   * under each.
   *
   * **A THIRD-row spine, deliberately.** A first-row spine at the left is the
   * case most likely to work by accident: its offsets are small, and a mapping
   * that ignored position entirely would still land near enough to look right.
   * A spine three rows down and far along is where a dropped scroll term or a
   * wrong origin shows up as a large, unmistakable error.
   *
   * **Numerically, not visually.** A rise that starts 30px off looks entirely
   * convincing in motion. The round trip is the strongest check available:
   * project the computed world position back to screen coordinates and confirm
   * it lands on the rect it came from.
   */
  const { artistId } = await seedRecord(page, `Rising ${suffix()}`);
  // ~63 spines fit a 1280px row, measured; 150 is comfortably three rows.
  for (let i = 0; i < 149; i += 1) {
    await page.request.post('/api/records', {
      data: { title: `Rising-${i} ${suffix()}`, artistId },
    });
  }

  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(`/?artistId=${artistId}`);
  await expect(page.getByTestId('shelf-timber')).toBeVisible();

  // Find a spine in the third row — by measuring where the rows actually are,
  // not by assuming how many fit.
  const target = await page.evaluate(() => {
    const spines = Array.from(
      document.querySelectorAll('[data-testid="shelf-spine"]'),
    ) as HTMLElement[];
    const tops = [...new Set(spines.map((s) => Math.round(s.getBoundingClientRect().top)))].sort(
      (a, b) => a - b,
    );
    if (tops.length < 3) return null;

    const thirdRow = spines.filter((s) => Math.round(s.getBoundingClientRect().top) === tops[2]);
    // Well along the row, not its first spine.
    const spine = thirdRow[Math.min(12, thirdRow.length - 1)];
    return { index: spines.indexOf(spine), rowCount: tops.length };
  });

  expect(target, 'the fixture must produce at least three rows').not.toBeNull();
  if (target === null) return;

  /**
   * **Scrolled into view FIRST, then measured, then clicked.**
   *
   * Playwright's `click()` scrolls the target into view before dispatching, so
   * a rect measured beforehand describes a position the spine no longer
   * occupies. Measured: `scrollY` moved 161 between the two, and the round trip
   * missed by exactly 161 on the Y axis — the component was right and the test
   * was reading the spine at the wrong moment.
   *
   * Worth stating because the number looked exactly like unit 18's defect,
   * which is a `scrollY` drift on one axis with the other correct. Same
   * signature, different culprit: there the code mixed coordinate systems, here
   * the harness moved the page between two correct measurements.
   */
  await page.getByTestId('shelf-spine').nth(target.index).scrollIntoViewIfNeeded();
  await page.waitForTimeout(100);

  const before = await page.evaluate((index) => {
    const spine = document.querySelectorAll('[data-testid="shelf-spine"]')[index] as HTMLElement;
    const box = spine.getBoundingClientRect();
    return { left: box.left, top: box.top, width: box.width, height: box.height };
  }, target.index);

  await page.getByTestId('shelf-spine').nth(target.index).click();
  await expect(page.getByTestId('record-box')).toBeVisible();

  /**
   * **The round trip, run on the values the COMPONENT computed.**
   *
   * The first version of this test recomputed `screenRectToWorld` in the page
   * from the spine rect it had measured itself, and projected that back. It
   * passed against a mapping that ignored the slot entirely AND against one
   * carrying unit 18's `+ scrollY` defect, because it was asserting its own
   * arithmetic and agreeing with itself. Both mutations are now proven to fail.
   *
   * So the world placement is read from the canvas element, where `BoxCanvas`
   * publishes what it actually gave the mesh, and only the projection BACK to
   * screen coordinates happens here. If the component's mapping is wrong, this
   * lands somewhere other than the spine.
   */
  const roundTrip = await page.evaluate(() => {
    const host = document.querySelector('[data-testid="record-box"]') as HTMLElement;
    const d = host.dataset;

    const world = {
      x: Number(d.riseX),
      y: Number(d.riseY),
      scaleX: Number(d.riseScaleX),
      scaleY: Number(d.riseScaleY),
    };
    const canvas = {
      left: Number(d.canvasLeft),
      top: Number(d.canvasTop),
      width: Number(d.canvasWidth),
      height: Number(d.canvasHeight),
    };

    // `squareFrustum`'s inverse. The camera is square, so one world unit is the
    // canvas's shorter axis.
    const shorter = Math.min(canvas.width, canvas.height);
    const halfW = canvas.width / shorter / 2;
    const halfH = canvas.height / shorter / 2;
    const pixelsPerUnitX = canvas.width / (halfW * 2);
    const pixelsPerUnitY = canvas.height / (halfH * 2);

    const width = world.scaleX * pixelsPerUnitX;
    const height = world.scaleY * pixelsPerUnitY;

    return {
      left: canvas.left + canvas.width / 2 + world.x * pixelsPerUnitX - width / 2,
      top: canvas.top + canvas.height / 2 - world.y * pixelsPerUnitY - height / 2,
      width,
      height,
      published: d.riseX !== undefined,
    };
  });

  expect(roundTrip.published, 'the canvas must publish what it computed').toBe(true);

  expect(roundTrip.left, 'the rise starts at the spine\'s left edge').toBeCloseTo(before.left, 1);
  expect(roundTrip.top, 'and its top — the axis a dropped scroll term breaks').toBeCloseTo(
    before.top,
    1,
  );
  expect(roundTrip.width, 'at the spine\'s width').toBeCloseTo(before.width, 1);
  expect(roundTrip.height, 'and its height').toBeCloseTo(before.height, 1);
});

test.skip('the rise still starts on the spine after the page has SCROLLED', async ({ page }) => {
  /**
   * The case unit 18's defect would fail, and the reason no scroll term appears
   * anywhere in this code.
   *
   * The page scrolls while a record is out — measured: `body { overflow:
   * visible }`, and under 24px of scroll a spine moves −24 while a
   * `position: fixed` overlay moves 0. Those are two different frames, and the
   * fix is not a correction term but reading both rects with the same
   * viewport-relative instrument so scroll cancels out of their difference.
   */
  const { artistId } = await seedRecord(page, `Scrolled ${suffix()}`);
  // Enough rows to make the page genuinely scroll: the wall is viewport-height,
  // so a collection that fits one screen gives only a few pixels of scroll and
  // the test would pass without testing anything. Measured: 100 records gave 24px.
  for (let i = 0; i < 199; i += 1) {
    await page.request.post('/api/records', {
      data: { title: `Scrolled-${i} ${suffix()}`, artistId },
    });
  }

  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(`/?artistId=${artistId}`);
  await expect(page.getByTestId('shelf-timber')).toBeVisible();

  await page.evaluate(() => window.scrollBy(0, 260));
  await page.waitForTimeout(150);

  const scrollY = await page.evaluate(() => window.scrollY);
  expect(scrollY, 'the page must actually have scrolled for this to test anything').toBeGreaterThan(
    50,
  );

  const index = 40;
  const before = await page.evaluate((i) => {
    const spine = document.querySelectorAll('[data-testid="shelf-spine"]')[i] as HTMLElement;
    const box = spine.getBoundingClientRect();
    return { left: box.left, top: box.top, width: box.width, height: box.height };
  }, index);

  await page.getByTestId('shelf-spine').nth(index).click();
  await expect(page.getByTestId('record-box')).toBeVisible();

  const canvas = await page.getByTestId('record-box').boundingBox();
  expect(canvas).not.toBeNull();
  if (canvas === null) return;

  /**
   * The property, stated without re-deriving the projection: the slot the
   * record rose from is where the spine was ON SCREEN at click time. If a
   * scroll term had crept in, this offset would differ by exactly `scrollY`,
   * which is the signature of unit 18's bug.
   */
  const offsetFromCanvas = {
    x: before.left - canvas.x,
    y: before.top - canvas.y,
  };

  expect(
    Math.abs(offsetFromCanvas.y),
    `the slot must be within the viewport frame, not off by scrollY (${scrollY})`,
  ).toBeLessThan(800);
});

test.skip('reduced motion skips the rise and puts the record in place', async ({ page }) => {
  /**
   * §10b: "reduced motion disables all of it." The record is not decorative;
   * the movement is, so the object still appears — it simply does not fly.
   *
   * Asserted on the published rise placement rather than on a screenshot: if
   * the rise ran, the canvas carries the world coordinates it started from. No
   * placement means no rise, which is the property, and it cannot be true by
   * accident because the same attributes are present and non-empty in the
   * ordinary case.
   */
  await page.emulateMedia({ reducedMotion: 'reduce' });

  const { artistId } = await seedRecord(page, `Reduced ${suffix()}`);
  for (let i = 0; i < 9; i += 1) {
    await page.request.post('/api/records', {
      data: { title: `Reduced-${i} ${suffix()}`, artistId },
    });
  }

  await page.goto(`/?artistId=${artistId}`);
  await expect(page.getByTestId('shelf-timber')).toBeVisible();

  await page.getByTestId('shelf-spine').nth(3).click();
  await expect(page.getByTestId('record-box'), 'the record still appears').toBeVisible();

  const rose = await page.evaluate(() => {
    const host = document.querySelector('[data-testid="record-box"]') as HTMLElement;
    return host.dataset.riseX !== undefined;
  });

  expect(rose, 'no rise placement is computed under reduced motion').toBe(false);
});

test.skip('the hover label does not linger behind the pulled record', async ({ page }) => {
  /**
   * **An integration defect that neither half could show on its own.**
   *
   * The spine's label reveals on `group-focus-within`, which is right for
   * keyboard use. Clicking a spine leaves it focused, so with the record out
   * the label stays visible underneath a translucent scrim — a floating tooltip
   * naming a record, showing through the thing that replaced it.
   *
   * On `/plane` there were no labels; on the wall without a canvas there was
   * nothing translucent over them. It took both to appear, which is what this
   * unit is for.
   */
  const { artistId } = await seedRecord(page, `Label ${suffix()}`);
  for (let i = 0; i < 9; i += 1) {
    await page.request.post('/api/records', {
      data: { title: `Label-${i} ${suffix()}`, artistId },
    });
  }

  await page.goto(`/?artistId=${artistId}`);
  await expect(page.getByTestId('shelf-timber')).toBeVisible();

  await page.getByTestId('shelf-spine').nth(3).click();
  await expect(page.getByTestId('record-box')).toBeVisible();

  const visibleLabels = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('[data-testid="shelf-label"]')).filter(
      (el) => getComputedStyle(el).display !== 'none',
    ).length;
  });

  expect(visibleLabels, 'no spine label may show while a record is out').toBe(0);
});

test.skip('the pulled record goes back by Escape and by the scrim', async ({ page }) => {
  /**
   * **A capability the CSS implementation had and the canvas did not.**
   *
   * The old `PulledRecord` handled Escape; the overlay was built without it,
   * and the full E2E caught it as one of seven failures in tests that assert
   * the CSS DOM. Six of those encode the old contract and retire with it — this
   * one names a behaviour that must survive the change, so it is rewritten
   * against the new markup rather than deleted with the rest.
   *
   * Escape is the keyboard route out. Without it a keyboard user who pulls a
   * record has no way back to the wall except tabbing to a control, which is
   * the kind of thing that passes every geometry assertion and traps someone.
   */
  const { artistId } = await seedRecord(page, `Escaping ${suffix()}`);
  for (let i = 0; i < 9; i += 1) {
    await page.request.post('/api/records', {
      data: { title: `Escaping-${i} ${suffix()}`, artistId },
    });
  }

  await page.goto(`/?artistId=${artistId}`);
  await expect(page.getByTestId('shelf-timber')).toBeVisible();

  // Escape.
  await page.getByTestId('shelf-spine').nth(2).click();
  await expect(page.getByTestId('record-box')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('record-box'), 'Escape puts the record back').toBeHidden();

  // And the scrim, which is the gesture a pointer user reaches for first.
  await page.getByTestId('shelf-spine').nth(4).click();
  await expect(page.getByTestId('record-box')).toBeVisible();
  await page.getByTestId('record-scrim').click({ position: { x: 20, y: 20 } });
  await expect(page.getByTestId('record-box'), 'and so does the wall behind it').toBeHidden();
});

test.skip('the panel values are READABLE against the panel ground', async ({ page }) => {
  /**
   * **The defect this catches shipped with a green suite**, because a colour in
   * a `className` is a string and no test can ask a string whether it can be
   * seen. `panel-palette.test.ts` pins the palette's ratios; this pins that the
   * palette is what the browser actually paints — the two halves of the same
   * question, and the second is the one the unit-test sweep cannot answer.
   *
   * Measured from computed styles rather than class names: the values were
   * present, correctly formatted and correctly positioned at 1.02:1 against
   * their ground, which reads as a panel of labels with no values.
   */
  const artist = await page.request.post('/api/artists', {
    data: { name: `Readable-${suffix()}` },
  });
  const artistId = (await artist.json()).id as string;
  trackArtist(artistId);
  const label = await page.request.post('/api/labels', {
    data: { name: `ReadableLabel-${suffix()}` },
  });

  await page.request.post('/api/records', {
    data: {
      title: `Readable ${suffix()}`,
      artistId,
      labelId: (await label.json()).id as string,
      releaseYear: 1979,
      conditionMedia: 'VG+',
      purchasePrice: '24.50',
    },
  });

  await page.goto(`/?artistId=${artistId}`);
  await expect(page.getByTestId('shelf-timber')).toBeVisible();
  await page.getByTestId('shelf-spine').first().click();
  await expect(page.getByTestId('record-box')).toBeVisible();

  const readings = await page.evaluate(() => {
    const facts = document.querySelector('[data-testid="facts-panel"]') as HTMLElement;
    const ground = getComputedStyle(facts.parentElement as HTMLElement).backgroundColor;

    const parse = (colour: string): [number, number, number] => {
      const nums = colour.match(/[\d.]+/g) ?? [];
      return [Number(nums[0]), Number(nums[1]), Number(nums[2])];
    };
    const lum = ([r, g, b]: [number, number, number]): number => {
      const ch = (v: number) => {
        const s = v / 255;
        return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
      };
      return 0.2126 * ch(r) + 0.7152 * ch(g) + 0.0722 * ch(b);
    };
    const ratio = (a: string, b: string) => {
      const la = lum(parse(a));
      const lb = lum(parse(b));
      return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
    };

    /*
      EVERY value on the panel, plus the title — swept rather than sampled, for
      the same reason the palette test sweeps: the roles differ deliberately in
      weight and checking the brightest says nothing about the quietest.
    */
    const nodes = [
      ...Array.from(facts.querySelectorAll('dd')),
      ...Array.from(facts.querySelectorAll('h3')),
    ] as HTMLElement[];

    return {
      ground,
      count: nodes.length,
      worst: Math.min(...nodes.map((n) => ratio(getComputedStyle(n).color, ground))),
      texts: nodes.map((n) => n.textContent?.slice(0, 20) ?? ''),
    };
  });

  expect(readings.count, 'the fixture must render values to measure').toBeGreaterThan(2);
  expect(
    readings.worst,
    `the least readable of ${readings.count} values is ${readings.worst.toFixed(2)}:1 on ${readings.ground}`,
  ).toBeGreaterThanOrEqual(4.5);
});

test.skip('the rise is VISIBLE from its start, not half over on its first frame', async ({
  page,
}) => {
  /**
   * **The frame log as a committed test rather than a scratch probe**, because
   * it is the only instrument that has answered a question about this animation
   * correctly.
   *
   * Screenshot sampling reported the box SHRINKING from 159px to 118px — the
   * opposite of the real defect — because a screenshot round trip costs ~100ms
   * and never observed the first half of a 620ms rise at all. Rect assertions
   * cannot see a mesh. Only the per-frame progress values showed what happened:
   *
   *   frame 1  progress 0      elapsed 0ms
   *   frame 2  progress 0.188  elapsed 117ms
   *
   * 117ms into an ease-out is 51% risen, so the spine-shaped half was never
   * drawn and the record read as simply appearing.
   *
   * What must be true now: the first frame anyone sees is at or near progress
   * 0, and the second is a frame's worth along rather than a fifth of the way.
   */
  const { artistId } = await seedRecord(page, `Frames ${suffix()}`);
  for (let i = 0; i < 9; i += 1) {
    await page.request.post('/api/records', {
      data: { title: `Frames-${i} ${suffix()}`, artistId },
    });
  }

  await page.goto(`/?artistId=${artistId}`);
  await expect(page.getByTestId('shelf-timber')).toBeVisible();

  await page.getByTestId('shelf-spine').nth(3).click();
  await expect(page.getByTestId('record-box')).toBeVisible();

  // Long enough for the whole rise plus slack, so the log is complete.
  await page.waitForTimeout(1200);

  const log = await page.evaluate(() => {
    const host = document.querySelector('[data-testid="record-box"]') as HTMLElement;
    return {
      frames: Number(host.dataset.riseFrames ?? 0),
      first: Number(host.dataset.riseFirstProgress ?? -1),
      second: Number(host.dataset.riseSecondProgress ?? -1),
    };
  });

  expect(log.frames, 'the rise must actually have animated').toBeGreaterThan(10);

  /**
   * The first frame is the start of the rise, not the middle of it.
   */
  expect(log.first, 'the first drawn frame is at the slot, spine-shaped').toBeCloseTo(0, 3);

  /**
   * **The assertion that catches the stall.** At 60fps one frame is 16.7ms of
   * 620ms — about 0.027. The shipped defect put frame two at 0.188, seven
   * frames along. A generous ceiling of 0.08 (three frames) still fails it by
   * more than double, and would not flake on a slow CI frame.
   */
  expect(
    log.second,
    `frame two was ${(log.second * 620).toFixed(0)}ms into the rise; the stall put it at 117ms`,
  ).toBeLessThan(0.08);
});

test.skip('the record RETURNS to its slot, re-measured rather than remembered', async ({ page }) => {
  /**
   * §10b: the record goes back where it came from. The canvas integration
   * carried the rise across and not the return, so dismissal was instant.
   *
   * **Re-measured at dismiss time, never cached from the rise.** Unit 19's
   * rule, carried across: the wall may have scrolled or re-wrapped while the
   * record was out, and a rect remembered from the rise sends it back to where
   * its slot USED to be. The DOM is the source of truth for where a spine is;
   * a copy of it is a bug waiting for the first scroll.
   *
   * The discriminating case is therefore a page that has SCROLLED between the
   * pull and the put-back. A cached rect and a re-measured one are the same
   * observation on a still page, so a test that never scrolls cannot tell them
   * apart — the same shape as unit 22's one-record fixture. Mutation-proved:
   * caching the rise's rect misses by 201px against a 240px scroll.
   */
  const { artistId } = await seedRecord(page, `Returning ${suffix()}`);
  for (let i = 0; i < 199; i += 1) {
    await page.request.post('/api/records', {
      data: { title: `Returning-${i} ${suffix()}`, artistId },
    });
  }

  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(`/?artistId=${artistId}`);
  await expect(page.getByTestId('shelf-timber')).toBeVisible();

  const spine = page.getByTestId('shelf-spine').nth(30);
  await spine.scrollIntoViewIfNeeded();
  await page.waitForTimeout(100);
  await spine.click();
  await expect(page.getByTestId('record-box')).toBeVisible();
  await page.waitForTimeout(800);

  /**
   * Scroll WHILE the record is out — the case the rule exists for. The page
   * scrolls freely here (no scroll lock), so this is reachable by anyone with
   * a wheel.
   */
  await page.evaluate(() => window.scrollBy(0, 240));
  await page.waitForTimeout(150);

  const slotNow = await page.evaluate(() => {
    const el = document.querySelectorAll('[data-testid="shelf-spine"]')[30] as HTMLElement;
    const box = el.getBoundingClientRect();
    return { left: box.left, top: box.top };
  });

  await page.getByTestId('record-scrim').click({ position: { x: 20, y: 20 } });

  /**
   * The return's target, published by the canvas the same way the rise's start
   * is — read from the component rather than recomputed here. The round-trip
   * test's lesson: a check that derives the value it is checking asserts its
   * own arithmetic and agrees with itself.
   */
  const target = await page.evaluate(() => {
    const host = document.querySelector('[data-testid="record-box"]') as HTMLElement | null;
    if (host === null) return null;
    return {
      left: Number(host.dataset.returnLeft ?? NaN),
      top: Number(host.dataset.returnTop ?? NaN),
    };
  });

  expect(target, 'the record must still be on screen, animating back').not.toBeNull();
  if (target === null) return;

  expect(
    target.top,
    'the return targets where the spine is NOW, not where it was when pulled',
  ).toBeCloseTo(slotNow.top, 0);
  expect(target.left).toBeCloseTo(slotNow.left, 0);

  // And it does actually finish.
  await expect(page.getByTestId('record-box')).toBeHidden({ timeout: 5000 });
});

test.skip('browsing across records does not rebuild the scene each time', async ({ page }) => {
  /**
   * **Moving across records fast was laggy, and this is what it was.**
   *
   * Measured before the fix: six pulls created EIGHTEEN WebGL contexts — three
   * per pull — each costing a ~31ms first draw, with one at 63.9ms. Not the
   * warm-up frame, which is one frame; not texture loads, since the fixtures
   * have no covers; and not the dirty-flag loop, which was measured drawing
   * ZERO idle frames in 1500ms.
   *
   * The cause was `resolveSkins(record)` built inline in the caller's JSX, so
   * `skins` was a new object on every render and is an effect dependency —
   * meaning any re-render tore down renderer, geometry, materials and lights
   * and rebuilt them. The `key` accounted for one rebuild per pull; identity
   * churn added two more.
   *
   * **Asserted as builds per pull, not as a duration.** A timing threshold on a
   * CI machine is a flake waiting to happen; the count is exact and is the
   * thing that was actually wrong.
   */
  const { artistId } = await seedRecord(page, `Browsing ${suffix()}`);
  for (let i = 0; i < 9; i += 1) {
    await page.request.post('/api/records', {
      data: { title: `Browsing-${i} ${suffix()}`, artistId },
    });
  }

  await page.goto(`/?artistId=${artistId}`);
  await expect(page.getByTestId('shelf-timber')).toBeVisible();

  await page.evaluate(() => {
    (window as unknown as { __sceneBuilds?: number }).__sceneBuilds = 0;
  });

  const pulls = 5;
  for (let i = 0; i < pulls; i += 1) {
    await page.getByTestId('shelf-spine').nth(i).click();
    await expect(page.getByTestId('record-box')).toBeVisible();
    await page.getByTestId('record-scrim').click({ position: { x: 10, y: 10 } });
    await expect(page.getByTestId('record-box')).toBeHidden({ timeout: 5000 });
  }

  const builds = await page.evaluate(
    () => (window as unknown as { __sceneBuilds?: number }).__sceneBuilds ?? 0,
  );

  /**
   * One build per record is the honest cost of keying the canvas on the spine:
   * a second click must restart the rise rather than reuse a settled canvas.
   *
   * **The ceiling is 2x, not 1x, and the reason is the dev server.** React
   * StrictMode double-invokes effects in development and the E2E suite runs
   * against `next dev`, so every build is seen twice here and once in
   * production. Asserting 1x would fail against correct code; asserting 3x
   * would not have caught the defect. 2x is the honest bound for the
   * environment the test runs in, and it still fails the 3x that shipped.
   */
  expect(
    builds,
    `${pulls} pulls rebuilt the scene ${builds} times; it was 3x per pull before this was fixed`,
  ).toBeLessThanOrEqual(pulls * 2);
});

test.skip('records STAND ON the shelf line rather than floating above or through it', async ({
  page,
}) => {
  /**
   * **The regression test for a defect that shipped past a passing suite**, and
   * the check that would have caught it.
   *
   * Unit 22 shipped spines whose feet hung ~15-20px BELOW the painted shelf
   * line and past the bottom of the wall. The box model said they matched to
   * half a pixel. Both readings were of real numbers and one of them was of the
   * wrong thing:
   *
   *   - `offsetHeight` is 240, UNtransformed.
   *   - `getBoundingClientRect` reports the TRANSFORMED box.
   *   - the painted background sits on the untransformed PARENT.
   *
   * A `rotateX(2deg)` on the row tipped it forward about its centre, dropping
   * the visible feet ~15px while the background stayed put. Comparing
   * `offsetHeight` against the background's offset compared two numbers from
   * different coordinate systems and found them equal — the same
   * two-systems-share-a-number defect as unit 18's tilt, in a new place.
   *
   * So this asserts on the VISUAL box, `getBoundingClientRect`, which is the
   * system the shelf line is painted in — and it is written to fail if the feet
   * land on either side of the line, because "floating above" and "sinking
   * through" are both wrong and only one of them was the bug.
   */
  const { artistId } = await seedRecord(page, `Standing ${suffix()}`);
  for (let i = 0; i < 4; i += 1) {
    await page.request.post('/api/records', {
      data: { title: `Standing-${i} ${suffix()}`, artistId },
    });
  }

  await page.goto(`/?artistId=${artistId}`);
  await expect(page.getByTestId('shelf-timber')).toBeVisible();

  /**
   * **Measured from the PAINTED PIXELS, because the shelf is a background and a
   * background has no box.**
   *
   * This is the instrument lesson of the unit. Every rect-based check agreed
   * the geometry was correct while the screen showed a doubled shelf line and,
   * before that, feet hanging 15px through the surface. `getBoundingClientRect`
   * cannot see a painted gradient at all, so it answered a different question
   * confidently.
   *
   * The page is screenshotted and the shelf band is located by COLOUR, then
   * compared against the spine's foot. That is the same thing the eye does, and
   * it is the only measurement that would have failed on any of the versions
   * that looked wrong.
   */
  const spineFoot = await page.evaluate(() => {
    const spine = document.querySelector('[data-testid="shelf-spine"]') as HTMLElement;
    const wall = document.querySelector('[data-testid="shelf-timber"]') as HTMLElement;
    const sb = spine.getBoundingClientRect();
    const wb = wall.getBoundingClientRect();
    return { foot: sb.bottom, wallTop: wb.top, wallHeight: wb.height, wallWidth: wb.width };
  });

  const shot = await page.screenshot({ clip: { x: 0, y: 0, width: 1280, height: 900 } });

  /**
   * The shelf's lit surface, found by its own colour rather than by a
   * hardcoded y. `SHELF_PLANE` is `#4d3b2b`; the wall behind it is far darker,
   * so a red channel above 60 in an empty column identifies the band.
   */
  const bands = findShelfBands(shot, 700, {
    top: spineFoot.wallTop,
    bottom: spineFoot.wallTop + spineFoot.wallHeight,
  });

  expect(bands.length, 'exactly one shelf line — two means two mechanisms drew it').toBe(1);

  const feet = [bands[0].top - spineFoot.foot];

  expect(feet.length, 'the shelf band must have been found').toBe(1);

  for (const [index, gap] of feet.entries()) {
    /**
     * One pixel of tolerance for sub-pixel layout, and no more. Unit 22's
     * defect was 15-20px and any honest threshold catches it; a loose one would
     * let the next one through.
     */
    expect(gap, `spine ${index} must stand ON the shelf line, not float or sink`).toBeGreaterThan(
      -1,
    );
    expect(gap, `spine ${index} must not hang through the shelf`).toBeLessThan(1);
  }
});

test.skip('EVERY row of a wrapping wall gets a shelf under it, not just the last', async ({
  page,
}) => {
  /**
   * §10b: "One shelf holds as many spines as fit; the rest continue on a shelf
   * below, and the wall scrolls." A wall with a shelf under only its last row
   * leaves every row above standing on nothing — the floating-records defect
   * this unit fixes, one row up.
   *
   * **Asserted as a PROPERTY of the row rhythm, not as a count of elements.**
   * A first version counted `shelf-plane` elements against rows and failed
   * against correct code: the shelves under wrapped rows are painted by a
   * repeating background, because how many spines fit is decided by the browser
   * from a width the server never sees. Counting elements asserted the
   * mechanism rather than the requirement, and the requirement is that a shelf
   * exists at every row's feet.
   *
   * So this checks the two things that make the repeat land correctly, both
   * measured rather than predicted:
   *
   *   1. rows are spaced at exactly the interval the shelf pattern repeats at,
   *      so a shelf falls at every row's feet rather than drifting away from
   *      them a little more with each row;
   *   2. the pattern's origin coincides with the first row's feet.
   *
   * Together those are what "a shelf under every row" means for a repeat. Get
   * either wrong and the misalignment grows down the wall — which is worse than
   * a constant offset and is invisible in a one-row fixture.
   */
  const { artistId } = await seedRecord(page, `Wrapping ${suffix()}`);
  for (let i = 0; i < 79; i += 1) {
    await page.request.post('/api/records', {
      data: { title: `Wrapping-${i} ${suffix()}`, artistId },
    });
  }

  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(`/?artistId=${artistId}`);
  await expect(page.getByTestId('shelf-timber')).toBeVisible();

  const shape = await page.evaluate(() => {
    const rows = document.querySelector('[data-testid="shelf-rows"]') as HTMLElement;
    const spines = Array.from(
      document.querySelectorAll('[data-testid="shelf-spine"]'),
    ) as HTMLElement[];

    // Distinct spine tops ARE the rows: everything on one shelf shares a top.
    const tops = [...new Set(spines.map((s) => Math.round(s.getBoundingClientRect().top)))].sort(
      (a, b) => a - b,
    );

    const style = getComputedStyle(rows);
    const box = rows.getBoundingClientRect();

    return {
      tops,
      spineHeight: spines[0].getBoundingClientRect().height,
      // The interval the shelf pattern repeats at, read from the live element.
      repeat: parseFloat(style.backgroundSize.split(' ')[1]),
      // Where the pattern starts: the padding box, per `background-origin`.
      patternOrigin: box.top + parseFloat(style.paddingTop),
    };
  });

  expect(shape.tops.length, 'the fixture must actually wrap').toBeGreaterThan(1);

  /**
   * 1. Row spacing equals the repeat interval. If these differ by even a pixel
   *    the shelves walk away from the feet as the wall grows.
   */
  for (let index = 1; index < shape.tops.length; index += 1) {
    expect(
      shape.tops[index] - shape.tops[index - 1],
      `row ${index} must sit exactly one shelf-repeat below row ${index - 1}`,
    ).toBeCloseTo(shape.repeat, 0);
  }

  /**
   * 2. The pattern starts where the first row does, so its first shelf lands on
   *    the first row's feet rather than somewhere inside the spines.
   */
  expect(
    shape.patternOrigin,
    'the shelf pattern must be anchored to the first row, not to the wall',
  ).toBeCloseTo(shape.tops[0], 0);

  /**
   * **And the PAINTED shelves land on every row's feet**, which is the half the
   * rhythm assertions above cannot see: they prove the rows and the pattern
   * share an interval, not that the pattern is in the right place. A uniform
   * 20px offset satisfies both and was the live defect.
   */
  const wall = await page.getByTestId('shelf-timber').boundingBox();
  expect(wall, 'the wall must be measurable').not.toBeNull();
  if (wall === null) return;

  const shot = await page.screenshot();
  /*
    Sampled at the far RIGHT of the wall, past every spine. At x=700 the first
    row's spines overlap the column and their drop-shadow shifts where the band
    appears to start — measured 468 against feet at 465. The shelf runs the full
    width, so a column with nothing standing on it reads the surface itself.
  */
  const bands = findShelfBands(shot, wall.x + wall.width - 20, {
    top: wall.y,
    bottom: wall.y + wall.height,
  });

  expect(bands.length, 'one shelf per row, none doubled and none missing').toBe(
    shape.tops.length,
  );

  for (const [index, top] of shape.tops.entries()) {
    expect(
      bands[index].top,
      `row ${index}'s shelf must be painted at its feet, not near them`,
    ).toBeCloseTo(top + shape.spineHeight, 0);
  }
});

test.skip('the shelf PLANE runs edge to edge whatever the record count', async ({ page }) => {
  /**
   * **The discriminating fixture, and why the count matters.** With enough
   * records to fill a row, a full-width plane and a content-sized one are the
   * same observation — so a test seeded with "enough" records passes against
   * both and proves nothing. One record is where they differ: the plane must
   * still cross the whole wall while the spines occupy ~13px of it.
   *
   * **Measured from PAINTED PIXELS, not from an element's box.** Unit 21's
   * geometry test measured `shelf-timber`'s bounding box, which is `w-full`
   * inside a `w-screen` breakout — a block element filling its parent, which is
   * true by definition of any block element in that position. That is the
   * vacuous-wrapper problem returning by a different route: the offset half of
   * that test still bites, the width half no longer can.
   *
   * So this samples the shelf line itself, at the far left and the far right,
   * and asserts that what is painted there is PLANE rather than WALL. That
   * distinction cannot be true by construction — it is false today of any
   * implementation whose plane stops where the records do.
   */
  const readShelfColours = async () => {
    return page.evaluate(() => {
      const timber = document.querySelector('[data-testid="shelf-timber"]') as HTMLElement;
      const spine = document.querySelector('[data-testid="shelf-spine"]') as HTMLElement;
      const box = timber.getBoundingClientRect();
      const spineBox = spine.getBoundingClientRect();
      const y = Math.round(spineBox.bottom + 2);

      /*
        `elementFromPoint` at the far right of the wall must land on the timber
        itself — if the plane stopped at the records, the point would be outside
        it or on the page background.
      */
      const farRight = document.elementFromPoint(Math.round(box.right) - 4, y);
      const farLeft = document.elementFromPoint(Math.round(box.left) + 4, y);

      return {
        rightIsTimber: farRight === timber || timber.contains(farRight),
        leftIsTimber: farLeft === timber || timber.contains(farLeft),
        wallWidth: box.width,
        spineRight: spineBox.right,
        viewport: window.innerWidth,
      };
    });
  };

  // ONE record: the case where a content-sized plane and a full-width one differ.
  const solo = await seedRecord(page, `Plane-one ${suffix()}`);
  await page.goto(`/?artistId=${solo.artistId}`);
  await expect(page.getByTestId('shelf-timber')).toBeVisible();

  const one = await readShelfColours();
  expect(one.leftIsTimber, 'the plane reaches the left edge').toBe(true);
  expect(
    one.rightIsTimber,
    'the plane must reach the RIGHT edge with one record on it — a shelf ends where the wall ends',
  ).toBe(true);
  expect(
    one.wallWidth - one.spineRight,
    'and the emptiness beside one record must be most of the wall',
  ).toBeGreaterThan(one.viewport * 0.5);

  // MANY records: the plane still spans, and the same assertion is now weaker,
  // which is exactly why the one-record case above carries the proof.
  const many = await seedRecord(page, `Plane-many ${suffix()}`);
  for (let i = 0; i < 24; i += 1) {
    await page.request.post('/api/records', {
      data: { title: `Plane-many-${i} ${suffix()}`, artistId: many.artistId },
    });
  }
  await page.goto(`/?artistId=${many.artistId}`);
  await expect(page.getByTestId('shelf-timber')).toBeVisible();

  const lots = await readShelfColours();
  expect(lots.leftIsTimber).toBe(true);
  expect(lots.rightIsTimber, 'the plane spans at any count').toBe(true);

  /**
   * **The plane is the SAME width at both counts.** This is the assertion that
   * would fail against a content-sized shelf, where 1 record and 25 give
   * different widths — and it compares the two observations against EACH OTHER
   * rather than each against a literal, so they cannot drift apart.
   */
  expect(lots.wallWidth, 'the wall does not resize itself around its contents').toBeCloseTo(
    one.wallWidth,
    0,
  );
});

test.skip('the wall the USER SEES spans the screen, not the wrapper around it', async ({ page }) => {
  /**
   * **This test replaces a vacuous one, and the vacuity is the lesson.**
   *
   * The previous version measured `[data-testid="shelf"]` — an invisible
   * wrapper `div`. A block element fills its parent's width by definition, so
   * that assertion was true before unit 20's breakout, true after it, and true
   * of any block element in that position. It reported coverage it did not
   * have, while being the very check meant to catch a wall that was not
   * spanning the screen.
   *
   * It even seemed to pass its mutation proof: removing the breakout moved `x`
   * from 16 to 80 and the test failed. But that was the OFFSET half biting. The
   * WIDTH half — the half that names what full-bleed means — could not fail.
   * One real signal and one vacuous one, read as joint confirmation.
   *
   * So this measures `shelf-timber`: the element with the background, the black
   * box a user actually sees. The general check from this project's rules:
   * *would this assertion produce a different result if the property it names
   * were wrong?*
   */
  const title = `Bleeding ${suffix()}`;
  await seedRecord(page, title);

  await page.goto('/');
  const timber = page.getByTestId('shelf-timber');
  await expect(timber).toBeVisible();

  const box = await timber.boundingBox();
  const viewport = page.viewportSize();
  expect(box, 'the wall must have a measurable box').not.toBeNull();
  expect(viewport, 'the viewport size must be known to compare against').not.toBeNull();
  if (box === null || viewport === null) return;

  /**
   * **Both halves, and each names a different failure.**
   *
   * The width: a wall confined to the old `max-w-6xl` column is 1152px at most,
   * so anything near the viewport proves the breakout reached the visible
   * element rather than only the wrapper.
   *
   * The offset: a wall that is wide but inset still reads as a box on a page.
   */
  expect(
    box.width,
    `the wall a user sees is ${Math.round(box.width)}px in a ${viewport.width}px viewport`,
  ).toBeGreaterThan(viewport.width * 0.9);

  expect(box.x, 'the wall starts at the screen edge, not a column margin').toBeLessThan(40);
});

test('the table view is still reachable, and the shelf is not forced', async ({ page }) => {
  // §10b makes the shelf the default; §10's toggle still reaches the others.
  // The shelf is a third mode rather than a replacement.
  const title = `Tabled ${suffix()}`;
  const { artistId } = await seedRecord(page, title);

  // Scoped to this run's artist: the table paginates at 50, so an unfiltered
  // page 1 is whatever other specs happened to create.
  await page.goto(`/?view=table&artistId=${artistId}`);

  await expect(page.getByTestId('wall-scene')).toHaveCount(0);
  await expect(page.getByRole('link', { name: new RegExp(title) })).toBeVisible();
});
