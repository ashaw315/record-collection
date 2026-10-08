import { expect, test, type Page } from '@playwright/test';
import { registerCleanup, trackArtist } from './cleanup';
import { seedImage } from './seed';
import { getTestDb } from '../test/helpers/db';
import { sql } from 'drizzle-orm';
import { GRID_FORK, NO_SCROLL_HEIGHT } from '../src/app/records/[id]/band-geometry';
import { login } from './sign-in';

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

  /* §53 (step 60a): the About has one cell. The lower row, its label and its controls are gone; the controls sit in the frame cell under the prose. */
  await expect(page.locator('[data-section="snippet"]'), 'no lower About row').toHaveCount(0);
  await expect(page.getByText('About this record', { exact: true }), 'no second heading for the About').toHaveCount(0);
  await expect(frame.getByTestId('snippet-edit'), 'the editor’s controls are in the frame cell').toHaveCount(1);
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
test('an About longer than its cell scrolls inside it: focusable, labelled, the scrollbar taking width, no clamp and no more link (§42)', async ({ page, playwright }) => {
  const suffix = makeSuffix();
  const id = await aRecord(page, suffix);
  const long = `${suffix} ` + 'A sentence about the record that goes on for a while and then some more. '.repeat(10);
  await getTestDb().execute(sql`UPDATE records SET snippet = ${long} WHERE id = ${id}::uuid`);
  /* At the fork the cell's height is fixed, so the region scrolls; below it the cell is sized by its content and the whole text sets (§41). */
  await page.setViewportSize({ width: GRID_FORK, height: NO_SCROLL_HEIGHT });
  await page.goto(`/records/${id}`);
  await page.getByTestId('record-page-8a').waitFor({ timeout: 20_000 });
  await page.waitForTimeout(600);
  const about = page.getByTestId('record-page-8a').locator('[data-field="about"]');
  await expect(about, 'the whole text is in the frame').toContainText('and then some more.');
  await expect(about).toHaveAttribute('role', 'region');
  await expect(about).toHaveAttribute('aria-label', 'About this record');
  await expect(about).toHaveAttribute('tabindex', '0');
  await expect(about, 'the frame says it scrolls').toHaveAttribute('data-scrolls');
  const m = await about.evaluate((node) => { const el = node as HTMLElement; return ({ overflowY: getComputedStyle(el).overflowY, scrollHeight: el.scrollHeight, clientHeight: el.clientHeight, gutter: el.offsetWidth - el.clientWidth, lineHeight: parseFloat(getComputedStyle(el).lineHeight), top: el.scrollTop }); });
  expect(['auto', 'scroll'], 'a scroll container').toContain(m.overflowY);
  expect(m.scrollHeight, 'the text overflows the region').toBeGreaterThan(m.clientHeight);
  /*
    Headless Chromium hides every scrollbar (--hide-scrollbars), so the
    gutter cannot be seen in this harness's browser; it is measured in a
    second Chromium launched without that flag, which is the browser a
    person has. Measured there: the WebKit rules give 8px while the text
    overflows and 0 when it fits.
  */
  const shown = await playwright.chromium.launch({ ignoreDefaultArgs: ['--hide-scrollbars'] });
  try {
    const ctx = await shown.newContext({ viewport: { width: GRID_FORK, height: NO_SCROLL_HEIGHT } });
    const p2 = await ctx.newPage();
    await login(p2);
    await p2.goto(`/records/${id}`);
    await p2.getByTestId('record-page-8a').waitFor({ timeout: 20_000 });
    await p2.waitForTimeout(600);
    const gutter = await p2.locator('[data-testid="record-page-8a"] [data-field="about"]').evaluate((node) => { const el = node as HTMLElement; return el.offsetWidth - el.clientWidth; });
    expect(gutter, 'the scrollbar takes width: visible while the text overflows, not an overlay that hides at rest').toBeGreaterThan(0);
  } finally {
    await shown.close();
  }
  expect(page.getByTestId('record-page-8a').locator('[data-field="about-more"]'), 'no more link').toHaveCount(0);
  await expect(about).not.toHaveAttribute('data-clamped');
  /* A keyboard can scroll it: focus, then arrow down. */
  await about.focus();
  await page.keyboard.press('ArrowDown');
  await page.waitForTimeout(200);
  expect(await about.evaluate((el) => el.scrollTop), 'scrolled by the keyboard').toBeGreaterThan(0);
  /* A short About: the same region, nothing to scroll, no gutter claimed. */
  await getTestDb().execute(sql`UPDATE records SET snippet = ${`${suffix} short.`} WHERE id = ${id}::uuid`);
  await page.reload();
  await page.getByTestId('record-page-8a').waitFor({ timeout: 20_000 });
  await page.waitForTimeout(600);
  await expect(about).not.toHaveAttribute('data-scrolls');
});

test('the frame counts the images the page shows, names earlier covers, and links to their editor (§62)', async ({ page }) => {
  /**
   * **`Images N Manage →`, in the About cell.** §9.4 marks Images on the
   * ground "the frame shows a count, never the images" — and for two days the
   * frame showed neither: `imageCount` was declared in `PageRecord`, passed by
   * the route, and never rendered. A field with no consumer.
   *
   * **§62 (step 73): the count is what the page shows.** It counted every
   * image row, covers included, so Bitches Brew read Images 5 above one tile.
   * "The Images count counts what the page shows: the displayed cover and
   * the gallery's tiles, and nothing the page does not draw", and the covers
   * it does not show are named "· N earlier covers" before Manage.
   *
   * Asserted with THREE records, so a hard-coded figure cannot pass, and each
   * count is checked against the page it sits beside: the sleeve drawn in the
   * frame plus the tiles drawn in the gallery.
   */
  const suffix = makeSuffix();
  const one = await aRecord(page, suffix);
  const two = await aRecord(page, `${suffix}b`);
  await seedImage({ recordId: two, imageType: 'back' });
  const many = await aRecord(page, `${suffix}c`);
  for (let i = 0; i < 3; i += 1) await seedImage({ recordId: many, imageType: 'cover' });
  await seedImage({ recordId: many, imageType: 'back' });

  for (const [id, expected, earlier] of [
    [one, 1, 0],
    [two, 2, 0],
    [many, 2, 3],
  ] as const) {
    await page.goto(`/records/${id}`);
    await page.getByTestId('record-page-8a').waitFor({ timeout: 20_000 });

    const cell = page.locator('[data-cell="note"]');
    const count = cell.locator('[data-field="image-count"]');

    await expect(count, 'the count renders').toHaveCount(1);
    await expect(count, `${expected} image(s) shown`).toHaveText(String(expected));

    /* The count against the page: one sleeve in the frame, and the gallery's tiles. */
    const drawn = (await page.locator('[data-cover]').count()) + (await page.locator('#images [data-testid="gallery-image"]').count());
    expect(drawn, 'the count is the number of images the page draws').toBe(expected);

    const clause = cell.locator('[data-field="earlier-covers"]');
    if (earlier === 0) await expect(clause, 'no clause where the record holds only what it shows').toHaveCount(0);
    else await expect(cell.locator('[data-field="images-line"]'), 'the earlier covers are named before Manage').toHaveText(new RegExp(`Images\\s*${expected}\\s*·\\s*${earlier} earlier covers\\s*·\\s*Manage`, 'i'));

    /* Manage is the same vocabulary as the genres count: a link to the editor. */
    const manage = cell.getByRole('link', { name: /Manage/ });
    await expect(manage, 'Manage is a link, not text').toHaveCount(1);
    await expect(manage).toHaveAttribute('href', '#images');

    /* And the editor it names exists on the page, so the link lands. */
    await expect(page.locator('#images[data-section="images"]')).toHaveCount(1);
  }
});

/**
 * §62 (step 73): "Measure how the extended control line wraps in the About
 * cell at 390, 960, 1000, 1439, 1440 and 1920, at the largest earlier-cover
 * count the collection holds, and report rows taken and whether the prose
 * region keeps §53's seven-line floor." The largest count is three: Bitches
 * Brew's four covers. The About is a generated one, whose by-line is the
 * longer of the two.
 *
 * **The claim is a comparison, because the floor alone would blame §62 for
 * what it did not do.** Measured 2 Oct on this fixture: the line is one row
 * at all six widths and the prose holds the same lines with the clause as
 * without it -- 10 at 390, 4 at 960 and 1000, 3 at 1439, 8 at 1440 and 1920.
 * From 960 to 1439 the prose is under seven lines with or without the
 * clause: §53 measured its floor in the 1440 cell ("at 263") and the packed
 * band below the fork is shorter. That is recorded in NOTES for Design and
 * is not this line's doing, so the floor is asserted only where §53 ruled
 * it and the comparison is asserted everywhere.
 *
 * **What this cannot reach, and what does:** `.env.test` leaves writing
 * unconfigured, so the control line on a seeded record has no "Write a new
 * one" and rests one row, where a configured page's rests two. The prose
 * figure here at 1440 and above is therefore 8 with 17px to spare; the
 * configured page's is 8 with none, and is held by the probe tests below.
 */
for (const width of [390, 960, 1000, 1439, 1440, 1920]) {
  test(`§62 at ${width}: the Images line with three earlier covers is one row inside the cell, and costs the prose no line`, async ({ page }) => {
    await login(page);
    const id = await aRecord(page, makeSuffix());
    for (let i = 0; i < 3; i += 1) await seedImage({ recordId: id, imageType: 'cover' });
    await seedImage({ recordId: id, imageType: 'back' });
    await getTestDb().execute(
      sql`UPDATE records SET snippet = ${'A long About, so the region scrolls and its budget is what the cell can hold. '.repeat(8)}, snippet_edited_at = NULL WHERE id = ${id}::uuid`,
    );
    await page.setViewportSize({ width, height: width === 390 ? 844 : NO_SCROLL_HEIGHT });

    const measure = async () => {
      await page.goto(`/records/${id}`);
      await page.getByTestId('record-page-8a').waitFor({ timeout: 20_000 });
      await page.locator('[data-field="about"][data-line-budget]').waitFor({ timeout: 10_000 });
      return page.evaluate(() => {
        const cell = document.querySelector('[data-cell="note"]');
        const line = cell?.querySelector('[data-field="images-line"]') ?? null;
        let lineRows: number | null = null;
        if (line !== null) {
          const range = document.createRange();
          range.selectNodeContents(line);
          lineRows = new Set(Array.from(range.getClientRects()).filter((r) => r.width > 0).map((r) => Math.round(r.top))).size;
        }
        const foot = line?.getBoundingClientRect();
        const box = cell?.getBoundingClientRect();
        return {
          text: (line?.textContent ?? '').replace(/\s+/g, ' ').trim().toLowerCase(),
          lineRows,
          budget: Number(cell?.querySelector('[data-field="about"]')?.getAttribute('data-line-budget')),
          footCut: foot === undefined || box === undefined ? null : Math.round(foot.bottom - box.bottom),
        };
      });
    };

    const extended = await measure();
    /* The baseline: the same record holding only the cover it shows. */
    await getTestDb().execute(
      sql`DELETE FROM images WHERE record_id = ${id}::uuid AND image_type = 'cover'
            AND id NOT IN (SELECT id FROM images WHERE record_id = ${id}::uuid AND image_type = 'cover' ORDER BY created_at DESC, id DESC LIMIT 1)`,
    );
    const plain = await measure();
    test.info().annotations.push({ type: '§62 measure', description: `${width}: extended ${JSON.stringify(extended)} plain ${JSON.stringify(plain)}` });

    /* The preconditions, asserted: the two pages differ by the clause and nothing else. */
    expect(extended.text, 'the line under test is the extended one').toBe('images 2 · 3 earlier covers · manage →');
    expect(plain.text, 'and the baseline carries no clause').toBe('images 2 manage →');

    expect(extended.lineRows, `the Images line's rows at ${width}`).toBe(1);
    expect(extended.footCut, 'the line is inside the cell, not clipped at its floor').toBeLessThanOrEqual(0);
    expect(extended.budget, `the prose holds as many lines with the clause as without, at ${width}`).toBe(plain.budget);
    if (width >= GRID_FORK) expect(extended.budget, `§53's seven-line floor, in the cell it was ruled for, at ${width}`).toBeGreaterThanOrEqual(7);
  });
}

/**
 * §62 against the FULL control line -- "Written by Claude · Edit · Delete ·
 * Write a new one", the one §53 measured at 51 characters and two rows.
 *
 * The seeded-record tests above run where writing is unconfigured, so their
 * control line is a row shorter and their prose figure flatters a real
 * page: the region there is 173px, 8.9 lines, and reads 8; with the full
 * line it is 156px, exactly 8.0 at 19.5px. The probe page renders the
 * configured form (`?configured=1`), which is the only place this line can
 * be drawn beside the extended Images line.
 *
 * Measured 2 Oct at 1440 and 1920: 8 lines with the clause and without it.
 * At the labels' .09em the Images line set "Images 2 · 9999 earlier covers
 * · Manage →" on one row and 10000 took two. Step 80 (5 Oct) set the label
 * system at .10em and the boundary moved: 999 is one row and 1000 is two,
 * re-measured. The second row takes the prose to 7, §53's floor met
 * exactly, at either tracking. The counts are the headroom step 73 asks
 * for, pinned here from both sides.
 */
async function probeAbout(page: Page, width: number, earlier: number) {
  await page.setViewportSize({ width, height: NO_SCROLL_HEIGHT });
  await page.goto(`/wall/probe/page8a?case=richest&generated=1&configured=1&earlier=${earlier}`);
  await page.locator('[data-field="about"][data-line-budget]').waitFor({ timeout: 15_000 });
  return page.evaluate(() => {
    const cell = document.querySelector('[data-cell="note"]');
    const about = cell?.querySelector('[data-field="about"]') ?? null;
    const controls = cell?.querySelector('[data-field="about-controls"]') ?? null;
    const line = cell?.querySelector('[data-field="images-line"]') ?? null;
    /*
      Rows as height over line height. Counting distinct rect tops read the
      control block as four rows: its buttons and text sit at slightly
      different tops within one row.
    */
    const rowsOf = (el: Element | null) => {
      if (el === null) return null;
      return Math.round(el.getBoundingClientRect().height / parseFloat(getComputedStyle(el).lineHeight));
    };
    const lineHeight = about === null ? NaN : parseFloat(getComputedStyle(about).lineHeight);
    return {
      controls: (controls?.textContent ?? '').replace(/\s+/g, ' ').trim(),
      controlRows: rowsOf(controls),
      lineRows: rowsOf(line),
      budget: Number(about?.getAttribute('data-line-budget')),
      /* The region's height in lines, unfloored: the slack the budget attribute hides. */
      linesExact: about === null ? NaN : about.clientHeight / lineHeight,
      footCut: line === null || cell === null || cell === undefined ? null : Math.round(line.getBoundingClientRect().bottom - cell.getBoundingClientRect().bottom),
    };
  });
}

for (const width of [1440, 1920]) {
  test(`§62 at ${width}, full control line: three earlier covers cost the prose no line, and it keeps §53's seven`, async ({ page }) => {
    await login(page);
    const plain = await probeAbout(page, width, 0);
    const extended = await probeAbout(page, width, 3);
    test.info().annotations.push({ type: '§62 measure', description: `${width}: plain ${JSON.stringify(plain)} extended ${JSON.stringify(extended)}` });

    /* The precondition this test exists for: the control line is the full one, on its two rows. */
    expect(extended.controls, 'the control line is the configured one').toBe('Written by Claude · Edit · Delete · Write a new one');
    expect(extended.controlRows, 'and rests on the two rows §53 measured').toBe(2);

    expect(extended.lineRows, 'the Images line is one row').toBe(1);
    expect(extended.footCut, 'inside the cell').toBeLessThanOrEqual(0);
    expect(extended.budget, 'the prose holds as many lines with the clause as without').toBe(plain.budget);
    expect(extended.linesExact, 'and the same height, not only the same floored count').toBe(plain.linesExact);
    expect(extended.budget, "§53's seven-line floor").toBeGreaterThanOrEqual(7);
  });

  test(`§62 at ${width}, full control line: the Images line takes a second row at 1000 earlier covers, not at 999, and the prose is then seven`, async ({ page }) => {
    await login(page);
    const last = await probeAbout(page, width, 999);
    const first = await probeAbout(page, width, 1000);
    test.info().annotations.push({ type: '§62 headroom', description: `${width}: 999 ${JSON.stringify(last)} 1000 ${JSON.stringify(first)}` });

    expect(last.controlRows, 'the full control line, at both counts').toBe(2);
    expect(last.lineRows, '999 earlier covers is still one row').toBe(1);
    expect(first.lineRows, '1000 is the first count that takes another').toBe(2);
    expect(first.footCut, 'the second row is inside the cell, not clipped at its floor').toBeLessThanOrEqual(0);
    expect(first.budget, 'the second row costs the prose one line').toBe(last.budget - 1);
    expect(first.budget, "and leaves §53's floor met, not broken").toBeGreaterThanOrEqual(7);
  });
}
