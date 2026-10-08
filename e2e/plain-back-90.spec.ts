import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import sharp from 'sharp';
import { sql } from 'drizzle-orm';
import { getTestDb } from '../test/helpers/db';
import { registerCleanup, trackArtist } from './cleanup';
import { seedImage } from './seed';
import { GRID_FORK, NO_SCROLL_HEIGHT } from '../src/app/records/[id]/band-geometry';
import { sleeveSquare } from '../src/app/records/[id]/sleeve-modal';
import { WALL_INK, WALL_PAPER_HEX, pullFill } from '../src/app/wall/pull-colour';
import { recordLadder } from '../src/lib/colour/record-ladder';
import { login } from './sign-in';

registerCleanup();

/**
 * Step 90, §M.3: "The modal's plain back is the record's field, filling the
 * square, with the label and catalogue number in paper on it; where the
 * record has no stored colour, it is ink." "From the wall's own
 * computation": the field a pulled record lands on (§W.2, the clamped
 * base), not the stored colour A19 named, which §M.3 withdraws.
 *
 * The expected colour is computed by the wall's own functions and compared
 * with what the modal paints, as pixels; and the wall's pulled record is
 * read beside it, because "one sleeve has one back".
 */

const COVER = `data:image/png;base64,${readFileSync(join('test', 'fixtures', 'covers', 'cover-inside-1000x951.png')).toString('base64')}`;
/* A stored colour OUTSIDE the clamp on both counts (very dark, very saturated), so the field and the stored colour differ and the test can tell which was drawn. */
const STORED = '#7a0c0c';
type Rgb = number[];
const near = (a: Rgb, b: Rgb, tol = 6) => a.every((v, i) => Math.abs(v - b[i]) <= tol);
const rgbOf = (hex: string): Rgb => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));

async function seed(page: Page, colour: string | null): Promise<{ id: string; label: string; catalogue: string }> {
  const s = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  const post = async (path: string, data: unknown) => { const r = await page.request.post(path, { data }); expect([200, 201], `${path}`).toContain(r.status()); return (await r.json()) as { id: string }; };
  const artist = await post('/api/artists', { name: `Plain90-${s}` });
  trackArtist(artist.id);
  const label = `Label90 ${s}`;
  const catalogue = `PB-${s.slice(-6)}`;
  const labelRow = await post('/api/labels', { name: label });
  const pressing = await post('/api/pressings', { catalogNumber: catalogue });
  const record = await post('/api/records', { title: `Plain90 ${s}`, artistId: artist.id, labelId: labelRow.id, pressingId: pressing.id });
  await seedImage({ recordId: record.id, imageType: 'cover', url: COVER });
  if (colour !== null) await getTestDb().execute(sql`UPDATE records SET spine_colour = ${colour} WHERE id = ${record.id}::uuid`);
  return { id: record.id, label, catalogue };
}

async function turnToBack(page: Page, id: string, width: number, height: number) {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width, height });
  await page.goto(`/records/${id}`);
  await page.locator('[data-cell="sleeve"] img[data-cover][data-cover-treatment]').waitFor({ timeout: 30_000 });
  await page.addStyleTag({ content: 'nextjs-portal{display:none!important}' });
  await page.getByRole('button', { name: 'Open the sleeve' }).click();
  await page.locator('[data-sleeve-control="turn"]').click();
  await page.locator('[data-sleeve][data-face="back"]').waitFor();
  await page.mouse.move(1, height - 1);
}

/** The square's inside as pixels, at five points clear of the imprint at its foot. */
async function ground(page: Page): Promise<Rgb[]> {
  const b = await page.locator('[data-sleeve]').evaluate((el) => { const r = el.getBoundingClientRect(); return { x: r.left + 1, y: r.top + 1, w: r.width - 2, h: r.height - 2 }; });
  const { data, info } = await sharp(await page.screenshot({ clip: { x: b.x, y: b.y, width: b.w, height: b.h } })).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const k = info.width / b.w;
  return [[0.5, 0.5], [0.02, 0.02], [0.98, 0.02], [0.98, 0.6], [0.5, 0.2]].map(([fx, fy]) => { const i = (Math.round(b.h * fy * k) * info.width + Math.round(b.w * fx * k)) * 3; return [data[i], data[i + 1], data[i + 2]]; });
}

test.beforeEach(async ({ page }) => login(page));

for (const [width, height] of [[390, 844], [GRID_FORK, NO_SCROLL_HEIGHT]] as const) {
  /* Fails against the modal as built at step 81, whose back with no photograph is an empty square on paper; and against a back in the stored colour, which this record's is chosen to differ from. */
  test(`at ${width} × ${height} the plain back is the record’s field filling the ${sleeveSquare(width, height)} square, with label and catalogue number in paper at its foot`, async ({ page }) => {
    const record = await seed(page, STORED);
    const field = pullFill(1, recordLadder(STORED));
    expect(near(rgbOf(field), rgbOf(STORED), 12), `the precondition: the field ${field} is not the stored colour ${STORED}`).toBe(false);
    await turnToBack(page, record.id, width, height);
    const square = await page.locator('[data-sleeve]').evaluate((el) => { const r = el.getBoundingClientRect(); return [r.width, r.height]; });
    expect(square, 'the square is the closed square').toEqual([sleeveSquare(width, height), sleeveSquare(width, height)]);
    for (const [i, p] of (await ground(page)).entries()) expect(near(p, rgbOf(field)), `point ${i} of the back reads as the field ${field}: ${p}`).toBe(true);
    const m = await page.locator('[data-sleeve] [data-plain-back]').evaluate((el) => {
      const sq = (el.closest('[data-sleeve]') as HTMLElement).getBoundingClientRect(); const r = el.getBoundingClientRect();
      const lines = Array.from(el.querySelectorAll('div')).filter((d) => d.children.length === 0);
      const last = lines[lines.length - 1].getBoundingClientRect();
      const rgb = (c: string) => { const k = document.createElement('canvas'); k.width = 1; k.height = 1; const x = k.getContext('2d') as CanvasRenderingContext2D; x.fillStyle = c; x.fillRect(0, 0, 1, 1); return Array.from(x.getImageData(0, 0, 1, 1).data.slice(0, 3)); };
      return { fills: [r.left - sq.left, r.top - sq.top, sq.right - r.right, sq.bottom - r.bottom], text: lines.map((d) => d.textContent), colour: rgb(getComputedStyle(lines[0]).color), footGap: r.bottom - last.bottom, leftGap: last.left - r.left, all: (el.textContent ?? '') };
    });
    expect(m.fills, 'it fills the square inside its hairline').toEqual([1, 1, 1, 1]);
    expect(m.text, 'label and catalogue number').toEqual([record.label, record.catalogue]);
    expect(m.all, 'and nothing further').toBe(`${record.label}${record.catalogue}`);
    expect(m.colour, 'in the wall’s paper').toEqual(rgbOf(WALL_PAPER_HEX));
    expect([m.footGap, m.leftGap], 'at the foot, 16 in, as on the wall').toEqual([16, 16]);
    await expect(page.locator('[data-face-label]')).toHaveText(/^back$/i);
  });
}

/* Fails against a back that falls to paper, or to a default colour, where nothing is stored: §W.3 and §W.8, "§5.3 owns the fallback and §5.3 says ink". */
test('where the record has no stored colour the plain back is ink', async ({ page }) => {
  const record = await seed(page, null);
  await turnToBack(page, record.id, GRID_FORK, NO_SCROLL_HEIGHT);
  for (const [i, p] of (await ground(page)).entries()) expect(near(p, rgbOf(WALL_INK)), `point ${i} reads as the wall's ink ${WALL_INK}: ${p}`).toBe(true);
  expect(pullFill(1, recordLadder(null)), 'which is the wall’s own answer for no colour').toBe(WALL_INK);
});

/* "One sleeve has one back": fails if the wall and the modal ever compute the ground differently, or draw different imprints. */
test('the wall’s pulled record, turned over, is the same ground and the same imprint', async ({ page }) => {
  const record = await seed(page, STORED);
  await turnToBack(page, record.id, GRID_FORK, NO_SCROLL_HEIGHT);
  const modal = await page.locator('[data-sleeve] [data-plain-back]').evaluate((el) => ({ ground: getComputedStyle(el).backgroundColor, text: el.textContent, imprint: (el.firstElementChild as HTMLElement).className }));
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/');
  await expect(page.getByTestId('wall')).toBeAttached({ timeout: 30_000 });
  await page.locator(`[data-seat="${record.id}"] [data-spine]`).click();
  await expect(page.getByTestId('record-chrome')).toBeVisible({ timeout: 8000 });
  await page.getByTestId('record-chrome').getByTestId('action-turn').click();
  await expect(page.locator('[data-pulled] [data-back-plain]')).toHaveCount(1);
  await page.waitForTimeout(1500);
  const wall = await page.evaluate(() => {
    const rgb = (c: string) => { const k = document.createElement('canvas'); k.width = 1; k.height = 1; const x = k.getContext('2d') as CanvasRenderingContext2D; x.fillStyle = c; x.fillRect(0, 0, 1, 1); return Array.from(x.getImageData(0, 0, 1, 1).data.slice(0, 3)).join(','); };
    const field = document.querySelector('[data-pulled] [data-field]') as SVGElement;
    const plain = document.querySelector('[data-pulled] [data-back-plain]') as Element;
    return { ground: rgb(field.getAttribute('fill') ?? ''), text: plain.textContent, imprint: (plain.firstElementChild as HTMLElement).className };
  });
  const modalGround = await page.evaluate((c) => { const k = document.createElement('canvas'); k.width = 1; k.height = 1; const x = k.getContext('2d') as CanvasRenderingContext2D; x.fillStyle = c; x.fillRect(0, 0, 1, 1); return Array.from(x.getImageData(0, 0, 1, 1).data.slice(0, 3)).join(','); }, modal.ground);
  expect(modalGround, 'the same ground').toBe(wall.ground);
  expect(modal.text, 'the same imprint').toBe(wall.text);
  expect(modal.imprint, 'drawn by the same component').toBe(wall.imprint);
});
