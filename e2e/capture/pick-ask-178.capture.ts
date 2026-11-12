import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { sql } from 'drizzle-orm';
import { expect, test, type Page } from '@playwright/test';
import { registerCleanup, trackArtist } from '../cleanup';
import { removeRecordsFor, seedRecords } from '../seed';
import { login } from '../sign-in';
import { wallMeasured } from '../wall-measured';
import { getTestDb } from '../../test/helpers/db';
import { aboutHash } from '../../src/lib/embeddings/plan';
import { EMBEDDING_MODEL } from '../../src/lib/openai/embeddings';
import { stubEmbedding } from '../../src/lib/openai/stub-embedding';
import { nearViewMinWidth } from '../../src/app/wall/view-fork';

/**
 * **Step 178, Q22's control, captured (the step's Capture bullet): every host at 1440 × 900 and 390, with a phrase, a
 * title, and an empty field.** Every record here is SEEDED, as the file names say: the test environment has no
 * provider key, so the vectors are the stub model's (`stubEmbedding`), and the records are this file's ten, not the
 * collection. A capture is a figure with a picture attached, and these describe a seeded case (the coordinator, 12
 * Nov, on §55's lesson). Written to `docs/captures/pick-ask-178/`. Run with CAPTURE=1 --project=capture.
 */
/* A committed capture is never rewritten: 178's stills stay in pick-ask-178, and the recapture at 182 (the label, the count line, the gap, the hairline, the pointer off ASK) is a folder of its own. */
const OUT = join('docs', 'captures', 'pick-ask-182');
registerCleanup();

const ABOUTS: Record<string, string> = {
  J1: 'A late night jazz record, warm and slow.',
  J2: 'Jazz for a late night, horns low.',
  J3: 'Late night jazz, a quartet at ease.',
  J4: 'Night jazz from a small club, late.',
  J5: 'A jazz record for late at night.',
  P1: 'Loud fast hardcore punk from the first wave.',
  P2: 'Punk, loud and fast, pressed thin.',
  P3: 'Fast loud punk singles.',
  P4: 'Hardcore punk, fast and loud.',
  P5: 'Loud punk, fast songs.',
};
const PHRASE = 'late night jazz';

async function seed(page: Page): Promise<{ artistId: string; title: string }> {
  const suffix = `cap178${Date.now().toString(36)}`;
  const artist = (await (await page.request.post('/api/artists', { data: { name: `Ask-${suffix}` } })).json()) as { id: string };
  trackArtist(artist.id);
  for (const key of Object.keys(ABOUTS)) await seedRecords(artist.id, `Ask ${key}`, suffix, 1);
  const listed = (await (await page.request.get(`/api/records?artistId=${artist.id}&pageSize=100`)).json()) as { data: Array<{ id: string; title: string }> };
  const db = getTestDb();
  let title = '';
  for (const row of listed.data) {
    const key = row.title.split(' ')[1];
    const about = ABOUTS[key];
    if (about === undefined) continue;
    if (key === 'J1') title = row.title;
    await db.execute(sql`UPDATE records SET snippet = ${about} WHERE id = ${row.id}::uuid`);
    const vector = stubEmbedding(about);
    await db.execute(sql`INSERT INTO record_embeddings (record_id, about_hash, model, dims, vector, embedded_at) VALUES (${row.id}::uuid, ${aboutHash(about)}, ${EMBEDDING_MODEL}, ${vector.length}, ${JSON.stringify(vector)}::jsonb, now())`);
  }
  return { artistId: artist.id, title };
}

const control = (page: Page) => page.locator('[data-pick-control]').filter({ visible: true });
const field = (page: Page) => control(page).locator('[data-ask-field]');

/** The three states of one host: empty, then the phrase asked, then the title asked; a fresh load for each so nothing carries over. */
async function states(page: Page, open: () => Promise<void>, name: string, width: number, title: string, settle: () => Promise<void>) {
  for (const [state, text] of [['empty', ''], ['phrase', PHRASE], ['title', title]] as const) {
    await open();
    if (text !== '') {
      await field(page).fill(text);
      await control(page).getByRole('button', { name: /^ask$/i }).click();
      await settle();
    }
    await page.evaluate(() => document.fonts.ready);
    /* The pointer off the control before the picture: left on ASK after the click, it drew ASK's hover underline into every capture (Design's defect 3, 12 Nov). */
    await page.mouse.move(0, 0);
    await page.screenshot({ path: join(OUT, `seeded-${name}-${width}-${state}.png`), fullPage: state !== 'empty' });
  }
}

const filtersReady = (page: Page) => page.locator('[data-collection-filters][data-hydrated="true"]').first().waitFor({ timeout: 30_000 });
const coversDrawn = (page: Page) => page.locator('[data-pick-answer]').first().waitFor({ timeout: 15_000 });

test.describe('wide, a fine pointer', () => {
  test.use({ viewport: { width: 1440, height: 900 } });
  test('the shelf, the far view, the table and the grid at 1440 × 900', async ({ page }) => {
    test.skip(process.env.CAPTURE !== '1', 'A capture tool: run with CAPTURE=1');
    test.setTimeout(240_000);
    mkdirSync(OUT, { recursive: true });
    await login(page);
    const { artistId, title } = await seed(page);
    try {
      /* The shelf: the first answer is pulled. */
      await states(page, async () => { await page.goto(`/?artistId=${artistId}`); await wallMeasured(page); }, 'shelf', 1440, title, async () => {
        await expect.poll(() => page.locator('[data-wall-container]').getAttribute('data-phase'), { timeout: 30_000 }).toBe('landed');
      });
      /* The far view at 1440, the rail a column: the first answer's cell in the count column. */
      await states(page, async () => {
        await page.goto(`/?artistId=${artistId}`);
        await wallMeasured(page);
        await page.getByTestId('wall-zoom-out').click();
        await page.locator('[data-wall="overview"]').waitFor({ timeout: 30_000 });
      }, 'far-view', 1440, title, async () => { await page.waitForTimeout(1_500); });
      /* The far view where its rail draws as a band: the covers in a row beneath the control. */
      await page.setViewportSize({ width: nearViewMinWidth() - 1, height: 900 });
      await states(page, async () => {
        await page.goto(`/?artistId=${artistId}`);
        await wallMeasured(page);
      }, 'far-band', nearViewMinWidth() - 1, title, async () => { await coversDrawn(page); });
      await page.setViewportSize({ width: 1440, height: 900 });
      for (const view of ['table', 'grid'] as const) {
        await states(page, async () => { await page.goto(`/?view=${view}&artistId=${artistId}`); await filtersReady(page); }, view, 1440, title, () => coversDrawn(page));
      }
    } finally {
      await removeRecordsFor(artistId);
    }
  });
});

test.describe('narrow, a coarse pointer', () => {
  test.use({ hasTouch: true, viewport: { width: 390, height: 844 } });
  test('the table and the grid at 390, where the control draws as a band', async ({ page }) => {
    test.skip(process.env.CAPTURE !== '1', 'A capture tool: run with CAPTURE=1');
    test.setTimeout(240_000);
    mkdirSync(OUT, { recursive: true });
    await login(page);
    const { artistId, title } = await seed(page);
    try {
      for (const view of ['table', 'grid'] as const) {
        await states(page, async () => { await page.goto(`/?view=${view}&artistId=${artistId}`); await filtersReady(page); }, view, 390, title, () => coversDrawn(page));
      }
    } finally {
      await removeRecordsFor(artistId);
    }
    writeFileSync(
      join(OUT, 'README.md'),
      `# pick-ask-182 · the ask field in every host, recaptured at step 182 (§P.2, §P.4, §P.5, §P.6; steps 178 to 182), captured ${new Date().toISOString().slice(0, 10)}

**Every record in these captures is seeded, and no figure here describes the collection.** The test environment has no
provider key, so the vectors are the test environment's stub model (a bag of words, \`src/lib/openai/stub-embedding.ts\`),
and the records are this capture's ten (five about late-night jazz, five about punk) under an artist filter, not Adam's
55. The file names say \`seeded-\` first for that reason (the coordinator, 12 Nov, on §55's lesson: a capture is a figure
with a picture attached).

From the build (E2E_SERVER=build). Three states per host: the field empty; the phrase "late night jazz" asked; a record's
own title asked, which asks from that record and leaves it out. Where the answer is covers, the page is captured in full.

| host | window | files |
|---|---|---|
| the shelf's rail (the first answer pulled) | 1440 × 900, a fine pointer | seeded-shelf-1440-{empty,phrase,title}.png |
| the far view's rail as a column (the first answer's cell in the count column) | 1440 × 900 | seeded-far-view-1440-{empty,phrase,title}.png |
| the far view's rail as a band (the covers in a row beneath the control) | ${nearViewMinWidth() - 1} × 900 | seeded-far-band-${nearViewMinWidth() - 1}-{empty,phrase,title}.png |
| the table's sidebar (a column of five) | 1440 × 900 | seeded-table-1440-{empty,phrase,title}.png |
| the grid's sidebar (a column of five) | 1440 × 900 | seeded-grid-1440-{empty,phrase,title}.png |
| the table's band (a wrapped row) | 390 × 844, a coarse pointer | seeded-table-390-{empty,phrase,title}.png |
| the grid's band (a wrapped row) | 390 × 844, a coarse pointer | seeded-grid-390-{empty,phrase,title}.png |

The answer's count is keyed to its form (§P.2, 12 Nov): one where it is a pull, the shelf's, and five where it is cells,
the far view's band included; a wrapped row where the control draws as a band and a column where it draws as a column.
Recaptured at step 182 with the field labelled WHAT TO PLAY, the count line "N have no About.", ASK and SURPRISE ME 18
apart in the sidebar, the closing hairline under the answer at 390, and the pointer moved off the control before each
picture, so ASK is in ink and not underlined. §P.4's "provisional until built and captured in every host" returns on these.
`,
    );
  });
});
