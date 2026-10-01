import { writeFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { CELL_PADDING } from '../../src/app/records/[id]/extended-grid';
import { WIDTHS, readFigures } from '../figure-reading';
import { readSeventeen } from '../seventeen';
import { login } from './login';

/**
 * **§57 on the real collection, read-only.** Per record at 390, 480, 1000,
 * 1440 and 1920: the Price history solo's drawn size, or that it is not
 * drawn, and whether any figure covers its host's type. The step asked for
 * this report; the seeded cases are in `e2e/figures-type-57.spec.ts`. The
 * run names the server it hit, since a reading is only as good as the build
 * that produced it.
 */
const OUT = process.env.SHEET_OUT_REPORT ?? 'docs/captures/figures-57-report.md';

test('§57 on the real collection: the solo per record at five widths, and no figure over type', async ({ page, baseURL }) => {
  await login(page);
  const rows = readSeventeen();
  const lines: string[] = [];
  const covering: string[] = [];
  const counts = new Map<number, { drawn: number; notDrawn: number }>();
  for (const r of rows) {
    const cells: string[] = [];
    for (const [w, h] of WIDTHS) {
      await page.setViewportSize({ width: w, height: h });
      await page.goto(`/records/${r.id}`);
      const figures = await readFigures(page);
      const solo = figures.find((f) => f.host === 'price-history');
      const c = counts.get(w) ?? { drawn: 0, notDrawn: 0 };
      if (solo === undefined) cells.push('no ladder');
      else if (solo.state === 'drawn' && solo.shown) { c.drawn += 1; cells.push(`${Math.round(solo.width)}×${Math.round(solo.height)} (${Math.round(solo.hostHeight - CELL_PADDING - solo.textBottom)} free)`); }
      else { c.notDrawn += 1; cells.push(`not drawn (${solo.state}, ${Math.round(solo.hostHeight - CELL_PADDING - solo.textBottom)} free)`); }
      counts.set(w, c);
      for (const f of figures) if (f.covered.length > 0) covering.push(`${r.title.split(':')[0]} @${w}: the ${f.kind} in ${f.host} covers ${f.covered.map((t) => `"${t}"`).join(', ')}`);
    }
    lines.push(`| ${r.title.split(':')[0]} | ${cells.join(' | ')} |`);
  }
  const header = ['| record | ' + WIDTHS.map(([w]) => `${w}`).join(' | ') + ' |', '|---|' + WIDTHS.map(() => '---').join('|') + '|'];
  const summary = WIDTHS.map(([w]) => { const c = counts.get(w) ?? { drawn: 0, notDrawn: 0 }; return `${w}: ${c.drawn} drawn, ${c.notDrawn} not drawn`; }).join('; ');
  const report = [`# §57 on the real collection`, '', `Server: ${baseURL}. Taken ${new Date().toISOString().slice(0, 16).replace('T', ' ')}. Each cell is the Price history solo's drawn width × height, with the strip's free height below its entries, or why it is not drawn.`, '', ...header, ...lines, '', `Solo by width: ${summary}.`, '', covering.length === 0 ? 'No figure covers its host\'s type at any of the five widths.' : `Figures covering type:\n${covering.map((x) => `- ${x}`).join('\n')}`, ''].join('\n');
  writeFileSync(OUT, report);
  console.log(`  SERVER ${baseURL}`);
  for (const line of [...header, ...lines]) console.log(`  ${line}`);
  console.log(`  §57 SOLO BY WIDTH: ${summary}`);
  console.log(`  §57 FIGURES OVER TYPE: ${covering.length}${covering.length ? '\n    ' + covering.join('\n    ') : ''}`);
  expect(rows.length, 'the report has subjects').toBeGreaterThan(10);
});
