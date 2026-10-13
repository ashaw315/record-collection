import { expect, type Page } from '@playwright/test';

const PASSWORD = process.env.E2E_PASSWORD ?? 'test-password-for-e2e';

/**
 * How long a sign-in may take to arrive at `/`.
 *
 * The wait covers a chain and not one thing: a `bcryptjs` comparison on the
 * server, then `/`, which awaits the shelf, the records and the facets, and
 * which the login page asks for twice (`router.replace` then
 * `router.refresh`). Read from the traces of two failures on 8 Oct, the
 * comparison took 4.74s in one and the two renders 2.6s each in the other,
 * against the 5 second default every copy of this function then used. The
 * budget is for the chain on a shared machine, the same figure the wall's
 * measured wait has, and a sign-in that is working returns long before it.
 */
export const SIGN_IN_ARRIVAL = 30_000;

/**
 * **A reader that can find two copies names its view** (step 142; the
 * convention is NOTES', 12 Oct).
 *
 * A bare `/` carries the shelf and the grid in one document and a media
 * query shows one (step 134), so a selector such as `ul[aria-label="View"]`
 * matches once in each. A Playwright locator refuses that loudly. A
 * `document.querySelector` inside an `evaluate` does not: it takes the
 * first copy in silence, and a test then measures the view that is not
 * drawn. This makes that case loud too: in every page a spec opens,
 * `querySelector` throws when the selector's matches lie in BOTH views.
 *
 * It is here because this is the one way in for every spec. It cannot be a
 * list in a repo test: only the page knows whether two views are in it, and
 * a reader on `?view=table` is right to name none.
 *
 * What it does not hold, said so the name is not read as more than it is:
 * a reader that finds ONE element, hidden, and measures it (nothing can
 * tell that from a test of what is not drawn); `querySelectorAll`, which
 * returns every copy and so hides none; and anything that walks the
 * document another way.
 */
function nameYourView(): void {
  const VIEWS = ['[data-shelf-offered]', '[data-shelf-fallback]'] as const;
  for (const owner of [Document.prototype, Element.prototype, DocumentFragment.prototype]) {
    const first = owner.querySelector;
    const all = owner.querySelectorAll;
    owner.querySelector = function querySelector(this: ParentNode, selector: string): Element | null {
      const found = first.call(this, selector) as Element | null;
      if (found === null) return found;
      const matches = Array.from(all.call(this, selector) as NodeListOf<Element>);
      if (matches.length < 2) return found;
      const inEach = VIEWS.map((view) => matches.some((match) => match.closest(view) !== null));
      if (inEach.every(Boolean)) throw new Error(`name your view: querySelector(${JSON.stringify(selector)}) matches in the shelf's view and in the grid's, and would have taken the first in silence. Put [data-shelf-offered] or [data-shelf-fallback] in the selector`);
      return found;
    } as typeof owner.querySelector;
  }
}

/**
 * Signs in through the form. The one way in for every spec and capture
 * (`test/repo/sign-in.test.ts`); the sheets have their own, for the real
 * collection.
 */
export async function login(page: Page): Promise<void> {
  await page.addInitScript(nameYourView);
  await page.goto('/login');
  /*
    The form is CONTROLLED, so a value typed before React attaches never
    reaches state and the submit sees an empty password. The input is in the
    server's markup; this attribute is set by an effect, so only it says
    React is listening. See the note on the login page.
  */
  await page.locator('form[data-hydrated="true"]').waitFor({ timeout: SIGN_IN_ARRIVAL });
  await page.getByLabel('Password').pressSequentially(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page, 'the sign-in arrives at /').toHaveURL('/', { timeout: SIGN_IN_ARRIVAL });
}
