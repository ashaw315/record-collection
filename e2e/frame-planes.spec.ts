import { expect, test, type Page } from '@playwright/test';
import { registerCleanup, trackArtist } from './cleanup';
import { seedImage } from './seed';
import { getTestDb } from '../test/helpers/db';
import { sql } from 'drizzle-orm';
import { GRID_FORK, NO_SCROLL_HEIGHT } from '../src/app/records/[id]/band-geometry';

registerCleanup();

/**
 * §5.1 — **a mark that touches a page edge is a flat plane; a mark that does
 * not is an isometric solid.**
 *
 * **Nothing tested that a mark is the shape its name says**, and that is how
 * the frame ended up with three cubes called `identityTriangle`,
 * `provenanceArc` and `aboutArc`. They were built flat, correctly replaced with
 * isometric solids under a ruling on 13 Sep, and that ruling was later reversed
 * in the drawing — *"that was true for one turn, under the withdrawn isometric
 * ruling, and is not true now"* — with nothing propagating to the build.
 *
 * **When a ruling is reversed, the code implementing the original does not
 * fail.** No test breaks, no type changes, and the only evidence was three
 * names disagreeing with what they drew.
 *
 * So this asserts the SHAPE, which is the claim the names were making: a plane
 * is one fill, and a solid is three faces at three lightnesses.
 */

const PASSWORD = process.env.E2E_PASSWORD ?? 'test-password-for-e2e';

async function login(page: Page) {
  await page.goto('/login');
  await page.locator('form[data-hydrated="true"]').waitFor({ timeout: 15_000 });
  await page.getByLabel('Password').pressSequentially(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL('/');
}

function makeSuffix(): string {
  return `p${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;
}

async function post(page: Page, path: string, data: unknown) {
  const response = await page.request.post(path, { data, failOnStatusCode: false });
  expect([200, 201], `${path} ${response.status()}`).toContain(response.status());
  return response.json();
}

async function aRecord(page: Page, suffix: string): Promise<string> {
  const artist = await post(page, '/api/artists', { name: `Vandross-${suffix}` });
  trackArtist(artist.id as string);
  const pressing = await post(page, '/api/pressings', {
    catalogNumber: `FE-${suffix}`,
    matrixRunout: `MX-${suffix}`,
    yearPressed: 1981,
    countryPressed: 'United States',
  });
  const record = await post(page, '/api/records', {
    title: `Never Too Much ${suffix}`,
    artistId: artist.id,
    pressingId: pressing.id,
    releaseYear: 1981,
    purchasePrice: '18.00',
    notes: `A note ${suffix}`,
  });
  await seedImage({ recordId: record.id as string, imageType: 'cover' });
  /*
    **A journal entry, because the About arc is suppressed on an empty cell
    (§5.4).** Without one the mark the test is written for is not on the page,
    and the assertion would pass or fail for a reason that has nothing to do
    with its shape.
  */
  await post(page, `/api/records/${record.id}/journal`, {
    note: `Bought it ${suffix}`,
    entryDate: '2024-03-14',
  });
  await getTestDb().execute(
    sql`UPDATE records SET spine_colour = ${'#a25829'},
          snippet = ${`Her last album for the label ${suffix}.`}, snippet_edited_at = NOW()
        WHERE id = ${record.id}::uuid`,
  );
  return record.id as string;
}

/** The three §5.1 planes, by the name each already carries. */
/**
 * **Two planes, not three: §28 withdraws the identity triangle** with the
 * ornament track that held it. "The identity cell carries no ornament. Its
 * corner field and ornament track are withdrawn." The claim below — a plane
 * is one painted region, not three faces — is unchanged for the two that
 * remain.
 */
/* `aboutArc` withdrawn by §35; the provenance plane is the one §5.1 quarter-circle left. */
const PLANES = ['provenanceArc'] as const;

test.beforeEach(async ({ page }) => {
  await login(page);
});

test('the three edge fields are flat planes, not isometric solids', async ({ page }) => {
  /**
   * **One fill, no faces.** An isometric solid is three polygons at three
   * opacities — which is exactly what these were rendering, and what makes the
   * distinction checkable without judgement: count the painted regions.
   */
  const suffix = makeSuffix();
  const id = await aRecord(page, suffix);
  await page.goto(`/records/${id}`);
  await page.getByTestId('record-page-8a').waitFor({ timeout: 20_000 });

  const marks = await page.evaluate((names: readonly string[]) =>
    names.map((name) => {
      const mark = document.querySelector(`[data-mark="${name}"]`);
      if (mark === null) return { name, present: false };

      /*
        A solid draws its faces as polygons at three opacities; a plane is one
        painted region. Counting polygons is the check — the opacity set is
        empty for a plane because there are no face nodes to carry one, which
        is a consequence rather than the claim.
      */
      const polygons = mark.querySelectorAll('polygon').length;
      const faceOpacities = Array.from(mark.querySelectorAll('polygon')).map(
        (node) => node.getAttribute('opacity') ?? '1',
      );
      return { name, present: true, polygons, faceOpacities };
    }),
  PLANES as unknown as string[]);

  for (const mark of marks) {
    expect(mark.present, `${mark.name} renders`).toBe(true);
    expect(mark.polygons, `${mark.name} is not built from faces`).toBe(0);
    expect(
      mark.faceOpacities,
      `${mark.name} has no faces to carry three lightnesses`,
    ).toEqual([]);
  }
});

test('each plane is the shape its name says', async ({ page }) => {
  /**
   * **The claim the names were making and nothing checked.** A triangle is a
   * clip path with three points; a quarter-circle is a corner radius on one
   * corner. Read off the computed style, so a mark renamed without being
   * redrawn fails here.
   */
  const suffix = makeSuffix();
  const id = await aRecord(page, suffix);
  await page.goto(`/records/${id}`);
  await page.getByTestId('record-page-8a').waitFor({ timeout: 20_000 });

  const shapes = await page.evaluate(() => {
    const read = (name: string) => {
      const mark = document.querySelector(`[data-mark="${name}"]`);
      if (mark === null) return null;
      const style = getComputedStyle(mark);
      return { clipPath: style.clipPath, borderRadius: style.borderRadius };
    };
    return {
      provenance: read('provenanceArc'),
    };
  });


  for (const [name, arc] of [
    ['provenance', shapes.provenance],
  ] as const) {
    expect(arc, `the ${name} arc renders`).not.toBeNull();
    /* A quarter-circle is one rounded corner, not four. */
    expect(arc?.borderRadius, `${name} is a quarter, not a disc`).toMatch(/\d/);
    expect(arc?.borderRadius, `${name} rounds one corner`).not.toMatch(/^(\d+px)$/);
  }
});

/**
 * **§28 withdrew this test's subject.** It asserted that the identity
 * triangle shrinks with the ornament track as the title grows — §4.2's
 * corner reserve yielding structurally. §28 withdraws both: "A track that
 * holds a triangle on most records and 1px on the worst makes ornament's
 * presence depend on the record. §21 forbids that, and it is the same defect
 * as hashing ornament, reached through the give order instead of the
 * generator."
 *
 * What replaces it is `mark-boxes.test.ts` asserting the mark is gone from
 * the inventory, and `identity-cell.spec.ts` asserting the cell is one track
 * whose whole height is the content's.
 */
/**
 * **§33 (d), amended, and both tests below followed the amendment.**
 *
 * The first version of these asserted journal-first: JOURNAL in the frame
 * when an entry exists, the note leading the section only then. §33 withdrew
 * that within itself (33/journal-first): "The lower frame's last cell shows
 * the record's About, labelled ABOUT... A record with no About shows its
 * latest journal entry instead, date and text; a record with neither shows
 * §6's diagonal." And the note "leaves the frame and leads §9's Journal
 * section, labelled NOTE, above the entries, on every record that has one."
 *
 * The fixture seeds an About, a note and an entry, so every clause is
 * exercised at once: the About wins the frame, the entry yields, the note
 * leads the section.
 */
test('the frame’s last cell is the ABOUT, the entry yields, and the note leads the section (§33)', async ({
  page,
}) => {
  const suffix = makeSuffix();
  const id = await aRecord(page, suffix);
  await page.goto(`/records/${id}`);
  await page.getByTestId('record-page-8a').waitFor({ timeout: 20_000 });

  const frame = page.getByTestId('record-page-8a');
  const journalSection = page.locator('[data-section="journal"]');

  /* The frame: the About under ABOUT, and neither the entry nor the note. */
  await expect(frame.getByText('About', { exact: true }), 'the frame cell is labelled ABOUT').toHaveCount(1);
  /*
    The VISIBLE field, not a text search: the cell keeps a hidden, unclamped
    copy of the About to measure its lines, and a text locator counts both.
  */
  await expect(frame.locator('[data-field="about"]'), 'the About is in the frame').toHaveText(`Her last album for the label ${suffix}.`);
  await expect(frame.locator('[data-field="about"]'), 'once, visibly').toHaveCount(1);
  await expect(frame.getByText(`Bought it ${suffix}`), 'the entry yields to the About').toHaveCount(0);
  await expect(frame.getByText(`A note ${suffix}`), 'the note is not in the frame').toHaveCount(0);
  await expect(frame.getByText('Note', { exact: true }), 'NOTE is not a frame label').toHaveCount(0);
  await expect(frame.getByText('About this record', { exact: true }), 'the section’s label stays out of the frame').toHaveCount(0);

  /* The section: the note leads it, labelled NOTE, above the entries. */
  const lead = journalSection.locator('[data-note-lead]');
  await expect(lead, 'the note leads the Journal section').toHaveCount(1);
  await expect(lead.getByText('Note', { exact: true }), 'labelled NOTE').toHaveCount(1);
  await expect(lead, 'and carries the note').toContainText(`A note ${suffix}`);
  const leadBox = await lead.boundingBox();
  const entryBox = await journalSection.getByText(`Bought it ${suffix}`).first().boundingBox();
  expect(leadBox, 'the lead is laid out').not.toBeNull();
  expect(entryBox, 'the entry is laid out').not.toBeNull();
  expect(leadBox!.y, 'the note LEADS: it sits above the entries').toBeLessThan(entryBox!.y);

  await expect(
    page.locator('[data-section="snippet"] [data-cell="label"]').getByText('About this record', { exact: true }),
    'the lower row keeps its label',
  ).toHaveCount(1);
  /* §33: "The lower About row keeps its controls and drops its text." */
  await expect(page.locator('[data-section="snippet"]').getByText(`Her last album for the label ${suffix}.`), 'the lower row does not repeat the About').toHaveCount(0);
  await expect(page.locator('[data-section="snippet"]').getByTestId('snippet-edit'), 'and keeps its editor controls').toHaveCount(1);
});

test('the note leads the Journal section even with no entry (§33)', async ({ page }) => {
  const suffix = makeSuffix();
  const artist = await post(page, '/api/artists', { name: `Vandross-${suffix}` });
  trackArtist(artist.id as string);
  const record = await post(page, '/api/records', { title: `Never Too Much ${suffix}`, artistId: artist.id, releaseYear: 1981, notes: `A note ${suffix}` });
  await page.goto(`/records/${record.id}`);
  await page.getByTestId('record-page-8a').waitFor({ timeout: 20_000 });
  const lead = page.locator('[data-section="journal"] [data-note-lead]');
  await expect(lead, '“on every record that has one”').toHaveCount(1);
  await expect(lead).toContainText(`A note ${suffix}`);
  await expect(page.getByTestId('record-page-8a').getByText(`A note ${suffix}`), 'and not in the frame').toHaveCount(0);
});

/**
 * §33: "An About longer than ten lines — a hand edit, or one written before
 * this ruling — shows nine lines and more ↓, which opens the lower row's
 * editor with the full text." Measured on the built cell: The Hurdy Gurdy
 * Man's 745 characters set to fourteen lines, so a text of that length is
 * the case.
 */
test('an About past ten lines shows nine and more ↓, which reaches the editor (§33)', async ({ page }) => {
  const suffix = makeSuffix();
  const id = await aRecord(page, suffix);
  const long = `${suffix} ` + 'A sentence about the record that goes on for a while and then some more. '.repeat(10);
  await getTestDb().execute(sql`UPDATE records SET snippet = ${long} WHERE id = ${id}::uuid`);
  /*
    **At the frame's reference width.** The clamp is measured against the
    cell the page draws: below the 1440 fork the lower frame is one column
    and this same text sets to four lines in a 1242px cell, so nothing
    clamps -- correctly. Playwright's default viewport is 1280.
  */
  await page.setViewportSize({ width: GRID_FORK, height: NO_SCROLL_HEIGHT });
  await page.goto(`/records/${id}`);
  await page.getByTestId('record-page-8a').waitFor({ timeout: 20_000 });
  await page.waitForTimeout(600);

  const about = page.getByTestId('record-page-8a').locator('[data-field="about"]');
  /*
    **The measuring copy is the paragraph's width.** It spanned the cell's
    padding once, 358 against 322, and counted ten lines where the page drew
    eleven; a probe that is not the element measures something else.
  */
  const widths = await page.evaluate(() => {
    const cell = document.querySelector('[data-cell="note"]') as HTMLElement;
    const p = cell.querySelector('[data-field="about"]') as HTMLElement;
    const probe = cell.querySelector('p[aria-hidden="true"]') as HTMLElement;
    return { paragraph: p.getBoundingClientRect().width, probe: probe.getBoundingClientRect().width };
  });
  expect(widths.probe, `the probe (${widths.probe}) measures on the paragraph's own width (${widths.paragraph})`).toBeCloseTo(widths.paragraph, 0);
  /* Presence, not value: the attribute is a boolean marker written as an empty string. */
  await expect(about).toHaveAttribute('data-clamped');
  const m = await about.evaluate((el) => ({ lines: Math.round(el.getBoundingClientRect().height / parseFloat(getComputedStyle(el).lineHeight)), clamp: getComputedStyle(el).webkitLineClamp }));
  expect(m.lines, 'nine visible lines').toBe(9);
  expect(m.clamp).toBe('9');

  const more = page.getByTestId('record-page-8a').locator('[data-field="about-more"]');
  await expect(more).toHaveText('more ↓');
  await expect(more).toHaveAttribute('href', '#snippet');
  await more.click();
  await expect(page).toHaveURL(/#snippet$/);
  await expect(page.locator('#snippet')).toBeInViewport();
});

test('the frame counts the images and links to their editor', async ({ page }) => {
  /**
   * **`Images N Manage →`, in the About cell.** §9.4 marks Images on the
   * ground "the frame shows a count, never the images" — and for two days the
   * frame showed neither: `imageCount` was declared in `PageRecord`, passed by
   * the route, and never rendered. A field with no consumer.
   *
   * The count is kept where the date was struck, and the rule that decides it
   * splits on WHY a constant is constant. purchase_date is constant because the
   * app abandoned the field — nothing will ever write it. The image count is
   * constant because the collection is unphotographed: the schema carries
   * cover, gatefold left, gatefold right and back, so one image per record is a
   * backlog rather than a ceiling. A rule reading texture from an unfilled
   * field measures the backlog rather than the design.
   *
   * Asserted with TWO counts, so a hard-coded "1" cannot pass: a record with
   * one image and a record with two.
   */
  const suffix = makeSuffix();
  const one = await aRecord(page, suffix);
  const two = await aRecord(page, `${suffix}b`);
  await seedImage({ recordId: two, imageType: 'back' });

  for (const [id, expected] of [
    [one, 1],
    [two, 2],
  ] as const) {
    await page.goto(`/records/${id}`);
    await page.getByTestId('record-page-8a').waitFor({ timeout: 20_000 });

    const cell = page.locator('[data-cell="note"]');
    const count = cell.locator('[data-field="image-count"]');

    await expect(count, 'the count renders').toHaveCount(1);
    await expect(count, `${expected} image(s)`).toHaveText(String(expected));

    /* Manage is the same vocabulary as the genres count: a link to the editor. */
    const manage = cell.getByRole('link', { name: /Manage/ });
    await expect(manage, 'Manage is a link, not text').toHaveCount(1);
    await expect(manage).toHaveAttribute('href', '#images');

    /* And the editor it names exists on the page, so the link lands. */
    await expect(page.locator('#images[data-section="images"]')).toHaveCount(1);
  }
});
