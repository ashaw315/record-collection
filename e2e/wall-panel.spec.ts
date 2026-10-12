import { expect, test, type Page } from '@playwright/test';
import { GROWTH, OUT_MS } from '../src/app/wall/gesture';
import { registerCleanup, trackArtist } from './cleanup';
import { seedRecords } from './seed';
import { contrastRatio } from '../src/lib/colour/record-colour';
import { login } from './sign-in';
import { POINTERS, expectFloor } from './hit-area';

/**
 * What the gesture arrives at (8a §W.7): the panel, flat on paper, right of
 * the pulled record, appearing at the slide's perceived end. Two claims
 * inherit from the lit wall's composition tests: the chrome arrives with the
 * record rather than before it, and Escape sends the record home — from
 * settled, and mid-turn — taking the chrome with it.
 */

registerCleanup();
const suffix = () => `${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;

async function seed(page: Page, count: number) {
  const artist = await page.request.post('/api/artists', { data: { name: `Wall-${suffix()}` } });
  const artistId = (await artist.json()).id as string;
  trackArtist(artistId);
  await seedRecords(artistId, 'Wall', suffix(), count);
  return artistId;
}

test.beforeEach(async ({ page }) => {
  await login(page);
  await page.setViewportSize({ width: 1280, height: 900 });
});

test('the panel arrives with the record — with the rotation, not before, in the facts column', async ({
  page,
}) => {
  const artistId = await seed(page, 12);
  await page.clock.install();
  await page.goto(`/?artistId=${artistId}`);
  await expect(page.getByTestId('wall')).toBeAttached({ timeout: 30_000 });
  await page.clock.pauseAt(Date.now() + 1000);

  await page.locator('[data-seat] [data-spine]').first().click();
  await page.clock.runFor(400);
  await expect(page.getByTestId('record-chrome'), 'not there while the record is still visibly moving').toHaveCount(0);

  await page.clock.runFor(700);
  const chrome = page.getByTestId('record-chrome');
  await expect(chrome).toBeVisible();
  /* The geometry below is read once the gesture has settled: the swing, then the 300ms finish. */
  await page.clock.runFor(OUT_MS);
  await expect(chrome.getByTestId('record-panel')).toHaveAttribute('data-expanded', 'true');
  await expect(chrome.getByTestId('action-turn')).toBeVisible();
  await expect(chrome.getByTestId('action-put')).toBeVisible();
  await expect(chrome.getByTestId('panel-detail-link')).toHaveAttribute('href', /\/records\//);

  /*
    §W.9, §W.10: the panel's region is fixed in the facts column, left of
    the drawing; the record lands in the drawing's region as its largest
    square face, still in the projection; the arrows go with the record.
    Nothing in the panel is sheared.
  */
  const geometry = await page.evaluate(() => {
    const box = (el: Element | null) => {
      const r = el?.getBoundingClientRect();
      return r ? { l: r.left, r: r.right, t: r.top, b: r.bottom, w: r.width, h: r.height } : null;
    };
    return {
      panel: box(document.querySelector('[data-testid="record-chrome"]')),
      facts: box(document.querySelector('[data-region="facts"]')),
      wall: box(document.querySelector('[data-region="wall"]')),
      field: box(document.querySelector('[data-pulled] [data-field]')),
      next: box(document.querySelector('[data-testid="nav-next"]')),
      count: box(document.querySelector('[data-testid="wall-count"]')),
    };
  });
  expect(geometry.panel && geometry.facts && geometry.wall && geometry.field && geometry.next && geometry.count).toBeTruthy();
  if (!geometry.panel || !geometry.facts || !geometry.wall || !geometry.field || !geometry.next || !geometry.count) return;
  expect(geometry.panel.r, 'the panel is in the facts column').toBeLessThanOrEqual(geometry.facts.r + 1);
  expect(geometry.panel.l).toBeLessThan(geometry.wall.l);
  expect(geometry.panel.t, 'below the count').toBeGreaterThan(geometry.count.b);
  /* Landed on the page's plane (§W.17, §W.21): a 560 square, the projection undone. */
  expect(Math.abs(geometry.field.w - geometry.field.h), 'the landed record is a square').toBeLessThan(1.5);
  /* At its own size while growth is with Design: 150 × 150 at 1:1. */
  expect(geometry.field.w).toBeCloseTo(150 * GROWTH, 0);
  expect(geometry.field.l, 'in the drawing’s region').toBeGreaterThanOrEqual(geometry.wall.l);
  expect(geometry.next.l, 'the arrow goes with the record, beside it').toBeGreaterThan(geometry.field.r);
  expect(geometry.next.l).toBeGreaterThanOrEqual(geometry.wall.l);
  const transform = await chrome.evaluate((el) => getComputedStyle(el).transform);
  expect(transform).toBe('none');
});

test('Escape dismisses, and a record dismissed MID-TURN goes home with its chrome', async ({ page }) => {
  const artistId = await seed(page, 6);
  await page.goto(`/?artistId=${artistId}`);
  await expect(page.getByTestId('wall')).toBeAttached({ timeout: 30_000 });
  const first = page.locator('[data-seat] [data-spine]').first();
  const firstId = await page.locator('[data-seat]').first().getAttribute('data-seat');

  /* Escape from settled. */
  await first.click();
  await expect(page.getByTestId('record-chrome')).toBeVisible({ timeout: 5000 });
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('record-chrome')).toHaveCount(0);
  await expect(page.locator(`[data-seat="${firstId}"] [data-spine]`), 'seated again').toHaveCount(1, { timeout: 5000 });

  /* Turn over, then Escape before anything else: the back shows on the same face, then it goes home. */
  await page.locator(`[data-seat="${firstId}"] [data-spine]`).click();
  await expect(page.getByTestId('record-chrome')).toBeVisible({ timeout: 5000 });
  await page.getByTestId('record-chrome').getByTestId('action-turn').click();
  await expect(page.locator('[data-pulled] [data-back-plain], [data-pulled] [data-back]')).toHaveCount(1);
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('record-chrome'), 'and the chrome goes with it').toHaveCount(0);
  await expect(page.locator(`[data-seat="${firstId}"] [data-spine]`)).toHaveCount(1, { timeout: 5000 });
  await expect(page.locator('[data-pulled]')).toHaveCount(0);
});

test('the panel’s values are READABLE against the paper they sit on', async ({ page }) => {
  /*
    The lit wall's version measured the panel against its scrim and once
    caught 1.02:1. The ground is paper now and the claim is the same: every
    text colour in the panel, measured on the rendered page, clears 4.5:1
    against the composition's ground.
  */
  const artistId = await seed(page, 3);
  await page.goto(`/?artistId=${artistId}`);
  await expect(page.getByTestId('wall')).toBeAttached({ timeout: 30_000 });
  await page.locator('[data-seat] [data-spine]').first().click();
  await expect(page.getByTestId('record-chrome')).toBeVisible({ timeout: 5000 });

  const colours = await page.evaluate(() => {
    const hex = (colour: string) => {
      const canvas = document.createElement('canvas');
      canvas.width = 1;
      canvas.height = 1;
      const ctx = canvas.getContext('2d');
      if (ctx === null) return colour;
      ctx.fillStyle = colour;
      ctx.fillRect(0, 0, 1, 1);
      const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
      return `#${[r, g, b].map((c) => c.toString(16).padStart(2, '0')).join('')}`;
    };
    const ground = hex(getComputedStyle(document.querySelector('[data-composition]') as HTMLElement).backgroundColor);
    const texts = Array.from(document.querySelectorAll('[data-testid="record-chrome"] h3, [data-testid="record-chrome"] p, [data-testid="record-chrome"] a, [data-testid="record-chrome"] button, [data-testid="record-chrome"] dt, [data-testid="record-chrome"] dd'))
      .filter((el) => (el.textContent ?? '').trim() !== '')
      .map((el) => hex(getComputedStyle(el).color));
    return { ground, texts: [...new Set(texts)] };
  });
  expect(colours.texts.length).toBeGreaterThan(0);
  for (const colour of colours.texts) {
    expect(contrastRatio(colour, colours.ground), `${colour} on ${colours.ground}`).toBeGreaterThanOrEqual(4.5);
  }
});

/*
  Step 130: the floor on the shelf's rail and a pulled record's controls,
  for a tablet or a touchscreen, which is coarse above the shelf's fork. The
  three view names are 14 at a pitch of 42 and Add record 16.5; the panel's
  Open the full record 19.5. The records themselves are not held here: they
  are 14 across to a finger and wait on a ruling (NOTES, 11 Oct).
*/
/*
  Step 134: the shelf is not offered under a coarse pointer at any width, so the two coarse cases went with their
  subject, and with them the only reader of the rail's coarse rules in globals.css, which nothing reaches now.
*/
for (const pointer of ['fine'] as (typeof POINTERS)[number][]) test.describe(`the shelf’s rail and a pulled record under a ${pointer} pointer`, () => {
 test.use({ hasTouch: pointer === 'coarse' });
 for (const width of [1280, 1440]) {
  test(pointer === 'coarse' ? `every control on the rail and the pulled record is 44 tall to a finger, at ${width}` : `under a mouse every control on the rail and the pulled record is its drawn size, at ${width}`, async ({ page }) => {
    const artistId = await seed(page, 12);
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`/?artistId=${artistId}`);
    await expect(page.getByTestId('wall')).toBeAttached({ timeout: 30_000 });
    await page.evaluate(() => document.fonts.ready);
    const rail = await expectFloor(page, pointer, `the rail at ${width}`, '[data-shelf-offered] [data-testid="wall-rail"]', 'button.sr-only');
    for (const name of ['Shelf', 'Table', 'Grid', 'Add record']) expect(rail.map((r) => r.name), 'the precondition: the rail’s links are read').toContain(name);
    for (const name of ['Shelf', 'Table', 'Grid']) expect.soft(rail.find((r) => r.name === name)?.height, `at ${width}: ${name} is drawn 14 tall`).toBe(14);
    const pitch = await page.evaluate(() => { const tops = Array.from(document.querySelectorAll('[data-shelf-offered] [data-testid="wall-rail"] ul a')).map((a) => a.getBoundingClientRect().top); return [(tops[1] ?? 0) - (tops[0] ?? 0), (tops[2] ?? 0) - (tops[1] ?? 0)]; });
    expect.soft(pitch, `at ${width}: the view names are ${pointer === 'coarse' ? 44 : 42} apart`).toEqual(pointer === 'coarse' ? [44, 44] : [42, 42]);

    await page.locator('[data-seat] [data-spine]').first().click();
    const chrome = page.getByTestId('record-chrome');
    await expect(chrome.getByTestId('record-panel')).toHaveAttribute('data-expanded', 'true', { timeout: 15_000 });
    await expect(chrome.getByTestId('action-turn')).toBeVisible();
    await page.waitForTimeout(600);
    const pulled = await expectFloor(page, pointer, `the pulled record at ${width}`, '[data-testid="record-chrome"]');
    expect.soft(pulled.find((r) => r.name.startsWith('Open the full record'))?.height, `at ${width}: Open the full record is drawn 19.5 tall`).toBe(19.5);
  });
 }
});
