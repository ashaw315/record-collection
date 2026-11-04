import { expect, test, type Page } from '@playwright/test';
import { pointerIs } from './hit-area';
import { login } from './sign-in';

/**
 * Step 166, §64 (Adam, 3 Nov): the two years on the record form. "'Release
 * year' and 'Year pressed' stand together, Release year first, each keeping
 * its hint, inside 'Everything else': side by side where both fit the
 * measure, and one directly beneath the other where they do not."
 *
 * Read on the new form with Everything else opened, at 1440 × 900 under a
 * fine pointer and 390 × 844 under a coarse one. Fails against the build
 * before it, where Year pressed stood inside Pressing details, 704px below
 * Release year at 1440, and never on screen with it: the nesting line fails
 * on the second disclosure holding the field, and the side-by-side line on
 * the two fields' tops.
 */
const WINDOWS = [[1440, 900, 'fine'], [390, 844, 'coarse']] as const;

type Pair = {
  inEverythingElse: [boolean, boolean];
  inPressingDetails: [boolean, boolean];
  releaseYearFirst: boolean;
  hints: [string | null, string | null];
  release: { top: number; bottom: number; left: number; right: number };
  pressed: { top: number; bottom: number; left: number; right: number };
};

const readPair = (page: Page) => page.evaluate((): Pair => {
  const release = document.querySelector<HTMLInputElement>('#releaseYear');
  const pressed = document.querySelector<HTMLInputElement>('#yearPressed');
  if (release === null || pressed === null) throw new Error('the two year fields were not both found');
  const disclosureOf = (el: Element, head: string) => Array.from(document.querySelectorAll('form details')).find((d) => (d.querySelector('summary')?.textContent ?? '').trim().startsWith(head)) ?? null;
  const inside = (el: Element, head: string) => { const d = disclosureOf(el, head); return d !== null && d.contains(el); };
  /* The hint is the row's <p> below the field, in the same box as the input; an error would be a <p role="alert"> and is not a hint. */
  const hintOf = (el: Element) => el.parentElement?.querySelector('p:not([role="alert"])')?.textContent ?? null;
  const box = (el: Element) => { const b = el.getBoundingClientRect(); return { top: b.top, bottom: b.bottom, left: b.left, right: b.right }; };
  return {
    inEverythingElse: [inside(release, 'Everything else'), inside(pressed, 'Everything else')],
    inPressingDetails: [inside(release, 'Pressing details'), inside(pressed, 'Pressing details')],
    releaseYearFirst: (release.compareDocumentPosition(pressed) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0,
    hints: [hintOf(release), hintOf(pressed)],
    release: box(release),
    pressed: box(pressed),
  };
});

for (const [width, height, pointer] of WINDOWS) test.describe(`at ${width} × ${height} under a ${pointer} pointer`, () => {
  test.use({ hasTouch: pointer === 'coarse', viewport: { width, height } });

  test(`§64: Release year and Year pressed stand together inside Everything else, Release year first, each with its hint, ${width >= 640 ? 'side by side' : 'one beneath the other'}`, async ({ page }) => {
    await login(page);
    expect(await pointerIs(page), 'the precondition: the page has the pointer this test is named for').toBe(pointer);
    await page.goto('/records/new');
    await page.locator('form[data-hydrated="true"]').waitFor({ timeout: 15_000 });
    const everythingElse = page.locator('details').filter({ has: page.locator('summary', { hasText: 'Everything else' }) }).first();
    if (!(await everythingElse.evaluate((el) => (el as HTMLDetailsElement).open))) {
      await everythingElse.locator('summary').first().click();
      await expect(everythingElse).toHaveAttribute('open', '');
    }
    await page.evaluate(() => document.fonts.ready);

    const pair = await readPair(page);
    expect(pair.inEverythingElse, 'both years inside Everything else').toEqual([true, true]);
    expect(pair.inPressingDetails, 'neither year inside Pressing details').toEqual([false, false]);
    expect(pair.releaseYearFirst, 'Release year first').toBe(true);
    expect(pair.hints, 'each keeping its hint').toEqual(["The album's original year, not this pressing's.", "This pressing's year, not the album's."]);

    if (width >= 640) {
      /* Side by side: one line, Year pressed to the right of Release year. */
      expect(Math.abs(pair.pressed.top - pair.release.top), `the two fields share a top (${pair.release.top} and ${pair.pressed.top})`).toBeLessThanOrEqual(1);
      expect(pair.pressed.left, 'Year pressed stands right of Release year').toBeGreaterThan(pair.release.right);
    } else {
      /* One directly beneath the other, on the same measure. */
      expect(pair.pressed.top, 'Year pressed stands beneath Release year').toBeGreaterThan(pair.release.bottom);
      expect(Math.abs(pair.pressed.left - pair.release.left), 'on the same left').toBeLessThanOrEqual(1);
      expect(Math.abs(pair.pressed.right - pair.release.right), 'on the same measure').toBeLessThanOrEqual(1);
    }
  });
});
