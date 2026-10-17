import { expect, test, type Page } from '@playwright/test';
import { registerCleanup, trackArtist, trackCreated } from './cleanup';
import { gapBetween } from './pair-gap';
import { login } from './sign-in';
import { INK, expectBox, expectLabelControl, read } from './type-read';

/**
 * Step 146, §T.6 part 2's passes, manage's rows (Design, 14 Oct): "A row's
 * actions are §9.3 labels in words, LINEUP, EDIT and DELETE, not drawn
 * icons; the system draws no mark that is not a letter beyond the glyphs
 * §T.1 rules: +, −, the chevron, ×, the tick and the search glyph. The tick
 * confirms what the × cancels on manage's inline row edit, so it is ruled
 * as the ×'s partner. Lucide's plus, cross and tick become §T.1's marks,
 * drawn at its weight, and the pencil and the bin stay unruled drawing,
 * replaced by words. An opened row keeps its name at the row's top, not
 * centred in a row grown tall. At 390, LINEUP joins SAVE and DELETE in the
 * form's action row; as built it floats mid-width. The add rows at 1280
 * lose their tinted band."
 *
 * Read at 1280 under a fine pointer on the Artists and Tags tables and the
 * Genres tree, and at 390 under a coarse pointer on the Artists list's open
 * form. Fails against the build before it: lucide's pencil, bin, plus,
 * check and x in ghost buttons of 28, the create row filled at 40% of the
 * secondary tint, every cell middle-aligned, and the list's Lineup under
 * the action row on its own line.
 */
registerCleanup();

type Marks = { lucide: number; marks: string[]; create: string; cells: string[] };
const readSection = (page: Page, region: string) => page.evaluate((name): Marks => {
  const root = document.querySelector(`section[aria-label="${name}"], [role="region"][aria-label="${name}"]`) as HTMLElement;
  const create = root.querySelector('[data-manage-create]') as HTMLElement | null;
  return {
    lucide: root.querySelectorAll('svg.lucide').length,
    marks: Array.from(root.querySelectorAll<SVGElement>('svg[data-mark]')).map((svg) => `${svg.getAttribute('data-mark')} ${svg.getAttribute('width')}×${svg.getAttribute('height')} ${getComputedStyle(svg).strokeWidth}`),
    create: create === null ? 'missing' : getComputedStyle(create).backgroundColor,
    cells: Array.from(new Set(Array.from(root.querySelectorAll<HTMLElement>('td')).map((td) => getComputedStyle(td).verticalAlign))),
  };
}, region);

async function fixtures(page: Page) {
  const suffix = `m146${Date.now().toString(36)}`;
  const post = async (path: string, data: unknown) => {
    const response = await page.request.post(path, { data });
    expect(response.status(), path).toBe(201);
    const body = (await response.json()) as { id: string };
    trackCreated(path, body);
    return body.id;
  };
  const artist = `Rows ${suffix}`;
  const artistId = await post('/api/artists', { name: artist });
  trackArtist(artistId);
  /* The artist list defaults to what you collect, so the artist needs a record to be listed. */
  await post('/api/records', { title: `Rows ${suffix}`, artistId });
  const tag = `rows-${suffix}`;
  await post('/api/tags', { name: tag });
  const genre = `Rows genre ${suffix}`;
  await post('/api/genres', { name: genre });
  return { artist, tag, genre };
}

async function section(page: Page, label: string) {
  await page.getByRole('navigation', { name: 'Resource' }).getByRole('button', { name: label, exact: true }).click();
  await expect(page.getByRole('region', { name: label })).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
}

test('manage at 1280 under a fine pointer: row actions as LINEUP, EDIT and DELETE in words, the tick and × as §T.1’s marks on an inline edit, Add a box with §T.1’s +, no lucide drawing, cells top-aligned, the add rows untinted', async ({ browser }) => {
  test.setTimeout(120_000);
  const context = await browser.newContext({ viewport: { width: 1280, height: 844 } });
  const page = await context.newPage();
  await login(page);
  const f = await fixtures(page);
  await page.goto('/manage');
  for (const [label, name, lineup] of [['Artists', f.artist, true], ['Tags', f.tag, false], ['Genres', f.genre, false]] as const) {
    await section(page, label);
    const region = page.getByRole('region', { name: label });
    /* The row, found from its own EDIT: both the table and the narrow list are in the document with CSS showing one, and a tree row's select names every genre, so a row filtered by text is not this one. */
    const row = region.getByRole('button', { name: `Edit ${name}`, exact: true }).locator('xpath=ancestor::*[self::tr or self::li][1]');
    await expect(row).toBeVisible();
    /* The actions in words. */
    const actions = (await read(row, 'button')).filter((r) => r.height > 0);
    expect(actions.map((r) => r.text), `${label}: the row's actions, in words`).toEqual(lineup ? ['Lineup', 'Edit', 'Delete'] : ['Edit', 'Delete']);
    for (const r of actions) expectLabelControl(r, `${label}: ${r.text}`);
    /* The add row and its Add. */
    const [add] = await read(page, `section[aria-label="${label}"] [data-manage-create] button, [role="region"][aria-label="${label}"] [data-manage-create] button`);
    expect(add, `${label}: the Add control`).toBeDefined();
    expectBox(add, `${label}: Add`, 'fine');
    /* Design, 17 Oct: a §9.3 box is drawn 32 under a fine pointer, as Save is, and 44 under a coarse one, the floor; a label keeps its 44 line under both. */
    expect.soft(add.height, `${label}: Add is the box's drawn 32 under a mouse`).toBe(32);
    const rest = await readSection(page, label);
    expect.soft(rest.create, `${label}: the add row untinted`).toBe('rgba(0, 0, 0, 0)');
    expect.soft(rest.lucide, `${label}: no lucide drawing at rest`).toBe(0);
    expect.soft(rest.marks, `${label}: §T.1's + on Add, 12 square at the hairline weight`).toEqual(['plus 12×12 1px']);
    if (label !== 'Genres') expect.soft(rest.cells, `${label}: every cell top-aligned, so an opened row keeps its name at its top`).toEqual(['top']);
    /* The inline edit: the tick and the × on the table's rows; the tree's rename is a field with Enter and Escape, so it has neither. Editing, the row's name is its field's value, so the controls are found in the section. */
    await row.getByRole('button', { name: `Edit ${name}`, exact: true }).click();
    const editing = await readSection(page, label);
    expect.soft(editing.lucide, `${label}: no lucide drawing while editing`).toBe(0);
    expect.soft(editing.marks.filter((m) => !m.startsWith('plus')).sort(), `${label}: ${label === 'Genres' ? 'no mark on a rename' : 'the tick and the × as §T.1’s marks'}`).toEqual(label === 'Genres' ? [] : ['cross 12×12 1px', 'tick 12×12 1px']);
    const inkOf = await page.evaluate((lbl) => Array.from(document.querySelectorAll<SVGElement>(`section[aria-label="${lbl}"] svg[data-mark], [role="region"][aria-label="${lbl}"] svg[data-mark]`)).map((svg) => getComputedStyle(svg).stroke), label);
    for (const stroke of inkOf) expect.soft(INK, `${label}: the marks in ink (${stroke})`).toContain(stroke);
    if (label === 'Genres') await page.keyboard.press('Escape');
    else await region.getByRole('button', { name: `Cancel editing ${name}`, exact: true }).click();
  }
  await context.close();
});

test('manage at 390 under a coarse pointer: an open artist’s form has SAVE as a §9.3 box with DELETE and LINEUP as §9.3 labels in one action row, 24 apart', async ({ browser }) => {
  const context = await browser.newContext({ hasTouch: true, viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  await login(page);
  const f = await fixtures(page);
  await page.goto('/manage');
  await section(page, 'Artists');
  const region = page.getByRole('region', { name: 'Artists' });
  await region.locator('[data-manage-row]').filter({ has: page.locator('[data-manage-name]', { hasText: f.artist }) }).locator('[data-manage-open]').click();
  await expect(region.locator('[data-manage-form]')).toBeVisible();
  const actions = (await read(page, '[data-manage-form] [data-manage-actions] button')).filter((r) => r.height > 0);
  expect(actions.map((r) => r.text), 'the action row: SAVE, DELETE, LINEUP').toEqual(['Save', 'Delete', 'Lineup']);
  const [save, del, lineup] = actions;
  expectBox(save, 'Save', 'coarse');
  expectLabelControl(del, 'Delete');
  expectLabelControl(lineup, 'Lineup');
  expect.soft(new Set(actions.map((r) => Math.round(r.edges.top))).size, 'the three on one line').toBe(1);
  expect.soft(gapBetween(save.edges, del.edges), 'SAVE to DELETE').toMatchObject({ axis: 'x', gap: 24 });
  expect.soft(gapBetween(del.edges, lineup.edges), 'DELETE to LINEUP').toMatchObject({ axis: 'x', gap: 24 });
  for (const r of actions) expect.soft(r.height, `${r.text} is 44`).toBe(44);
  await context.close();
});
