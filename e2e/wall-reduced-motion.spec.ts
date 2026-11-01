import { expect, test, type Page } from '@playwright/test';
import { login } from './sign-in';
import { wallAtRest } from './wall-ready';

/**
 * **§W.8: under the reduced-motion setting the wall moves nothing on its own.**
 * "A pull cuts to its landed state, a return cuts to the shelf, and the pan
 * jumps to where it would have come to rest." The target has named this test
 * since the step was written and it did not exist: a pull animated in full
 * under the preference, and from 30 Oct with the pan added. Each case records
 * every animation frame from before the press, so a frame of motion cannot be
 * stepped over, and the control shows the recording can see motion at all.
 */
const FRAMES = `(() => {
  const log = [];
  window.__frames = log;
  const tick = () => {
    const pulled = document.querySelector('[data-pulled] [data-landing]')?.getBoundingClientRect();
    log.push({ phase: document.querySelector('[data-wall-container]')?.getAttribute('data-phase'), box: pulled ? [Math.round(pulled.x), Math.round(pulled.y), Math.round(pulled.width), Math.round(pulled.height)] : null });
    if (log.length < 90) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
})()`;
type Frame = { phase: string; box: number[] | null };
const frames = (page: Page) => page.evaluate(() => (window as unknown as { __frames: Frame[] }).__frames);
const SPINE = 'a[data-seat][data-seat-order="2"] [data-spine]';
const region = (page: Page) => page.locator('[data-region="wall"]').evaluate((el) => [el.scrollLeft, el.scrollTop]);
/* Frames of motion: anything between the press and the end state. */
const moving = (log: Frame[]) => log.filter((f) => ['pan', 'swing', 'finish', 'return'].includes(f.phase)).length;

/* §W.19's landing, to the pixel. y sits on a half-pixel grid, since project() takes it through SIN30, and the scroller stops on whole pixels, so a seat lands at 179 or 179.5 and x at 657.6 to 658.5. Each seat's landing is the same however it is reached, and the same before the pan: it is rounding that cannot grow, so a bound and not an exact figure. */
const expectLanded = (box: number[] | null) => {
  expect(box).not.toBeNull();
  const [x, y, w, h] = box ?? [];
  expect(Math.abs(x - 658)).toBeLessThanOrEqual(1);
  expect(Math.abs(y - 180)).toBeLessThanOrEqual(1);
  expect([w, h]).toEqual([560, 560]);
};

const open = async (page: Page, reducedMotion: 'reduce' | 'no-preference') => {
  await login(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ reducedMotion });
  await page.goto('/');
  await wallAtRest(page);
  expect(await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches), 'the precondition: the preference is what this test is named for').toBe(reducedMotion === 'reduce');
};
const press = async (page: Page) => {
  await page.locator(SPINE).scrollIntoViewIfNeeded();
  await page.evaluate(FRAMES);
  await page.locator(SPINE).click({ force: true });
  await page.waitForTimeout(700);
};

/* The control: fails if the recording cannot see motion, which would make every test below vacuous. */
test('with no preference, the same recording sees the gesture', async ({ page }) => {
  await open(page, 'no-preference');
  await press(page);
  expect(moving(await frames(page))).toBeGreaterThan(10);
});

test('a pull reaches its end state in one frame, at the place and size the motion ends', async ({ page }) => {
  await open(page, 'reduce');
  await press(page);
  const log = await frames(page);
  expect(moving(log), 'at most the frame the press lands in').toBeLessThanOrEqual(1);
  expect(log[log.length - 1].phase).toBe('landed');
  expectLanded(log[log.length - 1].box);
});

test('a return cuts to the shelf, and the view jumps back', async ({ page }) => {
  await open(page, 'reduce');
  const before = await region(page);
  await press(page);
  await page.evaluate(FRAMES);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(500);
  /* The clock arms a frame after the press, so the phase can read `return` for two frames: what must not exist is a pose between. */
  const poses = new Set((await frames(page)).map((f) => JSON.stringify(f.box)));
  poses.delete('null');
  expect(poses.size, 'the landed record, then nothing: no pose between').toBe(1);
  expectLanded(JSON.parse([...poses][0]) as number[]);
  await expect(page.locator('[data-pulled]')).toHaveCount(0);
  expect(await region(page)).toEqual(before);
});

test('the arrows move nothing on their own: the neighbour is landed in one frame', async ({ page }) => {
  await open(page, 'reduce');
  await press(page);
  await page.evaluate(FRAMES);
  await page.getByTestId('nav-next').click();
  await page.waitForTimeout(500);
  const log = await frames(page);
  expect(moving(log)).toBeLessThanOrEqual(1);
  expectLanded(log[log.length - 1].box);
});

/* §W.8: "A pan the reader drives with a finger or a wheel still tracks, because that motion is theirs." */
test('a pan the reader drives still tracks', async ({ page }) => {
  await open(page, 'reduce');
  const before = await region(page);
  await page.locator('[data-region="wall"]').hover();
  await page.mouse.wheel(0, 60);
  await expect.poll(async () => (await region(page))[1]).toBeGreaterThan(before[1]);
});
