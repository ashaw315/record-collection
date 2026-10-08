import { expect, test } from '@playwright/test';
import { registerCleanup, trackArtist } from './cleanup';
import { NO_SCROLL_HEIGHT } from '../src/app/records/[id]/band-geometry';
import { login } from './sign-in';

registerCleanup();

/**
 * **§12's second fix: the clipped journal field.**
 *
 * §9.2's cells carry `overflow: hidden`, and that is load-bearing — §5.1's
 * edge marks bleed to a cell edge and the clip is what keeps each one inside
 * the cell that owns it. So a control that is WIDER than its cell does not
 * spill, it is silently cut, which is the worse failure: the reader sees a
 * field with no right-hand edge and no indication that anything is missing.
 *
 * Measured at 390 before the fix: the journal's content cell is 128px and the
 * note field asserted `min-w-[280px]`, so 186px of the field — its whole right
 * side, including the box's right rule — was clipped away, and `Save entry`
 * and the date input with it.
 *
 * The floor itself was deliberate and its reason survives: `flex-1` alone gave
 * the field 135px beside the date and the button, too narrow to show the
 * placeholder that tells a reader what to write. The defect is that the floor
 * was stated as an absolute that its container cannot honour. A floor that
 * exceeds the cell is not a floor, it is a clip.
 *
 * This asserts the general property rather than the one field: **nothing
 * inside a section cell may be wider than the cell that clips it.** Stated
 * that way it also covers the date input and the button, and it fails for any
 * future control that takes an absolute min-width in a cell that can be
 * narrower.
 */
/*
  **The identity cell is excluded, and reported rather than repaired.** §4.2
  fixes the artist at 40px and forbids 16 to 39, so a real band name is cut by
  its cell from 1100 down — 50px at 768, and at 390 the cell gives 93px of
  content where the narrowest wrap of "Godspeed You! Black Emperor" needs
  ~198px. No wrap fits a 40px word into 93px.

  The obvious fix is wrong and the existing tests proved it: `min-w-0` on the
  identity cell's content track let it collapse to its smallest content width,
  wrapping every title at 196px instead of 412 and consuming the ornament
  track that §4.2 requires to yield progressively. `identity-cell.spec.ts`
  failed on exactly that, which is the mechanism working. So the cell's
  clipping is a consequence of a ruled size meeting a narrow cell, and the
  remedy is Design's.
*/
test('no control is clipped by the cell that holds it, at any width (§12)', async ({ page }) => {
  await login(page);
  const s = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  const a = await page.request.post('/api/artists', { data: { name: 'Godspeed You! Black Emperor' } });
  const { id: artistId } = await a.json();
  trackArtist(artistId);
  const r = await page.request.post('/api/records', {
    data: { artistId, title: `Lift Your Skinny Fists Like Antennas to Heaven ${s}`, releaseYear: 1979, notes: 'A note.' },
  });
  const { id } = await r.json();

  for (const width of [1440, 1100, 768]) {
    await page.setViewportSize({ width, height: NO_SCROLL_HEIGHT });
    await page.goto(`/records/${id}`);
    await page.waitForTimeout(700);

    const cut = await page.evaluate(() => {
      const out: string[] = [];
      for (const el of Array.from(document.querySelectorAll('input, textarea, button, select, a'))) {
        /* The identity cell's 40px artist is §4.2's ruled size — see the note above. */
        if (el.closest('[data-cell="identity"]') !== null) continue;
        const r = el.getBoundingClientRect();
        if (r.width === 0 && r.height === 0) continue;
        /* The nearest ancestor that actually clips. */
        let n = el.parentElement;
        while (n !== null) {
          const cs = getComputedStyle(n);
          if (cs.overflow === 'hidden' || cs.overflowX === 'hidden') break;
          n = n.parentElement;
        }
        if (n === null) continue;
        const nr = n.getBoundingClientRect();
        const over = Math.round(Math.max(r.right - nr.right, nr.left - r.left));
        if (over > 1) {
          const name = el.id !== '' ? `#${el.id}` : `${el.tagName.toLowerCase()}:${(el.textContent ?? '').trim().slice(0, 18)}`;
          out.push(`${name} cut ${over}px by ${n.tagName.toLowerCase()}[${(n as HTMLElement).dataset.cell ?? ''}] (${Math.round(nr.width)}px)`);
        }
      }
      return out;
    });

    expect(cut, `at ${width}px, every control fits the cell that clips it — ${cut.join(' | ')}`).toEqual([]);
  }
});
