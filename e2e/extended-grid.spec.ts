import { expect, test, type Page } from '@playwright/test';
import { registerCleanup, trackArtist } from './cleanup';
import { seedImage } from './seed';
import { getTestDb } from '../test/helpers/db';
import { sql } from 'drizzle-orm';
import { CONTENT_X, MARK_HEIGHT, MARK_WIDTH, RAIL_X } from '../src/app/records/[id]/extended-grid';
import { NO_SCROLL_HEIGHT } from '../src/app/records/[id]/band-geometry';

/**
 * **The bar needs a derived colour, and a seeded image does not produce one.**
 * `spine_colour` is computed by the import path from real artwork; `seedImage`
 * writes a row and nothing else, so a record built here has a null ladder and
 * correctly draws no bar. Set explicitly, so the fixture states what the test
 * depends on rather than inheriting it.
 */
async function giveSpineColour(recordId: string) {
  await getTestDb().execute(
    sql`UPDATE records SET spine_colour = ${'#a25829'} WHERE id = ${recordId}::uuid`,
  );
}

registerCleanup();

/**
 * §9.1 — the extended grid, measured on the rendering.
 *
 * The constants have their own unit test; what cannot be asserted there is that
 * the RAIL ACTUALLY LANDS at 34 and the content at 284, that the section rule
 * bleeds past both, and that the bar appears beside a section holding nothing
 * but a control. Those are the claims the structure exists to make.
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
  return `x${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;
}

async function post(page: Page, path: string, data: unknown) {
  const response = await page.request.post(path, { data, failOnStatusCode: false });
  expect([200, 201], `${path} ${response.status()}`).toContain(response.status());
  return response.json();
}

/**
 * **The modal record — 16 of 17.** No plant, no weight, no colour variant, so
 * Pressing detail holds nothing and §9.1 does not render it at all.
 */
async function modalRecord(page: Page, suffix: string): Promise<string> {
  const artist = await post(page, '/api/artists', { name: `Donovan-${suffix}` });
  trackArtist(artist.id as string);
  const pressing = await post(page, '/api/pressings', {
    catalogNumber: `BN-${suffix}`,
    matrixRunout: `BNMX-${suffix}`,
    yearPressed: 1968,
    countryPressed: 'United States',
  });
  const record = await post(page, '/api/records', {
    title: `The Hurdy Gurdy Man ${suffix}`,
    artistId: artist.id,
    pressingId: pressing.id,
    releaseYear: 1968,
  });
  await seedImage({ recordId: record.id as string, imageType: 'cover' });
  await giveSpineColour(record.id as string);
  return record.id as string;
}

/** The richest record: the only one where Pressing detail has facts to hold. */
async function richRecord(page: Page, suffix: string): Promise<string> {
  const artist = await post(page, '/api/artists', { name: `Vandross-${suffix}` });
  trackArtist(artist.id as string);
  const pressing = await post(page, '/api/pressings', {
    catalogNumber: `FE-${suffix}`,
    matrixRunout: `FEMX-${suffix}`,
    pressingPlant: 'Terre Haute',
    yearPressed: 1981,
    countryPressed: 'United States',
    vinylWeightGrams: 180,
    colorVariant: 'Black',
  });
  const record = await post(page, '/api/records', {
    title: `Never Too Much ${suffix}`,
    artistId: artist.id,
    pressingId: pressing.id,
    releaseYear: 1981,
  });
  await seedImage({ recordId: record.id as string, imageType: 'cover' });
  await giveSpineColour(record.id as string);
  return record.id as string;
}

test.beforeEach(async ({ page }) => {
  await login(page);
});

test('the rail lands at 34 and the content at 284, on every section', async ({ page }) => {
  /**
   * **The one edge that never moves.** The whole structure is the claim that a
   * reader scrolling past sections of wildly different heights sees one x. So
   * it is asserted across EVERY rendered section rather than on one.
   */
  const suffix = makeSuffix();
  const id = await richRecord(page, suffix);
  await page.setViewportSize({ width: 1440, height: NO_SCROLL_HEIGHT });
  await page.goto(`/records/${id}`);
  await page.locator('[data-section]').first().waitFor({ timeout: 20_000 });

  const measured = await page.evaluate(() =>
    Array.from(document.querySelectorAll('[data-section]')).map((section) => {
      const rail = section.querySelector('[data-rail]');
      const content = section.querySelector('[data-content]');
      const box = section.getBoundingClientRect();
      return {
        name: section.getAttribute('data-section'),
        railX: rail === null ? null : Math.round(rail.getBoundingClientRect().left),
        contentX: content === null ? null : Math.round(content.getBoundingClientRect().left),
        left: Math.round(box.left),
        width: Math.round(box.width),
      };
    }),
  );

  expect(measured.length, 'sections rendered').toBeGreaterThan(0);

  for (const section of measured) {
    expect(section.railX, `${section.name}: rail x`).toBe(RAIL_X);
    expect(section.contentX, `${section.name}: content x`).toBe(CONTENT_X);
  }
});

test('the section rule bleeds past the tracks it contains', async ({ page }) => {
  /**
   * §3's distinction is load-bearing: a full-bleed rule separates modules, an
   * inset one separates things inside one module, and each section is a module.
   * Drawn inset, the region's only structural element would be the wrong kind
   * of edge by this file's own vocabulary.
   *
   * Asserted as the section spanning wider than its own content, which is what
   * "bleeds past" means geometrically.
   */
  const suffix = makeSuffix();
  const id = await richRecord(page, suffix);
  await page.setViewportSize({ width: 1440, height: NO_SCROLL_HEIGHT });
  await page.goto(`/records/${id}`);
  await page.locator('[data-section]').first().waitFor({ timeout: 20_000 });

  const measured = await page.evaluate(() => {
    const section = document.querySelector('[data-section]')!;
    const rail = section.querySelector('[data-rail]')!;
    const style = getComputedStyle(section);
    return {
      left: Math.round(section.getBoundingClientRect().left),
      right: Math.round(section.getBoundingClientRect().right),
      railLeft: Math.round(rail.getBoundingClientRect().left),
      borderTop: style.borderTopWidth,
      viewport: window.innerWidth,
    };
  });

  expect(measured.left, 'the rule starts at the composition edge').toBe(0);
  expect(measured.right, 'and runs to it').toBe(measured.viewport);
  expect(measured.railLeft, 'while the rail stays indented').toBeGreaterThan(measured.left);
  expect(measured.borderTop, 'one hairline').toBe('1px');
});

test('draws the bar beside a control-only section, because marking is by schema', async ({
  page,
}) => {
  /**
   * **The ruling that would be easiest to get wrong by building the obvious
   * thing.** On the modal record — 16 of 17 — Images and Journal hold nothing
   * but their controls, and both still carry a bar.
   *
   * Per-record marking would make the mark encode data: a bar appearing when a
   * record has images and vanishing when it does not is an indicator of that
   * fact. A control-only Images section is still where this record's images go.
   */
  const suffix = makeSuffix();
  const id = await modalRecord(page, suffix);
  await page.goto(`/records/${id}`);
  await page.locator('[data-section]').first().waitFor({ timeout: 20_000 });

  const marked = await page.evaluate(() =>
    Array.from(document.querySelectorAll('[data-section]')).map((section) => ({
      name: section.getAttribute('data-section'),
      hasBar: section.querySelector('[data-mark="section-bar"]') !== null,
    })),
  );

  const names = marked.map((row) => row.name);
  expect(names, 'Pressing detail holds nothing on this record').not.toContain('pressing-detail');

  for (const row of marked.filter((r) => r.name === 'images' || r.name === 'journal')) {
    expect(row.hasBar, `${row.name}: control-only, still marked`).toBe(true);
  }
});

test('the bar is 44 × 10 and sits on the rail', async ({ page }) => {
  const suffix = makeSuffix();
  const id = await richRecord(page, suffix);
  await page.setViewportSize({ width: 1440, height: NO_SCROLL_HEIGHT });
  await page.goto(`/records/${id}`);
  await page.locator('[data-mark="section-bar"]').first().waitFor({ timeout: 20_000 });

  const bars = await page.evaluate(() =>
    Array.from(document.querySelectorAll('[data-mark="section-bar"]')).map((bar) => {
      const box = bar.getBoundingClientRect();
      return { x: Math.round(box.left), w: Math.round(box.width), h: Math.round(box.height) };
    }),
  );

  expect(bars.length, 'at least one bar').toBeGreaterThan(0);

  for (const bar of bars) {
    expect(bar.w).toBe(MARK_WIDTH);
    expect(bar.h).toBe(MARK_HEIGHT);
    /* On the rail — the same x as every label, which is the whole argument. */
    expect(bar.x, 'the bar sits at the rail x').toBe(RAIL_X);
  }
});

test('renders no empty section, and no diagonal below the fold', async ({ page }) => {
  /**
   * §9.1: an empty section is not rendered at all — no diagonal, no label, no
   * reserved space — and §6's one-diagonal rule does not cross the fold.
   *
   * The asymmetry is exact: above, absence must be drawn because the geometry
   * is fixed and a hole reads as a mistake; below, absence costs nothing to
   * omit and drawing it would be inventing content.
   */
  const suffix = makeSuffix();
  const id = await modalRecord(page, suffix);
  await page.goto(`/records/${id}`);
  await page.locator('[data-section]').first().waitFor({ timeout: 20_000 });

  const below = await page.evaluate(() => {
    const frame = document.querySelector('[data-testid="record-page-8a"]')!;
    const diagonals = Array.from(document.querySelectorAll('[data-diagonal]')).filter(
      (mark) => !frame.contains(mark),
    );
    const empty = Array.from(document.querySelectorAll('[data-section]')).filter((section) => {
      const content = section.querySelector('[data-content]');
      return content !== null && (content.textContent ?? '').trim() === '';
    });
    return {
      diagonals: diagonals.length,
      empty: empty.map((section) => section.getAttribute('data-section')),
      all: Array.from(document.querySelectorAll('[data-section]')).map((x) => x.getAttribute('data-section')),
    };
  });

  expect(below.diagonals, 'no diagonal crosses the fold').toBe(0);
  expect(below.empty, `no section renders with empty content (all: ${below.all.join(', ')})`).toEqual([]);
});
