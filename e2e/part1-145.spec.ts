import { expect, test, type Page } from '@playwright/test';
import { registerCleanup, trackArtist, trackCreated } from './cleanup';
import { gapBetween } from './pair-gap';
import { login } from './sign-in';
import { pointerIs } from './hit-area';
import { LABEL_INK, expectBox, expectHeading, expectLabel, expectLabelControl, read } from './type-read';

registerCleanup();

/**
 * Step 145, §T.6 part 1's passes (Design, 13 Oct 14:40; the handoff's
 * unnumbered step): "On the want list's item page and new and edit forms:
 * labels in §4.1's type, actions as §9.3 controls with CANCEL 24 clear,
 * each label on its field's first line (fixing Best dig at 1280), one
 * heading weight with the Collection's, and the record page title's
 * leading on a wrapped heading. Login: the 18 inset at 390, centred at
 * 1280, the refusal in its reserved slot, and the same type. Not-found:
 * the header, the 40 heading Not found., the address sentence and a
 * COLLECTION control." Login's ring is the ring step's (144).
 *
 * Read from computed style at 390 under a coarse pointer and 1280 under a
 * fine one, as the captures are taken. Fails against the build before it:
 * sans uppercase labels, sentence-case boxes 32 tall, an underlined
 * Cancel 12 from the box, headings at two weights, login's 15px lede and
 * sans label, and a not-found page with no heading and no control.
 */
const WINDOWS = [[390, 'coarse'], [1280, 'fine']] as const;

async function fixtures(page: Page) {
  const suffix = `p145${Date.now().toString(36)}`;
  const post = async (path: string, data: unknown) => {
    const response = await page.request.post(path, { data });
    expect(response.status(), path).toBe(201);
    const body = (await response.json()) as { id: string };
    trackCreated(path, body);
    return body.id;
  };
  const artist = await post('/api/artists', { name: `Discharge ${suffix}` });
  trackArtist(artist);
  /* A title long enough to wrap at 390, a hunt and a ceiling, so every section draws. */
  const item = await post('/api/want-list', { title: `Why Why Why Why Why Why Why Why Why ${suffix}`, artistId: artist, bestDigNotes: 'The Clay first press, matrix A1/B1.', maxPrice: '40.00' });
  return { item };
}

for (const [width, pointer] of WINDOWS) test.describe(`part 1 at ${width} under a ${pointer} pointer`, () => {
  test.use({ hasTouch: pointer === 'coarse', viewport: { width, height: 844 } });

  test(`the want-list item page: §4.1 labels, one heading weight with the Collection’s and the record title’s leading on its wrapped title, EDIT a §9.3 box`, async ({ page }) => {
    expect(await pointerIs(page)).toBe(pointer);
    await login(page);
    const { item } = await fixtures(page);
    await page.goto(`/want-list/${item}`);
    await page.getByTestId('hunt').waitFor();
    const [h1] = await read(page, 'main h1');
    expect(h1).toBeDefined();
    if (h1 === undefined) return;
    expectHeading(h1, 'the title');
    /* "a wrapped 40 heading takes the leading of the record page's title", 0.94 (`IdentityCell.tsx`): 37.6 a line. At 390 this title wraps; at 1280 it does not, and the leading holds either way. */
    expect.soft(h1.lineHeight, 'the record page title’s leading').toBe('37.6px');
    if (width === 390) expect.soft(h1.height, 'the title wraps at 390, so the leading is seen').toBeGreaterThan(40);
    for (const r of await read(page, 'main [data-testid="hunt"] h2, main [data-testid="ceiling"] h2, main [data-testid="hunt"] dt, main section h2')) expectLabel(r, `“${r.text}”`);
    const [edit] = await read(page, '[data-testid="want-list-edit"]');
    expect(edit).toBeDefined();
    if (edit !== undefined) expectBox(edit, 'EDIT');
    expect.soft(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), 'nothing wider than the window').toBe(true);
  });

  for (const [which, path] of [['new', (item: string) => `/want-list/new?from=${item}`], ['edit', (item: string) => `/want-list/${item}/edit`]] as const) {
    test(`the want-list ${which} form: §4.1 section and field labels on their field’s first line, the submit a §9.3 box, CANCEL a §9.3 label 24 clear, the heading at the Collection’s weight`, async ({ page }) => {
      expect(await pointerIs(page)).toBe(pointer);
      await login(page);
      const { item } = await fixtures(page);
      await page.goto(which === 'new' ? '/want-list/new' : path(item));
      await page.getByTestId('want-list-form').waitFor();
      await page.evaluate(() => document.fonts.ready);
      const [h1] = await read(page, 'main h1');
      expect(h1).toBeDefined();
      if (h1 !== undefined) expectHeading(h1, 'the heading');
      for (const r of await read(page, '[data-testid="want-list-form"] section h2, [data-testid="want-list-form"] label[for]')) expectLabel(r, `“${r.text}”`);
      const [submit] = await read(page, '[data-testid="want-list-form"] button[type="submit"]');
      /* The button after the submit: the form's other plain buttons are the inline-create rows' (+ NEW ARTIST). */
      const [cancel] = await read(page, '[data-testid="want-list-form"] button[type="submit"] + button');
      expect(submit).toBeDefined();
      expect(cancel).toBeDefined();
      if (submit === undefined || cancel === undefined) return;
      expectBox(submit, submit.text);
      expectLabelControl(cancel, 'CANCEL');
      expect.soft(cancel.text.toUpperCase()).toBe('CANCEL');
      const apart = gapBetween(submit.edges, cancel.edges);
      expect.soft(apart, 'CANCEL beside the box, 24 clear').toEqual({ axis: 'x', gap: 24 });
      /*
        "a field's label aligns with the field's first line" (Best dig at 1280 was at its box's foot): the label's
        own line and the field's first line of type share a middle, within a pixel or two, for every labelled field.
        Below 640 under a coarse pointer the label is the field's width above it (step 129) and stands over it.
      */
      if (width >= 640) {
        const rows = await page.evaluate(() => Array.from(document.querySelectorAll<HTMLLabelElement>('[data-testid="want-list-form"] label[for]')).map((label) => { const field = document.getElementById(label.htmlFor) as HTMLElement; const fs = getComputedStyle(field); const ls = getComputedStyle(label); const fb = field.getBoundingClientRect(); const lb = label.getBoundingClientRect(); const firstLine = field.tagName === 'TEXTAREA' ? fb.top + parseFloat(fs.borderTopWidth) + parseFloat(fs.paddingTop) + parseFloat(fs.lineHeight) / 2 : fb.top + fb.height / 2; const labelLine = lb.top + parseFloat(ls.paddingTop) + parseFloat(ls.lineHeight) / 2; return { id: label.htmlFor, off: Math.round((labelLine - firstLine) * 10) / 10 }; }));
        for (const row of rows) expect.soft(Math.abs(row.off), `${row.id}: the label’s line against the field’s first line (${row.off})`).toBeLessThanOrEqual(2);
      }
    });
  }

  test(`login: the 18 inset at 390 and a centred 384 column at 1280, the refusal’s slot, and the type: the 40 heading, a 13 sentence in the label colour, PASSWORD a §4.1 label, SIGN IN a §9.3 box`, async ({ page }) => {
    expect(await pointerIs(page)).toBe(pointer);
    await page.goto('/login');
    await page.getByLabel('Password').waitFor();
    await page.evaluate(() => document.fonts.ready);
    const [h1] = await read(page, 'main h1');
    const [sentence] = await read(page, 'main h1 + p');
    const [label] = await read(page, 'main label[for="password"]');
    const [button] = await read(page, 'main button[type="submit"]');
    expect(h1 && sentence && label && button, 'the precondition: heading, sentence, label and button are found').toBeTruthy();
    if (!h1 || !sentence || !label || !button) return;
    expectHeading(h1, 'the heading');
    expect.soft(sentence.size, 'the sentence is 13').toBe('13px');
    expect.soft(LABEL_INK, 'the sentence in the label colour').toContain(sentence.colour);
    expectLabel(label, 'PASSWORD');
    expectBox(button, 'SIGN IN');
    expect.soft(h1.left, width === 390 ? 'the block at the 18 inset' : 'the block centred, 384 wide: its left at 448').toBe(width === 390 ? 18 : 448);
    expect.soft(await page.locator('#password-error').evaluate((el) => el.getBoundingClientRect().height), 'the refusal’s slot is reserved, one line, before anything is refused').toBeGreaterThan(0);
  });

  test(`not found: the header, the 40 heading Not found., the address sentence in the label colour, and a COLLECTION §9.3 box, as the error screen`, async ({ page }) => {
    expect(await pointerIs(page)).toBe(pointer);
    await login(page);
    await page.goto('/no-such-page-145');
    await page.getByTestId('not-found-line').waitFor();
    /* The header: at 390 its navigation stands behind MENU, so the header itself is what is looked for. */
    await expect(page.locator('header[data-app-nav]'), 'the header').toBeVisible();
    const [h1] = await read(page, 'main h1');
    const [line] = await read(page, '[data-testid="not-found-line"]');
    const [control] = await read(page, 'main a[href="/"]');
    expect(h1 && line && control, 'the precondition: heading, sentence and control are found').toBeTruthy();
    if (!h1 || !line || !control) return;
    expect.soft(h1.text).toBe('Not found.');
    expectHeading(h1, 'the heading');
    expect.soft(h1.left, 'at the 18').toBe(18);
    expect.soft(await page.locator('main p').count(), 'one sentence').toBe(1);
    expect.soft(line.size, 'the sentence is 13').toBe('13px');
    expect.soft(LABEL_INK, 'in the label colour').toContain(line.colour);
    await expect(page.getByTestId('not-found-line'), 'naming the address').toContainText('/no-such-page-145');
    expect.soft(control.text.toUpperCase()).toBe('COLLECTION');
    expectBox(control, 'COLLECTION');
  });
});
