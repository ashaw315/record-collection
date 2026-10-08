import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * **Sign-in is one function, and no spec types it (8 Oct).**
 *
 * 94 files each carried their own copy: go to `/login`, wait for the form
 * to hydrate, type, press, then `expect(page).toHaveURL('/')` at the 5
 * second default. Under load three tests failed on that wait in one day,
 * each named for a feature it never reached. The traces showed the wait
 * covers a chain (a `bcryptjs` comparison, then `/` rendered, twice), so
 * no one part's budget is the right one and a copy cannot be corrected in
 * one place.
 *
 * A convention held by 94 copies is held by nothing, so this is the check:
 * the Sign in button is pressed in `e2e/sign-in.ts` and in the files named
 * below, each with its reason, and nowhere else.
 */
const HELPER = 'e2e/sign-in.ts';

const EXEMPT: Record<string, string> = {
  [HELPER]: 'the helper',
  'e2e/auth.spec.ts': 'the sign-in form is its subject: a wrong password, a session that survives a reload, typing before hydration',
  'e2e/sheet/login.ts': 'the sheets sign in to the real collection, by a minted session or its own password, and then probe that the server cannot write',
};

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return walk(path);
    return entry.name.endsWith('.ts') ? [path] : [];
  });
}

const files = walk('e2e');
const PRESS = /name: 'Sign in'/;

describe('sign-in is one function', () => {
  it('the helper presses Sign in and waits for the address with its own named budget', () => {
    const source = readFileSync(HELPER, 'utf8');
    expect(source).toMatch(PRESS);
    expect(source).toMatch(/export const SIGN_IN_ARRIVAL = \d/);
    expect(source).toMatch(/toHaveURL\('\/', \{ timeout: SIGN_IN_ARRIVAL \}\)/);
  });

  it('no other file presses Sign in', () => {
    const typed = files.filter((path) => !(path in EXEMPT) && PRESS.test(readFileSync(path, 'utf8')));
    expect(typed, `these sign in by their own copy and not by ${HELPER}:\n${typed.join('\n')}`).toEqual([]);
  });

  it('no file declares a sign-in of its own', () => {
    const own = files.filter(
      (path) => !(path in EXEMPT) && /^(?:async )?function (?:login|signIn)\b/m.test(readFileSync(path, 'utf8')),
    );
    expect(own, `these declare their own login():\n${own.join('\n')}`).toEqual([]);
  });

  it('every exempt file still exists and still presses Sign in, so the list cannot outlive its reasons', () => {
    for (const path of Object.keys(EXEMPT)) {
      expect(PRESS.test(readFileSync(path, 'utf8')), `${path} no longer presses Sign in and should leave the list`).toBe(true);
    }
  });

  it('no arrival at / after a sign-in is waited for at the default five seconds', () => {
    /*
      A bare `toHaveURL('/')` in a file that presses Sign in is the wait
      that failed. Elsewhere it follows a navigation the spec made itself
      and is not this check's business.
    */
    const bare = Object.keys(EXEMPT)
      .filter((path) => path !== HELPER)
      .filter((path) => /toHaveURL\('\/'\)/.test(readFileSync(path, 'utf8')));
    expect(bare, `these wait for / at the default:\n${bare.join('\n')}`).toEqual([]);
  });
});
