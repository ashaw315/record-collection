import { expect, test, type Page, type Route } from '@playwright/test';
import { registerCleanup, trackArtist } from './cleanup';
import { removeRecordsFor, seedRecords } from './seed';
import { login } from './sign-in';

/**
 * **§P.3, the ask in flight, built (step 3; "Ask in flight presses and field", 22 Nov; "Indicator any length", 23 Nov).**
 * The slot draws a motion with no end for the length of the call, and at five seconds words join it; the drawn answer
 * stays until replaced; the field stays live; ASK with the same phrase starts no request, a changed phrase lets the ask
 * go and asks again, SURPRISE ME lets it go and answers, and an abandoned ask's reply is never drawn. The ask route is
 * held and fulfilled by the test, so every interleaving is chosen rather than raced, and the page's clock is the test's,
 * so a 30-second wait takes no 30 seconds. Fails against the interim rule (both presses ignored), a motion that stops,
 * words that never come or come at once, and a late reply drawn over the answer that replaced it.
 */
registerCleanup();
test.beforeEach(async ({ page }) => login(page));

type Held = { route: Route; body: { phrase: string; exclude?: string[] } };

async function pool(page: Page): Promise<{ artistId: string; ids: string[] }> {
  const suffix = `fl${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;
  const artist = (await (await page.request.post('/api/artists', { data: { name: `Flight-${suffix}` } })).json()) as { id: string };
  trackArtist(artist.id);
  await seedRecords(artist.id, 'Flight', suffix, 4);
  const listed = (await (await page.request.get(`/api/records?artistId=${artist.id}&pageSize=100`)).json()) as { data: Array<{ id: string }> };
  return { artistId: artist.id, ids: listed.data.map((r) => r.id) };
}

/** Every POST to the ask route is held until the test answers it, in the order the test chooses. */
async function holdAsks(page: Page): Promise<Held[]> {
  const held: Held[] = [];
  await page.route('**/api/ask', async (route) => {
    held.push({ route, body: route.request().postDataJSON() as Held['body'] });
  });
  return held;
}
const answer = (h: Held, ids: string[]) =>
  h.route.fulfill({ json: { mode: 'pick', verdict: 'answer', answers: ids.map((recordId) => ({ recordId, reason: 'A reason.' })), from: 'phrase', askedFrom: null, unanswerable: false } });

const control = (page: Page) => page.locator('[data-pick-control]').filter({ visible: true });
const field = (page: Page) => control(page).locator('[data-ask-field]');
const askButton = (page: Page) => control(page).getByRole('button', { name: /^ask$/i });
const surprise = (page: Page) => control(page).getByRole('button', { name: /surprise me/i });
const drawnIds = (page: Page) =>
  page.evaluate(`Array.from(document.querySelectorAll('[data-pick-answer]')).filter((el) => el.getClientRects().length > 0).map((el) => ((el.querySelector('a') || {}).getAttribute ? el.querySelector('a').getAttribute('href') : '').replace('/records/', ''))`) as Promise<string[]>;
/** The motion's animation as the page runs it: playing, with no end. */
const motion = (page: Page) =>
  page.evaluate(`(() => {
    const el = Array.from(document.querySelectorAll('[data-pick-working-motion]')).find((e) => e.getClientRects().length > 0);
    if (!el) return null;
    const a = el.getAnimations()[0];
    return a ? { playState: a.playState, iterations: a.effect.getComputedTiming().iterations } : { playState: 'none', iterations: 0 };
  })()`) as Promise<{ playState: string; iterations: number } | null>;
const words = (page: Page) => control(page).locator('[data-pick-working-words]');

async function openGrid(page: Page, artistId: string, width = 1440) {
  await page.setViewportSize({ width, height: 900 });
  await page.goto(`/?view=grid&artistId=${artistId}`);
  await page.locator('[data-collection-filters][data-hydrated="true"]').first().waitFor({ timeout: 30_000 });
}

test('a 30-second wait: the motion runs without end throughout, the words join it at five seconds and stay, and both clear at the reply with the answer drawn', async ({ page }) => {
  const { artistId, ids } = await pool(page);
  try {
    await page.clock.install();
    const held = await holdAsks(page);
    await openGrid(page, artistId);
    await field(page).fill('something slow');
    /* An installed clock flows in real time until paused; paused here, the test's runFor is the only time that passes. */
    await page.clock.pauseAt(((await page.evaluate('Date.now()')) as number) + 100);
    await askButton(page).click();
    await expect.poll(() => held.length).toBe(1);
    expect(await motion(page), 'the motion runs from the press').toEqual({ playState: 'running', iterations: Infinity });
    await expect(words(page), 'no words before five seconds').toHaveCount(0);
    await page.clock.runFor(4_900);
    await expect(words(page)).toHaveCount(0);
    await page.clock.runFor(200);
    await expect(words(page), 'words at five seconds').toHaveText('Reading your records…');
    await page.clock.runFor(25_000);
    expect(await motion(page), 'still running at thirty seconds').toEqual({ playState: 'running', iterations: Infinity });
    await expect(words(page)).toHaveCount(1);
    await answer(held[0], ids.slice(0, 2));
    await expect.poll(() => drawnIds(page)).toEqual(ids.slice(0, 2));
    await expect(control(page).locator('[data-pick-working]'), 'both clear at the reply').toHaveCount(0);
  } finally {
    await removeRecordsFor(artistId);
  }
});

test('under reduced motion the line is still and the words are drawn from the press', async ({ page }) => {
  const { artistId, ids } = await pool(page);
  try {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const held = await holdAsks(page);
    await openGrid(page, artistId);
    await field(page).fill('something slow');
    await askButton(page).click();
    await expect.poll(() => held.length).toBe(1);
    await expect(words(page), 'words from the press').toHaveText('Reading your records…');
    expect((await motion(page))?.playState, 'the line still').toBe('none');
    await answer(held[0], ids.slice(0, 1));
    await expect(control(page).locator('[data-pick-working]')).toHaveCount(0);
  } finally {
    await removeRecordsFor(artistId);
  }
});

test('in flight: the field takes typing, the same phrase starts no request, and the drawn answer stays until replaced', async ({ page }) => {
  const { artistId, ids } = await pool(page);
  try {
    const held = await holdAsks(page);
    await openGrid(page, artistId);
    await field(page).fill('something slow');
    await askButton(page).click();
    await expect.poll(() => held.length).toBe(1);
    await answer(held[0], [ids[0]]);
    await expect.poll(() => drawnIds(page)).toEqual([ids[0]]);
    /* A re-ask of the same phrase, held: the answer already drawn stays drawn while it waits. */
    await askButton(page).click();
    await expect.poll(() => held.length).toBe(2);
    expect(await drawnIds(page), 'the drawn answer stays until replaced').toEqual([ids[0]]);
    await askButton(page).click();
    await page.waitForTimeout(300);
    expect(held.length, 'the same phrase again starts no request').toBe(2);
    await expect(field(page), 'the field is live').toBeEditable();
    await field(page).pressSequentially(' and quiet');
    await expect(field(page), 'typing in flight is kept').toHaveValue('something slow and quiet');
    await answer(held[1], [ids[1]]);
    await expect.poll(() => drawnIds(page)).toEqual([ids[1]]);
  } finally {
    await removeRecordsFor(artistId);
  }
});

test('in flight: a changed phrase lets the ask go and asks again, and only the second answer is drawn, whichever reply comes last', async ({ page }) => {
  const { artistId, ids } = await pool(page);
  try {
    const held = await holdAsks(page);
    await openGrid(page, artistId);
    await field(page).fill('something slow');
    await askButton(page).click();
    await expect.poll(() => held.length).toBe(1);
    await field(page).fill('something loud');
    await askButton(page).click();
    await expect.poll(() => held.length, 'the changed phrase is asked').toBe(2);
    expect(held[1].body.phrase).toBe('something loud');
    await answer(held[1], [ids[1]]);
    await expect.poll(() => drawnIds(page)).toEqual([ids[1]]);
    await answer(held[0], [ids[0]]);
    await page.waitForTimeout(300);
    expect(await drawnIds(page), 'the abandoned reply is never drawn').toEqual([ids[1]]);
  } finally {
    await removeRecordsFor(artistId);
  }
});

test('in flight: SURPRISE ME lets the ask go and answers at once, and the late reply draws nothing', async ({ page }) => {
  const { artistId, ids } = await pool(page);
  try {
    const held = await holdAsks(page);
    await openGrid(page, artistId);
    await field(page).fill('something slow');
    await askButton(page).click();
    await expect.poll(() => held.length).toBe(1);
    await surprise(page).click();
    await expect.poll(async () => (await drawnIds(page)).length, 'SURPRISE ME answers at once').toBe(1);
    const surprised = await drawnIds(page);
    await expect(control(page).locator('[data-pick-working]'), 'the indicator ends with the ask let go').toHaveCount(0);
    await answer(held[0], ids.filter((id) => id !== surprised[0]).slice(0, 2));
    await page.waitForTimeout(300);
    expect(await drawnIds(page), 'no late ask answer').toEqual(surprised);
  } finally {
    await removeRecordsFor(artistId);
  }
});

/* The step's measure: the words' line at the rail's width and at 320 and 1280, reported; two lines at the rail go back to Design rather than being cut. */
for (const [label, width, query] of [['the shelf rail at 1280', 1280, ''], ['the grid sidebar at 1280', 1280, 'view=grid&'], ['the band at 320', 320, 'view=grid&']] as const) {
  test(`the words' line measured in ${label}`, async ({ page }) => {
    const { artistId } = await pool(page);
    try {
      await page.emulateMedia({ reducedMotion: 'reduce' });
      const held = await holdAsks(page);
      await page.setViewportSize({ width, height: 900 });
      await page.goto(`/?${query}artistId=${artistId}`);
      await control(page).waitFor({ timeout: 30_000 });
      await page.waitForTimeout(500);
      await field(page).fill('something slow');
      await askButton(page).click();
      await expect.poll(() => held.length).toBe(1);
      const m = (await page.evaluate(`(() => {
        const el = Array.from(document.querySelectorAll('[data-pick-working-words]')).find((e) => e.getClientRects().length > 0);
        const slot = el && el.closest('[data-pick-slot]');
        if (!el || !slot) return null;
        const lh = parseFloat(getComputedStyle(el).lineHeight);
        return { lines: Math.round(el.getBoundingClientRect().height / lh), words: el.getBoundingClientRect().width, slot: slot.getBoundingClientRect().width };
      })()`)) as { lines: number; words: number; slot: number } | null;
      expect(m, 'the words are drawn').not.toBeNull();
      test.info().annotations.push({ type: 'words', description: `${label}: ${m?.lines} line(s), the words ${m?.words.toFixed(0)} wide in a slot ${m?.slot.toFixed(0)} wide` });
      await answer(held[0], []);
    } finally {
      await removeRecordsFor(artistId);
    }
  });
}
