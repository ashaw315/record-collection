import { expect, test, type Page } from '@playwright/test';
import { registerCleanup, trackArtist } from './cleanup';
import { login } from './sign-in';

/**
 * Step 146, §T.6 part 2's passes, the lineup walk (Design, 14 Oct): "The
 * lineup picker's choices become hairline-separated rows, and its progress
 * line takes a reserved slot the row's width beneath the row. At 1280 that
 * is not the 60-wide actions cell, where it ran to three lines." And the
 * reserved-slot rule: "a status or error that replaces or follows a control
 * takes a reserved slot of stated lines", so the slot keeps its height from
 * the first word of progress to the result.
 *
 * The walk and the search are mocked at the route, as manage.spec does; the
 * artists are this test's own, listed with ?artists=all. Read at 1280 under
 * a fine pointer on the table and at 390 under a coarse pointer on the
 * list's open form. Fails against the build before it: the progress line
 * and the picker inside the actions cell, right-aligned under LINEUP, the
 * picker a 288-wide box of boxed buttons.
 */
registerCleanup();

const WINDOWS = [[1280, 'fine'], [390, 'coarse']] as const;

type Box = { left: number; right: number; top: number; bottom: number; height: number };
const boxOf = (page: Page, selector: string) => page.locator(selector).first().evaluate((el): Box => { const r = el.getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, height: r.height }; });

async function makeArtist(page: Page, name: string) {
  const response = await page.request.post('/api/artists', { data: { name } });
  expect(response.status(), name).toBe(201);
  const id = ((await response.json()) as { id: string }).id;
  trackArtist(id);
  return id;
}

for (const [width, pointer] of WINDOWS) test(`the lineup walk at ${width} under a ${pointer} pointer: its progress and result in a reserved slot the row’s width beneath the row, held to one height; the picker’s choices as hairline rows in the same slot`, async ({ browser }) => {
  const context = await browser.newContext({ hasTouch: pointer === 'coarse', viewport: { width, height: 844 } });
  const page = await context.newPage();
  await login(page);
  const suffix = `l146${Date.now().toString(36)}`;
  const walker = await makeArtist(page, `Walk ${suffix}`);
  const picked = await makeArtist(page, `Pick ${suffix}`);
  let finish: (() => void) | undefined;
  const finished = new Promise<void>((resolve) => { finish = resolve; });
  await page.route(`**/api/artists/${walker}/lineup`, async (route) => {
    await finished;
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ walked: true, candidates: [], checked: 3, total: 3, partial: false, text: '3 members.' }) });
  });
  await page.route(`**/api/artists/${walker}/lineup/progress`, async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ found: 12 }) });
  });
  await page.route(`**/api/artists/${picked}/lineup`, async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ walked: false, candidates: [
      { mbid: 'mb-one', name: `Pick ${suffix}`, score: 100, type: 'Group', country: 'GB', disambiguation: 'UK hardcore punk/d-beat band', lifeSpan: { begin: '1977', end: null, ended: false } },
      { mbid: 'mb-two', name: `Pick ${suffix}`, score: 83, type: 'Group', country: 'GB', disambiguation: 'UK punk band, only one release', lifeSpan: { begin: '1978', end: '1980', ended: true } },
    ] }) });
  });
  await page.goto('/manage?artists=all');
  await page.getByRole('navigation', { name: 'Resource' }).getByRole('button', { name: 'Artists', exact: true }).click();
  const region = page.getByRole('region', { name: 'Artists' });
  await expect(region).toBeVisible();
  await page.evaluate(() => document.fonts.ready);

  /* The row the slot sits beneath, and the row's width: the table's at 1280, the list item's at 390. */
  const rowOf = async (name: string) => {
    if (width < 640) {
      const item = region.locator('[data-manage-row]').filter({ has: page.locator('[data-manage-name]', { hasText: name }) });
      await item.locator('[data-manage-open]').click();
      await expect(item.locator('[data-manage-form]')).toBeVisible();
      return { lineup: item.getByRole('button', { name: /lineup/i }), width: await item.evaluate((el) => el.getBoundingClientRect().width), edges: await item.evaluate((el) => { const r = el.getBoundingClientRect(); return { left: r.left, right: r.right }; }) };
    }
    const row = region.getByRole('button', { name: `Edit ${name}`, exact: true }).locator('xpath=ancestor::tr[1]');
    const table = row.locator('xpath=ancestor::table[1]');
    return { lineup: row.getByRole('button', { name: /lineup/i }), width: await table.evaluate((el) => el.getBoundingClientRect().width), edges: await table.evaluate((el) => { const r = el.getBoundingClientRect(); return { left: r.left, right: r.right }; }) };
  };

  /* The walk: the slot appears beneath the row at the row's width and holds its height from the first word to the result. */
  const w = await rowOf(`Walk ${suffix}`);
  const actionsBefore = width < 640 ? null : await boxOf(page, `[data-lineup-for="${walker}"]`).catch(() => null);
  await w.lineup.click();
  const progress = page.getByTestId('lineup-progress');
  await expect(progress).toBeVisible({ timeout: 15_000 });
  const slot = page.locator(`[data-lineup-slot="${walker}"]`);
  await expect(slot, 'the slot beneath the row').toBeVisible();
  const first = await boxOf(page, `[data-lineup-slot="${walker}"]`);
  expect.soft(Math.abs(first.left - w.edges.left), `${width}: the slot starts at the row's left`).toBeLessThanOrEqual(1);
  expect.soft(Math.abs(first.right - w.edges.right), `${width}: the slot ends at the row's right`).toBeLessThanOrEqual(1);
  const lineupBox = await w.lineup.evaluate((el) => el.getBoundingClientRect().bottom);
  expect.soft(first.top, `${width}: the slot is beneath the row`).toBeGreaterThanOrEqual(lineupBox - 1);
  await expect(progress, 'a count, not a spinner').toContainText(/12/, { timeout: 15_000 });
  const counted = await boxOf(page, `[data-lineup-slot="${walker}"]`);
  finish?.();
  await expect(page.getByTestId('lineup-result')).toContainText(/3 members/i, { timeout: 15_000 });
  const done = await boxOf(page, `[data-lineup-slot="${walker}"]`);
  expect.soft([counted.height, done.height], `${width}: the slot holds its height from the first word (${first.height}) to the count and the result`).toEqual([first.height, first.height]);
  if (actionsBefore !== null) {
    const actionsAfter = await boxOf(page, `[data-lineup-for="${walker}"]`);
    expect.soft(actionsAfter.right - actionsAfter.left, `${width}: the actions cell keeps its width`).toBeCloseTo(actionsBefore.right - actionsBefore.left, 0);
  }

  /* The picker: hairline rows in the slot, no box, each choice the slot's width. */
  const p = await rowOf(`Pick ${suffix}`);
  await p.lineup.click();
  const picker = page.getByTestId('lineup-picker');
  await expect(picker).toBeVisible({ timeout: 15_000 });
  const look = await picker.evaluate((el) => {
    const cs = getComputedStyle(el);
    const choices = Array.from(el.querySelectorAll<HTMLElement>('[data-testid="lineup-candidate"]'));
    /* The slot's content box: the row's width less the cell's own 12 either side in the table, the row's width in the list. */
    const slot = el.closest('[data-lineup-slot]') as HTMLElement;
    const cell = slot.tagName === 'TR' ? (slot.querySelector('td') as HTMLElement) : slot;
    const cellStyle = getComputedStyle(cell);
    const content = cell.getBoundingClientRect().width - parseFloat(cellStyle.paddingLeft) - parseFloat(cellStyle.paddingRight);
    return {
      content,
      box: { border: cs.borderTopWidth, radius: cs.borderTopLeftRadius, fill: cs.backgroundColor, width: el.getBoundingClientRect().width },
      choices: choices.map((c) => { const li = c.closest('li') as HTMLElement; const ls = getComputedStyle(li); const b = getComputedStyle(c); return { rule: `${ls.borderTopWidth}/${ls.borderBottomWidth}`, radius: b.borderTopLeftRadius, border: b.borderTopWidth, fill: b.backgroundColor, width: c.getBoundingClientRect().width }; }),
    };
  });
  expect.soft(look.box, `${width}: the picker is no box`).toMatchObject({ border: '0px', radius: '0px', fill: 'rgba(0, 0, 0, 0)' });
  expect.soft(Math.abs(look.box.width - look.content), `${width}: the picker fills its slot, the row's width less the cell's padding (${look.content} of the row's ${p.width})`).toBeLessThanOrEqual(1);
  expect.soft(p.width - look.content, `${width}: the slot's content is the row's width less at most the cell's 24`).toBeLessThanOrEqual(24);
  expect(look.choices.length, 'two choices').toBe(2);
  for (const c of look.choices) {
    expect.soft(c.rule.includes('1px'), `${width}: a choice is a row between hairlines (${c.rule})`).toBe(true);
    expect.soft(c, `${width}: a choice is not a boxed button`).toMatchObject({ border: '0px', radius: '0px', fill: 'rgba(0, 0, 0, 0)' });
    expect.soft(Math.abs(c.width - look.box.width), `${width}: a choice is the slot's width`).toBeLessThanOrEqual(1);
  }
  await context.close();
});
