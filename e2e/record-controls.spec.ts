import { expect, test, type Page } from '@playwright/test';
import { registerCleanup, trackArtist } from './cleanup';
import { GRID_FORK, NO_SCROLL_HEIGHT } from '../src/app/records/[id]/band-geometry';
import { login } from './sign-in';

registerCleanup();

/**
 * **§24: Edit and Delete record go in the top nav, at its far right.**
 *
 * §13's placement is superseded. It refused AppHeader because a bar identical
 * on six screens cannot hold a per-record control — an objection to the bar's
 * CONTENTS being per-record, and a named slot answers it: AppHeader gains one
 * `actions` slot at its right end, empty on every screen but this one, filled
 * by the page rather than by AppHeader. The component stays identical
 * everywhere; only this page puts something in it.
 *
 * The two verbs stay together, in that order, after the app's own right-hand
 * glyphs, separated from them by a 1px, 16px-tall hairline at 0.72. The
 * hairline marks the slot's boundary: left of it is the app's, right of it is
 * this record's. Both are 11px mono uppercase in ink — the nav's own type — so
 * they cost no height and add no weight.
 *
 * What §13 was protecting is kept by a different mechanism: its worry was the
 * app's only irreversible act sitting in chrome. Delete record ASKS before it
 * acts, naming the record, so its place in the nav makes it findable without
 * making it one click from gone.
 *
 * What moves with it: the eyebrow returns to Collection alone, and the foot
 * row that held Delete is gone. §13's deletion of the ← Collection band stands.
 */
async function seed(page: Page) {
  const s = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  const a = await page.request.post('/api/artists', { data: { name: `ctl-${s}` } });
  const { id: artistId } = await a.json();
  trackArtist(artistId);
  const r = await page.request.post('/api/records', {
    data: { artistId, title: `Controls ${s}`, releaseYear: 1979, notes: 'A note.' },
  });
  const { id } = await r.json();
  return { id: id as string, title: `Controls ${s}` };
}

test('§24: the slot is filled on the record screen and on no other', async ({ page }) => {
  await login(page);
  const { id } = await seed(page);
  await page.setViewportSize({ width: GRID_FORK, height: 1000 });

  /* Empty everywhere else: the component is identical on every screen. */
  for (const path of ['/', '/manage', '/want-list', '/stats']) {
    await page.goto(path);
    await expect(page.locator('[data-app-nav]')).toBeVisible();
    await expect(page.locator('[data-slot="actions"]'), `${path}: no actions slot rendered`).toHaveCount(0);
  }

  await page.goto(`/records/${id}`);
  await expect(page.locator('[data-app-nav] [data-slot="actions"]'), 'filled on records/[id]').toHaveCount(1);
});

test('§24: Edit then Delete record, far right, behind a 1 × 16 hairline, in the nav’s own type', async ({ page }) => {
  await login(page);
  const { id } = await seed(page);
  await page.setViewportSize({ width: GRID_FORK, height: 1000 });
  await page.goto(`/records/${id}`);
  await page.waitForTimeout(500);

  const m = await page.evaluate(() => {
    const header = document.querySelector('[data-app-nav]')!;
    const bar = header.querySelector(':scope > div')!.getBoundingClientRect();
    const slot = header.querySelector('[data-slot="actions"]');
    const hair = header.querySelector('[data-slot="actions"] [data-hairline]');
    const edit = header.querySelector('[data-slot="actions"] [data-control="edit"]');
    const del = header.querySelector('[data-slot="actions"] [data-control="delete"]');
    const glyphs = Array.from(header.querySelectorAll('nav a'));
    const lastGlyph = glyphs.at(-1) ?? null;

    const box = (el: Element | null) => (el === null ? null : el.getBoundingClientRect());
    const cs = (el: Element | null) => (el === null ? null : getComputedStyle(el));

    return {
      barRight: bar.right,
      slot: box(slot),
      hair: box(hair),
      hairBg: cs(hair)?.backgroundColor ?? null,
      edit: box(edit),
      del: box(del),
      lastGlyphRight: box(lastGlyph)?.right ?? null,
      editStyle: cs(edit) === null ? null : { size: cs(edit)!.fontSize, family: cs(edit)!.fontFamily, transform: cs(edit)!.textTransform, color: cs(edit)!.color },
      delStyle: cs(del) === null ? null : { size: cs(del)!.fontSize, family: cs(del)!.fontFamily, transform: cs(del)!.textTransform, color: cs(del)!.color },
      navIsSameHeightAsBefore: header.getBoundingClientRect().height,
    };
  });

  expect(m.edit, 'Edit is in the slot').not.toBeNull();
  expect(m.del, 'Delete record is in the slot').not.toBeNull();
  expect(m.hair, 'the hairline is drawn').not.toBeNull();

  /* Order: the app's glyphs, then the hairline, then Edit, then Delete — left to right. */
  expect(m.lastGlyphRight!, 'the app’s glyphs come first').toBeLessThanOrEqual(m.hair!.left);
  expect(m.hair!.right, 'the hairline precedes Edit').toBeLessThanOrEqual(m.edit!.left);
  expect(m.edit!.right, 'Edit precedes Delete').toBeLessThanOrEqual(m.del!.left);

  /* Far right: the slot ends where the bar's content ends. */
  expect(m.barRight - m.del!.right, 'Delete is at the bar’s far right').toBeLessThanOrEqual(20);

  /* The hairline: 1 × 16, at the 0.72 rule value. */
  expect(Math.round(m.hair!.width), '1px wide').toBe(1);
  expect(Math.round(m.hair!.height), '16px tall').toBe(16);
  /* 0.72 in oklch is L* ≈ 67.5 in lab, which is how a colour-mixed utility serialises it. */
  expect(m.hairBg, 'at the 0.72 hairline').toMatch(/oklch\(0\.72 |lab\(67\.|rgb\(17[0-9], 17[0-9], 1[67][0-9]\)/);

  /* The nav's own type: 11px mono uppercase, ink. */
  for (const [name, s] of [['Edit', m.editStyle], ['Delete', m.delStyle]] as const) {
    expect(s!.size, `${name} is 11px`).toBe('11px');
    expect(s!.family, `${name} is mono`).toMatch(/mono/i);
    expect(s!.transform, `${name} is uppercase`).toBe('uppercase');
    /*
      Measured, not guessed: oklch 0.19 serialises as lab(6.18 …). Muted is
      oklch 0.44, about L* 37, so any L* under 15 is ink and nothing else on
      this page is. The first version guessed 10–14 and failed on the truth.
    */
    expect(s!.color, `${name} is ink, not muted`).toMatch(/oklch\(0\.19 |lab\((\d|1[0-4])\.|rgb\(3[0-9], 3[0-9], 3[0-9]\)|rgb\(4[0-9], 4[0-9], 4[0-9]\)/);
  }

  /* They cost no height: the bar is one line tall at this width. */
  expect(m.navIsSameHeightAsBefore, 'the nav stays one line').toBeLessThan(60);
});

test('§24 at 390: the slot takes its own row below the header’s row, right-aligned (§G.8)', async ({ page }) => {
  /*
    Step 76 replaced the wrapped nav this test pinned ("the nav keeps its
    two-row wrap") with a menu below 584; §G.5 assigns the wrapping tests to
    that step. What §24 and §G.8 keep at 390: the wordmark and the control
    hold the 52 row, unchanged by the slot, and the slot takes a row of its
    own below it at the right -- 24/in-line-no-height's narrow case.
  */
  await login(page);
  const { id } = await seed(page);
  await page.setViewportSize({ width: 390, height: NO_SCROLL_HEIGHT });

  await page.goto('/want-list');
  const without = await page.evaluate(() => {
    const c = document.querySelector('[data-app-nav] [data-menu-control]')!.getBoundingClientRect();
    const mark = document.querySelector('[data-app-nav] [data-wordmark]')!.getBoundingClientRect();
    return { controlTop: c.top, markCentre: (mark.top + mark.bottom) / 2 };
  });

  await page.goto(`/records/${id}`);
  await page.waitForTimeout(400);
  const m = await page.evaluate(() => {
    const c = document.querySelector('[data-app-nav] [data-menu-control]')!.getBoundingClientRect();
    const slot = document.querySelector('[data-slot="actions"]')!.getBoundingClientRect();
    const bar = document.querySelector('[data-app-nav] > div')!.getBoundingClientRect();
    const mark = document.querySelector('[data-app-nav] [data-wordmark]')!.getBoundingClientRect();
    return { controlTop: c.top, markCentre: (mark.top + mark.bottom) / 2, rowBottom: bar.top + 52, slotTop: slot.top, slotRight: slot.right, barRight: bar.right };
  });

  expect(m.controlTop, 'the control sits where it does without the slot').toBeCloseTo(without.controlTop, 0);
  expect(m.markCentre, 'and so does the wordmark').toBeCloseTo(without.markCentre, 0);
  expect(m.slotTop, 'the slot sits below the 52 row').toBeGreaterThanOrEqual(m.rowBottom - 0.5);
  expect(m.barRight - m.slotRight, 'at the right, on the 18 inset').toBeCloseTo(18, 0);
});

test('§24: the eyebrow returns to Collection alone and the foot row is gone', async ({ page }) => {
  await login(page);
  const { id } = await seed(page);
  await page.setViewportSize({ width: GRID_FORK, height: 1000 });
  await page.goto(`/records/${id}`);

  /* §27 deleted the eyebrow's grid row; the label sits in the content flow, first, and alone. */
  const eyebrow = page.locator('[data-field="eyebrow"]');
  await expect(eyebrow).toBeVisible();
  await expect(eyebrow, 'the eyebrow reads Collection, and nothing else').toHaveText(/^\s*collection\s*$/i);
  await expect(page.locator('[data-row="eyebrow"]'), 'the row §13 added is gone').toHaveCount(0);
  /* The head of the block that flows from the top — not a third child of the track, which would share its slack. */
  const first = page.locator('[data-block="title"] > :first-child');
  await expect(first, 'and it is the title block’s first child').toHaveAttribute('data-field', 'eyebrow');
  await expect(page.locator('[data-row="delete"]'), 'the foot Delete row is deleted').toHaveCount(0);
  await expect(page.getByTestId('record-controls'), '§13’s band deletion stands').toHaveCount(0);
});

test('§24: both verbs work, and Delete asks first, naming the record', async ({ page }) => {
  await login(page);
  const { id, title } = await seed(page);
  await page.setViewportSize({ width: GRID_FORK, height: 1000 });
  await page.goto(`/records/${id}`);

  /* Delete asks before it acts, and the question names the record. */
  await page.locator('[data-slot="actions"] [data-control="delete"]').click();
  const dialog = page.getByRole('dialog');
  await expect(dialog, 'a confirmation opens').toBeVisible();
  await expect(dialog, 'and it names the record').toContainText(title);
  await expect(page, 'nothing has been deleted yet').toHaveURL(`/records/${id}`);
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();

  /* Edit is a link to the editor, asserted by role so plain text cannot satisfy it. */
  const edit = page.locator('[data-slot="actions"]').getByRole('link', { name: /^edit$/i });
  await expect(edit).toHaveAttribute('href', `/records/${id}/edit`);
  await edit.click();
  await expect(page).toHaveURL(`/records/${id}/edit`);
});
