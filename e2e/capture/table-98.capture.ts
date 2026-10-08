import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { sql } from 'drizzle-orm';
import { registerCleanup, trackArtist, trackCreated } from '../cleanup';
import { getTestDb } from '../../test/helpers/db';

registerCleanup();

/**
 * Step 98's capture for Adam's one judgement: are the table's rows, at a
 * floor of 44, too loose? A fixture of 200 records under one genre, so the
 * page shows 50 of 200 with the pager, at 390 and at 1440. Half the
 * records carry the genre through a child genre, so their rows have the
 * match-reason line and are taller than the floor; at 390 every record
 * with a label or a condition has that line too. Both cases are in the
 * capture because both are what the table is, by §T.4 as ruled on 8 Oct.
 *
 * Each file is named by the figures that differ: the width, the rows shown
 * of the fixture's count, and the shortest and tallest row.
 *
 * Run with CAPTURE=1 --project=capture.
 */
const PASSWORD = process.env.E2E_PASSWORD ?? 'test-password-for-e2e';
const OUT = join('docs', 'captures', 'table-98');
const TITLES = ['Blue', 'Kind Of Blue', 'A Love Supreme', 'The Black Saint And The Sinner Lady', 'Out To Lunch!', 'Mingus Ah Um', 'Somethin’ Else', 'The Shape Of Jazz To Come', 'Moanin’', 'Time Out', 'Maiden Voyage', 'Speak No Evil', 'Getz/Gilberto', 'Karma', 'In A Silent Way', 'Free Jazz: A Collective Improvisation By The Ornette Coleman Double Quartet'];
const GRADES = ['NM', 'VG+', 'VG', 'G+'];

async function login(page: Page) {
  await page.goto('/login');
  await page.locator('form[data-hydrated="true"]').waitFor({ timeout: 15_000 });
  await page.getByLabel('Password').pressSequentially(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL('/');
}

test('a full page of 50 from a 200-record fixture, under a genre filter, at 390 and 1440', async ({ page }) => {
  /*
    The capture project is part of a bare `npx playwright test`, so a
    capture with no guard runs in every gate. This one did, on 8 Oct: it
    rewrote the committed captures mid-run and the gate read `tree CHANGED`.
    Every other file here has this line; this one was written without it.
  */
  test.skip(process.env.CAPTURE !== '1', 'A capture tool: run with CAPTURE=1');
  test.setTimeout(180_000);
  mkdirSync(OUT, { recursive: true });
  await login(page);
  const suffix = `c98${Date.now().toString(36)}`;
  const post = async (path: string, data: unknown) => {
    const response = await page.request.post(path, { data });
    expect(response.status(), path).toBe(201);
    const body = (await response.json()) as { id: string };
    trackCreated(path, body);
    return body.id;
  };
  const parent = await post('/api/genres', { name: `Jazz ${suffix}` });
  const child = await post('/api/genres', { name: `Hard Bop ${suffix}`, parentGenreId: parent });
  const labels = [await post('/api/labels', { name: `Blue Note ${suffix}` }), await post('/api/labels', { name: `Impulse! ${suffix}` })];
  const artists: string[] = [];
  for (const name of ['Miles Davis', 'John Coltrane', 'Charles Mingus', 'The Art Ensemble Of Chicago']) {
    const id = await post('/api/artists', { name: `${name} ${suffix}` });
    trackArtist(id);
    artists.push(id);
  }
  const db = getTestDb();
  for (let i = 0; i < 200; i += 1) {
    const result = (await db.execute(sql`
      INSERT INTO records (artist_id, title, label_id, release_year, condition_media, purchase_price)
      VALUES (${artists[i % artists.length]}::uuid, ${`${TITLES[i % TITLES.length]} ${String(i).padStart(3, '0')}`}, ${i % 3 === 0 ? null : labels[i % 2]}::uuid, ${i % 7 === 0 ? null : 1955 + (i % 20)}, ${i % 5 === 0 ? null : GRADES[i % GRADES.length]}, ${i % 4 === 0 ? null : (4 + (i % 37) * 3.5).toFixed(2)})
      RETURNING id`)) as unknown as { rows: Array<{ id: string }> };
    const row = result.rows[0];
    await db.execute(sql`INSERT INTO record_genres (record_id, genre_id) VALUES (${row.id}::uuid, ${(i % 2 === 0 ? parent : child)}::uuid)`);
  }

  const manifest: unknown[] = [];
  for (const width of [390, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`/?view=table&genreId=${parent}&sort=title:asc`);
    await page.locator('[data-collection-filters][data-hydrated="true"]').waitFor({ timeout: 60_000 });
    await page.addStyleTag({ content: 'nextjs-portal{display:none!important}' });
    await page.evaluate(() => document.fonts.ready);
    const m = await page.evaluate(() => {
      const heights = Array.from(document.querySelectorAll<HTMLElement>('main table tbody tr')).map((r) => Math.round(r.getBoundingClientRect().height * 10) / 10);
      const tally: Record<string, number> = {};
      for (const h of heights) tally[String(h)] = (tally[String(h)] ?? 0) + 1;
      return { rows: heights.length, min: Math.min(...heights), max: Math.max(...heights), tally, count: (document.querySelector('[data-collection-count]')?.textContent ?? '').trim(), page: document.documentElement.scrollHeight, table: Math.round((document.querySelector('main table') as HTMLElement).getBoundingClientRect().height), columns: Array.from(document.querySelectorAll<HTMLElement>('main table thead th')).filter((th) => th.getBoundingClientRect().width > 0).map((th) => (th.textContent ?? '').trim()) };
    });
    expect(m.rows, 'a full page').toBe(50);
    expect(m.count).toMatch(/^200 of \d+ records$/i);
    const file = `table-98-w${width}-rows${m.rows}of200-h${m.min}to${m.max}-page${m.page}.png`;
    await page.screenshot({ path: join(OUT, file), fullPage: true });
    manifest.push({ width, file, ...m });
  }
  writeFileSync(join(OUT, 'manifest.json'), `${JSON.stringify(manifest, null, 1)}\n`);
  for (const id of artists) await db.execute(sql`DELETE FROM records WHERE artist_id = ${id}::uuid`);
});
