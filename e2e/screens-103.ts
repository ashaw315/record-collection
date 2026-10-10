import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, type Page } from '@playwright/test';
import { trackArtist } from './cleanup';
import { NO_SCROLL_HEIGHT } from '../src/app/records/[id]/band-geometry';
import { seedImage } from './seed';

/**
 * The screens step 103 reaches, for the specs that read each of them: the
 * five §T.6 names (the want list, look up, stats, manage with its six
 * sections, the record form new and editing) and the four pages the survey
 * left out (suggestions, the want list's new form, a want-list item's page
 * and its edit form).
 */
export type Fixture = { record: string; want: string };

export async function seedFixture(page: Page, name: string): Promise<Fixture> {
  const suffix = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  const artist = await page.request.post('/api/artists', { data: { name: `${name}-${suffix}` } });
  const artistId = ((await artist.json()) as { id: string }).id;
  trackArtist(artistId);
  const record = await page.request.post('/api/records', { data: { title: `${name} ${suffix}`, artistId } });
  expect(record.status(), 'the fixture record exists').toBe(201);
  const id = ((await record.json()) as { id: string }).id;
  /* A cover, so the record has a modal to open. */
  await seedImage({ recordId: id, imageType: 'cover', url: `data:image/png;base64,${readFileSync(join('test', 'fixtures', 'covers', 'cover-inside-1000x951.png')).toString('base64')}` });
  const want = await page.request.post('/api/want-list', { data: { title: `${name} want ${suffix}`, artistId, priority: 3 } });
  expect(want.status(), 'the fixture want-list item exists').toBe(201);
  return { record: id, want: ((await want.json()) as { id: string }).id };
}

export async function openScreen(page: Page, path: string, width: number) {
  await page.setViewportSize({ width, height: NO_SCROLL_HEIGHT });
  await page.goto(path);
  await page.locator('h1, [data-testid="wall"], [data-testid="record-page-8a"]').first().waitFor({ state: 'attached', timeout: 30_000 });
  await page.waitForLoadState('load');
  await page.addStyleTag({ content: 'nextjs-portal{display:none!important}' });
}

/** Opens each of the screens in turn, manage once a section, and hands each to `visit` under a name with no id in it. */
export async function eachScreen(page: Page, f: Fixture, width: number, visit: (name: string) => Promise<void>) {
  for (const path of ['/want-list', '/lookup', '/stats', '/records/new', `/records/${f.record}/edit`, '/suggestions', '/want-list/new', `/want-list/${f.want}`, `/want-list/${f.want}/edit`]) {
    await openScreen(page, path, width);
    await visit(path.replace(f.record, '<record>').replace(f.want, '<item>'));
  }
  await openScreen(page, '/manage', width);
  const names = page.locator('nav[aria-label="Resource"] button');
  const count = await names.count();
  expect(count, 'manage’s sections').toBe(6);
  for (let i = 0; i < count; i += 1) {
    await names.nth(i).click();
    await visit(`manage, ${((await names.nth(i).textContent()) ?? String(i)).trim()}`);
  }
}

/** The five screens §T.6 names, the record form twice, each with the measure step 118 keeps for it. */
export function fiveScreens(f: Fixture): { name: string; path: string; manage: boolean }[] {
  return [
    { name: 'stats', path: '/stats', manage: false },
    { name: 'the want list', path: '/want-list', manage: false },
    { name: 'look up', path: '/lookup', manage: false },
    { name: 'the record form, new', path: '/records/new', manage: false },
    { name: 'the record form, editing', path: `/records/${f.record}/edit`, manage: false },
    { name: 'manage', path: '/manage', manage: true },
  ];
}
