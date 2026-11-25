import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { NAV_TYPE } from '@/components/nav-type';
import { MatchedTextVerb } from './MatchedTextVerb';

/**
 * **§24 and §67: the sheet from the record page (Q90; "Sheet from the record page mended", 24 Nov).** The record's own way
 * into §67's sheet, a verb in AppHeader's actions slot in the slot's type, the nav's own, worded "Matched text"
 * (provisional). Fails against a verb that is a link (it opens a sheet, it does not navigate), one in another type, or
 * one worded otherwise. Its place before Edit and what it opens are the e2e's (e2e/sheet-from-record-page.spec.ts).
 */
describe('MatchedTextVerb', () => {
  it('is a button worded Matched text in the nav’s own type', () => {
    const html = renderToStaticMarkup(<MatchedTextVerb recordId="r1" />);
    expect(html).toMatch(/^<button type="button" data-control="matched-text"/);
    expect(html).toContain('>Matched text</button>');
    for (const c of NAV_TYPE.split(' ')) expect(html).toContain(c);
  });
});
