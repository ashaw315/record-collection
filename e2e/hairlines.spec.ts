import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { describeDoubled, doubledHairlines, type DoubledHairline } from './hairlines';
import { login } from './sign-in';

/**
 * Two hairlines with nothing drawn between them (`hairlines.ts`). Twice
 * the convention was held by someone noticing (the nav's `G.8/hairline-
 * below-last`; suggestions' panel and list, step 140); from here it is
 * held by a reading.
 *
 * Two parts. **The reading, staged** on pages written here, so a pair it
 * must find and a pair it must not are each shown to it before any screen
 * is. **Every screen, against the record:** each route at 390 and 1280 is
 * read and compared with `hairlines-record.json`, which holds the pairs
 * that stood when the check was built (the coordinator, 13 Oct: the
 * retrospective list is recorded, not sent to Design as a queue; verdicts
 * are taken on pairs that sit on screens being passed anyway). A pair not
 * in the record fails; a pair in the record that has gone fails too, so
 * the record stays what is drawn. The record's keys carry no coordinates,
 * so seeded data moving a line does not move the record.
 */
const RECORD = join(__dirname, 'hairlines-record.json');
const record: Record<string, string[]> = existsSync(RECORD) ? (JSON.parse(readFileSync(RECORD, 'utf8')) as Record<string, string[]>) : {};

const key = (d: DoubledHairline) => `${d.above} → ${d.below}`;
const html = (body: string) => `<!doctype html><html><body style="margin:0;font:16px/1.5 sans-serif">${body}</body></html>`;
const RULE = '1px solid rgb(0, 0, 0)';

test.describe('the reading, staged', () => {
  /* Fails against a reading of adjacency only: these two stand 24 apart. */
  test('two hairlines 24 apart with nothing between them are a doubled rule; the same two with a word between are not', async ({ page }) => {
    await page.setContent(html(`<div style="border-bottom:${RULE};padding:8px">Above</div><div style="height:24px"></div><div style="border-top:${RULE};padding:8px">Below</div>`));
    const found = await doubledHairlines(page);
    expect(found.map(key)).toEqual(['div bottom → div top']);
    expect(found[0]?.apart).toBe(25);

    await page.setContent(html(`<div style="border-bottom:${RULE};padding:8px">Above</div><p style="margin:4px 0">A word between</p><div style="border-top:${RULE};padding:8px">Below</div>`));
    expect(await doubledHairlines(page)).toEqual([]);
  });

  test('two hairlines touching are a doubled rule, and a third line between two makes them neighbours of it, not of each other', async ({ page }) => {
    await page.setContent(html(`<div style="border-bottom:${RULE};padding:8px">Above</div><div style="border-top:${RULE};padding:8px">Below</div>`));
    expect((await doubledHairlines(page)).map((d) => [key(d), d.apart])).toEqual([['div bottom → div top', 1]]);

    await page.setContent(html(`<div style="border-bottom:${RULE};padding:8px">Above</div><hr style="margin:12px 0;border:0;border-top:${RULE}"><div style="border-top:${RULE};padding:8px">Below</div>`));
    expect((await doubledHairlines(page)).map(key)).toEqual(['div bottom → hr', 'hr → div top']);
  });

  test('a box with a visible background between two rules is content, as is a bordered box, whose edges are not rules; a transparent border and a hidden rule are not lines', async ({ page }) => {
    await page.setContent(html(`<div style="border-bottom:${RULE};padding:8px">Above</div><div style="height:24px;background:rgb(200, 200, 200)"></div><div style="border-top:${RULE};padding:8px">Below</div>`));
    expect(await doubledHairlines(page)).toEqual([]);

    /* The record form's first reading: every input's bottom edge paired with the rule under its row. A control is a box, and a box is content. */
    await page.setContent(html(`<div style="border-bottom:${RULE};padding:8px">Above</div><div style="margin:12px 0;border:${RULE};height:24px"></div><div style="border-top:${RULE};padding:8px">Below</div>`));
    expect(await doubledHairlines(page)).toEqual([]);

    await page.setContent(html(`<div style="border-bottom:${RULE};padding:8px">Above</div><div style="height:24px;border-top:1px solid transparent"></div><div style="border-top:${RULE};padding:8px;display:none">Hidden</div><div style="border-top:${RULE};padding:8px">Below</div>`));
    expect((await doubledHairlines(page)).map(key)).toEqual(['div bottom → div top']);
  });

  test('a collapsed table’s rows share one line each, and two cells side by side do not overlap', async ({ page }) => {
    await page.setContent(html(`<table style="border-collapse:collapse;width:300px"><tr style="border-bottom:${RULE}"><td style="border-top:${RULE}">one</td><td style="border-top:${RULE}">two</td></tr><tr style="border-bottom:${RULE}"><td style="border-top:${RULE}">three</td><td style="border-top:${RULE}">four</td></tr></table>`));
    expect(await doubledHairlines(page)).toEqual([]);
  });
});

const ROUTES = ['/', '/lookup', '/manage', '/records/new', '/stats', '/suggestions', '/want-list', '/want-list/new'] as const;

test.describe('every screen, against the record', () => {
  test.beforeEach(async ({ page }) => login(page));

  for (const width of [390, 1280]) {
    for (const route of ROUTES) {
      test(`${route} at ${width}: no doubled hairline the record does not hold, and none in the record gone`, async ({ page }) => {
        await page.setViewportSize({ width, height: 844 });
        await page.goto(route);
        /* Manage's frame is a div, not a main. */
        await page.locator('main, [data-screen-frame]').first().waitFor({ timeout: 30_000 });
        await page.evaluate(() => document.fonts.ready);
        const found = await doubledHairlines(page);
        expect(found.map(key).sort(), `on ${route} at ${width}:\n  ${found.map(describeDoubled).join('\n  ')}`).toEqual([...(record[`${route}@${width}`] ?? [])].sort());
      });
    }
  }

  /* §G.8: the menu's own hairline below its last row touched the header's rule. The withdrawn claim, held. */
  test('the nav menu open at 390: its last row and the header’s rule are not a doubled hairline', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    await page.getByRole('button', { name: 'Menu' }).click();
    await page.locator('[data-menu-list]').waitFor();
    const found = await doubledHairlines(page);
    expect(found.map(key).sort(), `with the menu open:\n  ${found.map(describeDoubled).join('\n  ')}`).toEqual([...(record['/ menu open@390'] ?? [])].sort());
  });
});
