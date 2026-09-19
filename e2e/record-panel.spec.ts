import { expect, test, type Page } from '@playwright/test';
import { getTestDb } from '../test/helpers/db';
import { sql } from 'drizzle-orm';

/**
 * **The pulled record's panel expands in place and keeps generated/entered facts
 * distinguishable (§10b, A33).**
 *
 * The chevron expands the panel over the record rather than navigating (A33b);
 * `/records/:id` is a link INSIDE the expanded panel. The synopsis (the
 * generated `snippet`) sits above the entered facts with a boundary between them
 * (A33c), so the panel never asserts things about music without saying which
 * part it made up.
 *
 * Driven on `/?artistId=` with ONE record, so the pull is unambiguous — the
 * real route, the isometric wall (8a §11.7): the panel is flat on paper, right
 * of the pulled record, appearing at the slide's perceived end.
 */

const PASSWORD = process.env.E2E_PASSWORD ?? 'test-password-for-e2e';

async function login(page: Page) {
  await page.goto('/login');
  await page.locator('form[data-hydrated="true"]').waitFor({ timeout: 15_000 });
  await page.getByLabel('Password').pressSequentially(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL('/');
}

async function pullTheRecord(page: Page) {
  await page.locator('[data-seat] [data-spine]').first().click();
  /* The panel arrives at the slide's perceived end (~690ms), not before. */
  await expect(page.getByTestId('record-chrome')).toBeVisible({ timeout: 5000 });
}

/** One artist, one record, optionally with a snippet and pressing facts. */
async function seedRecord(opts: {
  snippet?: string;
  edited?: boolean;
  withFacts?: boolean;
}): Promise<{ artistId: string; recordId: string; pressingId?: string }> {
  const db = getTestDb();
  const run = Date.now().toString(36);
  const a = await db.execute(sql`INSERT INTO artists (name) VALUES (${'Panel-' + run}) RETURNING id`);
  const artistId = (a.rows[0] as { id: string }).id;

  let pressingId: string | undefined;
  if (opts.withFacts) {
    const pr = await db.execute(
      sql`INSERT INTO pressings (catalog_number, country_pressed, year_pressed)
          VALUES (${'CAT-' + run}, 'UK', 1978) RETURNING id`,
    );
    pressingId = (pr.rows[0] as { id: string }).id;
  }

  const editedAt = opts.edited ? sql`now()` : sql`NULL`;
  const r = await db.execute(sql`
    INSERT INTO records (artist_id, title, release_year, pressing_id, snippet, snippet_edited_at, condition_media)
    VALUES (
      ${artistId}::uuid, ${'Panel ' + run}, 1978,
      ${pressingId ?? null}::uuid,
      ${opts.snippet ?? null}, ${editedAt},
      ${opts.withFacts ? 'VG+' : null}
    ) RETURNING id`);
  return { artistId, recordId: (r.rows[0] as { id: string }).id, pressingId };
}

async function cleanup(ids: { artistId: string; recordId: string; pressingId?: string }) {
  const db = getTestDb();
  await db.execute(sql`DELETE FROM records WHERE id = ${ids.recordId}::uuid`);
  if (ids.pressingId) await db.execute(sql`DELETE FROM pressings WHERE id = ${ids.pressingId}::uuid`);
  await db.execute(sql`DELETE FROM artists WHERE id = ${ids.artistId}::uuid`);
}

test('the panel is expanded at rest in its own column, and nothing navigates', async ({ page }) => {
  /*
    A33's chevron expanded an overlay over the record; §11.9 gives the panel a
    fixed region in the facts column at every width the pulled state exists,
    so it is the expanded shape at rest and the toggle has nothing to do. The
    destination stays INSIDE the panel (A33b): the wall is still mounted, the
    URL unchanged.

    These three ran at 390px while §11.8's fork was an overlay. §11.24 rules
    that below the fork the pulled state does not exist — a tap opens the
    record screen (shelf-narrow.spec.ts) — so the panel's claims are made
    where the panel is.
  */
  const ids = await seedRecord({});
  try {
    await login(page);
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(`/?artistId=${ids.artistId}`);
    await pullTheRecord(page);

    const panel = page.getByTestId('record-chrome').getByTestId('record-panel');
    await expect(panel).toHaveAttribute('data-expanded', 'true');
    await expect(page.getByTestId('record-chrome').getByTestId('panel-expand-toggle'), 'no toggle: the panel has one state (§11.9, §11.19)').toHaveCount(0);

    await expect(page.getByTestId('wall')).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`/\\?artistId=`));

    const link = page.getByTestId('record-chrome').getByTestId('panel-detail-link');
    await expect(link).toBeVisible();
    await expect(link).toHaveAttribute('href', `/records/${ids.recordId}`);
  } finally {
    await cleanup(ids);
  }
});

test('a generated snippet and entered facts are separated by a boundary', async ({ page }) => {
  const ids = await seedRecord({ snippet: 'A landmark Deptford debut.', withFacts: true });
  try {
    await login(page);
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(`/?artistId=${ids.artistId}`);
    await pullTheRecord(page);

    await expect(page.getByTestId('record-chrome').getByTestId('record-panel')).toHaveAttribute('data-expanded', 'true');

    /* The snippet, labelled as generated (A33c). */
    const snippet = page.getByTestId('record-chrome').getByTestId('panel-snippet');
    await expect(snippet).toBeVisible();
    await expect(page.getByTestId('record-chrome').getByTestId('panel-snippet-label')).toContainText(/Claude/i);
    await expect(snippet).toContainText('Deptford');

    /* The facts, and a boundary between the two. */
    await expect(page.getByTestId('record-chrome').getByTestId('panel-facts')).toBeVisible();
    await expect(
      page.getByTestId('record-chrome').getByTestId('panel-boundary'),
      'a boundary separates the generated snippet from the entered facts',
    ).toBeVisible();

    /* The snippet text is NOT inside the fact list — they are separate blocks. */
    const factsText = await page.getByTestId('record-chrome').getByTestId('panel-facts').innerText();
    expect(factsText, 'the snippet did not leak into the facts').not.toContain('Deptford');
  } finally {
    await cleanup(ids);
  }
});

test('an edited snippet is labelled as the user\'s, not generated', async ({ page }) => {
  const ids = await seedRecord({ snippet: 'My own note.', edited: true });
  try {
    await login(page);
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(`/?artistId=${ids.artistId}`);
    await pullTheRecord(page);

    await expect(page.getByTestId('record-chrome').getByTestId('panel-snippet-label'), 'edited = the user owns it (§4.2)').toContainText(
      /your/i,
    );
  } finally {
    await cleanup(ids);
  }
});

test('the desktop flanking panel shows the expanded content at rest', async ({ page }) => {
  const ids = await seedRecord({ snippet: 'A landmark Deptford debut.', withFacts: true });
  try {
    await login(page);
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(`/?artistId=${ids.artistId}`);
    await pullTheRecord(page);

    /*
      A33d: the wide panel is the expanded shape at rest — snippet, facts and
      the link all visible, no chevron, no toggle needed.
    */
    await expect(page.getByTestId('record-chrome').getByTestId('panel-snippet')).toBeVisible();
    await expect(page.getByTestId('record-chrome').getByTestId('panel-facts')).toBeVisible();
    await expect(page.getByTestId('record-chrome').getByTestId('panel-detail-link')).toBeVisible();
    await expect(page.getByTestId('record-chrome').getByTestId('panel-expand-toggle'), 'no toggle: the panel has one state (§11.9, §11.19)').toHaveCount(0);
  } finally {
    await cleanup(ids);
  }
});
