import { expect, test, type Page } from '@playwright/test';
import { registerCleanup, trackArtist } from './cleanup';
import { seedImage } from './seed';
import { getTestDb } from '../test/helpers/db';
import { sql } from 'drizzle-orm';
import { NO_SCROLL_HEIGHT } from '../src/app/records/[id]/band-geometry';

registerCleanup();

/**
 * §4.2 — **the genres run collapses when the give runs short.**
 *
 * Three things give, in order: the title→pressing gap, then the corner ornament
 * track, then the genres run. The first two are geometry; the third costs a
 * fact, so the format line becomes `Vinyl, LP, Album · 3 genres` with the count
 * underlined, opening the pressing editor. It costs no height because it
 * appends to a line already set.
 *
 * **What this asserts is the ORDER, not a line count.** On the build, the
 * longest title in the collection — the five-line "On The Radio: Greatest Hits
 * Vol. 1 & 2" — is absorbed by the ornament track with 27px to spare at every
 * viewport, because the title block is a fixed 412px measure. The drawing's
 * "20px short" is the build's 27px surplus, so the third give is never reached
 * on that record. The first test says so explicitly rather than pretending; the
 * second uses a record whose facts run one line longer, where it is.
 */

const PASSWORD = process.env.E2E_PASSWORD ?? 'test-password-for-e2e';
const FIVE_LINE_TITLE = 'On The Radio: Greatest Hits Vol. 1 & 2';
/** The genres run's own height: one 13px line at leading-none, no margin. */
const RUN_HEIGHT = 13;

async function login(page: Page) {
  await page.goto('/login');
  await page.locator('form[data-hydrated="true"]').waitFor({ timeout: 15_000 });
  await page.getByLabel('Password').pressSequentially(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL('/');
}

/**
 * Short, because it lands in the pressing line: a long suffix wrapped
 * `Casablanca gc… · NBLP-7119-gc… · United States, 1979` to two lines and made
 * the "fits" record fit by 8px instead of 27. The catalog number carries no
 * suffix at all — pressings are found-or-created, so reuse is correct.
 */
function makeSuffix(): string {
  return Date.now().toString(36).slice(-6);
}

async function post(page: Page, path: string, data: unknown) {
  const response = await page.request.post(path, { data, failOnStatusCode: false });
  expect([200, 201], `${path} ${response.status()}`).toContain(response.status());
  return response.json();
}

/**
 * The five-line title with a normal pressing block: three genres, a short
 * label. This is the collection's longest title, as it actually renders.
 */
async function longestTitle(page: Page, suffix: string, genreNames: string[], label: string) {
  const artist = await post(page, '/api/artists', { name: `Donna Summer ${suffix}` });
  trackArtist(artist.id as string);
  const labelRow = await post(page, '/api/labels', { name: `${label} ${suffix}` });
  const genreIds: string[] = [];
  for (const name of genreNames) {
    const genre = await post(page, '/api/genres', { name: `${name} ${suffix}` });
    genreIds.push(genre.id as string);
  }
  const pressing = await post(page, '/api/pressings', {
    catalogNumber: 'NBLP 7119',
    matrixRunout: 'NBLP-7119-A',
    yearPressed: 1979,
    countryPressed: 'United States',
  });
  /* The format line the count appends to — the ruling's `Vinyl, LP, Album`.
     Without it the count falls to its own line and the "costs no height"
     claim has nothing to be measured against. */
  const format = await post(page, '/api/formats', { name: `Vinyl, LP, Album ${suffix}` });
  const record = await post(page, '/api/records', {
    title: FIVE_LINE_TITLE,
    artistId: artist.id,
    labelId: labelRow.id,
    pressingId: pressing.id,
    formatId: format.id,
    releaseYear: 1979,
    genreIds,
  });
  await seedImage({ recordId: record.id as string, imageType: 'cover' });
  await getTestDb().execute(
    sql`UPDATE records SET spine_colour = ${'#a25829'} WHERE id = ${record.id}::uuid`,
  );
  return { id: record.id as string, genreIds };
}

async function measure(page: Page) {
  return page.evaluate(() => {
    const cell =
      document.querySelector('[data-cell="identity"] [data-cell="identity"]') ??
      document.querySelector('[data-cell="identity"]')!;
    const track = cell.querySelector('[data-track="ornament"]')!;
    const content = cell.querySelector('[data-track="content"]')!;
    const title = cell.querySelector('[data-field="title"]')!;
    const style = getComputedStyle(cell);
    const inner =
      cell.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom);
    const range = document.createRange();
    range.selectNodeContents(title);
    const lines = [...range.getClientRects()].filter((r) => r.width > 0).length;
    const count = cell.querySelector('[data-field="genre-count"]');
    const format = cell.querySelector('[data-field="format"]');
    return {
      lines,
      track: Math.round(track.getBoundingClientRect().height * 10) / 10,
      inner: Math.round(inner),
      needed: Math.round(content.scrollHeight),
      overflows: cell.scrollHeight > cell.clientHeight,
      genresListed: cell.querySelector('[data-field="genres"]') !== null,
      count: count === null ? null : Number(count.textContent),
      countIsLink: count?.closest('a') !== null,
      countHref: count?.closest('a')?.getAttribute('href') ?? null,
      formatHeight: format === null ? null : Math.round(format.getBoundingClientRect().height),
      cellText: (cell.textContent ?? '').replace(/\s+/g, ' '),
    };
  });
}

test.beforeEach(async ({ page }) => {
  await login(page);
});

test('the longest title in the collection is absorbed by the track, and does not collapse', async ({
  page,
}) => {
  /**
   * **Said plainly, because the drawing says otherwise.** §4.2 draws this record
   * 20px short with the track at zero; the build measures it 27px clear with
   * the track at 27.6. The collapse is the third give and this record never
   * reaches it. A test claiming it fires at five lines would be asserting the
   * drawing against the build, which is the shape the sweep found twice.
   */
  const suffix = makeSuffix();
  const { id } = await longestTitle(page, suffix, ['Disco', 'Soul', 'Pop'], 'Casablanca');
  await page.setViewportSize({ width: 1440, height: NO_SCROLL_HEIGHT });
  await page.goto(`/records/${id}`);
  await page.locator('[data-cell="identity"]').first().waitFor({ timeout: 20_000 });
  await page.waitForTimeout(300);

  const m = await measure(page);

  expect(m.lines, 'the five-line title').toBe(5);
  /* The line the count would append to, present on both fixtures: without a
     format line the collapse has nothing to append to and the "costs no
     height" claim is unmeasurable — which is how the first fixture found out. */
  expect(m.formatHeight, 'a format line to append to').not.toBeNull();
  /* The run is already inside `needed`; "fits" is any surplus at all. The
     track is what is left over, and it is >0 exactly when nothing overflows. */
  expect(m.inner - m.needed, `fits with ${m.inner - m.needed}px to spare`).toBeGreaterThanOrEqual(0);
  expect(m.track, 'the track still holds what the content did not need').toBeGreaterThan(0);
  expect(m.overflows, 'and nothing overflows').toBe(false);

  /* So the run is shown in full and there is no count. */
  expect(m.genresListed, 'the genres are listed').toBe(true);
  expect(m.count, 'no count while every genre is shown').toBeNull();
  for (const name of ['Disco', 'Soul', 'Pop']) {
    expect(m.cellText).toContain(`${name} ${suffix}`);
  }
});

test('the run collapses only once the track is exhausted, and the count is what is withheld', async ({
  page,
}) => {
  /**
   * A record whose facts run one line longer than the longest title's: a label
   * long enough to wrap the pressing line, and six genres that wrap the run.
   * That is the state the third give exists for, and the only way to reach it
   * on the build's geometry.
   *
   * Three claims. The track is at zero — the second give was used up before
   * the third fired. The count equals the genres NOT shown, and none of their
   * names is on the cell, so it cannot say three while three are visible. And
   * the format line is one line tall, because the count appends to a line
   * already set and costs no height.
   */
  const suffix = makeSuffix();
  const genres = ['Disco', 'Soul', 'Pop', 'Funk', 'Electronic', 'Hi-NRG'];
  const { id } = await longestTitle(
    page,
    suffix,
    genres,
    'Casablanca Record and FilmWorks International',
  );
  await page.setViewportSize({ width: 1440, height: NO_SCROLL_HEIGHT });
  await page.goto(`/records/${id}`);
  await page.locator('[data-cell="identity"]').first().waitFor({ timeout: 20_000 });
  await page.waitForTimeout(300);

  const m = await measure(page);

  expect(m.lines, 'still the five-line title').toBe(5);
  expect(m.formatHeight, 'a format line to append to — the precondition').not.toBeNull();
  /*
    **Measured after the collapse, so the track has already taken back what the
    run freed** — asserting it at zero here was checking the wrong moment. The
    claim is that the run could not have stayed: whatever room the track holds
    now is less than the run needs, so putting it back would overflow again.
    `RUN_HEIGHT` is the run's own line — 13px at `text-prose leading-none`,
    no margin — and the first test asserts the converse on the record that
    fits.
  */
  expect(
    m.inner - m.needed,
    `less room left (${m.inner - m.needed}px) than the run needs (${RUN_HEIGHT}px): inner ${m.inner}, needed ${m.needed}, track ${m.track}`,
  ).toBeLessThan(RUN_HEIGHT);

  expect(m.count, `the count is the ${genres.length} withheld`).toBe(genres.length);
  expect(m.genresListed, 'no genre is listed beside a count').toBe(false);
  for (const name of genres) {
    expect(m.cellText, `${name} is withheld, not shown`).not.toContain(`${name} ${suffix}`);
  }

  expect(m.countIsLink, 'the count opens the pressing editor').toBe(true);
  expect(m.countHref).toBe(`/records/${id}/edit`);

  /* Costs no height: after the collapse the content fits, and the format line
     is one line — the count did not wrap it. */
  expect(m.overflows, 'the collapse closed the shortfall').toBe(false);
  expect(m.formatHeight, 'one line').toBeLessThan(30);
});
