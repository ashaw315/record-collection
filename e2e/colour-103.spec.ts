import { expect, test, type Page } from '@playwright/test';
import { registerCleanup } from './cleanup';
import { GRID_FORK } from '../src/app/records/[id]/band-geometry';
import { eachScreen, openScreen, seedFixture } from './screens-103';
import { login } from './sign-in';

registerCleanup();

/**
 * Step 103b, §T.6: "Oxblood goes from every screen... Each instance becomes
 * what its role takes: text in ink or the label colour; a filled button
 * §9.3's unfilled ink box, square; a destructive action ink, as §24's Delete
 * record is. The survey's grey becomes the system's own by role... No fourth
 * neutral remains."
 *
 * Read as paint: every element's text colour, fill, drawn borders, outline,
 * ring and svg fill and stroke, each painted to a pixel and compared, since
 * one colour is spelt `lab()` through a class and `oklch()` inline. Every
 * element in the document is read, drawn or not.
 *
 * The three colours that go: oxblood; the grey the survey found, which is
 * `--muted-foreground`; and the destructive red, which §T.6 does not name
 * as a colour and rules by role ("a destructive action ink").
 *
 * Sign-in was first left out, by the coordinator's ruling of 9 Oct, and a
 * test here held its oxblood so the exception was on the record. §T.6 then
 * reached it ("It reaches login too, for colour as for radius"), and the
 * last test reads it as any other screen.
 */
const GOING = { oxblood: 'oklch(0.36 0.098 18)', 'the survey’s grey': 'oklch(0.48 0.012 60)', 'destructive red': 'oklch(0.52 0.2 27)' };
const INK = 'oklch(0.19 0.008 60)';

/** Every element painting one of the colours that go, as "what, where, which". */
const going = (page: Page, within = 'body') =>
  page.evaluate(({ GOING, within }) => {
    const canvas = document.createElement('canvas'); canvas.width = 1; canvas.height = 1;
    const ctx = canvas.getContext('2d', { willReadFrequently: true }) as CanvasRenderingContext2D;
    const cache = new Map<string, [number, number, number, number]>();
    const paint = (css: string) => {
      let got = cache.get(css);
      if (got === undefined) { ctx.clearRect(0, 0, 1, 1); ctx.fillStyle = '#000'; ctx.fillStyle = css; ctx.fillRect(0, 0, 1, 1); const d = ctx.getImageData(0, 0, 1, 1).data; got = [d[0], d[1], d[2], d[3]]; cache.set(css, got); }
      return got;
    };
    const targets = Object.entries(GOING).map(([name, css]) => ({ name, rgb: paint(css) }));
    /* Any strength of the colour is the colour: a tint of red is red. Compared unpremultiplied, so a 10% wash matches within rounding. */
    const which = (css: string) => {
      const [r, g, b, a] = paint(css);
      if (a === 0) return null;
      const tol = a < 60 ? 14 : 2;
      return targets.find((t) => Math.abs(t.rgb[0] - r) <= tol && Math.abs(t.rgb[1] - g) <= tol && Math.abs(t.rgb[2] - b) <= tol)?.name ?? null;
    };
    const colours = (value: string) => value.match(/(?:rgba?|lab|oklab|oklch|lch|color)\([^)]*\)/g) ?? [];
    const found = new Set<string>();
    const all = Array.from(document.querySelectorAll(`${within}, ${within} *`)).filter((el) => el.closest('nextjs-portal, script, style') === null);
    for (const el of all) {
      const cs = getComputedStyle(el);
      const text = Array.from(el.childNodes).some((n) => n.nodeType === Node.TEXT_NODE && (n.textContent ?? '').trim() !== '') || el instanceof HTMLInputElement || el instanceof HTMLSelectElement || el instanceof HTMLTextAreaElement;
      const reads: Array<[string, string]> = [['fill', cs.backgroundColor]];
      if (text) reads.push(['text', cs.color]);
      for (const side of ['Top', 'Right', 'Bottom', 'Left'] as const) if (cs[`border${side}Width`] !== '0px' && cs[`border${side}Style`] !== 'none') reads.push(['border', cs[`border${side}Color`]]);
      if (cs.outlineStyle !== 'none' && cs.outlineWidth !== '0px') reads.push(['outline', cs.outlineColor]);
      for (const c of colours(cs.boxShadow)) reads.push(['ring', c]);
      if (el instanceof SVGElement) { for (const c of colours(cs.fill)) reads.push(['svg fill', c]); for (const c of colours(cs.stroke)) reads.push(['svg stroke', c]); }
      if (el instanceof HTMLInputElement && (el.type === 'checkbox' || el.type === 'radio')) reads.push(['accent', cs.accentColor === 'auto' ? 'rgba(0,0,0,0)' : cs.accentColor]);
      for (const [kind, css] of reads) {
        const name = which(css);
        if (name === null) continue;
        const label = ((el.textContent ?? '').trim() || el.getAttribute('aria-label') || el.getAttribute('placeholder') || '').slice(0, 24);
        found.add(`${name}: ${kind} of ${el.tagName.toLowerCase()} "${label}"`);
      }
    }
    return { found: [...found].sort(), read: all.length };
  }, { GOING, within });

async function expectNone(page: Page, name: string, within = 'body') {
  const r = await going(page, within);
  expect(r.read, `${name}: the precondition, the page was read`).toBeGreaterThan(5);
  /* Soft, so one run names every screen and not only the first. */
  expect.soft(r.found, `${name}: oxblood, the grey or the destructive red`).toEqual([]);
}

test.describe('§T.6: oxblood, the survey’s grey and the destructive red are gone from the screens it reaches', () => {
  test.beforeEach(async ({ page }) => login(page));

  for (const width of [390, GRID_FORK]) {
    /* Fails against the built screens: oxblood on every submit and the stats bars, the grey on every aside, and red on Delete. */
    test(`at ${width}: at rest, on the five screens and the four pages`, async ({ page }) => {
      const f = await seedFixture(page, 'Colour103');
      await eachScreen(page, f, width, (name) => expectNone(page, name));
    });
  }

  /* Fails against the oxblood ring and border a focused field and button take from the shared controls. */
  test('with a field and then a button focused, on each form', async ({ page }) => {
    const f = await seedFixture(page, 'Colour103');
    for (const path of ['/lookup', '/records/new', '/want-list/new', `/want-list/${f.want}/edit`, `/records/${f.record}/edit`]) {
      await openScreen(page, path, GRID_FORK);
      const field = page.locator('main input:not([type=hidden]):not([type=checkbox]):not([type=radio]):visible').first();
      await field.focus();
      await expect(field).toBeFocused();
      await expectNone(page, `${path.replace(f.record, '<record>').replace(f.want, '<item>')}, a field focused`);
      const button = page.locator('main button[type=submit]:visible').first();
      await button.focus();
      await expect(button).toBeFocused();
      await expectNone(page, `${path.replace(f.record, '<record>').replace(f.want, '<item>')}, its submit focused`);
    }
  });

  /* Fails against the confirmation dialogs, which are drawn outside the page and take the app's colours: a red Delete. */
  test('in the want list’s delete confirmation', async ({ page }) => {
    await seedFixture(page, 'Colour103');
    await openScreen(page, '/want-list', GRID_FORK);
    await page.getByRole('button', { name: /^(delete|remove)/i }).first().click();
    await page.locator('[data-slot="dialog-content"]').waitFor();
    await expectNone(page, 'the want list’s confirmation');
  });

  /* Fails against a filled submit: §T.6 makes "a filled button §9.3's unfilled ink box, square". */
  test('a form’s submit is an unfilled box with a 1px ink border and ink type', async ({ page }) => {
    const f = await seedFixture(page, 'Colour103');
    const ink = await page.evaluate((c) => { const k = document.createElement('canvas'); k.width = 1; k.height = 1; const x = k.getContext('2d') as CanvasRenderingContext2D; x.fillStyle = c; x.fillRect(0, 0, 1, 1); return Array.from(x.getImageData(0, 0, 1, 1).data.slice(0, 3)); }, INK);
    for (const path of ['/lookup', '/records/new', '/want-list/new', `/records/${f.record}/edit`]) {
      await openScreen(page, path, GRID_FORK);
      const m = await page.locator('main button[type=submit]:visible').first().evaluate((b) => {
        const cs = getComputedStyle(b);
        const k = document.createElement('canvas'); k.width = 1; k.height = 1; const x = k.getContext('2d') as CanvasRenderingContext2D;
        const rgba = (c: string) => { x.clearRect(0, 0, 1, 1); x.fillStyle = c; x.fillRect(0, 0, 1, 1); return Array.from(x.getImageData(0, 0, 1, 1).data); };
        return { fill: rgba(cs.backgroundColor)[3], border: cs.borderTopWidth, borderColour: rgba(cs.borderTopColor).slice(0, 3), text: rgba(cs.color).slice(0, 3), radius: cs.borderTopLeftRadius };
      });
      expect(m, path.replace(f.record, '<record>')).toEqual({ fill: 0, border: '1px', borderColour: ink, text: ink, radius: '0px' });
    }
  });
});

/**
 * Each focusable control on the page, focused in turn, and what it then
 * paints in a colour that goes. A key is pressed first, so a scripted focus
 * is one the engine draws a ring for, as it does for a reader on a keyboard.
 */
const goingFocused = (page: Page, names: string[]) =>
  page.evaluate(({ GOING, names }) => {
    const canvas = document.createElement('canvas'); canvas.width = 1; canvas.height = 1;
    const ctx = canvas.getContext('2d', { willReadFrequently: true }) as CanvasRenderingContext2D;
    const paint = (css: string) => { ctx.clearRect(0, 0, 1, 1); ctx.fillStyle = '#000'; ctx.fillStyle = css; ctx.fillRect(0, 0, 1, 1); const d = ctx.getImageData(0, 0, 1, 1).data; return [d[0], d[1], d[2], d[3]]; };
    const targets = Object.entries(GOING).filter(([name]) => names.includes(name)).map(([name, css]) => ({ name, rgb: paint(css) }));
    const which = (css: string) => {
      const [r, g, b, a] = paint(css);
      if (a === 0) return null;
      /* Unpremultiplied, the canvas gives a half-strength colour back within a step or two of the full one. */
      const tol = a < 60 ? 14 : 3;
      return targets.find((t) => Math.abs(t.rgb[0] - r) <= tol && Math.abs(t.rgb[1] - g) <= tol && Math.abs(t.rgb[2] - b) <= tol)?.name ?? null;
    };
    const colours = (value: string) => value.match(/(?:rgba?|lab|oklab|oklch|lch|color)\([^)]*\)/g) ?? [];
    const focusable = Array.from(document.querySelectorAll<HTMLElement>('a[href], button, input:not([type=hidden]), select, textarea, [tabindex]:not([tabindex="-1"])')).filter((el) => el.closest('nextjs-portal') === null && !(el as HTMLButtonElement).disabled && el.getClientRects().length > 0);
    const found = new Set<string>();
    let focused = 0;
    let ringed = 0;
    for (const el of focusable) {
      el.focus({ preventScroll: true });
      if (document.activeElement !== el) continue;
      focused += 1;
      const cs = getComputedStyle(el);
      const reads: Array<[string, string]> = [['fill', cs.backgroundColor], ['text', cs.color]];
      for (const side of ['Top', 'Right', 'Bottom', 'Left'] as const) if (cs[`border${side}Width`] !== '0px' && cs[`border${side}Style`] !== 'none') reads.push(['border', cs[`border${side}Color`]]);
      if (cs.outlineStyle !== 'none' && cs.outlineWidth !== '0px') { ringed += 1; reads.push(['outline', cs.outlineColor]); }
      for (const c of colours(cs.boxShadow)) { ringed += 1; reads.push(['ring', c]); }
      for (const [kind, css] of reads) {
        const name = which(css);
        if (name === null) continue;
        const where = el.closest('[data-app-nav]') !== null ? 'the header’s ' : '';
        found.add(`${name}: ${kind} of ${where}${el.tagName.toLowerCase()} "${((el.textContent ?? '').trim() || el.getAttribute('aria-label') || el.getAttribute('placeholder') || '').slice(0, 20)}"`);
      }
    }
    (document.activeElement as HTMLElement | null)?.blur();
    return { found: [...found].sort(), focused, ringed };
  }, { GOING, names });

async function expectNoneFocused(page: Page, name: string, names = Object.keys(GOING)) {
  await page.keyboard.press('Shift');
  const r = await goingFocused(page, names);
  expect(r.focused, `${name}: the precondition, controls took focus`).toBeGreaterThan(1);
  expect(r.ringed, `${name}: the precondition, a focused control draws a ring that was read`).toBeGreaterThan(0);
  expect.soft(r.found, `${name}, each control focused: ${names.join(', ')}`).toEqual([]);
}

/**
 * Step 113. §T.6 rules oxblood gone app-wide, and the build took it only
 * from screens whose root carried `data-t6`: the header is outside every
 * such root, and the table and grid never carried it, so every focus ring
 * there was the root's oxblood (found on the GENRE line, 10 Oct). The ring
 * is ink at the root now, and this reads the focused state of every
 * control, where the tests above read one field and one submit on five
 * forms.
 */
test.describe('§T.6: no control draws oxblood when focused, on any screen', () => {
  test.beforeEach(async ({ page }) => login(page));

  for (const width of [390, GRID_FORK]) {
    /* Fails against the root's oxblood ring: the header's controls on every one of these, 6 at 1440 and 2 at 390. */
    test(`at ${width}: every control on the five screens and the four pages, the header’s included, with the grey and the red gone too`, async ({ page }) => {
      const f = await seedFixture(page, 'Focus113');
      await eachScreen(page, f, width, (name) => expectNoneFocused(page, name));
    });

    /* Fails against the same ring on Sort, each filter line, each option, the view names and each row's link. */
    test(`at ${width}: every control on the table and the grid, with a filter open and with a year filter in force`, async ({ page }) => {
      for (const view of ['table', 'grid']) {
        await openScreen(page, `/?view=${view}`, width);
        await page.locator('[data-collection-filters][data-hydrated="true"]').waitFor({ timeout: 30_000 });
        await expectNoneFocused(page, `the ${view}`);
        await page.locator('[data-filter="genreId"] [data-filter-trigger]').click();
        await page.locator('[data-filter-panel]').waitFor();
        await expectNoneFocused(page, `the ${view}, Genre open`);
        /* The undated control and CLEAR are drawn only in this state. */
        await openScreen(page, `/?view=${view}&yearFrom=1900`, width);
        await page.locator('[data-filter-undated]').waitFor();
        await expectNoneFocused(page, `the ${view}, a year filter`);
      }
    });

    /*
      Oxblood alone: §T.6 "does not reach the shelf, the record page or the
      modal" as compositions, and their grey is not ruled here. Fails against
      the root's ring on each of them.
    */
    test(`at ${width}: no oxblood on a focused control on the shelf, the record page, its modal, its confirmation, or the page for an address that is not one`, async ({ page }) => {
      const f = await seedFixture(page, 'Focus113');
      const oxblood = ['oxblood'];
      await openScreen(page, '/', width);
      await expectNoneFocused(page, 'the shelf', oxblood);
      if (width === GRID_FORK) {
        await page.getByTestId('wall-zoom-out').click();
        await page.locator('[data-wall="overview"]').waitFor();
        await expectNoneFocused(page, 'the shelf, far', oxblood);
      } else {
        await page.locator('[data-app-nav] [data-menu-control]').click();
        await page.locator('[data-menu-panel]').waitFor();
        await expectNoneFocused(page, 'the header’s menu, open', oxblood);
      }
      await openScreen(page, `/records/${f.record}`, width);
      await expectNoneFocused(page, 'the record page', oxblood);
      await page.locator('[data-cover-trigger]').click();
      await page.locator('[data-sleeve-modal]:not([data-travelling])').waitFor();
      await expectNoneFocused(page, 'the record modal', oxblood);
      await page.keyboard.press('Escape');
      await page.locator('[data-sleeve-modal]').waitFor({ state: 'detached' });
      await page.getByRole('button', { name: 'Delete record' }).click();
      await page.getByRole('button', { name: 'Cancel' }).waitFor();
      await expectNoneFocused(page, 'the record’s confirmation', oxblood);
      await page.goto('/no-such-page');
      await page.waitForLoadState('load');
      await expectNoneFocused(page, 'not found', oxblood);
    });
  }
});

/* Fails against `text-primary` on the price history's line while the root's primary was oxblood. */
test('§T.6: the record page’s price history draws its line in ink', async ({ page }) => {
  await login(page);
  await openScreen(page, '/?view=table', GRID_FORK);
  const records = await page.locator('main [data-collection-table] tbody tr a').evaluateAll((as) => as.map((a) => a.getAttribute('href') ?? '').filter((h) => /^\/records\/[0-9a-f-]+$/.test(h)));
  let lines = 0;
  for (const href of records) {
    await openScreen(page, href, GRID_FORK);
    const strokes = await page.locator('polyline').evaluateAll((all) => all.map((l) => getComputedStyle(l).stroke));
    if (strokes.length === 0) continue;
    lines += strokes.length;
    const r = await going(page);
    expect(r.found.filter((line) => line.startsWith('oxblood')), `${href.slice(0, 12)}…: oxblood at rest`).toEqual([]);
    if (lines >= 3) break;
  }
  expect(lines, 'the precondition: a seeded record draws a price line').toBeGreaterThan(0);
});

/**
 * The tokens themselves, used or not. Three root tokens held the oxblood
 * value after it had left every screen, two of them named for a sidebar
 * (`--sidebar-primary`, `--sidebar-ring`) on the eve of a sidebar being
 * built: a component reaching for the token named after it would have
 * brought the colour back. So no custom property the stylesheets declare
 * may resolve, at the root, to oxblood. The grey and the red are not read
 * here: both are still the root's, scoped out by `data-t6` (NOTES, 10 Oct).
 */
test('§T.6: no token resolves to oxblood at the root, whether anything reads it or not', async ({ page }) => {
  await login(page);
  await openScreen(page, '/?view=table', GRID_FORK);
  const r = await page.evaluate((oxblood) => {
    const canvas = document.createElement('canvas'); canvas.width = 1; canvas.height = 1;
    const ctx = canvas.getContext('2d', { willReadFrequently: true }) as CanvasRenderingContext2D;
    const paint = (css: string) => { ctx.clearRect(0, 0, 1, 1); ctx.fillStyle = '#000'; ctx.fillStyle = css; ctx.fillRect(0, 0, 1, 1); const d = ctx.getImageData(0, 0, 1, 1).data; return [d[0], d[1], d[2], d[3]]; };
    const target = paint(oxblood);
    const names = new Set<string>();
    const walk = (rules: CSSRuleList) => {
      for (const rule of Array.from(rules)) {
        if (rule instanceof CSSStyleRule) for (const name of Array.from(rule.style)) if (name.startsWith('--')) names.add(name);
        const inner = (rule as CSSGroupingRule).cssRules as CSSRuleList | undefined;
        if (inner !== undefined && inner.length > 0) walk(inner);
      }
    };
    for (const sheet of Array.from(document.styleSheets)) { try { walk(sheet.cssRules); } catch { /* a sheet from another origin has no rules to read */ } }
    const root = getComputedStyle(document.documentElement);
    const probe = document.createElement('i');
    document.body.append(probe);
    const found: string[] = [];
    let colours = 0;
    for (const name of names) {
      if (root.getPropertyValue(name).trim() === '') continue;
      /* Resolved through an element, so a token defined by another token is read as the colour it ends at. */
      probe.style.color = '';
      probe.style.color = `var(${name})`;
      if (probe.style.color === '') continue;
      const [red, green, blue, alpha] = paint(getComputedStyle(probe).color);
      if (alpha === 0) continue;
      colours += 1;
      if (Math.abs(red - target[0]) <= 3 && Math.abs(green - target[1]) <= 3 && Math.abs(blue - target[2]) <= 3) found.push(name);
    }
    probe.remove();
    return { names: names.size, colours, found: found.sort() };
  }, GOING.oxblood);
  expect(r.names, 'the precondition: the stylesheets’ custom properties were found').toBeGreaterThan(40);
  expect(r.colours, 'the precondition: colours among them were resolved').toBeGreaterThan(20);
  expect(r.found, 'tokens that are oxblood').toEqual([]);
});

test.describe('§9.3, settled: "Delete is on every record, so it cannot be red here"', () => {
  /*
    Fails against the record page's confirmation as built: its Delete was the shared destructive variant, red type on
    a red tint (5.03 : 1, measured 9 Oct). §9.3: "Destructive actions are identical to constructive ones... The
    confirmation carries the weight instead." §T.6 maps a destructive action to ink independently. Only the dialog is
    read: the record page beneath it is a closed screen and is not this test's.
  */
  test('the record page’s delete confirmation has no red: its Delete is the ink box its Cancel is', async ({ page }) => {
    await login(page);
    const f = await seedFixture(page, 'Colour103');
    await openScreen(page, `/records/${f.record}`, GRID_FORK);
    await page.locator('[data-control="delete"]').click();
    await page.getByTestId('confirm-delete').waitFor();
    await expectNone(page, 'the record page’s confirmation', '[data-slot="dialog-content"]');
    const m = await page.getByTestId('confirm-delete').evaluate((b) => { const cs = getComputedStyle(b); return { fill: cs.backgroundColor, border: cs.borderTopWidth, radius: cs.borderTopLeftRadius }; });
    expect(m).toEqual({ fill: 'rgba(0, 0, 0, 0)', border: '1px', radius: '0px' });
  });
});

test.describe('§T.6: "It reaches login too, for colour as for radius"', () => {
  /*
    Fails against sign-in as 103b left it: a filled oxblood button, a grey line,
    an oxblood ring on the focused field and a red refusal. This replaces a
    test that HELD that oxblood, written for the coordinator's ruling of 9 Oct
    that sign-in took the radius and not the colour; §T.6 was then extended to
    it and the ruling superseded.
  */
  test('sign-in has none of them, at rest, with its field focused, and with a wrong password refused', async ({ page }) => {
    await openScreen(page, '/login', GRID_FORK);
    await page.locator('form[data-hydrated="true"]').waitFor({ timeout: 15_000 });
    await expectNone(page, 'sign-in at rest');
    await page.locator('#password').focus();
    await expectNone(page, 'sign-in, the field focused');
    await page.locator('#password').pressSequentially('not-the-password');
    /* The form's submit, by its type: this is a refusal and not a sign-in, and the repo's check keeps the button's name to the sign-in helper. */
    await page.locator('form button[type=submit]').click();
    await page.locator('#password-error').waitFor({ timeout: 15_000 });
    await expectNone(page, 'sign-in, refused');
    const m = await page.locator('form button[type=submit]').evaluate((b) => { const cs = getComputedStyle(b); return { fill: cs.backgroundColor, border: cs.borderTopWidth, radius: cs.borderTopLeftRadius }; });
    expect(m, 'its button is §9.3’s unfilled box').toEqual({ fill: 'rgba(0, 0, 0, 0)', border: '1px', radius: '0px' });
  });
});
