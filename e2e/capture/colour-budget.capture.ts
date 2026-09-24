import { test, expect } from '@playwright/test';
import { writeFileSync } from 'node:fs';
import { NO_SCROLL_HEIGHT } from '../../src/app/records/[id]/band-geometry';

/**
 * **The colour DISTRIBUTION, measured. The area budget is withdrawn.**
 *
 * §5.5 set 12–18% of the page, sleeve excluded. Measured on the assembled page
 * it came to 12.11% / 10.79% / 10.66% — and the figure governed nothing, because
 * **a page hits any area target with one big rectangle.** The release-year field
 * alone is 7.82%, roughly two-thirds of all colour, so 10.79% describes one
 * large mark plus rounding and not a keyed composition.
 *
 * Fifth instance of the shape NOTES records: the measurement was defined over
 * an axis correlated with the signal rather than the signal itself. Here the
 * signal is DISTRIBUTION and the measurement was total area.
 *
 * What replaced it: **no single mark exceeds 40% of the page's coloured area**,
 * plus §5.5's existing per-band base mark. No area target at all. The figures
 * below are kept as a record rather than as a gate.
 *
 *   CAPTURE=1 npx playwright test --project=capture
 */

const PASSWORD = process.env.E2E_PASSWORD ?? 'test-password-for-e2e';

test.use({ viewport: { width: 1440, height: NO_SCROLL_HEIGHT }, deviceScaleFactor: 1 });

test('measure the colour budget', async ({ page }) => {
  test.skip(process.env.CAPTURE !== '1', 'A measurement tool: run with CAPTURE=1');

  await page.goto('/login');
  await page.locator('form[data-hydrated="true"]').waitFor({ timeout: 15_000 });
  await page.getByLabel('Password').pressSequentially(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL('/');

  const lines: string[] = [
    '§5.5 colour budget: 12–18% of the page, sleeve excluded',
    'Measured on the assembled page at 1440 × 900.',
    '',
  ];

  for (const which of ['richest', 'modal', 'emptiest']) {
    await page.goto(`/wall/probe/page8a?case=${which}`);
    await page.getByTestId('record-page-8a').waitFor({ timeout: 20_000 });
    await page.waitForFunction(
      () => {
        const img = document.querySelector('[data-cell="sleeve"] img');
        return img === null || (img as HTMLImageElement).naturalWidth > 0;
      },
      undefined,
      { timeout: 20_000 },
    );

    const measured = await page.evaluate(() => {
      const page8a = document.querySelector('[data-testid="record-page-8a"]');
      if (page8a === null) return null;

      const pageBox = page8a.getBoundingClientRect();
      /* §5.5: the sleeve is the SOURCE, not a mark, so it is excluded. */
      const sleeve = document.querySelector('[data-cell="sleeve"]');
      const sleeveArea =
        sleeve === null
          ? 0
          : sleeve.getBoundingClientRect().width * sleeve.getBoundingClientRect().height;

      const denominator = pageBox.width * pageBox.height - sleeveArea;

      const marks: Array<{ name: string; area: number }> = [];
      for (const mark of document.querySelectorAll('[data-mark]')) {
        const name = mark.getAttribute('data-mark') ?? '?';
        /* The sleeve's own marks sit over the source and count as marks. */
        const box = mark.getBoundingClientRect();

        /*
          Circles and the triangle occupy a fraction of their box: a disc is
          πr²/(2r)² = 78.5% of it, and the triangle's clip-path is half.
        */
        /*
          **The coloured AREA, not the host's box.** Two of the seven marks are
          implemented as properties of a cell rather than as elements: the
          release-year field is the cell's background — so its box IS its area —
          and the journal edge is a 2px border, whose area is 2px by the cell's
          height. Counting the journal cell's box gave 11.74% for a hairline,
          which is what made the first measurement obviously wrong.

          Circles and the triangle occupy a fraction of their box: a disc is
          πr²/(2r)² = 78.5%, the triangle's clip-path is half.
        */
        let area: number;
        if (name === 'journalEdge') {
          area = 2 * box.height;
        } else if (name.endsWith('Arc') || name === 'disc') {
          area = box.width * box.height * (Math.PI / 4);
        } else {
          area = box.width * box.height;
        }

        marks.push({ name, area });
      }

      /* The construction's coloured faces, from the SVG's own geometry. */
      const svg = document.querySelector('[data-testid="construction-still"]');
      let faceArea = 0;
      if (svg !== null) {
        const svgBox = svg.getBoundingClientRect();
        const vb = (svg.getAttribute('viewBox') ?? '0 0 1 1').split(' ').map(Number);
        const scale = (svgBox.width / vb[2]) * (svgBox.height / vb[3]);
        for (const poly of svg.querySelectorAll('polygon[data-step="base"]')) {
          const pts = (poly.getAttribute('points') ?? '')
            .trim()
            .split(/\s+/)
            .map((p) => p.split(',').map(Number));
          let sum = 0;
          for (let i = 0; i < pts.length; i += 1) {
            const [x1, y1] = pts[i];
            const [x2, y2] = pts[(i + 1) % pts.length];
            sum += x1 * y2 - x2 * y1;
          }
          faceArea += (Math.abs(sum) / 2) * scale;
        }
      }

      const total = marks.reduce((n, m) => n + m.area, 0) + faceArea;
      return {
        denominator,
        marks: marks.map((m) => ({ name: m.name, pct: (m.area / denominator) * 100 })),
        facesPct: (faceArea / denominator) * 100,
        totalPct: (total / denominator) * 100,
      };
    });

    expect(measured, which).not.toBeNull();
    if (measured === null) continue;

    lines.push(`── ${which} ──`);
    for (const mark of measured.marks.sort((a, b) => b.pct - a.pct)) {
      lines.push(`   ${mark.name.padEnd(20)} ${mark.pct.toFixed(2)}%`);
    }
    lines.push(`   ${'construction faces'.padEnd(20)} ${measured.facesPct.toFixed(2)}%`);
    lines.push(
      `   TOTAL ${measured.totalPct.toFixed(2)}%  ${
        measured.totalPct < 12 ? '— BELOW the 12% floor' : measured.totalPct > 18 ? '— ABOVE the 18% ceiling' : '— in band'
      }`,
    );
    lines.push('');
  }

  writeFileSync('docs/record-detail/assembled/colour-budget.txt', lines.join('\n'));
});
