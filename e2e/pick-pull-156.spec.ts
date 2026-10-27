import { expect, test, type Page } from '@playwright/test';
import { registerCleanup, trackArtist } from './cleanup';
import { seedRecords } from './seed';
import { login } from './sign-in';
import { wallMeasured } from './wall-measured';
import { RETURN_MS } from '../src/app/wall/gesture';

/**
 * Step 156 unit 4, target §P.3: on the near view SURPRISE ME answers with
 * §W's pull. "In a view that can pull, the first answer is §W's pull, from the
 * seat the pick names." "With a record out, an ask puts it back and then pulls
 * the next, both by §W unchanged. That holds whether the record came out by
 * an ask or by its spine." "An ask while a record is moving is ignored."
 * "Where the pick names the record already out, nothing moves", and the slot
 * says "The only one." §P.2: "A record the reader pulled by its spine counts
 * as served too", and since 27 Oct §P.2 and §P.3 rule the same for a record
 * brought out by §W.9's arrows.
 *
 * The re-roll's put back and pull run in sequence, which is what is built and
 * not what is ruled (`P.3/probe-judges`): Adam judges the order by using it.
 *
 * Each test seeds its own artist and filters the wall to it, so the pool is
 * those records and nothing here depends on what else the database holds.
 */
registerCleanup();
test.beforeEach(async ({ page }) => login(page));

async function poolOf(page: Page, count: number): Promise<{ artistId: string; ids: string[] }> {
  const suffix = `pp156${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;
  const artist = (await (await page.request.post('/api/artists', { data: { name: `Pull-${suffix}` } })).json()) as { id: string };
  trackArtist(artist.id);
  await seedRecords(artist.id, 'Pull', suffix, count);
  const listed = (await (await page.request.get(`/api/records?artistId=${artist.id}&pageSize=100`)).json()) as { data: Array<{ id: string }> };
  return { artistId: artist.id, ids: listed.data.map((row) => row.id) };
}

async function openNear(page: Page, artistId: string) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`/?artistId=${artistId}`);
  await wallMeasured(page);
  await page.addStyleTag({ content: 'nextjs-portal{display:none!important}' });
  /*
    Every pulled record and the gesture's phase, frame by frame, kept where
    either changes: a record carries `data-pulled` while it moves either way,
    so two at once is two in motion, and the phase's times say whether a put
    back ran its whole course before the next pull began.
  */
  await page.evaluate(() => {
    const w = window as unknown as { __frames: Array<{ pulled: string; phase: string; t: number }> };
    w.__frames = [];
    const sample = (t: number) => {
      const pulled = Array.from(document.querySelectorAll('[data-pulled]')).map((el) => el.getAttribute('data-pulled') ?? '').join(',');
      const phase = document.querySelector('[data-wall-container]')?.getAttribute('data-phase') ?? '';
      const last = w.__frames[w.__frames.length - 1];
      if (last === undefined || last.pulled !== pulled || last.phase !== phase) w.__frames.push({ pulled, phase, t });
      requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  });
}

/** The drawn control's button: a bare `/` carries two copies and a media query hides one. */
const press = (page: Page) => page.locator('[data-pick-control] button').filter({ visible: true }).click();
type Frame = { pulled: string; phase: string; t: number };
const sampled = (page: Page) => page.evaluate(() => (window as unknown as { __frames: Frame[] }).__frames);
/** The records out, in order, each run of frames counted once; '' is a frame with none. */
const frames = async (page: Page) => (await sampled(page)).map((f) => f.pulled).filter((f, i, all) => i === 0 || all[i - 1] !== f);
/** The same without the frames where nothing is out: whether one shows between a put back and the next pull is a matter of which frame React commits in, and nothing §P.3 rules. */
const outs = async (page: Page) => (await frames(page)).filter((f) => f !== '');
/**
 * Settled out: the gesture's phase reads `landed` and one record is out. Not
 * the panel, which `WallStage` draws partway through the swing: an ask then
 * is an ask while a record moves, and is rightly ignored.
 */
async function settledOut(page: Page): Promise<string> {
  await expect.poll(() => page.locator('[data-wall-container]').getAttribute('data-phase'), { timeout: 30_000 }).toBe('landed');
  await expect.poll(() => page.locator('[data-pulled]').count(), { timeout: 30_000 }).toBe(1);
  return (await page.locator('[data-pulled]').getAttribute('data-pulled')) ?? '';
}
/** At rest with nothing out, after the put back has landed. */
const atRest = (page: Page) => expect.poll(() => page.locator('[data-pulled]').count(), { timeout: 30_000 }).toBe(0);
const slot = (page: Page) => page.locator('[data-pick-control] [data-pick-slot]').filter({ visible: true }).textContent();

test('the first ask pulls a record from the pool, by §W’s pull, and draws no cell on the near view', async ({ page }) => {
  const { artistId, ids } = await poolOf(page, 3);
  await openNear(page, artistId);
  await press(page);
  const out = await settledOut(page);
  expect(ids, 'the pulled record is one of the pool’s').toContain(out);
  expect(await page.locator('[data-pick-answer]').filter({ visible: true }).count(), '§P.4’s cell is the answer only where the view cannot pull').toBe(0);
});

test('a re-roll puts the record back and then pulls another, never both moving at once', async ({ page }) => {
  const { artistId, ids } = await poolOf(page, 3);
  await openNear(page, artistId);
  await press(page);
  const first = await settledOut(page);
  await press(page);
  await expect.poll(async () => (await page.locator('[data-pulled]').getAttribute('data-pulled').catch(() => null)) ?? '', { timeout: 30_000 }).not.toBe(first);
  const second = await settledOut(page);
  expect(ids).toContain(second);
  expect(second, '§P.2: the same record is not served twice in a row while another remains').not.toBe(first);
  expect((await frames(page)).filter((f) => f.includes(',')), 'two records in motion at once').toEqual([]);
  expect(await outs(page), 'the first record alone, then the second alone').toEqual([first, second]);
  /* In sequence, and the put back whole: the second's swing begins no sooner than a full return after the first's began. */
  const all = await sampled(page);
  const back = all.find((f) => f.pulled === first && f.phase === 'return');
  const next = all.find((f) => f.pulled === second);
  expect(back, 'the first record went back').toBeDefined();
  expect(next, 'the second record came out').toBeDefined();
  expect((next?.t ?? 0) - (back?.t ?? 0), `the put back ran its ${RETURN_MS}ms before the pull began`).toBeGreaterThanOrEqual(RETURN_MS - 20);
});

test('an ask while a record moves is ignored, coming out and going back', async ({ page }) => {
  const { artistId } = await poolOf(page, 3);
  await openNear(page, artistId);
  await press(page);
  await page.locator('[data-pulled]').waitFor({ timeout: 30_000 });
  await press(page);
  const first = await settledOut(page);
  /* A second press while the first record was coming out would have queued nothing: one record, and it stays out. */
  await page.waitForTimeout(2_500);
  expect(await outs(page), 'only the first pull happened').toEqual([first]);
  await press(page);
  await expect.poll(async () => (await frames(page)).length, { timeout: 30_000 }).toBeGreaterThan(2);
  await press(page);
  const second = await settledOut(page);
  await page.waitForTimeout(2_500);
  expect(await outs(page), 'one re-roll: the press while it ran did nothing').toEqual([first, second]);
});

/*
  A pool of two and a draw left to chance would pass half the time with the
  served rule broken. So the draw is pinned at each end of the pool in turn:
  with the rule broken, one of the two lands on the served record.
*/
const DRAWS = [0, 0.999];
const pin = (page: Page, draw: number) => page.evaluate((r) => { Math.random = () => r; }, draw);

test('a record pulled by its spine counts as served, and an ask with it out re-rolls', async ({ page }) => {
  const { artistId, ids } = await poolOf(page, 2);
  const [spine, other] = ids;
  for (const draw of DRAWS) {
    await openNear(page, artistId);
    await page.locator(`a[data-seat="${spine}"] [data-spine]`).click();
    expect(await settledOut(page)).toBe(spine);
    await pin(page, draw);
    await press(page);
    await expect.poll(() => outs(page), { timeout: 30_000, message: `draw ${draw}: with the spine’s record out, the ask puts it back and pulls the other` }).toEqual([spine, other]);
    expect(await settledOut(page)).toBe(other);
    expect((await frames(page)).filter((f) => f.includes(','))).toEqual([]);
  }
});

test('a record brought out by the arrows counts as served, as one pulled by its spine does', async ({ page }) => {
  const { artistId, ids } = await poolOf(page, 2);
  for (const draw of DRAWS) {
    await openNear(page, artistId);
    await page.locator(`a[data-seat="${ids[0]}"] [data-spine]`).click();
    await settledOut(page);
    await page.locator('[data-testid="nav-next"], [data-testid="nav-previous"]').first().click();
    /* The arrows' slide has both moving on one clock (§W.8), so only the frames with one record out are compared. */
    const alone = async () => (await outs(page)).filter((f) => !f.includes(','));
    await expect.poll(alone, { timeout: 30_000 }).toEqual([ids[0], ids[1]]);
    await settledOut(page);
    await page.keyboard.press('Escape');
    await atRest(page);
    await pin(page, draw);
    await press(page);
    await expect.poll(alone, { timeout: 30_000, message: `draw ${draw}: the arrowed record was served, so the ask draws the other` }).toEqual([ids[0], ids[1], ids[0]]);
  }
});

test('where the pool holds one record and it is out, an ask moves nothing and the slot says “The only one.”', async ({ page }) => {
  const { artistId, ids } = await poolOf(page, 1);
  await openNear(page, artistId);
  await press(page);
  expect(await settledOut(page)).toBe(ids[0]);
  expect(await slot(page), 'the first answer is a pull, not "the only one"').toBe('');
  await press(page);
  await expect.poll(() => slot(page), { timeout: 10_000 }).toBe('The only one.');
  await page.waitForTimeout(2_500);
  expect(await outs(page), 'nothing moved').toEqual([ids[0]]);
  expect((await sampled(page)).filter((f) => f.phase === 'return'), 'no put back began').toEqual([]);
});
