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
  await expect(
    page.getByTestId('composed-face'),
    'the back is composed from what is known, never blank',
  ).toBeVisible();

  // §10b: "click again puts it back."
  await page.getByTestId('turn-record').click();
  await expect(pulled).toHaveAttribute('data-face', 'front');
});

test('the gatefold affordance is absent without an inner image', async ({ page }) => {
  /**
   * §10b's strictest rule: "the state exists only where an inner image has been
   * photographed. There is no generated stand-in: the point of a gatefold is
   * the artwork inside it, and a panel of pressing details folded open where a
   * photograph should be would be inventing the thing the user came to see."
   *
   * So the ABSENCE is the assertion. A record with no inner photograph has two
   * faces and nothing suggests otherwise.
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

  await page.getByTestId('put-back').click();
  await expect(
    page.getByTestId('pulled-record'),
    'a reduced-motion reader must be able to put the record back',
  ).toHaveCount(0);
});

test('the shelf is no wider than it needs and no shorter than a shelf', async ({ page }) => {
  /**
   * §10b as amended: **no wider than it needs, no shorter than a shelf.**
   *
   * Two rules, and the unit that produced them had only the first. "A shelf's
   * width is however much it carries" fixed a real defect — a full-viewport
   * band with five spines at the left reads as MISSING DATA, the genre-sections
   * defect one level out — and then overshot, because at five records it left a
   * 105px tile floating in a 1200px column, which reads as a thumbnail of a
   * shelf rather than as a shelf.
   *
   * What resolves it is that a shelf is FURNITURE. It has a length whether or
   * not it is full, and a real shelf with five records on it is still a shelf
   * with space beside them. The emptiness was never the problem; the emptiness
   * being the whole viewport was, because that implies a collection that should
   * have filled it.
   *
   * So the floor and the ceiling are asserted together. Neither alone is the
   * rule, and each was briefly shipped as if it were.
   *
   * **The ceiling is measured against the WIDEST ROW, not the last spine.** The
   * first version of this test compared the container to the final spine, then
   * passed scoped and failed in the full suite — where other specs seed enough
   * records to WRAP, so the last spine sits at the start of a short second row
   * and 769px of legitimate trailing shelf belongs to the rows above it.
   */
  const title = `Fitted ${suffix()}`;
  await seedRecord(page, title);

  await page.goto('/');
  const shelf = page.getByTestId('shelf');
  await expect(shelf).toBeVisible();

  const spines = page.getByTestId('shelf-spine');
  const spineCount = await spines.count();
  expect(spineCount, 'nothing is proven by a shelf with no spines').toBeGreaterThan(0);

  const timber = shelf.locator('> div').first();
  const box = await timber.boundingBox();
  const column = await shelf.boundingBox();
  expect(box, 'the shelf must have a measurable box').not.toBeNull();
  expect(column, 'the content column must have a measurable box').not.toBeNull();
  if (box === null || column === null) return;

  /**
   * The floor: a shelf is furniture and has a length. Asserted as a fraction of
   * the CONTENT COLUMN rather than of the viewport, because that is what the
   * shelf sits in and what it looked lost inside.
   */
  expect(
    box.width / column.width,
    `the shelf is ${Math.round(box.width)}px in a ${Math.round(column.width)}px column — a tile, not a shelf`,
  ).toBeGreaterThan(0.3);

  // The rightmost edge any spine reaches, across every row.
  let widestReach = 0;
  for (let i = 0; i < spineCount; i += 1) {
    const spine = await spines.nth(i).boundingBox();
    if (spine !== null) widestReach = Math.max(widestReach, spine.x + spine.width);
  }
  expect(widestReach, 'no spine had a measurable box').toBeGreaterThan(0);

  /**
   * The ceiling, and it only applies ABOVE the floor. Below it the shelf is
   * deliberately wider than its records — that is the whole point of a minimum
   * — so trailing space is furniture rather than the defect this half catches.
   */
  const trailing = box.x + box.width - widestReach;
  const atFloor = box.width <= column.width * 0.45;
  if (!atFloor) {
    expect(
      trailing,
      `the shelf runs ${Math.round(trailing)}px past its widest row — it is filling the viewport rather than fitting its records`,
    ).toBeLessThan(40);
  }
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
