import { expect, test, type Page } from '@playwright/test';
import { registerCleanup, trackArtist } from './cleanup';
import { WORST } from '../src/app/records/[id]/identity-extremes';
import { seedExtreme } from './identity-extremes';
import { COLLAPSE_TOLERANCE } from '../src/app/records/[id]/genres-run';
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
 * **What this asserts is the CONDITION, not a line count**: the run collapses
 * when the ornament track has resolved to 0 and the remaining growth still
 * exceeds the gap. "Five lines" was a proxy, and it fires wrongly the moment the
 * type stack or the measure moves — which happened. The drawing's give
 * arithmetic (20px short at five lines) was computed against a stack ~69px
 * taller than the built one; a text stack's height is a measurement rather than
 * a decision, and the build is authoritative on it. On the build the longest
 * title in the collection leaves the track 27px at every viewport, so no record
 * collapses today. The first test says so; the second reaches the condition
 * with a record whose facts run one line longer.
 */

const PASSWORD = process.env.E2E_PASSWORD ?? 'test-password-for-e2e';
/*
  The title, the pressing and the two label variants come from the shared
  extremes module (§27), so this spec and the probe cannot disagree about the
  collection's worst case — the disagreement is how a 16.5px row passed one
  and cut the other.
*/
const FIVE_LINE_TITLE = WORST.title;
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
async function measure(page: Page) {
  return page.evaluate(() => {
    const cell =
      document.querySelector('[data-cell="identity"] [data-cell="identity"]') ??
      document.querySelector('[data-cell="identity"]')!;

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

test('§28: the collapse fires on NO record in the collection, including its worst title', async ({
  page,
}) => {
  /**
   * **The fixture-level half of the guard, and its subject is the
   * COLLECTION.** §4.2 says it three times — "the collapse fires on no record
   * in the collection today", "the condition is unmet on all seventeen" — and
   * §28 confirms the real worst record "fits with 25px to spare".
   *
   * The guard's own behaviour is asserted at the unit level on constructed
   * input (`genres-run.test.ts`), where the subject is the FUNCTION and no
   * claim is made about the collection. Two tests, two subjects: §27's rule
   * forbids altering a fixture along the axis it measures, because a fixture
   * stands in for the collection; a constructed case makes no claim about the
   * collection at all.
   *
   * **The previous version asserted the opposite of §4.2** — it reached the
   * collapse on a fixture whose twelve-character artist suffix added a 40px
   * line, which is §27's third recorded instance of exactly that defect.
   *
   * And the mechanism it credited is gone: §28 withdrew the identity cell's
   * ornament track, so nothing is "absorbed by the track". What remains is
   * the cell's own height, which the content fits inside.
   */
  /*
    **The SHARED fixture, not a local seeder.** The helper this replaced
    appended the isolation suffix to the artist — `Donna Summer ${suffix}` —
    which wraps it to a second 40px line and inflates the cell by exactly the
    axis under test. That is §27's named defect and this is its fourth
    instance; `seedExtreme` suffixes a field the assertion does not read and
    keeps the artist one line, which the precondition below asserts.
  */
  const id = await seedExtreme(page, WORST);
  await page.setViewportSize({ width: 1440, height: NO_SCROLL_HEIGHT });
  await page.goto(`/records/${id}`);
  await page.locator('[data-cell="identity"]').first().waitFor({ timeout: 20_000 });
  await page.waitForTimeout(300);

  const m = await measure(page);

  /* The precondition: this IS the collection's worst case, not a mild one. */
  expect(m.lines, 'the fixture wraps to five lines').toBe(5);
  expect(m.formatHeight, 'a format line the count could have appended to').not.toBeNull();

  /**
   * **KNOWN-FAILING, and the open question is named.** §28 says the worst
   * record "fits with 25px to spare"; the build measures 512 against 510 with
   * the run LISTED, a 2px overage, and one fact clipped by 0.9px.
   *
   * The 27px between them is settled as arithmetic: §28's figure was measured
   * on a built page with the genres run COLLAPSED (NOTES, 23 Sep — "six
   * genres collapsed — needs 485 against 510"), and the run is 26px tall when
   * listed. 512 − 26 = 486 against the recorded 485. Neither number is wrong;
   * they are two states of one record.
   *
   * What is NOT settled, and is Design's: §28 quotes a fits-by-25 figure
   * obtained with the collapse already fired, while also calling the clause
   * "untriggered on the current collection" and §4.2 saying the condition is
   * unmet on all seventeen. If the run must be listed the record does not
   * fit; if it may collapse, the collapse is triggered. §28's own 4px
   * tolerance is why the build lists rather than collapses at −2.
   *
   * Asserted as it stands rather than relaxed, so the resolution moves this
   * line instead of arriving unnoticed.
   */
  expect(m.overflows, 'nothing overflows the cell — see the note above; open with Design').toBe(false);
  expect(m.genresListed, 'every genre is listed').toBe(true);
  expect(m.count, 'and no count, because nothing is withheld').toBeNull();
  for (const name of WORST.genres) {
    expect(m.cellText, `${name} is shown`).toContain(name);
  }

  /*
    Not by a hair: §28 puts the real worst record 25px clear, and the 0.4px
    that once looked like a margin was the suffixed fixture. Asserted so a
    change that leaves it fitting by a rounding fails here rather than
    passing quietly.
  */
  expect(m.inner - m.needed, `fits with ${(m.inner - m.needed).toFixed(1)}px to spare`).toBeGreaterThan(COLLAPSE_TOLERANCE);
});
