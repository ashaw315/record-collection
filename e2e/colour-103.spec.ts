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
const going = (page: Page) =>
  page.evaluate((GOING) => {
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
    const all = Array.from(document.querySelectorAll('body, body *')).filter((el) => el.closest('nextjs-portal, script, style') === null);
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
  }, GOING);

async function expectNone(page: Page, name: string) {
  const r = await going(page);
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
