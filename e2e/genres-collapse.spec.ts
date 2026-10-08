import { expect, test, type Page } from '@playwright/test';
import { registerCleanup, trackArtist } from './cleanup';
import { OVERFLOWS_THE_MEASURE, WORST } from '../src/app/records/[id]/identity-extremes';
import { seedExtreme } from './identity-extremes';
import { COLLAPSE_TOLERANCE } from '../src/app/records/[id]/genres-run';
import { seedImage } from './seed';
import { getTestDb } from '../test/helpers/db';
import { sql } from 'drizzle-orm';
import { NO_SCROLL_HEIGHT } from '../src/app/records/[id]/band-geometry';
import { login } from './sign-in';

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

/*
  The title, the pressing and the two label variants come from the shared
  extremes module (§27), so this spec and the probe cannot disagree about the
  collection's worst case — the disagreement is how a 16.5px row passed one
  and cut the other.
*/
const FIVE_LINE_TITLE = WORST.title;
/** The genres run's own height: one 13px line at leading-none, no margin. */
const RUN_HEIGHT = 13;

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

/*
  28/collapse-fires (§47) withdrew "the collapse fires on the collection's worst
  title": at the rendered 443 measure that title sets four lines and fits. §46
  rules the collapse a claim about the page -- any record the app can hold --
  so the claim is kept and re-pointed at a synthetic record whose title does
  overflow the measure. Not deleted: the mechanism is live and this is the
  only test that exercises it firing.
*/
test('§27, §46: the collapse FIRES on a record the app can hold whose title overflows the measure, and no fact is clipped', async ({
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
  const id = await seedExtreme(page, OVERFLOWS_THE_MEASURE);
  await page.setViewportSize({ width: 1440, height: NO_SCROLL_HEIGHT });
  await page.goto(`/records/${id}`);
  await page.locator('[data-cell="identity"]').first().waitFor({ timeout: 20_000 });
  await page.waitForTimeout(300);

  const m = await measure(page);

  /* The precondition: this IS the collection's worst case, not a mild one. */
  /* §45 (step 53): five lines was the 412 box; at the cell's rendered measure the worst title sets in four. The count is held to the ladder's own measured count at its chosen step -- the claim under test is the collapse, below. */
  const ladderRaw = await page.locator('[data-title-step]').first().getAttribute('data-ladder');
  const ladder = JSON.parse(ladderRaw ?? '{}') as { chosen: number; steps: Array<{ size: number; lines: number }> };
  expect(m.lines, `the fixture wraps to the ${ladder.steps.find((st) => st.size === ladder.chosen)?.lines} lines the ladder measured at ${ladder.chosen}`).toBe(ladder.steps.find((st) => st.size === ladder.chosen)?.lines);
  expect(m.lines, 'a title that overflows the measure: five or more lines at 72').toBeGreaterThanOrEqual(5);
  expect(m.formatHeight, 'a format line for the count to append to').not.toBeNull();

  /* The collapse fired: the run is gone and the count stands in its place. */
  expect(m.genresListed, 'the run has yielded').toBe(false);
  expect(m.count, `the count is the ${OVERFLOWS_THE_MEASURE.genres.length} withheld`).toBe(OVERFLOWS_THE_MEASURE.genres.length);
  for (const name of OVERFLOWS_THE_MEASURE.genres) {
    expect(m.cellText, `${name} is withheld, not shown`).not.toContain(name);
  }

  /* §18 and §27 both: yielding a run is the answer, clipping a fact is not. */
  expect(m.overflows, 'and with it yielded, nothing overflows').toBe(false);
  expect(m.inner - m.needed, `fits with ${(m.inner - m.needed).toFixed(1)}px to spare once the run has yielded`).toBeGreaterThanOrEqual(0);

  /* Costs no height: the count appends to a line already set. */
  expect(m.countIsLink, 'the count opens the pressing editor').toBe(true);
  expect(m.formatHeight, 'the format line is still one line').toBeLessThan(30);
});
