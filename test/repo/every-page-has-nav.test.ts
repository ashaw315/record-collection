import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Every screen must render the app header.
 *
 * `/manage` shipped without it and had no way back to the collection except the
 * browser's back button — which does nothing on a fresh tab or a shared link.
 * Found by using the app, not by any test.
 *
 * Asserted for ALL pages rather than just the one that was broken, because the
 * next screen added is exactly as likely to forget it. `/login` is exempt: it
 * is the unauthenticated screen and its nav would link to pages the visitor
 * cannot reach.
 */

const APP_DIR = 'src/app';
const EXEMPT = [join('src', 'app', 'login', 'page.tsx')];

function findPages(dir: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) found.push(...findPages(path));
    else if (entry === 'page.tsx') found.push(path);
  }
  return found;
}

describe('every screen renders the app header', () => {
  const pages = findPages(APP_DIR).filter((page) => !EXEMPT.includes(page));

  it('finds the pages, so an empty glob cannot pass vacuously', () => {
    expect(pages.length).toBeGreaterThanOrEqual(4);
    expect(pages).toContain(join(APP_DIR, 'manage', 'page.tsx'));
  });

  for (const page of findPages(APP_DIR).filter((p) => !EXEMPT.includes(p))) {
    it(`${page} renders <AppHeader />`, () => {
      expect(readFileSync(page, 'utf8')).toContain('<AppHeader />');
    });
  }
});
