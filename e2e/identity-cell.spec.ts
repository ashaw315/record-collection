import { expect, test, type Page } from '@playwright/test';
import { NO_SCROLL_HEIGHT } from '../src/app/records/[id]/band-geometry';
import { login } from './sign-in';

/**
 * 8a §4.2 — the identity cell's structural guard and its line breaking.
 *
 * **The anchor is the property; the fit is a coincidence.** The 38-character
 * title needs 498 of 500px, and a test asserting that passes on 2px of luck. So
 * these assert what the layout GUARANTEES: the pressing block sits on the cell
 * floor at every title length, so the two blocks cannot push each other.
 *
 * **And the break, because the break is the decision.** §7's clamp is retracted
 * — the fault was an orphaned volume number reading as a rendering error, not
 * the title's length. `text-wrap: balance` is a rendering behaviour rather than
 * a guarantee, so what it actually does is measured here rather than trusted.
 *
 * **The hard case is one real record, which is what makes four cases worth
 * asserting.** Measured across the collection: 8 titles take one line, 6 take
 * two, 2 take three, and 1 takes five. That one is
 * `On The Radio: Greatest Hits Vol. 1 & 2` — and it is the same record that is
 * worst on every other axis: no price history, six absent fields, the most
 * chromatic cover. So the five-line case is not a hypothetical stress test, it
 * is a record in the collection, and the anchor has to hold on it.
 *
 * **Measured, not assumed — and the fallback is worse-looking but still
 * correct.** With `balance`, the five lines measure
 * [235, 206, 283, 270, 141]; with it forced off, [235, 206, 283, 365, 43] —
 * the 43px orphan. Same height either way, so where the property is
 * unsupported the title looks worse and nothing overflows. That is the right
 * shape for a rendering behaviour that cannot be guaranteed, and it is asserted
 * in the last test rather than hoped for.
 */

const CASES = ['one', 'two', 'three', 'four', 'five'] as const;

const measure = (page: Page) =>
  page.evaluate(() => {
    const read = (id: string) => {
      const cell = document.querySelector(`[data-case="${id}"]`);
      if (cell === null) return null;
      const title = cell.querySelector('[data-field="title"]');
      const pressing = cell.querySelector('[data-block="pressing"]');
      if (title === null || pressing === null) return null;

      const cellBox = cell.getBoundingClientRect();
      /*
        The content track, whose floor the pressing block anchors to. The CELL's
        floor is 140px lower — that is the ornament track — so the two are
        measured separately rather than one standing in for the other.
      */
      const track = cell.querySelector('[data-track="content"]');
      const trackBox = (track ?? cell).getBoundingClientRect();
      const titleBox = title.getBoundingClientRect();
      const pressingBox = pressing.getBoundingClientRect();

      /* Line boxes, so the BREAK can be asserted rather than inferred. */
      const range = document.createRange();
      range.selectNodeContents(title);
      const lines = [...range.getClientRects()]
        .filter((r) => r.width > 0)
        .map((r) => Math.round(r.width));

      /* §27: the eyebrow is the content track's first child; the title begins at its bottom. */
      const eyebrow = cell.querySelector('[data-field="eyebrow"]');
      const eyebrowBox = eyebrow?.getBoundingClientRect() ?? null;

      return {
        cellBottom: Math.round(cellBox.bottom),
        trackBottom: Math.round(trackBox.bottom),
        cellTop: Math.round(cellBox.top),
        eyebrowBottom: eyebrowBox === null ? null : Math.round(eyebrowBox.bottom),
        titleTop: Math.round(titleBox.top),
        titleHeight: Math.round(titleBox.height),
        pressingBottom: Math.round(pressingBox.bottom),
        lineWidths: lines,
        overflows: cellBox.height < cell.scrollHeight,
      };
    };
    return {
      one: read('one'),
      two: read('two'),
      three: read('three'),
      four: read('four'),
      five: read('five'),
    };
  });

test.describe('the identity cell (§4.2)', () => {
  test.use({ viewport: { width: 2200, height: NO_SCROLL_HEIGHT } });

  /**
   * **THE assertion.** The pressing block's bottom edge sits at the cell floor
   * at every title length — one line and five. A test that measures 498 against
   * 500 passes on a coincidence; this passes on the property.
   */
  test('anchors the pressing block to the cell floor at every title length', async ({ page }) => {
    await login(page);
    await page.goto('/wall/probe/identity');
    await page.locator('[data-case="five"]').waitFor({ timeout: 15_000 });

    const m = await measure(page);

    for (const id of CASES) {
      const c = m[id];
      expect(c, `${id} rendered`).not.toBeNull();
      if (c === null) continue;

      /**
       * **The floor is the CONTENT TRACK's floor, not the cell's.**
       *
       * §4.2 made the identity cell a two-track grid — content at 1fr,
       * ornament at minmax(0, 140px) — so the cell's bottom is now 140px below
       * the content, and this measured 158 (18 + 140). The claim is unchanged:
       * the pressing block anchors to the bottom of the space the content has,
       * and the title cannot push it. What moved is which box that is.
       */
      expect(c.trackBottom - c.pressingBottom, `${id}: pressing sits on the floor`).toBe(0);
    }
  });

  test('flows the title from the top so the two blocks cannot meet', async ({ page }) => {
    await login(page);
    await page.goto('/wall/probe/identity');
    await page.locator('[data-case="five"]').waitFor({ timeout: 15_000 });

    const m = await measure(page);

    for (const id of CASES) {
      const c = m[id];
      if (c === null) continue;

      /*
        **§13 put the eyebrow line above the title, so the figure moved and the
        CLAIM did not.** The title still flows from the top of the content
        track — it is the track's first child — and what sits above it is the
        frame's own top line, which §8.1 rules is the identity band's label.
        18 was the cell's padding when the title was the first thing in the
        cell; now the offset is that padding plus the line.

        Asserted as the relationship rather than as a new constant: the title
        begins immediately below the eyebrow row, so a change to the line's
        size moves both together and this cannot drift.
      */
      expect(c.titleTop, `${id}: title starts at the top of the content track`).toBe(c.eyebrowBottom);
      /* The guard: a growing title spends the gap, never the pressing block. */
      expect(c.overflows, `${id}: nothing overflows the cell`).toBe(false);
    }
  });

  /**
   * **The break is the decision, so the break is what is asserted.** Five lines
   * stay five and are evenly measured: with `balance`, no line is a fraction of
   * the others — the orphaned "2" that read as a rendering error is gone.
   */
  test('balances the five-line title rather than orphaning its last line', async ({ page }) => {
    await login(page);
    await page.goto('/wall/probe/identity');
    await page.locator('[data-case="five"]').waitFor({ timeout: 15_000 });

    const m = await measure(page);
    const five = m.five;
    expect(five).not.toBeNull();
    if (five === null) return;

    /*
      §45 (step 53): the count follows the measure. Five lines was the 412 box;
      at the cell's rendered width (480 less 18 a side) the same title sets in
      four. Unclamped is the claim, so the rendered count is held to the
      ladder's own measured count at the chosen step rather than to a number.
    */
    const ladder = await page.locator('[data-case="five"] [data-title-step]').getAttribute('data-ladder');
    const measured = (JSON.parse(ladder ?? '{}') as { chosen: number; steps: Array<{ size: number; lines: number }> });
    const atChosen = measured.steps.find((st) => st.size === measured.chosen);
    expect(five.lineWidths.length, `unclamped: renders the ${atChosen?.lines} lines the ladder measured at ${measured.chosen}`).toBe(atChosen?.lines);
    expect(five.lineWidths.length, 'and it is a multi-line title').toBeGreaterThanOrEqual(3);

    /*
      Evenness, stated as a ratio rather than a pixel count so it survives a
      font metric changing. An orphan is a last line far narrower than the
      widest; balanced lines sit within a fraction of each other.
    */
    const widest = Math.max(...five.lineWidths);
    const last = five.lineWidths[five.lineWidths.length - 1];

    expect(
      last / widest,
      `line widths ${JSON.stringify(five.lineWidths)} — the last must not be an orphan`,
    ).toBeGreaterThan(0.35);
  });

  /**
   * **`balance` degrading safely, known rather than assumed.** Where it is
   * unsupported the property is ignored, the orphan returns, and nothing
   * overflows — acceptable, and asserted so the fallback is a measured state.
   */
  test('does not overflow even with balance disabled', async ({ page }) => {
    await login(page);
    await page.goto('/wall/probe/identity');
    await page.locator('[data-case="five"]').waitFor({ timeout: 15_000 });

    await page.evaluate(() => {
      for (const el of document.querySelectorAll('[data-field="title"]')) {
        (el as HTMLElement).style.textWrap = 'wrap';
      }
    });

    const m = await measure(page);
    const five = m.five;
    if (five === null) return;

    expect(five.overflows, 'the unbalanced fallback still fits').toBe(false);
  });
});

test.describe('the corner field is a track, not a reserve (§4.2)', () => {
  test.use({ viewport: { width: 2200, height: NO_SCROLL_HEIGHT } });

  /**
   * **The mechanism, asserted as a mechanism.**
   *
   * The previous version was static padding plus a fixed absolute height — two
   * independent numbers with nothing coupling either to remaining space, so
   * "the reserve yields" was a claim with no mechanism behind it. It produced
   * numbers, and a test pinning those numbers would have passed on it.
   *
   * So this asserts the RELATIONSHIP: the ornament track shrinks by exactly
   * what the content takes, at every real title length. A two-track grid with
   * `1fr` and `minmax(0, 140px)` has that property by construction; padding
   * plus an absolute height does not have it at all.
   */
  /**
   * **§28 withdrew this test's subject.** It asserted the ornament track
   * shrinking by exactly what the content takes — §4.2's two-track mechanism.
   * §28: "The identity cell carries no ornament. Its corner field and
   * ornament track are withdrawn, and the ornament step leaves §4.2's give
   * order... The space the track held returns to the content on every
   * record."
   *
   * The cell is one track now, so there is no yielding to assert. What the
   * mechanism was FOR — the content always fits and no fact is dropped —
   * survives in the test below, which is the claim that mattered.
   */
  test('never drops a fact, at any title length', async ({ page }) => {
    /**
     * **The claim §4.2's two-track mechanism existed to deliver**, kept after
     * §28 withdrew the track itself: whatever the title does, the cell holds
     * its pressing line, its genres and its format, and nothing overflows.
     * The mechanism is now simply that the content has the whole cell.
     */
    await login(page);
    await page.goto('/wall/probe/identity');
    await page.locator('[data-case="five"]').waitFor({ timeout: 15_000 });

    const rows = await page.evaluate(() =>
      ['one', 'two', 'three', 'four', 'five'].map((id) => {
        const cell = document.querySelector(`[data-case="${id}"] [data-cell="identity-content"]`)!;
        return {
          id,
          overflows: cell.scrollHeight > Math.ceil(cell.getBoundingClientRect().height),
          hasPressing: cell.querySelector('[data-field="pressing-line"]') !== null,
          hasGenres: cell.querySelector('[data-field="genres"]') !== null,
          hasFormat: cell.querySelector('[data-field="format"]') !== null,
        };
      }),
    );

    for (const row of rows) {
      expect(row.overflows, `${row.id}: nothing overflows the cell`).toBe(false);
      expect(row.hasPressing, `${row.id}: keeps the pressing line`).toBe(true);
      expect(row.hasGenres, `${row.id}: keeps the genres`).toBe(true);
      expect(row.hasFormat, `${row.id}: keeps the format`).toBe(true);
    }
  });

  test('leaves the ornament track its min-content minimum', async ({ page }) => {
    /**
     * **`min-height: 0` on the content wrapper is the declaration that defeats
     * the mechanism it sits inside.** It reads as flex-overflow hygiene and is
     * exactly wrong here: it pins the `1fr` track, so content overflows the
     * ornament instead of displacing it — the track stops yielding and the
     * numbers still look plausible.
     *
     * Asserted on the computed style, because the defect is invisible in the
     * geometry until a title is long enough to need the give.
     */
    await login(page);
    await page.goto('/wall/probe/identity');
    await page.locator('[data-case="five"]').waitFor({ timeout: 15_000 });

    const mins = await page.evaluate(() =>
      ['one', 'five'].map((id) => {
        const content = document.querySelector(
          `[data-case="${id}"] [data-cell="identity-content"] [data-track="content"]`,
        )!;
        return { id, minHeight: getComputedStyle(content).minHeight };
      }),
    );

    for (const row of mins) {
      expect(row.minHeight, `${row.id}: the content track keeps its automatic minimum`).not.toBe(
        '0px',
      );
    }
  });
});
