import { expect, test, type Page } from '@playwright/test';
import { registerCleanup, trackArtist } from './cleanup';
import { GRID_FORK } from '../src/app/records/[id]/band-geometry';

registerCleanup();

/**
 * **§13: the record's controls — a departure, an interaction and an ending
 * are three things, not two.**
 *
 * Edit moves to the right end of the frame's EYEBROW line, level with
 * COLLECTION. Not AppHeader: that is chrome shared with six screens, and a
 * control acting on THIS record cannot live in a bar identical on all of
 * them. The eyebrow is the frame's top line at 11px mono and Edit is 11px
 * mono, so the control joins a line it already matches and costs no height —
 * a claim about the structure, which is why the row is asserted here and not
 * only the position: the eyebrow and Edit share one baseline row with
 * `space-between`, so the row's height is the line's.
 *
 * Delete does NOT go with it. It goes alone to the foot of §9's region,
 * because deletion is the record's end and the page is the record. §11.19 put
 * "Open the full record" above "Turn over" and "Put back" on the same ground:
 * a departure separates from the verbs that act on the object. Delete is
 * neither — it is the departure that takes the record with it — so it sits
 * after everything the record is. Keeping the two verbs together would put
 * the app's only irreversible act in its chrome line, where every other
 * screen's chrome is safe.
 *
 * And the ← Collection band goes: the CONTAINER, because §8.1 already deleted
 * its only occupant and §12 removed the link. Once Edit and Delete move out
 * it holds nothing, and deleting it gives §9's region its height back.
 */
const PASSWORD = process.env.E2E_PASSWORD ?? 'test-password-for-e2e';

async function login(page: Page) {
  await page.goto('/login');
  await page.locator('form[data-hydrated="true"]').waitFor({ timeout: 15_000 });
  await page.getByLabel('Password').pressSequentially(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL('/');
}

async function seed(page: Page) {
  const s = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  const a = await page.request.post('/api/artists', { data: { name: `ctl-${s}` } });
  const { id: artistId } = await a.json();
  trackArtist(artistId);
  const r = await page.request.post('/api/records', {
    data: { artistId, title: `Controls ${s}`, releaseYear: 1979, notes: 'A note.' },
  });
  const { id } = await r.json();
  return id as string;
}

test('§13: Edit rides the eyebrow, Delete ends the region, the band is gone', async ({ page }) => {
  await login(page);
  const id = await seed(page);
  await page.setViewportSize({ width: GRID_FORK, height: 1100 });
  await page.goto(`/records/${id}`);
  await page.waitForTimeout(700);

  /* The band's container is deleted, not merely emptied. */
  await expect(
    page.getByTestId('record-controls'),
    '§13: the ← Collection band is deleted entirely',
  ).toHaveCount(0);

  const m = await page.evaluate(() => {
    const eyebrow = document.querySelector('[data-field="eyebrow"]');
    const edit = document.querySelector('[data-control="edit"]');
    const row = eyebrow?.parentElement ?? null;
    const cell = document.querySelector('[data-cell="identity"]');
    const del = document.querySelector('[data-control="delete"]');
    const sections = Array.from(document.querySelectorAll('[data-section]'));
    const last = sections.at(-1);

    const box = (el: Element | null | undefined) => {
      if (el === null || el === undefined) return null;
      const r = el.getBoundingClientRect();
      return { x: Math.round(r.x), y: Math.round(r.y), right: Math.round(r.right), bottom: Math.round(r.bottom), h: Math.round(r.height) };
    };
    const style = (el: Element | null) => (el === null ? null : getComputedStyle(el));

    return {
      eyebrow: box(eyebrow),
      eyebrowText: eyebrow?.textContent?.trim() ?? null,
      eyebrowFont: style(eyebrow)?.fontFamily ?? null,
      eyebrowSize: style(eyebrow)?.fontSize ?? null,
      edit: box(edit),
      editSize: style(edit)?.fontSize ?? null,
      row: box(row),
      rowJustify: style(row)?.justifyContent ?? null,
      rowAlign: style(row)?.alignItems ?? null,
      cell: box(cell),
      delete: box(del),
      lastSectionBottom: box(last)?.bottom ?? null,
      deleteInsideASection: del?.closest('[data-section]') !== null && del !== null,
    };
  });

  /* The eyebrow itself, which §8.1 rules is the band's label and not a link. */
  expect(m.eyebrowText, 'the eyebrow reads COLLECTION').toMatch(/collection/i);
  expect(m.eyebrowFont, 'the eyebrow is mono').toMatch(/mono/i);
  expect(m.eyebrowSize, '11px, the label system').toBe('11px');

  /* Edit joins a line it already matches, so it costs no height. */
  expect(m.edit, 'Edit is drawn').not.toBeNull();
  expect(m.editSize, 'Edit is 11px mono, like the line it joins').toBe(m.eyebrowSize);
  expect(m.rowJustify, 'the row is space-between').toBe('space-between');
  expect(m.rowAlign, 'baseline-aligned').toBe('baseline');
  expect(m.row?.h, 'the row is the line’s height, so Edit costs none').toBeLessThanOrEqual((m.eyebrow?.h ?? 0) + 2);

  /* Eyebrow first, Edit second and at the cell's right edge. */
  expect(m.eyebrow!.x, 'the eyebrow leads the row').toBeLessThan(m.edit!.x);
  expect(m.cell!.right - m.edit!.right, 'Edit sits at the cell’s right edge').toBeLessThanOrEqual(20);

  /* Delete is alone at the foot of the region, after everything the record is. */
  expect(m.delete, 'Delete is drawn').not.toBeNull();
  expect(m.delete!.y, 'Delete follows the last section').toBeGreaterThanOrEqual(m.lastSectionBottom! - 1);
  expect(m.deleteInsideASection, 'Delete is its own row, not inside a section').toBe(false);

  /* And the two are not together: §3's departure is not the interaction. */
  expect(Math.abs(m.delete!.y - m.edit!.y), 'Edit and Delete are not on one line').toBeGreaterThan(100);
});

test('§13: both controls still work where they now live', async ({ page }) => {
  await login(page);
  const id = await seed(page);
  await page.setViewportSize({ width: GRID_FORK, height: 1100 });
  await page.goto(`/records/${id}`);

  /* Moving a control must not lose it — the capability, asserted by role. */
  const edit = page.getByRole('link', { name: /^edit$/i });
  await expect(edit).toHaveAttribute('href', `/records/${id}/edit`);
  await edit.click();
  await expect(page).toHaveURL(`/records/${id}/edit`);

  await page.goto(`/records/${id}`);
  await expect(page.getByRole('button', { name: /delete record/i })).toBeVisible();
});
