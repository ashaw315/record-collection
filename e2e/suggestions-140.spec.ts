import { expect, test, type Page } from '@playwright/test';
import { registerCleanup, trackArtist } from './cleanup';
import { POINTERS, pointerIs } from './hit-area';
import { gapBetween } from './pair-gap';
import { login } from './sign-in';

registerCleanup();

/**
 * Step 140, Design's drop of 12 Oct: the reserved slot stated as a rule,
 * and suggestions' pass.
 *
 * "Nothing the app does on its own moves what a reader may be about to
 * press: a control whose label changes keeps its drawn size, and a status
 * or error that replaces or follows a control takes a reserved slot of
 * stated lines." And: "Below 640 the Ask Claude panel stacks ... No boxes
 * except controls ... The controls take §9.3's type."
 *
 * Ask Claude's panel is read on `/suggestions/probe`, where it is drawn
 * configured (the real screen draws it only with a model key, which the
 * test environment has not got, by design). Every answer is a stub's.
 */
const PROBE = '/suggestions/probe';
const AI = '**/api/suggestions/ai**';
const json = (body: unknown, status = 200) => ({ status, contentType: 'application/json', body: JSON.stringify(body) });

async function panel(page: Page, width: number) {
  await page.setViewportSize({ width, height: 844 });
  await page.goto(PROBE);
  await expect(page.getByRole('button', { name: 'Ask Claude' })).toBeVisible();
  await page.addStyleTag({ content: 'nextjs-portal{display:none!important}' });
  await page.evaluate(() => document.fonts.ready);
}

/** Where the scope select, ASK CLAUDE and what follows the panel stand, and how wide the button is. */
const places = (page: Page) =>
  page.evaluate(() => {
    const box = (el: Element | null) => { if (el === null) return null; const b = el.getBoundingClientRect(); return [Math.round(b.left * 10) / 10, Math.round(b.top * 10) / 10, Math.round(b.width * 10) / 10, Math.round(b.height * 10) / 10]; };
    return { select: box(document.querySelector('[data-testid="gap-scope"]')), button: box(document.querySelector('[data-ask-button]')), after: box(document.querySelector('[data-after-panel]')) };
  });

test.beforeEach(async ({ page }) => login(page));

for (const pointer of POINTERS) test.describe(`Ask Claude’s panel under a ${pointer} pointer`, () => {
  test.use({ hasTouch: pointer === 'coarse' });
  for (const width of [320, 390, 1280]) {
    /* Fails against "Thinking…" narrower than "Ask Claude" (the select moved 4), and against a failure line that is not there until it fails (what follows moved 31). */
    test(`nothing moves when ASK CLAUDE reads THINKING… or fails, at ${width}`, async ({ page }) => {
      expect(await pointerIs(page)).toBe(pointer);
      let release: () => void = () => {};
      const held = new Promise<void>((resolve) => { release = resolve; });
      await page.route(AI, async (route) => { await held; await route.fulfill(json({ error: { message: 'The suggestion service is at its limit for now.', code: 'RATE_LIMITED' } }, 429)); });
      await panel(page, width);
      const idle = await places(page);
      expect(idle.select !== null && idle.button !== null && idle.after !== null, 'the precondition: the select, the button and what follows are all drawn').toBe(true);

      await page.getByRole('button', { name: 'Ask Claude' }).click();
      await expect(page.locator('[data-ask-button]')).toHaveText(/thinking/i);
      expect(await places(page), 'thinking, against idle').toEqual(idle);

      release();
      await expect(page.locator('[data-ask-failure]')).toHaveText('The suggestion service is at its limit for now.');
      await expect(page.locator('[data-ask-button]')).toHaveText(/ask claude/i);
      expect(await places(page), 'failed, against idle').toEqual(idle);
      const slot = await page.evaluate(() => { const line = (document.querySelector('[data-ask-failure]') as HTMLElement).getBoundingClientRect(); const button = (document.querySelector('[data-ask-button]') as HTMLElement).getBoundingClientRect(); const after = (document.querySelector('[data-after-panel]') as HTMLElement).getBoundingClientRect(); return { beneath: line.top >= button.bottom - 0.5, above: line.bottom <= after.top + 0.5 }; });
      expect(slot, 'the failure stands beneath the controls and above what follows').toEqual({ beneath: true, above: true });
    });

    /* Fails against controls set in 11 sans (the select) and a button in sentence case, each 36 or less under a finger. */
    test(`the scope select and ASK CLAUDE are §9.3 controls: 11 mono uppercase${pointer === 'coarse' ? ', 44 to a finger' : ''}, at ${width}`, async ({ page }) => {
      await panel(page, width);
      const m = await page.evaluate(() => ['[data-testid="gap-scope"]', '[data-ask-button]'].map((selector) => { const el = document.querySelector(selector) as HTMLElement; const cs = getComputedStyle(el); return { size: cs.fontSize, upper: cs.textTransform, mono: /mono/i.test(cs.fontFamily), radius: cs.borderTopLeftRadius, height: Math.round(el.getBoundingClientRect().height) }; }));
      for (const control of m) {
        expect.soft(control, 'type and corners').toMatchObject({ size: '11px', upper: 'uppercase', mono: true, radius: '0px' });
        if (pointer === 'coarse') expect.soft(control.height, '44 in the box under a coarse pointer').toBe(44);
      }
      /*
        Step 143: grouped controls stand 24 apart, §G.3's gap, "side by side or stacked"; the axis is read from the
        boxes rather than assumed (`pair-gap.ts`) and named in the message. Fails against the row as built, 8 apart.
      */
      const [select, ask] = await page.evaluate(() => ['[data-testid="gap-scope"]', '[data-ask-button]'].map((selector) => { const b = (document.querySelector(selector) as HTMLElement).getBoundingClientRect(); return { left: b.left, top: b.top, right: b.right, bottom: b.bottom }; }));
      if (select === undefined || ask === undefined) throw new Error('the select and the button are not both there');
      const apart = gapBetween(select, ask);
      test.info().annotations.push({ type: 'axis', description: `the select and ASK CLAUDE at ${width} ${pointer}: ${apart.axis}, ${apart.gap} apart` });
      expect(['x', 'y'], `at ${width}: the pair is side by side or stacked`).toContain(apart.axis);
      expect(apart.gap, `at ${width}: 24 apart along ${apart.axis}`).toBe(24);
    });
  }

  /* Fails against the heading and sentence in a column about 90 wide beside the controls, eleven lines at 390. */
  test('below 640 the panel stacks: heading and sentence the panel’s width, then the select and ASK CLAUDE on one row; from 640 they stand beside it', async ({ page }) => {
    for (const [width, stacked] of [[390, true], [639, true], [640, false], [1280, false]] as const) {
      await panel(page, width);
      const m = await page.evaluate(() => {
        const box = (selector: string) => (document.querySelector(selector) as HTMLElement).getBoundingClientRect();
        const panelBox = box('[data-ask-panel]'); const words = box('[data-ask-words]'); const select = box('[data-testid="gap-scope"]'); const button = box('[data-ask-button]');
        return { panel: Math.round(panelBox.width), words: Math.round(words.width), below: select.top >= words.bottom - 0.5, oneRow: Math.abs((select.top + select.height / 2) - (button.top + button.height / 2)) < 1, lines: Math.round(box('[data-ask-words] p').height / parseFloat(getComputedStyle(document.querySelector('[data-ask-words] p') as HTMLElement).lineHeight)) };
      });
      expect.soft(m.oneRow, `at ${width}: the select and the button on one row`).toBe(true);
      expect.soft(m.below, `at ${width}: the controls ${stacked ? 'beneath' : 'beside'} the words`).toBe(stacked);
      if (stacked) expect.soft(m.words, `at ${width}: the words are the panel’s width`).toBe(m.panel);
      if (width === 390) expect.soft(m.lines, 'at 390 the sentence is three lines or fewer, not eleven').toBeLessThanOrEqual(3);
    }
  });

  /* Fails against a panel in a box of four sides with a 6 radius. */
  test('the panel is a section between two hairlines, not a box', async ({ page }) => {
    await panel(page, 1280);
    const m = await page.locator('[data-ask-panel]').evaluate((el) => { const cs = getComputedStyle(el); return [cs.borderTopWidth, cs.borderBottomWidth, cs.borderLeftWidth, cs.borderRightWidth, cs.borderTopLeftRadius]; });
    expect(m).toEqual(['1px', '1px', '0px', '0px', '0px']);
  });

  /* Fails against a list of boxes: each suggestion in four borders, 12 apart. */
  test('the suggestions are rows between hairlines, with no box that is not a control', async ({ page }) => {
    expect(await pointerIs(page)).toBe(pointer);
    const suffix = `s140-${Date.now()}-${Math.floor(Math.random() * 1e4)}`;
    const post = async (path: string, data: unknown) => { const response = await page.request.post(path, { data, failOnStatusCode: false }); expect(response.status(), path).toBe(201); return ((await response.json()) as { id: string }).id; };
    const owned = await post('/api/artists', { name: `Discharge ${suffix}` });
    trackArtist(owned);
    const candidate = await post('/api/artists', { name: `Anti-Cimex ${suffix}` });
    trackArtist(candidate);
    await post('/api/records', { title: `Hear Nothing ${suffix}`, artistId: owned });
    await post('/api/influences', { sourceArtistId: candidate, targetArtistId: owned, strength: 5 });
    /* A second, so there is a line BETWEEN two rows to read whatever else the shared database holds. */
    const second = await post('/api/artists', { name: `The Varukers ${suffix}` });
    trackArtist(second);
    await post('/api/influences', { sourceArtistId: second, targetArtistId: owned, strength: 4 });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/suggestions');
    const row = page.getByRole('listitem').filter({ hasText: `Anti-Cimex ${suffix}` });
    await expect(row).toBeVisible();
    const boxes = await page.evaluate(() => Array.from(document.querySelectorAll('main *')).filter((el) => { if (el.closest('a, button, select, input, textarea') !== null) return false; const cs = getComputedStyle(el); return parseFloat(cs.borderLeftWidth) > 0 || parseFloat(cs.borderRightWidth) > 0 || parseFloat(cs.borderTopLeftRadius) > 0; }).map((el) => `${el.tagName.toLowerCase()} "${(el.textContent ?? '').trim().slice(0, 30)}"`));
    expect(boxes, 'things in a box that are not controls').toEqual([]);
    const lines = await page.evaluate(() => { /* The list's own rows: each row holds a list of its reasons, whose items are not rows. */ const rows = Array.from(document.querySelectorAll('main > ul > li')); const tops = rows.map((li) => li.getBoundingClientRect().top); return { rows: rows.length, /* One line between two rows, whichever of the two carries it: the stylesheet's `divide` puts it under every row but the last. */ between: rows.slice(1).map((li, index) => `${parseFloat(getComputedStyle(li).borderTopWidth) + parseFloat(getComputedStyle(rows[index] as Element).borderBottomWidth)}px`), above: (() => { const panel = document.querySelector('[data-ask-panel], main ul')?.parentElement; const first = rows[0]; if (first === undefined || panel === null || panel === undefined) return null; const sentence = document.querySelector('main > ul')?.previousElementSibling; const last = sentence?.lastElementChild ?? sentence; return last === null || last === undefined ? null : getComputedStyle(last).borderBottomWidth; })(), sorted: tops.every((top, index) => index === 0 || top >= (tops[index - 1] ?? 0)) }; });
    expect(lines.rows, 'the precondition: two rows or more').toBeGreaterThan(1);
    expect(new Set(lines.between), 'one hairline between each row and the next').toEqual(new Set(['1px']));
    expect(lines.above, 'and one above the first: the lower hairline of what stands over the list').toBe('1px');
    if (pointer === 'coarse') {
      /* "Add to want list stays a link, its row its target where it stands alone." */
      const reached = await row.evaluate((el) => { const box = el.getBoundingClientRect(); const link = el.querySelector('a'); const at = document.elementFromPoint(box.left + 24, box.top + box.height / 2); return at !== null && link !== null && (at === link || link.contains(at)); });
      expect(reached, 'a tap on the row’s left reaches Add to want list').toBe(true);
    }
  });
});
