import { expect, test, type Page } from '@playwright/test';
import { existsSync, readFileSync } from 'node:fs';
import { registerCleanup, trackArtist } from '../cleanup';
import { getTestDb } from '../../test/helpers/db';
import { sql } from 'drizzle-orm';
import { NO_SCROLL_HEIGHT } from '../../src/app/records/[id]/band-geometry';
import { ABOUT_LINES } from '../../src/app/records/[id]/about-cell';

registerCleanup();
const PASSWORD = process.env.E2E_PASSWORD ?? 'test-password-for-e2e';
async function login(page: Page) {
  await page.goto('/login');
  await page.locator('form[data-hydrated="true"]').waitFor({ timeout: 15_000 });
  await page.getByLabel('Password').pressSequentially(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL('/');
}

/**
 * **A measuring tool: the About's line count and character budget, read off
 * the element the page draws.** The earlier budget (535, bisected between
 * 535 and 555) was derived on a probe 358px wide against a 322px paragraph
 * -- a probe that is not the element -- so every number from it is retired.
 *
 * For each real About (`docs/captures/abouts.json`, the production
 * database's own text; REQUIRED -- stand-ins were falsified once, Gaucho at
 * 555 rendering ten lines where a 552 stand-in took eleven): the paragraph's
 * width, the probe's width, the rendered line count, the clamp state, the
 * largest word-boundary prefix that sets in ten lines, and what the editor
 * displays as its limit. Run with CAPTURE=1 --project=capture.
 */
const ABOUTS = 'docs/captures/abouts.json';

test('measure the About budget on the real texts, at 1440 x 900', async ({ page }) => {
  test.skip(process.env.CAPTURE !== '1', 'A measuring tool: run with CAPTURE=1');
  expect(existsSync(ABOUTS), 'the real texts are required; no stand-ins').toBe(true);
  const abouts: Array<{ title: string; text: string }> = JSON.parse(readFileSync(ABOUTS, 'utf8'));

  await login(page);
  const a = await page.request.post('/api/artists', { data: { name: 'MGMT' } });
  const artist = await a.json();
  const artistId = (artist.id ?? artist.error?.existingId) as string;
  trackArtist(artistId);
  const r = await page.request.post('/api/records', { data: { artistId, title: 'Loss Of Life', releaseYear: 2024 } });
  const { id } = await r.json();
  const db = getTestDb();
  await page.setViewportSize({ width: 1440, height: NO_SCROLL_HEIGHT });

  console.log(`\nABOUT BUDGET -- REAL TEXTS, 1440 x 900, read off [data-field="about"] and its probe`);
  console.log('  title                  chars  paragraph  probe  lines  clamped  fits-10-at  editor shows');
  const floors: number[] = [];
  for (const about of abouts) {
    await db.execute(sql`UPDATE records SET spine_colour = ${'#a25829'}, snippet = ${about.text}, snippet_edited_at = NOW() WHERE id = ${id}::uuid`);
    await page.goto(`/records/${id}`);
    await expect(page.locator('[data-field="eyebrow"]')).toBeVisible();
    await page.waitForTimeout(750);
    /* The editor shows its limit only while editing (`AboutBudget` sits under the textarea). */
    await page.getByTestId('snippet-edit').click();
    await page.getByTestId('about-budget').waitFor({ timeout: 10_000 });
    await page.waitForTimeout(300);
    const m = await page.evaluate((maxLines) => {
      const real = document.querySelector('[data-field="about"]') as HTMLElement;
      const probe = real.parentElement?.querySelector('p[aria-hidden="true"]') as HTMLElement;
      const lh = parseFloat(getComputedStyle(probe).lineHeight);
      const linesOf = (text: string) => { probe.textContent = text; return Math.round(probe.getBoundingClientRect().height / lh); };
      const full = probe.textContent ?? '';
      const lines = linesOf(full);
      /* Largest word-boundary prefix that sets in ten lines. */
      let lo = 0; let hi = full.length;
      const cutAt = (n: number) => { const c = full.lastIndexOf(' ', n); return full.slice(0, c > 0 ? c : n); };
      while (hi - lo > 1) { const mid = Math.floor((lo + hi) / 2); if (linesOf(cutAt(mid)) <= maxLines) lo = mid; else hi = mid; }
      const fits = lines <= maxLines ? full.length : cutAt(lo).length;
      probe.textContent = full;
      const editor = (document.querySelector('[data-testid="about-budget"]')?.textContent ?? '').trim();
      return { paragraph: Math.round(real.getBoundingClientRect().width), probe: Math.round(probe.getBoundingClientRect().width), lines, clamped: real.hasAttribute('data-clamped'), fits, editor };
    }, ABOUT_LINES);
    if (m.lines > ABOUT_LINES) floors.push(m.fits);
    console.log(`  ${about.title.padEnd(22)} ${String(about.text.length).padStart(5)}  ${String(m.paragraph).padStart(9)}  ${String(m.probe).padStart(5)}  ${String(m.lines).padStart(5)}  ${String(m.clamped).padStart(7)}  ${String(m.fits).padStart(10)}  ${m.editor}`);
  }
  console.log(`  BUDGET = the smallest ten-line prefix among the Abouts that exceed ten lines: ${floors.length ? Math.min(...floors) : 'none exceed'} (from ${floors.join(', ') || '-'})`);
});
