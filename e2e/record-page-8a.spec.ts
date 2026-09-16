import { expect, test, type Page } from '@playwright/test';
import { registerCleanup, trackArtist } from './cleanup';
import { BANDS, NO_SCROLL_HEIGHT, MAX_GRID_WIDTH } from '../src/app/records/[id]/band-geometry';

registerCleanup();

/**
 * **8a on the REAL route** (SPEC.md §10 `/records/:id`).
 *
 * Every assertion 8a has passed so far was made against `/wall/probe/page8a`,
 * which renders `RecordPage8a` from hard-coded literals. That proved the
 * component and proved nothing about the screen: the route went on rendering
 * `RecordGrid`, uncapped, and the cap "not applying" was a probe measured
 * against a page that never had one.
 *
 * So this spec drives the real route, through `hydrateRecord`, on records
 * created via the API — the mapping from a database row to `PageRecord` is the
 * part the probe could not exercise, and it is where a null lands wrong.
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

/**
 * 201 created, or 200 reused.
 *
 * **Both are correct, and asserting 201 alone was a domain error on my part.**
 * §4 makes pressings SHARED and found-or-created: two records of the same
 * pressing are meant to resolve to one row, so the endpoint documents 200 for a
 * reuse. The first run created them and the second reused them, which is the
 * schema working.
 *
 * Suffixing the catalog number per run would have made this green by making
 * every pressing unique — hiding the one behaviour CLAUDE.md §8 calls the worst
 * bug this app can ship.
 */
async function post(page: Page, path: string, data: unknown) {
  const response = await page.request.post(path, { data, failOnStatusCode: false });
  expect([200, 201], `${path} ${JSON.stringify(data)}`).toContain(response.status());
  return response.json();
}

/**
 * The three real records, field-for-field from the collection (measured
 * 2026-09-12) — the same three the probe carries as literals.
 *
 * They are the cases because they are the RANGE: the richest record populates
 * every module, the modal one is what 16 of 17 actually look like, and the
 * emptiest has no Discogs release so its market mark is crossed. A spec that
 * only drove a full record would never see the diagonals.
 */
const CASES = [
  {
    name: 'richest',
    title: 'Never Too Much',
    artist: 'Luther Vandross',
    label: 'Epic',
    catalogNumber: 'FE 36811',
    matrixRunout: 'FE 36811-1A / FE 36811-1B <stamped>',
    countryPressed: 'United States',
    yearPressed: 1981,
    releaseYear: 1981,
    genres: ['Soul', 'Disco'],
    store: 'Academy Records',
    purchasePrice: '18.00',
    conditionMedia: 'VG+',
    conditionSleeve: 'VG',
  },
  {
    name: 'modal',
    title: 'The Hurdy Gurdy Man',
    artist: 'Donovan',
    label: 'Epic',
    catalogNumber: 'BN 26420',
    matrixRunout: 'BN 26420-1A / BN 26420-1B',
    countryPressed: 'United States',
    yearPressed: 1968,
    releaseYear: 1968,
    genres: ['Folk Rock', 'Psychedelic Rock'],
    store: null,
    purchasePrice: null,
    conditionMedia: null,
    conditionSleeve: null,
  },
  {
    name: 'emptiest',
    title: 'Grave New World',
    artist: 'Discharge',
    label: 'Clay Records',
    catalogNumber: null,
    matrixRunout: null,
    countryPressed: 'United Kingdom',
    yearPressed: null,
    releaseYear: 1986,
    genres: [],
    store: null,
    purchasePrice: null,
    conditionMedia: null,
    conditionSleeve: null,
  },
] as const;

type Case = (typeof CASES)[number];

async function createRecord(page: Page, which: Case, suffix: string): Promise<string> {
  const artist = await post(page, '/api/artists', { name: `${which.artist}-${suffix}` });
  trackArtist(artist.id as string);
  /*
    **The label is scoped per record, not per run.** Two of the three real
    records are on Epic, so one `suffix` across all three made the second POST a
    genuine 409 duplicate — §5.4's reference rows are unique by name and were
    right to refuse. The case name disambiguates them.
  */
  const label = await post(page, '/api/labels', { name: `${which.label}-${which.name}-${suffix}` });

  const store =
    which.store === null ? null : await post(page, '/api/stores', { name: `${which.store}-${suffix}` });

  const genreIds: string[] = [];
  for (const genre of which.genres) {
    const created = await post(page, '/api/genres', { name: `${genre}-${suffix}` });
    genreIds.push(created.id as string);
  }

  /*
    A pressing only when there is something to put in it. The emptiest record
    has no catalog number and no matrix, and inventing one would make every
    case a populated case — which is how a spec stops being able to see the
    diagonals it exists to check.
  */
  const pressing =
    which.catalogNumber === null && which.matrixRunout === null && which.yearPressed === null
      ? null
      : await post(page, '/api/pressings', {
          catalogNumber: which.catalogNumber,
          matrixRunout: which.matrixRunout,
          yearPressed: which.yearPressed,
          countryPressed: which.countryPressed,
        });

  const record = await post(page, '/api/records', {
    title: `${which.title} ${suffix}`,
    artistId: artist.id,
    labelId: label.id,
    storeId: store === null ? undefined : store.id,
    pressingId: pressing === null ? undefined : pressing.id,
    releaseYear: which.releaseYear,
    conditionMedia: which.conditionMedia ?? undefined,
    conditionSleeve: which.conditionSleeve ?? undefined,
    purchasePrice: which.purchasePrice ?? undefined,
    genreIds,
  });

  return record.id as string;
}

test.beforeEach(async ({ page }) => {
  await login(page);
});

test('the real route renders 8a, not the old grid', async ({ page }) => {
  /**
   * **The assertion the whole unit turns on.** Everything else here could pass
   * against the probe; this is the one that can only pass on the route.
   *
   * Both halves are load-bearing. Asserting only that 8a is present would stay
   * green if both screens rendered, and asserting only that the grid is gone
   * would stay green on a blank page.
   */
  const suffix = makeSuffix();
  const id = await createRecord(page, CASES[1], suffix);

  await page.goto(`/records/${id}`);

  await expect(page.getByTestId('record-page-8a')).toBeVisible();
  await expect(page.getByTestId('record-grid')).toHaveCount(0);
});

for (const which of CASES) {
  test(`${which.name}: renders on the real route with its facts in its cells`, async ({ page }) => {
    const suffix = makeSuffix();
    const id = await createRecord(page, which, suffix);

    await page.goto(`/records/${id}`);
    const page8a = page.getByTestId('record-page-8a');
    await expect(page8a).toBeVisible();

    /* Located by handle rather than by text: a fact that MOVED must fail. */
    await expect(page8a.locator('[data-field="title"]')).toHaveText(`${which.title} ${suffix}`);
    /*
      By ROLE: the artist is a LINK to the collection filtered by them, and it
      has now been lost twice — once when the grid replaced the header, once
      when 8a replaced the grid. A text assertion passes on plain text and
      loses §10's one click, which is the whole point of the field.
    */
    await expect(
      page8a.getByRole('link', { name: `${which.artist}-${suffix}` }),
    ).toBeVisible();
    await expect(page8a.locator('[data-field="artist"]')).toHaveText(`${which.artist}-${suffix}`);

    if (which.catalogNumber !== null) {
      await expect(page8a.locator('[data-field="pressing-line"]')).toContainText(
        which.catalogNumber,
      );
    }

    /*
      The mapping is what the probe could not test: these values come from
      `hydrateRecord` through the route, not from a literal in a probe file.
    */
    if (which.purchasePrice !== null) {
      await expect(page8a.locator('[data-cell="provenance"]')).toContainText(
        `$${which.purchasePrice}`,
      );
    }
    for (const genre of which.genres) {
      await expect(page8a.locator('[data-field="genres"]')).toContainText(`${genre}-${suffix}`);
    }
  });
}

test('8a renders the genres it is given, as links', async ({ page }) => {
  /**
   * **A fact the screen accepts and never shows.**
   *
   * `PageRecord` declares `genres`, the route supplies them, and
   * `gridModules` carries them into `modules.pressing.genres` — §1.1 says the
   * pressing block carries the genres line. `RecordPage8a` renders no genre
   * anywhere: the rendered text of the richest record goes straight from the
   * pressing line to Provenance.
   *
   * This is a CAPABILITY loss and not only a missing line. `RecordGrid`
   * rendered them as links that filter the collection, and its own comment
   * records that dropping them once already cost §10's "what else is like
   * this" in one click. 8a drops them again.
   *
   * §1.1 puts the genres line in the pressing block, which is where they now
   * render — as LINKS, because `record-detail.spec.ts` asserts §10's "what else
   * is like this in one click" and plain text would have satisfied a text
   * assertion while losing the capability.
   */
  const suffix = makeSuffix();
  const id = await createRecord(page, CASES[0], suffix);
  await page.goto(`/records/${id}`);

  for (const genre of CASES[0].genres) {
    /* By ROLE, so plain text cannot satisfy it. */
    await expect(
      page.getByTestId('record-page-8a').getByRole('link', { name: `${genre}-${suffix}` }),
    ).toBeVisible();
  }
});

test('every real record fills 900px exactly, at 1440 and wider', async ({ page }) => {
  /**
   * **The no-scroll claim, asserted against a rendering for the first time.**
   *
   * `band-geometry.test.ts` asserts `BAND_TOTAL === NO_SCROLL_HEIGHT` — four
   * numbers summing to 900 in a pure function. That is arithmetic about
   * constants and cannot fail when the rendered page overflows: the same shape
   * as the colour rule that regressed while 23 tests passed.
   *
   * **It measures 8a, not the document.** The first version of this test
   * measured `documentElement.scrollHeight` and failed by 699px — correctly,
   * because the real route keeps §10's gallery, snippet, market and journal
   * below the seam, and the probe rendered 8a alone. Those sections are MEANT
   * to scroll. The 900 is a claim about the screen 8a occupies: what a reader
   * sees before scrolling is the whole record, which is the property that dies
   * silently if a band grows.
   *
   * So it asserts 8a's own height is exactly 900 and that it starts within the
   * first viewport — an overflowing band shows up as a taller element whatever
   * is underneath it.
   */
  const suffix = makeSuffix();
  const ids: Array<[string, string]> = [];
  for (const which of CASES) {
    ids.push([which.name, await createRecord(page, which, suffix)]);
  }

  for (const width of [1440, MAX_GRID_WIDTH]) {
    await page.setViewportSize({ width, height: NO_SCROLL_HEIGHT });

    for (const [name, id] of ids) {
      await page.goto(`/records/${id}`);
      const page8a = page.getByTestId('record-page-8a');
      await expect(page8a).toBeVisible();

      const box = await page8a.boundingBox();
      if (box === null) throw new Error(`${name}: no box`);

      /*
        **8a's own bands are 847; the nav's 53 is `AppHeader`, outside it.**
        Measured 847 on the first run of this assertion, which is exactly
        900 - BANDS.nav — the budget was right and the element was wrong.

        **Summed from the bands rather than subtracted from the total**, which
        is not a cosmetic difference: `900 - nav` is 847 whatever the identity
        and record bands are individually, so it survived the identity band
        taking the tail's 47px without registering the change. The bands are
        the claim; the total is their consequence.
      */
      const bands = BANDS.identity + BANDS.record + BANDS.tail;
      expect(bands, 'the bands below the nav spend the rest of the screen').toBe(
        NO_SCROLL_HEIGHT - BANDS.nav,
      );
      expect(Math.round(box.height), `${name} at ${width}: 8a is ${box.height}px, not ${bands}`).toBe(bands);

      /*
        And the two together fill the screen exactly: 8a starts where the
        header ends, so a header that grew would push the record off the fold
        while 8a's own height stayed correct.
      */
      expect(Math.round(box.y), `${name} at ${width}: 8a starts at ${box.y}, not below a ${BANDS.nav}px nav`).toBe(
        BANDS.nav,
      );
    }
  }
});

test('the page caps, and the header caps with it', async ({ page }) => {
  /**
   * **The nav and the page are one measure.** The header sat outside the cap
   * carrying its own `max-w-6xl` (1152) while the grid capped at 1728, so the
   * nav was narrower than the page and left-aligned against it — visible on the
   * probe too, and reported from the rendered screen rather than from any test.
   *
   * Asserted as EQUAL WIDTH and SHARED LEFT EDGE rather than as a class name: a
   * `max-w` cancelled by an ancestor passes a class check, which is unit 20's
   * breakout defect exactly.
   */
  const suffix = makeSuffix();
  const id = await createRecord(page, CASES[0], suffix);

  for (const width of [1440, 2560]) {
    await page.setViewportSize({ width, height: NO_SCROLL_HEIGHT });
    await page.goto(`/records/${id}`);
    await expect(page.getByTestId('record-page-8a')).toBeVisible();

    const measured = await page.evaluate(() => {
      const page8a = document.querySelector('[data-testid="record-page-8a"]');
      const bar = document.querySelector('header > div');
      if (page8a === null || bar === null) throw new Error('missing page or header bar');
      const p = page8a.getBoundingClientRect();
      const h = bar.getBoundingClientRect();
      return { pw: Math.round(p.width), pl: Math.round(p.left), hw: Math.round(h.width), hl: Math.round(h.left) };
    });

    const expected = Math.min(width, MAX_GRID_WIDTH);
    expect(measured.pw, `page width at ${width}`).toBe(expected);
    expect(measured.hw, `header width at ${width}`).toBe(expected);
    /* Same measure AND same edge — equal widths off by an offset still misalign. */
    expect(measured.hl, `header left at ${width} (page ${measured.pl})`).toBe(measured.pl);
  }
});

test('the journal is named once, on its own section', async ({ page }) => {
  /**
   * **This test has now been superseded twice, and both times the claim
   * survived while its ground moved.**
   *
   * §8.3 removed a stacked-column `<h2>` that duplicated the frame's journal
   * cell label, and the test asserted "once". §9.1 then made a section label
   * structural, so the word returned and the test asserted "twice — the frame's
   * cell and the rail". Now the frame has no journal cell at all: the journal
   * has its own section at the bottom of the page and the frame's last cell
   * carries `Note` — the owner's note, in the field-name register of the
   * frame; the §9 section keeps `About this record`.
   *
   * So it is once again — but the surviving instance is the SECTION's, where
   * before it was the frame's. Asserted as a count over the page plus which
   * one remains, because "once" alone would pass if the section lost its label
   * and the frame kept a cell.
   */
  const suffix = makeSuffix();
  const id = await createRecord(page, CASES[0], suffix);
  await page.goto(`/records/${id}`);
  await expect(page.getByTestId('record-page-8a')).toBeVisible();

  await expect(
    page.getByTestId('record-page-8a').getByText('Journal', { exact: true }),
    'the frame has no journal cell',
  ).toHaveCount(0);

  await expect(
    page.locator('[data-section="journal"] [data-cell="label"]').getByText('Journal', {
      exact: true,
    }),
    "§9.1's label span",
  ).toHaveCount(1);

  await expect(
    page.locator('main').getByText('Journal', { exact: true }),
    'named once on the screen',
  ).toHaveCount(1);
});
