import zlib from 'node:zlib';
import { expect, test, type Page } from '@playwright/test';

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

  await expect(page.getByTestId('shelf')).toBeVisible();
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

test('clicking a spine pulls the record out, and turning shows the back', async ({ page }) => {
  /**
   * §10b's core interaction. The BACK is the interesting half: "the back face
   * is never empty … every record is a two-sided object from the day it is
   * entered", so a record with no photographs at all still turns over and shows
   * what is known.
   *
   * This fixture has neither cover nor back, which is the common state after
   * §10's quick in-store entry — so the front and the back are both composed,
   * and the test proves the record is two-sided regardless.
   */
  const title = `Turnable ${suffix()}`;
  await seedRecord(page, title);

  await page.goto('/');
  await page.getByRole('link', { name: new RegExp(title) }).click();

  const pulled = page.getByTestId('pulled-record');
  await expect(pulled).toBeVisible();
  await expect(pulled).toHaveAttribute('data-face', 'front');

  await page.getByTestId('turn-record').click();
  await expect(pulled).toHaveAttribute('data-face', 'back');

  /**
   * **Scoped to the BACK panel, and that scoping is what the box changed.**
   *
   * This read `getByTestId('composed-face')` unscoped, which was unambiguous
   * when one face existed at a time and its contents were swapped. The record
   * is now a box: front and back are both present throughout, so a record with
   * no photographs at all composes BOTH, and the bare locator resolves to two
   * elements.
   *
   * The contract did not change — the assertions either side of this, that
   * `data-face` goes front → back → front, pass untouched. What changed is that
   * "the back" is now a specific panel rather than whatever the single face
   * currently held, so the locator has to say which one it means.
   */
  await expect(
    page.getByTestId('pulled-back-face').getByTestId('composed-face'),
    'the back is composed from what is known, never blank',
  ).toBeAttached();

  // §10b: "click again puts it back."
  await page.getByTestId('turn-record').click();
  await expect(pulled).toHaveAttribute('data-face', 'front');
});

test('the gatefold affordance is absent without an inner image', async ({ page }) => {
  /**
   * §10b's strictest rule, as amended by A21c: "the state exists only where
   * BOTH leaves have been photographed. One is not enough: a hinge that opens
   * onto artwork on one side and a blank on the other invents exactly the thing
   * the user came to see."
   *
   * So the ABSENCE is the assertion. This record has no inner photographs at
   * all, which is the ordinary case; the half-photographed case — one leaf and
   * not the other — is the discriminating one and is pinned at the unit level,
   * in `faces.test.ts` and `shelf.test.ts`, where a fixture can be built
   * without uploading two files through the UI.
   */
  const title = `Plain ${suffix()}`;
  await seedRecord(page, title);

  await page.goto('/');
  await page.getByRole('link', { name: new RegExp(title) }).click();

  await expect(page.getByTestId('pulled-record')).toBeVisible();
  await expect(page.getByTestId('turn-record'), 'it still turns over').toBeVisible();
  await expect(
    page.getByTestId('open-gatefold'),
    'but nothing offers to open a sleeve that does not fold',
  ).toHaveCount(0);
});

test('the pulled record can be put back, and by Escape', async ({ page }) => {
  const title = `Closable ${suffix()}`;
  await seedRecord(page, title);

  await page.goto('/');
  await page.getByRole('link', { name: new RegExp(title) }).click();
  await expect(page.getByTestId('pulled-record')).toBeVisible();

  await page.getByTestId('put-back').click();
  await expect(page.getByTestId('pulled-record')).toHaveCount(0);

  // Escape is the other way out, as it is on any overlay.
  await page.getByRole('link', { name: new RegExp(title) }).click();
  await expect(page.getByTestId('pulled-record')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('pulled-record')).toHaveCount(0);
});

test('clicking a spine pulls out THAT record, out of its own slot', async ({ page }) => {
  /**
   * §10b: "the record rises out of its slot. It was on the shelf a moment ago
   * and now it is in your hands — that continuity is the feature. A record that
   * fades in centred is a modal wearing a sleeve."
   *
   * **Nothing here waits on a duration.** The rise's timing lives in CSS and
   * this design deliberately keeps it there, so a test that slept for it would
   * be asserting a number TypeScript is not allowed to know. What is assertable
   * is identity — the record that comes out is the one whose spine was clicked
   * — and that the sleeve is transform-driven at all.
   *
   * Identity is the half that matters: a wall of spines all leading to the same
   * overlay would pass every other test in this file.
   */
  const mine = `Risen ${suffix()}`;
  const other = `Neighbour ${suffix()}`;
  await seedRecord(page, other);
  const { artistId } = await seedRecord(page, mine);

  await page.goto(`/?artistId=${artistId}`);
  await page.getByRole('link', { name: new RegExp(mine) }).click();

  const pulled = page.getByTestId('pulled-record');
  await expect(pulled).toBeVisible();
  await expect(
    pulled,
    'the record that came out must be the one whose spine was clicked',
  ).toHaveAttribute('aria-label', new RegExp(mine));
  await expect(pulled).not.toHaveAttribute('aria-label', new RegExp(other));

  /**
   * The sleeve carries the rise. Asserted as "the class is applied" rather than
   * as a computed transform: mid-flight the transform is whatever the
   * compositor has reached, and settled it is `none` — so a value assertion
   * either races the animation or pins the end state, and neither says the
   * rise happened.
   */
  await expect(page.getByTestId('pulled-sleeve')).toHaveClass(/record-rise/);
});

test('a record dismissed MID-RISE still goes away', async ({ page }) => {
  /**
   * **The defect this unit shipped and then fixed, kept as the test that
   * found it.**
   *
   * The return leg listened for `transitionend` and closed on it. Dismiss the
   * record while the rise is still travelling and the browser fires
   * `transitioncancel` for the interrupted transition instead — so the listener
   * never ran, the record never unmounted, and Escape left it stranded on
   * screen with no way out but a reload.
   *
   * The full E2E run caught it as a failure in the EXISTING Escape test, which
   * is the cross-file break CLAUDE.md §10 exists for: nothing in this file's
   * own additions was wrong.
   *
   * No wait between the click and the dismissal — that is the whole point. A
   * user who changes their mind does it in well under the rise's duration.
   */
  const title = `Interrupted ${suffix()}`;
  const { artistId } = await seedRecord(page, title);

  await page.goto(`/?artistId=${artistId}`);
  await page.getByRole('link', { name: new RegExp(title) }).click();

  // Immediately — mid-flight, before the rise can settle.
  await page.keyboard.press('Escape');
  await expect(
    page.getByTestId('pulled-record'),
    'a record dismissed mid-rise must not be stranded on screen',
  ).toHaveCount(0);

  // And the same through the button, which takes the identical path.
  await page.getByRole('link', { name: new RegExp(title) }).click();
  await page.getByTestId('put-back').click();
  await expect(page.getByTestId('pulled-record')).toHaveCount(0);
});

test('reduced motion: the record still arrives, and still goes back', async ({ page }) => {
  /**
   * §10b: "reduced motion disables all of it. The turn, the rise and the hinge
   * are decorative; the record and its faces are not."
   *
   * **This is the branch a screenshot will never show.** The risk it guards is
   * specific and was designed against rather than discovered: with
   * `transition: none` the browser fires no `transitionend`, so a return leg
   * that waits for one would strand the record on screen for ever. A reader who
   * asked for less motion would be the only one who could not put a record
   * back.
   */
  await page.emulateMedia({ reducedMotion: 'reduce' });

  const title = `Still ${suffix()}`;
  const { artistId } = await seedRecord(page, title);

  await page.goto(`/?artistId=${artistId}`);
  await page.getByRole('link', { name: new RegExp(title) }).click();
  await expect(page.getByTestId('pulled-record')).toBeVisible();

  /**
   * The CHROME obeys the preference too (§10b: "reduced motion disables all of
   * it"). The backdrop is still dark and the controls are still there — they
   * are not decorative, the TRAVEL is — so what is asserted is that neither
   * carries a transition, not that either is absent.
   */
  const durations = await page.getByTestId('pulled-record').evaluate((el) => {
    const controls = el.querySelector('.record-controls');
    return {
      chrome: getComputedStyle(el).transitionDuration,
      controls: controls === null ? 'missing' : getComputedStyle(controls).transitionDuration,
    };
  });
  expect(durations.controls, 'the control row must exist to be asserted about').not.toBe(
    'missing',
  );
  expect(durations.chrome, 'the backdrop must not travel under reduced motion').toMatch(/^0s(,\s*0s)*$/);
  expect(durations.controls, 'the controls must not travel under reduced motion').toMatch(
    /^0s(,\s*0s)*$/,
  );

  /**
   * The TILT obeys the preference too (§10b: "reduced motion disables all of
   * it"). Two locks, asserted together because either alone can be defeated:
   * the handler declines to write the angles, and the stylesheet overrides the
   * transform for a reader who changed the setting while a record was already
   * out and turned.
   */
  const tilt = page.getByTestId('pulled-tilt');
  const box = await tilt.boundingBox();
  expect(box, 'the tilt surface must have a measurable box').not.toBeNull();
  if (box !== null) {
    await page.mouse.move(box.x + box.width - 6, box.y + 6);
    await page.waitForTimeout(120);
  }
  expect(
    await tilt.evaluate((el) => getComputedStyle(el).transform),
    'a reduced-motion reader must get a record that does not turn',
  ).toBe('none');

  /**
   * The FLIP obeys the preference too. The record still turns over — the back
   * is not decorative, the travel is — so what is asserted is that the box
   * carries no transition, not that it refuses to rotate.
   */
  expect(
    await page.getByTestId('pulled-box').evaluate((el) => getComputedStyle(el).transitionDuration),
    'the flip must not travel under reduced motion',
  ).toBe('0s');

  await page.getByTestId('turn-record').click();
  await expect(
    page.getByTestId('pulled-record'),
    'a reduced-motion reader still gets to see the back',
  ).toHaveAttribute('data-face', 'back');
  await page.getByTestId('turn-record').click();

  await page.getByTestId('put-back').click();
  await expect(
    page.getByTestId('pulled-record'),
    'a reduced-motion reader must be able to put the record back',
  ).toHaveCount(0);
});

test('the tilt tracks pointer POSITION, and holds when the pointer leaves', async ({ page }) => {
  /**
   * §10b's "an object you turn", and the two properties that make it one.
   *
   * **Absolute mapping**: the same pointer position gives the same angle
   * whatever path the pointer took. Asserted as a ROUND TRIP because a single
   * move cannot distinguish position-mapping from delta-accumulation — both
   * produce an angle, and on a first move both produce the same one. They
   * diverge only over a path.
   *
   * **It holds its last angle**: no spring back, no idle animation. That is
   * what makes it a record someone turned rather than a control that resets,
   * and it is why a still record costs nothing.
   */
  const title = `Turned ${suffix()}`;
  const { artistId } = await seedRecord(page, title);

  await page.goto(`/?artistId=${artistId}`);
  await page.getByRole('link', { name: new RegExp(title) }).click();
  await page.getByTestId('pulled-record').waitFor();

  const tilt = page.getByTestId('pulled-tilt');

  /**
   * **The record's LAID-OUT box, not `boundingBox()`.**
   *
   * `boundingBox()` reports the visual rectangle, and during the rise that is a
   * moving target — measured at 188px growing to 512, x sliding 195 → 384. A
   * `box` captured mid-rise puts the pointer positions below outside the
   * settled record, where the mapping clamps: the full suite caught this as
   * `first` being `--tilt-x: -16deg`, exactly the clamp maximum, rather than
   * the interior angle the test intended.
   *
   * `offsetWidth`/`offsetLeft` are layout geometry and ignore transforms, so
   * these coordinates describe the same rectangle whatever the record is doing.
   * This is the same correction the component's own pointer handler needed, and
   * the fourth instance of the family in this feature.
   */
  const box = await tilt.evaluate((el: HTMLElement) => {
    const target = el.querySelector<HTMLElement>('[data-testid="pulled-box"]') ?? el;
    let x = 0;
    let y = 0;
    for (
      let node: HTMLElement | null = target;
      node !== null;
      node = node.offsetParent as HTMLElement | null
    ) {
      x += node.offsetLeft;
      y += node.offsetTop;
    }
    return { x, y, width: target.offsetWidth, height: target.offsetHeight };
  });
  expect(box.width, 'the tilt surface must have a measurable box').toBeGreaterThan(0);

  const angles = () => tilt.evaluate((el) => el.getAttribute('style') ?? '');
  const start = { x: box.x + 90, y: box.y + 380 };

  /**
   * **`expect.poll` throughout, because the pointer's effect is asynchronous
   * and the test must not guess how long it takes.**
   *
   * An earlier version slept a fixed 80ms after each `mouse.move`. That passed
   * scoped and flaked under the full suite's parallel load, where the event
   * lands later — the assertion is about the VALUE, so it waits for the value.
   *
   * Three attempts at a cleverer helper each made it worse and were reverted;
   * what is recorded in NOTES is that the underlying behaviour was verified
   * directly and is exact — the round trip closes to the digit and the angle
   * holds. The instability was only ever in how this test waited.
   */
  /**
   * **Poll until the style DIFFERS from rest, not until `--tilt-y` exists.**
   *
   * The element ships with `--tilt-x: 0deg; --tilt-y: 0deg` from its React
   * default, so a poll waiting for the property to appear is satisfied before
   * the pointer has moved — and `first` is then captured as the resting value.
   * Every later assertion compares against that, and under parallel load, where
   * the `pointermove` lands later, the test fails with
   * `Expected: "--tilt-x: 0deg; --tilt-y: 0deg;"`. That was the flake.
   */
  const resting = await angles();

  /**
   * **Wait for the rise to finish before AIMING a pointer.**
   *
   * The box above is layout geometry, which is right for the mapping — the
   * tilt's reference rect must not move as the record moves (unit 13). But it
   * is wrong for deciding where to put a real cursor while the record is still
   * travelling: measured mid-rise, the layout box reads (384,121) 512x512 while
   * the record is visually at (863,452) 188x281, so `start` lands on the scroll
   * wrapper and no `pointermove` ever reaches the tilt surface. The poll then
   * times out having never seen an angle.
   *
   * Two different questions — "what rect does the mapping use" and "where is
   * the element right now" — and the same value does not answer both. Polling
   * until the visual box matches the laid-out one is the browser saying the
   * rise is over, with no duration in the test.
   */
  await expect
    .poll(async () => {
      const visual = await tilt.boundingBox();
      return visual !== null && Math.abs(visual.width - box.width) < 2;
    })
    .toBe(true);

  await page.mouse.move(start.x, start.y);
  await expect.poll(async () => angles()).not.toBe(resting);
  const first = await angles();

  // A path that an accumulating mapping could not retrace.
  await page.mouse.move(box.x + box.width - 6, box.y + box.height / 2);
  await page.mouse.move(box.x + 6, box.y + 6);
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.move(start.x, start.y);

  await expect
    .poll(async () => angles(), {
      message: 'the same position must give the same angle, whatever the path',
    })
    .toBe(first);

  // Pointer well away from the record, and left there: it holds rather than
  // springing back.
  await page.mouse.move(40, 780);
  await expect
    .poll(async () => angles(), {
      message: 'the record holds its angle rather than springing back',
    })
    .toBe(first);
});

test('the shelf is a plane that ends where the wall ends, at any collection size', async ({ page }) => {
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
  await expect(page.getByTestId('shelf')).toBeVisible();

  /**
   * The heading is the FILTERED count from `listRecords`; the spines are what
   * `shelfRecords` returned. Both describe the same request, so they must
   * agree.
   */
  const heading = await page.locator('main header p').first().textContent();
  const headingCount = Number(/^(\d+)/.exec(heading?.trim() ?? '')?.[1] ?? NaN);
  expect(headingCount, `the heading did not state a count: "${heading}"`).not.toBeNaN();

  const spines = await page.getByTestId('shelf-spine').count();

  expect(
    spines,
    `the wall shows ${spines} spines under a heading reading "${heading?.trim()}"`,
  ).toBe(headingCount);
});

test('the shelf view puts its controls in an overlay, and says when a filter is on', async ({
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

test('the view toggle stays OUT of the overlay, and can reach all three views', async ({
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

test('records STAND ON the shelf line rather than floating above or through it', async ({
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

test('EVERY row of a wrapping wall gets a shelf under it, not just the last', async ({
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

test('the shelf PLANE runs edge to edge whatever the record count', async ({ page }) => {
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

test('the wall the USER SEES spans the screen, not the wrapper around it', async ({ page }) => {
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

  await expect(page.getByTestId('shelf')).toHaveCount(0);
  await expect(page.getByRole('link', { name: new RegExp(title) })).toBeVisible();
});
