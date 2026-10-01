import { writeFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { NO_SCROLL_HEIGHT } from '../../src/app/records/[id]/band-geometry';
import { GROUND, contrast, thresholdFor } from '../ground-reading';
import { readSeventeen } from '../seventeen';
import { login } from './login';

/**
 * **§59 on the real collection, read-only.** Per record at 390, 480 and
 * 594 -- the widths where the Images caption sat on the quarter-disc --
 * the disc's radius or that it is not drawn, and the worst glyph contrast
 * anywhere on the page against §59's bound by size.
 */
const OUT = process.env.SHEET_OUT_REPORT_59 ?? 'docs/captures/disc-59-report.md';
const WIDTHS = [390, 480, 594] as const;

test('§59 on the real collection: the Images disc per record at three widths, and the worst glyph contrast on the page', async ({ page, baseURL }) => {
  await login(page);
  const rows = readSeventeen();
  const lines: string[] = [];
  const under: string[] = [];
  let worst: { ratio: number; where: string } | null = null;
  for (const r of rows) {
    const cells: string[] = [];
    for (const w of WIDTHS) {
      await page.setViewportSize({ width: w, height: NO_SCROLL_HEIGHT });
      await page.goto(`/records/${r.id}`);
      await page.locator('[data-section="images"]').waitFor({ timeout: 20_000 });
      await page.waitForFunction(`(() => { const d = document.querySelector('[data-section="images"] [data-flat="quarterDisc"]'); return d === null || d.getAttribute('data-disc-state') !== 'measuring'; })()`, undefined, { timeout: 10_000 }).catch(() => undefined);
      await page.waitForTimeout(300);
      const disc = await page.evaluate(`(() => { const sec = document.querySelector('[data-section="images"]'); const d = sec && sec.querySelector('[data-flat="quarterDisc"]'); if (!d) return null; const s = sec.getBoundingClientRect(); const b = d.getBoundingClientRect(); return { state: d.getAttribute('data-disc-state'), radius: Math.max(0, Math.min(b.right, s.right) - Math.max(b.left, s.left)), free: d.getAttribute('data-disc-free') }; })()`) as { state: string | null; radius: number; free: string | null } | null;
      cells.push(disc === null ? 'no disc' : disc.state === 'drawn' ? `r ${Math.round(disc.radius * 10) / 10} (free ${disc.free})` : `not drawn (${disc.state}, free ${disc.free})`);
      const m = await page.evaluate(GROUND);
      for (const row of m.rows) {
        const ratio = contrast(row.ink, row.ground);
        if (ratio === null) continue;
        const where = `${r.title.split(':')[0]} @${w}: ${row.size}px "${row.text}" on ${row.ground}`;
        if (worst === null || ratio < worst.ratio) worst = { ratio, where };
        if (ratio < thresholdFor(row.size)) under.push(`${where} at ${ratio}:1 (bound ${thresholdFor(row.size)})`);
      }
    }
    lines.push(`| ${r.title.split(':')[0]} | ${cells.join(' | ')} |`);
  }
  const header = ['| record | 390 | 480 | 594 |', '|---|---|---|---|'];
  const report = ['# §59 on the real collection', '', `Server: ${baseURL}. Taken ${new Date().toISOString().slice(0, 16).replace('T', ' ')}. The Images quarter-disc's visible radius with the free height below its caption, or why it is not drawn.`, '', ...header, ...lines, '', worst === null ? 'No glyph run sits on paint at these widths.' : `Worst glyph contrast on any page at these widths: ${worst.ratio}:1 -- ${worst.where}.`, '', under.length === 0 ? 'Every glyph run on a non-paper ground clears §59.' : `Under §59's bound:\n${under.map((u) => `- ${u}`).join('\n')}`, ''].join('\n');
  writeFileSync(OUT, report);
  console.log(`  SERVER ${baseURL}`);
  for (const line of [...header, ...lines]) console.log(`  ${line}`);
  console.log(`  §59 WORST CONTRAST: ${worst === null ? 'none' : `${worst.ratio}:1 -- ${worst.where}`}`);
  console.log(`  §59 UNDER BOUND: ${under.length}${under.length ? '\n    ' + under.join('\n    ') : ''}`);
  expect(rows.length, 'the report has subjects').toBeGreaterThan(10);
});
