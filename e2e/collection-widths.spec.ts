import { expect, test, type Locator, type Page } from '@playwright/test';

/**
 * **No width may lose data** (SPEC.md §10: mobile is an equal priority).
 *
 * The collection table hides columns at narrow widths and reprints them in a
 * summary line under the title. That is sound only while the two are exact
 * complements — and they were not. The summary was `sm:hidden` (gone at 640px)
 * while the label column was `hidden md:table-cell` (arriving at 768px), so
 * **between 640 and 768 the label was in neither**.
 *
 * What makes that worse than a missing column: the table renders absence as a
 * dash meaning "not recorded". A value dropped by the layout is indistinguishable
 * from a value the user never entered — the app is confidently misleading rather
 * than obviously broken, which CLAUDE.md §8 ranks as the worse failure.
 *
 * Tested at the BOUNDARIES rather than at 390 and 1280, because the gap lives
 * between the usual two. 390 and 1280 both passed throughout.
 */

const PASSWORD = process.env.E2E_PASSWORD ?? 'test-password-for-e2e';

/** Straddling both Tailwind breakpoints the table uses: sm=640, md=768. */
const WIDTHS = [
  { width: 375, note: 'phone — summary line' },
  { width: 639, note: 'one below sm' },
  { width: 640, note: 'sm exactly — summary line disappears here' },
  { width: 700, note: 'THE GAP — between sm and md' },
  { width: 767, note: 'one below md' },
  { width: 768, note: 'md exactly — label column arrives here' },
  { width: 1280, note: 'desktop — full table' },
];

async function login(page: Page) {
  await page.goto('/login');

  // Waits for hydration before typing: this form is CONTROLLED, so a value
  // typed into the DOM before React attaches never reaches state and the submit
  // sees an empty password. See the note on the login page.
  await page.locator('form[data-hydrated="true"]').waitFor({ timeout: 15_000 });
  await page.getByLabel('Password').pressSequentially(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL('/');
}

function makeSuffix(): string {
  return `e2ew${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;
}

type Fixture = { suffix: string; artistId: string; label: string; format: string };

async function seed(page: Page): Promise<Fixture> {
  const suffix = makeSuffix();

  const post = async (path: string, data: unknown) => {
    const response = await page.request.post(path, { data, failOnStatusCode: false });
    expect(response.status(), `${path} ${JSON.stringify(data)}`).toBe(201);
    return response.json();
  };

  const artist = await post('/api/artists', { name: `WidthTest-${suffix}` });
  const label = await post('/api/labels', { name: `Chrysalis-${suffix}` });

  // An existing format from the fixed reference list, whichever is first.
  const formats = await (await page.request.get('/api/formats')).json();
  const format = formats.data?.[0] ?? formats[0];

  await post('/api/records', {
    title: `Widths ${suffix}`,
    artistId: artist.id,
    labelId: label.id,
    formatId: format.id,
    releaseYear: 1979,
    conditionMedia: 'VG+',
  });

  return { suffix, artistId: artist.id, label: `Chrysalis-${suffix}`, format: format.name };
}

/**
 * What the user can actually READ, as opposed to what is in the DOM.
 *
 * `innerText` respects `display:none`; `textContent` does not. That difference
 * is the whole subject of this file — a hidden column and a hidden summary line
 * both still carry their text in the markup.
 */
async function visibleText(row: Locator): Promise<string> {
  return (await row.evaluate((node) => (node as HTMLElement).innerText)).replace(/\s+/g, ' ');
}

test.beforeEach(async ({ page }) => {
  await login(page);
});

test('the label is readable at every width, never silently dropped', async ({ page }) => {
  const f = await seed(page);

  for (const { width, note } of WIDTHS) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`/?artistId=${f.artistId}`);

    const row = page.getByRole('row').filter({ hasText: f.suffix });
    await expect(row, `${width}px (${note})`).toHaveCount(1);

    /**
     * `visibleText`, not `toContainText`.
     *
     * Both the hidden column and the hidden summary line stay in the DOM —
     * Tailwind hides them with `display:none`, and `textContent` returns the
     * text of a hidden node. A first draft of this test used `toContainText`
     * and passed at all seven widths INCLUDING the broken one, which is the
     * decorative-test shape CLAUDE.md §2 describes: it would have passed
     * whatever the layout did.
     */
    expect(await visibleText(row), `label not VISIBLE at ${width}px — ${note}`).toContain(f.label);
  }
});

test('the format is readable at every width', async ({ page }) => {
  const f = await seed(page);

  for (const { width, note } of WIDTHS) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`/?artistId=${f.artistId}`);

    const row = page.getByRole('row').filter({ hasText: f.suffix });
    expect(await visibleText(row), `format not VISIBLE at ${width}px — ${note}`).toContain(
      f.format,
    );
  }
});

test('a dash means "not recorded", never "your window is too narrow"', async ({ page }) => {
  /**
   * The discriminating case, and the reason the two tests above are not enough.
   *
   * A row whose label is genuinely absent SHOULD read as absent. This asserts
   * the two states stay distinguishable: the seeded row has a label at every
   * width, so no width may render it the way an empty one renders.
   */
  const f = await seed(page);

  const bare = await page.request.post('/api/records', {
    data: { title: `Bare ${f.suffix}`, artistId: f.artistId },
    failOnStatusCode: false,
  });
  expect(bare.status()).toBe(201);

  for (const { width, note } of WIDTHS) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`/?artistId=${f.artistId}`);

    const withLabel = page.getByRole('row').filter({ hasText: `Widths ${f.suffix}` });
    const without = page.getByRole('row').filter({ hasText: `Bare ${f.suffix}` });

    expect(await visibleText(withLabel), `${width}px (${note})`).toContain(f.label);
    expect(await visibleText(without), `${width}px (${note})`).not.toContain(f.label);
  }
});
