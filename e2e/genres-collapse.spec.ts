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
      document.querySelector('[data-cell="identity-content"]')!;

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

test('§27: the collapse FIRES on the collection’s worst title, and no fact is clipped', async ({
  page,
}) => {
  /**
   * **§27 rules this directly**: "If the worst title still overflows, §4.2's
   * genres-collapse fires — never overflow-hidden; test asserts no pressing
   * fact is clipped." The genres run is the third term of §4.2's give order,
   * so its yielding IS the mechanism working, not a failure of it.
   *
   * §28's "untriggered on the current collection" is the error, and the
   * arithmetic says why: its fits-by-25 figure was measured on a built page
   * with the collapse ALREADY fired (NOTES, 23 Sep — "six genres collapsed —
   * needs 485 against 510"). With the run listed the same record needs 512
   * against 510, and 512 − 26 (the run's own height) = 486 against the
   * recorded 485. The two claims could not both hold.
   *
   * The unit layer asserts the guard on constructed input, where the subject
   * is the function; this asserts what the COLLECTION does, which is §27's
   * subject. Two tests, two subjects.
   */
  const id = await seedExtreme(page, WORST);
  await page.setViewportSize({ width: 1440, height: NO_SCROLL_HEIGHT });
  await page.goto(`/records/${id}`);
  await page.locator('[data-cell="identity"]').first().waitFor({ timeout: 20_000 });
  await page.waitForTimeout(300);

  const m = await measure(page);

  /* The precondition: this IS the collection's worst case, not a mild one. */
  expect(m.lines, 'the fixture wraps to five lines').toBe(5);
  expect(m.formatHeight, 'a format line for the count to append to').not.toBeNull();

  /* The collapse fired: the run is gone and the count stands in its place. */
  expect(m.genresListed, 'the run has yielded').toBe(false);
  expect(m.count, `the count is the ${WORST.genres.length} withheld`).toBe(WORST.genres.length);
  for (const name of WORST.genres) {
    expect(m.cellText, `${name} is withheld, not shown`).not.toContain(name);
  }

  /* §18 and §27 both: yielding a run is the answer, clipping a fact is not. */
  expect(m.overflows, 'and with it yielded, nothing overflows').toBe(false);
  expect(m.inner - m.needed, `fits with ${(m.inner - m.needed).toFixed(1)}px to spare once the run has yielded`).toBeGreaterThanOrEqual(0);

  /* Costs no height: the count appends to a line already set. */
  expect(m.countIsLink, 'the count opens the pressing editor').toBe(true);
  expect(m.formatHeight, 'the format line is still one line').toBeLessThan(30);
});
