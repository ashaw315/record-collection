import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { registerCleanup, trackArtist, trackCreated } from '../cleanup';
import { login } from '../sign-in';

/**
 * **Step 174, §T.6: every exit the page owns asks, captured (Design's Capture bullet).** At 390 × 844 under a coarse
 * pointer, a store row open with a change typed, and each exit the page owns asked on the row's one line: a change of
 * section, a link in the app (through the header's menu, which is where the app's links are below 584, closed again so
 * the line shows), and Back. The browser's own exit, the unload prompt, is the browser's dialog and cannot be captured
 * from the page; the spec asserts it. Written to `docs/captures/manage-exits-174/`. Run with CAPTURE=1 --project=capture.
 */
const OUT = join('docs', 'captures', 'manage-exits-174');
registerCleanup();

async function seedStore(page: Page, stamp: string): Promise<string> {
  const post = async (path: string, data: unknown) => {
    const response = await page.request.post(path, { data });
    expect(response.status(), path).toBe(201);
    const body = (await response.json()) as { id: string };
    trackCreated(path, body);
    return body.id;
  };
  const artist = await post('/api/artists', { name: `Exits174-${stamp}` });
  trackArtist(artist);
  await post('/api/records', { title: `Exits ${stamp}`, artistId: artist });
  const name = `A Shop With A Long Name ${stamp}`;
  await post('/api/stores', { name, city: 'Leeds', country: 'UK', isFavorite: true });
  return name;
}

test.use({ hasTouch: true, viewport: { width: 390, height: 844 } });

test('each exit the page owns, asked, at 390 under a coarse pointer', async ({ page }) => {
  test.skip(process.env.CAPTURE !== '1', 'A capture tool: run with CAPTURE=1');
  mkdirSync(OUT, { recursive: true });
  await login(page);
  const store = await seedStore(page, Date.now().toString(36));
  await page.goto('/');
  await page.goto('/manage');
  await page.getByRole('navigation', { name: 'Resource' }).getByRole('button', { name: 'Stores', exact: true }).click();
  const row = page.locator('[data-manage-list]:visible [data-manage-row]').filter({ hasText: store });
  await row.locator('[data-manage-open]').click();
  const form = row.locator('[data-manage-form]');
  await form.getByLabel(`${store} city`, { exact: true }).fill('York');
  await page.evaluate(() => document.fonts.ready);
  const confirm = form.locator('[data-manage-confirm]');
  const shot = async (name: string) => {
    await expect(confirm).toBeVisible();
    await confirm.scrollIntoViewIfNeeded();
    await page.screenshot({ path: join(OUT, `${name}-390-asked.png`) });
    await confirm.getByRole('button', { name: 'Keep editing' }).click();
    await expect(confirm).toHaveCount(0);
  };

  await page.getByRole('navigation', { name: 'Resource' }).getByRole('button', { name: 'Tags', exact: true }).click();
  await shot('section-change');

  await page.getByRole('button', { name: 'Menu' }).click();
  await page.getByRole('link', { name: 'Want list', exact: true }).click();
  await shot('link-in-the-app');

  await page.goBack();
  await shot('back');

  writeFileSync(
    join(OUT, 'README.md'),
    `# manage-exits-174 · every exit the page owns asks (§T.6, step 174), captured ${new Date().toISOString().slice(0, 10)}

From the build (E2E_SERVER=build) at 390 × 844 under a coarse pointer. A store row open with its city changed, then each
exit the page owns pressed, and the row's one line asking, DISCARD CHANGES and KEEP EDITING, before anything moves.

| exit | how it was pressed | file |
|---|---|---|
| a change of section | the Resource navigation's Tags | section-change-390-asked.png |
| a link in the app | the header's Menu, then Want list; the menu closes so the line shows | link-in-the-app-390-asked.png |
| Back | the browser's Back, over the entry opening the row added | back-390-asked.png |

The three stills are byte-identical, and that is the ruling seen: every exit asks with the same line in the same place,
and a still cannot show which exit was pressed, so the spec asserts that (\`e2e/manage.spec.ts\`, "174: every exit the
page owns asks"). The browser's own exit, the unload prompt on closing or reloading the tab, is the browser's dialog and
not the page's to draw, so it has no capture; the spec asserts it is bound while the form has changes and not otherwise.
`,
  );
});
