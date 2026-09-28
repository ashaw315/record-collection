import { expect, test } from '@playwright/test';
import { writeFileSync } from 'node:fs';

/**
 * **§43's font metrics, generated.** The server estimates each record-band
 * cell's quarters from its content, and §43 rules "prose estimated from the
 * font's own metrics rather than one average coefficient". This writes the
 * advance width of every glyph the frame can set, per register, measured
 * with the page's own fonts loaded, to `src/app/records/[id]/font-metrics.json`.
 * Run with CAPTURE=1 after a font or register changes; the unit test guards
 * the file against the registers the page uses.
 */
test('write the record band’s font metrics', async ({ page }) => {
  test.skip(process.env.CAPTURE !== '1', 'A generator: run with CAPTURE=1');
  await page.goto('/login');
  await page.locator('form[data-hydrated="true"]').waitFor({ timeout: 15_000 });
  await page.getByLabel('Password').pressSequentially(process.env.E2E_PASSWORD ?? 'test-password-for-e2e');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL('/');
  await page.evaluate(() => document.fonts.ready);
  const metrics = await page.evaluate(() => {
    const probe = document.createElement('div');
    probe.className = 'text-prose';
    document.body.appendChild(probe);
    const sans = getComputedStyle(probe).fontFamily;
    probe.className = 'font-mono';
    const mono = getComputedStyle(probe).fontFamily;
    probe.remove();
    const canvas = document.createElement('canvas').getContext('2d')!;
    const chars: string[] = [];
    for (let c = 32; c < 127; c += 1) chars.push(String.fromCharCode(c));
    for (let c = 160; c < 256; c += 1) chars.push(String.fromCharCode(c));
    for (const c of '’‘“”–—·…€£→↓') chars.push(c);
    const registers: Record<string, { font: string; size: number }> = {
      prose: { font: `400 13px ${sans}`, size: 13 },
      label: { font: `400 11px ${mono}`, size: 11 },
      mono12: { font: `400 12px ${mono}`, size: 12 },
      mono10: { font: `400 10px ${mono}`, size: 10 },
      mono13: { font: `400 13px ${mono}`, size: 13 },
      figure72: { font: `800 72px ${sans}`, size: 72 },
      figure40: { font: `800 40px ${sans}`, size: 40 },
    };
    const out: Record<string, { font: string; advances: Record<string, number> }> = {};
    for (const [name, r] of Object.entries(registers)) {
      canvas.font = r.font;
      const advances: Record<string, number> = {};
      for (const ch of chars) advances[ch] = Math.round(canvas.measureText(ch).width * 1000) / 1000;
      out[name] = { font: r.font, advances };
    }
    return { fonts: { sans, mono }, registers: out };
  });
  writeFileSync('src/app/records/[id]/font-metrics.json', JSON.stringify(metrics, null, 1) + '\n');
  console.log(`  FONT METRICS: sans ${metrics.fonts.sans}; mono ${metrics.fonts.mono}; ${Object.keys(metrics.registers).length} registers; prose 'a' ${metrics.registers.prose.advances.a}, label 'A' ${metrics.registers.label.advances.A}, figure72 '1' ${metrics.registers.figure72.advances['1']}`);
});
