import { readdirSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ErrorBody } from './ErrorBody';

/**
 * Step 142, Design, 12 Oct: "A page that fails draws the app's header and
 * nav, the 40 heading Something went wrong., one sentence in the label
 * colour saying the page could not load, and two §9.3 controls: TRY AGAIN,
 * and the way back to the Collection. ... It applies to every route, with
 * no ornament and no figure. ... The heading names no route."
 *
 * What is drawn and how tall is the browser's to say
 * (`e2e/error-screen-142.spec.ts`). Here: what the body is made of, and
 * that one boundary reaches every route.
 */
describe('the error screen’s body', () => {
  const html = renderToStaticMarkup(<ErrorBody retry={() => {}} />);

  it('is the heading, one sentence, TRY AGAIN and the way back to the Collection, and nothing else', () => {
    expect(html).toMatch(/<h1[^>]*>Something went wrong\.<\/h1>/);
    expect(html.match(/<p\b/g)?.length, 'one sentence').toBe(1);
    expect(html).toMatch(/<button[^>]*type="button"[^>]*>Try again<\/button>/);
    expect(html).toMatch(/<a[^>]*href="\/"[^>]*>Collection<\/a>/);
    expect(html.match(/<(?:button|a)\b/g)?.length, 'two controls').toBe(2);
    expect(html, 'no figure and no ornament').not.toMatch(/<svg|<img|data-tint|data-head-figure/);
  });

  it('names no route in its heading or its sentence', () => {
    expect(html).not.toMatch(/\/[a-z-]+\/|records|want-list|manage|stats|lookup/);
  });
});

describe('one boundary reaches every route', () => {
  const app = join(process.cwd(), 'src', 'app');
  const find = (dir: string, name: string): string[] => readdirSync(dir).flatMap((entry) => { const path = join(dir, entry); return statSync(path).isDirectory() ? find(path, name) : entry === name ? [path] : []; });

  /* Fails against an app with no error file at all, which is what it had: a page that threw drew Next's own, with no header and no way back. */
  it('there is one error.tsx, at the app’s root, and a global-error.tsx beside it', () => {
    expect(find(app, 'error.tsx')).toEqual([join(app, 'error.tsx')]);
    expect(existsSync(join(app, 'global-error.tsx'))).toBe(true);
  });
});
