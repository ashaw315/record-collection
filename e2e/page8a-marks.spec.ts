import { expect, test } from '@playwright/test';
import { NO_SCROLL_HEIGHT } from '../src/app/records/[id]/band-geometry';
import { login } from './sign-in';

/**
 * 8a's marks stay inside the cells that host them.
 *
 * **One rule rather than three adjustments.** Three defects were the same
 * class: diagonals running past cell edges into neighbouring cells and off the
 * band, the about arc clipped to a quarter-circle by the wrong edge so it read
 * as an artefact, and the sleeve's black block half off the right edge reading
 * as a crop. A mark that paints its box is correct; a box that lets it out is
 * not — so containment belongs to the host, and this asserts it.
 */

const CASES = ['richest', 'modal', 'emptiest'] as const;

test.describe('every mark stays in its cell', () => {
  test.use({ viewport: { width: 1440, height: NO_SCROLL_HEIGHT } });

  for (const which of CASES) {
    test(`contains every mark on the ${which} record`, async ({ page }) => {
      await login(page);
      await page.goto(`/wall/probe/page8a?case=${which}`);
      await page.getByTestId('record-page-8a').waitFor({ timeout: 20_000 });

      /*
        **Asserts the CLIP, not the box.** A first version compared
        `getBoundingClientRect` of each mark against its host and passed even
        with `overflow-hidden` removed — the layout boxes never escaped; the
        gradient PAINTED beyond them. So the property to assert is that every
        host clips, which is the thing that was missing.
      */
      const escapes = await page.evaluate(() => {
        const out: string[] = [];

        /*
          **Exactly one cell crosses, and it is named.** The construction reaches
          into the title cell by ruling — "one crosser, one edge, and the rule
          stays drawn at full strength underneath". Exempting `still` BY NAME
          rather than relaxing the rule means a second crosser fails here.
        */
        const CROSSES = new Set(['still']);
        for (const mark of document.querySelectorAll('[data-mark], [data-diagonal]')) {
          const host = mark.closest('[data-cell]');
          const name = `${host?.getAttribute('data-cell') ?? '?'}/${
            mark.getAttribute('data-mark') ?? `diagonal-${mark.getAttribute('data-diagonal')}`
          }`;

          if (host === null) {
            out.push(`${name}: no host cell`);
            continue;
          }

          const cellName = host.getAttribute('data-cell') ?? '';
          const clip = getComputedStyle(host).overflow;
          if (!CROSSES.has(cellName) && clip !== 'hidden') {
            out.push(`${name}: host overflow is ${clip}, not hidden`);
          }

          const m = mark.getBoundingClientRect();
          const h = host.getBoundingClientRect();
          if (m.left < h.left - 1) out.push(`${name}: ${(h.left - m.left).toFixed(1)}px past left`);
          if (m.right > h.right + 1)
            out.push(`${name}: ${(m.right - h.right).toFixed(1)}px past right`);
          if (m.top < h.top - 1) out.push(`${name}: ${(h.top - m.top).toFixed(1)}px past top`);
          if (m.bottom > h.bottom + 1)
            out.push(`${name}: ${(m.bottom - h.bottom).toFixed(1)}px past bottom`);
        }
        return out;
      });

      expect(escapes, `marks escaping their cells on ${which}`).toEqual([]);
    });
  }

  /**
   * **A mark's box may not contain type, and that is a rule rather than a fix.**
   *
   * §5.5 makes tint GROUND, and ground does not overlap content — it sits where
   * content is not. The triangle at 150×150 anchored bottom-left of the identity
   * cell sat under `Epic · BN 26420 · United States, 1968` and hid the first
   * ~90px of it. A z-index would have been a stacking fix for a placement
   * problem; shrinking would have traded the mark's presence for the collision
   * without settling where a mark may sit.
   *
   * Asserted across ALL marks rather than fixed on the one, because otherwise
   * the next mark added collides somewhere else — and this only surfaced because
   * the assembly put real text under it. The sheet could not have caught it: the
   * construction has no type in it.
   */
  for (const which of CASES) {
    test(`keeps every mark clear of type on the ${which} record`, async ({ page }) => {
      await login(page);
      await page.goto(`/wall/probe/page8a?case=${which}`);
      await page.getByTestId('record-page-8a').waitFor({ timeout: 20_000 });

      const collisions = await page.evaluate(() => {
        const out: string[] = [];

        /* Every text-bearing leaf on the page, by its rendered rect. */
        const textRects: Array<{ text: string; rect: DOMRect }> = [];
        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
        for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
          const content = node.textContent?.trim() ?? '';
          if (content === '') continue;

          const range = document.createRange();
          range.selectNodeContents(node);
          for (const rect of range.getClientRects()) {
            if (rect.width > 0 && rect.height > 0) textRects.push({ text: content, rect });
          }
        }

        /*
          **The rule governs marks that sit IN a cell, not marks that ARE one.**

          The release-year field is its cell's background and the journal edge
          its border, so each one's box contains that cell's own type by
          definition — the 72 sits ON the field, which §5.2 requires and clamps
          the lightness for. A rule written for ornament cannot be applied to a
          ground that type is meant to sit on.

          Both were unlabelled until the mark audit, so this only surfaced when
          they gained `data-mark` — the check was passing because the two
          largest marks were invisible to it.
        */
        const CELL_MARKS = new Set(['releaseYearField', 'journalEdge']);

        for (const mark of document.querySelectorAll('[data-mark]')) {
          const name = mark.getAttribute('data-mark') ?? '?';
          if (CELL_MARKS.has(name)) continue;
          /* The sleeve bar and block sit over artwork, never over type. */
          const box = mark.getBoundingClientRect();

          for (const { text, rect } of textRects) {
            const overlapX = Math.min(box.right, rect.right) - Math.max(box.left, rect.left);
            const overlapY = Math.min(box.bottom, rect.bottom) - Math.max(box.top, rect.top);
            if (overlapX <= 1 || overlapY <= 1) continue;

            out.push(
              `${name} covers "${text.slice(0, 34)}" by ${overlapX.toFixed(0)}×${overlapY.toFixed(0)}px`,
            );
          }
        }
        return out;
      });

      expect(collisions, `marks overlapping type on ${which}`).toEqual([]);
    });
  }

  /**
   * §5.1 specifies seven derived marks. Four existed, so the 12–18% colour
   * budget was under-spent and the system was being judged at about half
   * strength.
   */
  test('draws the marks §5.1 specifies, on a populated record', async ({ page }) => {
    await login(page);
    await page.goto('/wall/probe/page8a?case=richest');
    await page.getByTestId('record-page-8a').waitFor({ timeout: 20_000 });

    for (const mark of [
      'sleeveBar',
      'sleeveBlock',
      /* §28 withdraws `identityTriangle` with the identity cell's ornament track. */
      'provenanceArc',
      /* `aboutArc` is withdrawn by §35: one real record in seventeen drew it. */
      /* §5.4's small solid, in the construction's own vocabulary. */
      'matrixSolid',
    ]) {
      await expect(page.locator(`[data-mark="${mark}"]`), mark).toHaveCount(1);
    }

    /* The disc is the generator's, inside the construction's own SVG. */
    await expect(page.locator('[data-mark="disc"]')).toHaveCount(1);
  });

  /**
   * §5.4: decoration does not decorate an absence. The arcs are ornament, so an
   * empty cell suppresses them — a decorated empty cell reads as a designed
   * state rather than as a gap the reader can fill.
   */
  test('suppresses the ornament in cells that are empty', async ({ page }) => {
    await login(page);
    await page.goto('/wall/probe/page8a?case=emptiest');
    await page.getByTestId('record-page-8a').waitFor({ timeout: 20_000 });

    await expect(page.locator('[data-mark="provenanceArc"]'), 'provenance is empty').toHaveCount(0);
    await expect(page.locator('[data-mark="aboutArc"]'), 'withdrawn by §35, in every state').toHaveCount(0);
    /* But the structural marks persist: they mark the cell, not its content. */
    await expect(page.locator('[data-mark="sleeveBar"]')).toHaveCount(1);
  });

  /** The 72 is the page's largest mark; its position must not move. */
  test('keeps the year label on one line so the 72 does not move', async ({ page }) => {
    await login(page);

    const tops: number[] = [];
    for (const which of CASES) {
      await page.goto(`/wall/probe/page8a?case=${which}`);
      await page.getByTestId('record-page-8a').waitFor({ timeout: 20_000 });

      const box = await page.evaluate(() => {
        const cell = document.querySelector('[data-cell="year"]');
        const label = cell?.querySelector('div');
        const figure = cell?.querySelectorAll('div')[1];
        if (label === undefined || label === null || figure === undefined) return null;
        return {
          labelHeight: Math.round(label.getBoundingClientRect().height),
          figureTop: Math.round(figure.getBoundingClientRect().top),
        };
      });

      expect(box, which).not.toBeNull();
      if (box === null) continue;

      expect(box.labelHeight, `${which}: the label wrapped`).toBeLessThan(20);
      tops.push(box.figureTop);
    }

    /* Same position on every record, whatever the label says. */
    expect(new Set(tops).size, `the 72 moved between records: ${tops.join(', ')}`).toBe(1);
  });
});
