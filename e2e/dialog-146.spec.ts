import { expect, test, type Page } from '@playwright/test';
import { registerCleanup, trackArtist, trackCreated } from './cleanup';
import { DIALOG, expectDialogControls } from './hit-area';
import { login } from './sign-in';
import { INK, expectBox, read } from './type-read';

/**
 * Step 146, §T.6 part 2's passes, the shared dialog (Design, 14 Oct): "it is
 * opaque paper in a 1px ink box over the page. At 1280 the blurred, dimmed
 * page behind it is a defect against §M.1's no dimming, and so is the
 * tinted band under its buttons. Cancel's grey fill goes, and CANCEL and
 * the verb are §9.3 boxes. At 390 the build stacks Delete above Cancel, a
 * defect against the order already ruled, Cancel first, 24 apart. The ×
 * stays at the top right at 44." And §T.6's "a destructive action ink, as
 * §24's Delete record is".
 *
 * Read on the three screens that open it, a record's delete, a want-list
 * row's delete and manage's delete, at 390 under a coarse pointer and 1280
 * under a fine one. The order, the 24 and the 44 are `expectDialogControls`,
 * which the three screens' own specs also call. Fails against the build
 * before it: a backdrop tinted black at 10% and blurred, the popup in a 10%
 * ring, a footer with a muted fill and a top rule, an outline Cancel and a
 * red-filled Delete, both 32 under a mouse.
 */
registerCleanup();

const WINDOWS = [[390, 'coarse'], [1280, 'fine']] as const;
type Surfaces = { paper: string; overlay: { fill: string; blur: string }; popup: { fill: string; border: string; borderColour: string; radius: string; shadow: string }; footer: { fill: string; borderTop: string } };
const surfaces = (page: Page) => page.evaluate((): Surfaces => {
  const cs = (sel: string) => getComputedStyle(document.querySelector(sel) as HTMLElement);
  const o = cs('[data-slot="dialog-overlay"]'); const p = cs('[data-slot="dialog-content"]'); const f = cs('[data-slot="dialog-footer"]');
  return { paper: getComputedStyle(document.body).backgroundColor, overlay: { fill: o.backgroundColor, blur: o.backdropFilter }, popup: { fill: p.backgroundColor, border: p.borderTopWidth, borderColour: p.borderTopColor, radius: p.borderTopLeftRadius, shadow: p.boxShadow }, footer: { fill: f.backgroundColor, borderTop: f.borderTopWidth } };
});

async function expectDialog(page: Page, pointer: 'coarse' | 'fine', where: string) {
  await page.locator(DIALOG).waitFor();
  await page.locator(DIALOG).evaluate((el) => Promise.all(el.getAnimations().map((animation) => animation.finished)));
  const s = await surfaces(page);
  expect.soft(s.overlay, `${where}: nothing dimmed or blurred behind the dialog`).toMatchObject({ fill: 'rgba(0, 0, 0, 0)', blur: 'none' });
  expect.soft(s.popup, `${where}: opaque paper in a 1px ink box, square`).toMatchObject({ border: '1px', radius: '0px', shadow: 'none' });
  expect.soft(s.popup.fill, `${where}: the popup is the page's paper`).toBe(s.paper);
  expect.soft(INK, `${where}: the box is ink (${s.popup.borderColour})`).toContain(s.popup.borderColour);
  expect.soft(s.footer, `${where}: no tinted band and no rule under the buttons`).toMatchObject({ fill: 'rgba(0, 0, 0, 0)', borderTop: '0px' });
  const buttons = await read(page, `${DIALOG} [data-slot="dialog-footer"] button`);
  expect(buttons.map((b) => b.text), `${where}: CANCEL then the verb`).toEqual(['Cancel', 'Delete']);
  /* Design, 17 Oct: a §9.3 box is drawn 32 under a fine pointer, as Save is, and 44 under a coarse one, the floor; a label keeps its 44 line under both. */
  for (const b of buttons) { expectBox(b, `${where}: ${b.text}`, pointer); expect.soft(b.height, `${where}: ${b.text} is the box's ${pointer === 'coarse' ? '44 under a finger' : 'drawn 32 under a mouse'}`).toBe(pointer === 'coarse' ? 44 : 32); }
  await expectDialogControls(page, pointer, where);
  /* Measured, not assumed (the reviewer, 17 Oct): the footer holds boxes alone, so its row is the box's height and the dialog is 12 shorter under a mouse. Reported, not pinned. */
  const footer = await page.locator(`${DIALOG} [data-slot="dialog-footer"]`).evaluate((el) => el.getBoundingClientRect().height);
  test.info().annotations.push({ type: `footer row, ${where}`, description: `${Math.round(footer)} tall with the boxes at ${pointer === 'coarse' ? 44 : 32}` });
}

for (const [width, pointer] of WINDOWS) test(`the shared dialog at ${width} under a ${pointer} pointer: paper in an ink box over an undimmed page, CANCEL and DELETE as §9.3 boxes 24 apart, on a record, a want-list row and manage`, async ({ browser }) => {
  const context = await browser.newContext({ hasTouch: pointer === 'coarse', viewport: { width, height: 844 } });
  const page = await context.newPage();
  await login(page);
  const suffix = `d146${Date.now().toString(36)}`;
  const post = async (path: string, data: unknown) => {
    const response = await page.request.post(path, { data });
    expect(response.status(), path).toBe(201);
    const body = (await response.json()) as { id: string };
    trackCreated(path, body);
    return body.id;
  };
  const artist = await post('/api/artists', { name: `Dialog ${suffix}` });
  trackArtist(artist);
  const record = await post('/api/records', { title: `Dialog ${suffix}`, artistId: artist });
  const item = await post('/api/want-list', { title: `Dialog want ${suffix}`, artistId: artist });
  const tag = `dialog-${suffix}`;
  await post('/api/tags', { name: tag });

  await page.goto(`/records/${record}`);
  await page.getByRole('button', { name: 'Delete record' }).click();
  await expectDialog(page, pointer, `a record’s delete at ${width}`);
  await page.keyboard.press('Escape');

  await page.goto('/want-list');
  await page.getByRole('listitem').filter({ hasText: `Dialog want ${suffix}` }).getByRole('button', { name: 'Delete' }).click();
  await expectDialog(page, pointer, `the want list’s delete at ${width}`);
  await page.keyboard.press('Escape');

  await page.goto('/manage');
  await page.getByRole('button', { name: 'Tags', exact: true }).click();
  const region = page.getByRole('region', { name: 'Tags' });
  await expect(region).toBeVisible();
  /* Below 640 the entry's controls are in its open form (step 133); from 640 they are on its row. */
  if (width < 640) await region.locator('[data-manage-row]').filter({ hasText: tag }).locator('button').first().click();
  await region.getByRole('button', { name: `Delete ${tag}`, exact: true }).click();
  await expectDialog(page, pointer, `manage’s delete at ${width}`);
  await page.getByTestId('confirm-delete').click();
  await expect(page.locator(DIALOG)).toBeHidden();
  expect(item).toBeTruthy();
  await context.close();
});
