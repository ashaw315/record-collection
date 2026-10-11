import { expect, test } from '@playwright/test';
import { registerCleanup } from './cleanup';
import { SCREEN } from '../src/app/screen-frame';
import { framedScreens, openScreen, seedFixture } from './screens-103';
import { login } from './sign-in';

registerCleanup();

/**
 * Step 118: stats, the want list, look up and the record form keep their
 * 736 and manage its 1,120, pinned left and not centred. Step 120, §T.1:
 * "Content starts at the wordmark's 18 on every screen and at every width,
 * phones included", and the four pages the survey left out and the
 * not-found page are pinned with them, each at the measure it had.
 */
test.beforeEach(async ({ page }) => login(page));

for (const width of [390, 1024, 1440, 1920]) {
  /* Fails against the centred column (at 1920 a 736 column's heading starts at 592), and against step 118's 20, 2 right of the wordmark. */
  test(`at ${width}: each framed screen starts at the wordmark’s 18 and keeps its measure`, async ({ page }) => {
    const f = await seedFixture(page, 'Pinned118');
    for (const screen of framedScreens(f)) {
      await openScreen(page, screen.path, width);
      const m = await page.evaluate(() => {
        const frame = document.querySelector<HTMLElement>('[data-screen-frame]');
        /* The not-found page has no heading; its one line is what stands under the wordmark. */
        const heading = document.querySelector('h1, [data-testid="not-found-line"]');
        const wordmark = document.querySelector('[data-wordmark]');
        if (frame === null || heading === null || wordmark === null) return null;
        const style = getComputedStyle(frame);
        const box = frame.getBoundingClientRect();
        const left = box.left + Number.parseFloat(style.paddingLeft);
        const right = box.right - Number.parseFloat(style.paddingRight);
        return {
          frames: document.querySelectorAll('[data-screen-frame]').length,
          left,
          measure: right - left,
          heading: heading.getBoundingClientRect().left,
          wordmark: wordmark.getBoundingClientRect().left,
          scrolls: document.documentElement.scrollWidth - document.documentElement.clientWidth,
          review: [...document.querySelectorAll<HTMLElement>('[data-review-frame]')].map((el) => el.getBoundingClientRect().left + Number.parseFloat(getComputedStyle(el).paddingLeft)),
        };
      });
      if (m === null) throw new Error(`${screen.name} at ${width}: no frame, heading or wordmark`);
      const measure = Math.min(screen.measure, width - 2 * SCREEN.inset);
      expect.soft(m.frames, `${screen.name}: one frame`).toBe(1);
      expect.soft(m.left, `${screen.name}: its content's left`).toBeCloseTo(SCREEN.inset, 1);
      expect.soft(m.heading, `${screen.name}: its heading's left`).toBeCloseTo(SCREEN.inset, 1);
      expect.soft(m.measure, `${screen.name}: its measure`).toBeCloseTo(measure, 1);
      expect.soft(m.heading - m.wordmark, `${screen.name}: the heading under the wordmark`).toBeCloseTo(0, 1);
      for (const left of m.review) expect.soft(left, `${screen.name}: the match review's left`).toBeCloseTo(SCREEN.inset, 1);
    }
  });
}
