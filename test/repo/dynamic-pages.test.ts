import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Every page that reads the database must render per request.
 *
 * Next prerenders a page at BUILD TIME unless something forces it dynamic.
 * `/manage` reads seven tables and uses no request-scoped API — auth lives in
 * middleware, which does not count — so it was built once and served from cache
 * forever. Proven against a production build: the API created a tag, the API
 * returned it, and a FULL PAGE LOAD of /manage never showed it.
 *
 * That is a shipping defect, not a test artefact. It would have surfaced at
 * step 14 as "the manage screen shows data from whenever we last deployed".
 *
 * `/` escapes it by accident: awaiting `searchParams` opts a page into dynamic
 * rendering. Relying on that is fragile — removing the filters would silently
 * make the collection screen stale — so it is declared explicitly too.
 *
 * This test reads the source rather than the build output, so it fails in
 * milliseconds during development instead of after a two-minute build.
 */

const APP_DIR = 'src/app';

/** Every `page.tsx` under src/app, at any depth. */
function findPages(dir: string): string[] {
  const found: string[] = [];

  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) found.push(...findPages(path));
    else if (entry === 'page.tsx') found.push(path);
  }

  return found;
}

/**
 * A page is "data-backed" if it imports from the query layer. A static page
 * with no database access — a help screen, say — has nothing to go stale and
 * should stay prerendered.
 */
function readsTheDatabase(source: string): boolean {
  return /from '@\/lib\/db\/queries\//.test(source);
}

describe('pages that read the database render per request', () => {
  const pages = findPages(APP_DIR);

  it('finds the pages, so an empty glob cannot pass vacuously', () => {
    // Without this, a broken path makes every assertion below iterate nothing
    // and report success — the hollow-check shape from NOTES.
    expect(pages.length).toBeGreaterThanOrEqual(2);
    expect(pages).toContain(join(APP_DIR, 'page.tsx'));
    expect(pages).toContain(join(APP_DIR, 'manage', 'page.tsx'));
  });

  for (const page of findPages(APP_DIR)) {
    const source = readFileSync(page, 'utf8');
    if (!readsTheDatabase(source)) continue;

    it(`${page} declares dynamic rendering`, () => {
      /**
       * `export const dynamic = 'force-dynamic'` rather than relying on an
       * incidental dynamic API. A page that becomes static because someone
       * removed a `searchParams` argument fails silently and invisibly — the
       * data simply stops updating.
       */
      expect(source).toMatch(/export const dynamic = 'force-dynamic'/);
    });
  }
});
