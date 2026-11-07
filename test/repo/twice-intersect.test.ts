import { describe, expect, it } from 'vitest';
import { bodyAt, intersectReport, quantitiesOf } from '../../scripts/twice-intersect.mjs';

/**
 * **The twice sweep's hits against the shared quantities, mechanically (the
 * coordinator, 7 Nov: "the list is the part that has to be right, and the
 * intersection follows mechanically").** The list is confirmed at seven:
 * 1 the wall's layout under §W.12; 2 the collection's count; 3 the untagged
 * count; 4 facets and stats; 5 `listRecords` under any filter, its order and
 * total; 6 the Manage lists; 7 the ownership check.
 *
 * A hit site is in the intersection when the page its read ran on renders a
 * shared quantity from rows the test does not own, and the read measures
 * something that quantity can move (geometry, a count, text, a list), not a
 * font load, a focus or a style. Each case below is a real site's shape from
 * the 7 Nov log. Fails against: a scoped collection read counted as shared;
 * a scoped WALL read counted as owned (§W.12 sizes the wall by the whole
 * collection whatever the filter); facets treated as scoped (§5.2: static);
 * a font wait or a style read counted as a measurement; a record page or a
 * probe counted at all.
 */
describe('quantitiesOf', () => {
  it('a wall read of the region’s scroll is item 1, scoped or not (§W.12)', () => {
    const body = "() => { const el = document.querySelector('[data-region=\"wall\"]'); return { left: el.scrollLeft }; }";
    expect(quantitiesOf({ route: '/?artistId=ID', title: 'Evaluate', body })).toEqual([1]);
    expect(quantitiesOf({ route: '/', title: 'Evaluate', body })).toEqual([1]);
  });
  it('a font wait or a style read on the wall reads nothing a quantity moves', () => {
    expect(quantitiesOf({ route: '/', title: 'Evaluate', body: '() => document.fonts.ready' })).toEqual([]);
    expect(quantitiesOf({ route: '/', title: 'Evaluate', body: '(el) => getComputedStyle(el).letterSpacing' })).toEqual([]);
    expect(quantitiesOf({ route: '/', title: 'Evaluate', body: '() => document.activeElement?.id' })).toEqual([]);
  });
  it('the collection’s rows unscoped are item 5; scoped to the test’s artist they are the test’s own', () => {
    const body = "(rows) => rows.map((r) => r.querySelector('td')?.textContent)";
    expect(quantitiesOf({ route: '/?view=table', title: 'Evaluate', body })).toEqual([5]);
    expect(quantitiesOf({ route: '/?view=table&artistId=ID', title: 'Evaluate', body })).toEqual([]);
  });
  it('a search term is a filter, not a scope: a q= read is item 5 (the coordinator’s check, 7 Nov)', () => {
    expect(quantitiesOf({ route: '/?view=table&q=miles', title: 'Query count', body: "page.locator('tbody tr').count()" })).toEqual([5]);
  });
  it('the filters’ options are item 4 whatever the scope, since facets are the whole collection’s (§5.2)', () => {
    const body = "() => Array.from(document.querySelectorAll('[data-filter]')).map((e) => e.getBoundingClientRect().top)";
    expect(quantitiesOf({ route: '/?view=table&artistId=ID', title: 'Evaluate', body })).toEqual([4]);
    expect(quantitiesOf({ route: '/?view=table', title: 'Evaluate', body })).toEqual([4, 5]);
  });
  it('the mood pick’s pool is item 3 wherever it is drawn', () => {
    expect(quantitiesOf({ route: '/?view=grid&artistId=ID', title: 'Evaluate', body: "() => document.querySelector('[data-mood-pick]')?.textContent" })).toEqual([3]);
  });
  it('stats unscoped are item 4; scoped by artist they are the test’s own', () => {
    const body = '() => document.querySelector("main").getBoundingClientRect()';
    expect(quantitiesOf({ route: '/stats', title: 'Evaluate', body })).toEqual([4]);
    expect(quantitiesOf({ route: '/stats?artistId=ID', title: 'Evaluate', body })).toEqual([]);
  });
  it('the Manage lists and the want list are item 6', () => {
    const body = '(el) => el.getBoundingClientRect()';
    expect(quantitiesOf({ route: '/manage?artists=all', title: 'Evaluate', body })).toEqual([6]);
    expect(quantitiesOf({ route: '/want-list', title: 'Evaluate', body })).toEqual([6]);
  });
  it('a lookup result card is item 7; the lookup page’s chrome is not', () => {
    expect(quantitiesOf({ route: '/lookup', title: 'Evaluate', body: '(all) => all.map((card) => card.getBoundingClientRect())' })).toEqual([7]);
    expect(quantitiesOf({ route: '/lookup', title: 'Evaluate', body: "(b) => b.closest('form').getBoundingClientRect()" })).toEqual([]);
  });
  it('a record’s own page, a probe and the login page are no shared quantity', () => {
    const body = '() => document.body.getBoundingClientRect()';
    for (const route of ['/records/ID', '/records/new', '/wall/probe/labelled', '/login', '/suggestions/probe']) {
      expect(quantitiesOf({ route, title: 'Evaluate', body }), route).toEqual([]);
    }
  });
  it('a count, a bounding box and a screenshot are measurements by their kind', () => {
    expect(quantitiesOf({ route: '/', title: 'Query count', body: "page.locator('[data-pulled]').count()" })).toEqual([1]);
    expect(quantitiesOf({ route: '/manage', title: 'Bounding box', body: 'save.boundingBox()' })).toEqual([6]);
  });
});

describe('bodyAt', () => {
  it('takes the evaluate call’s bracket-matched argument at the line, across lines', () => {
    const src = "const a = 1;\nconst m = await page.evaluate(() => {\n  return document.body.scrollWidth;\n});\n";
    expect(bodyAt(src, 2)).toContain('scrollWidth');
  });
  it('follows a bare identifier to its const in the same file, since READ and MEASURE live apart from their calls', () => {
    const src = "const MEASURE = () => {\n  return document.body.getBoundingClientRect();\n};\n\nconst m = await page.evaluate(MEASURE);\n";
    expect(bodyAt(src, 5)).toContain('getBoundingClientRect');
  });
  it('a selector passed in as an argument is read from the lines that call the reader (pick-moods-157:226, whose selector is the untagged line’s, at its callers)', () => {
    const src = [
      'const fits = (sel: string) =>',
      '  page.evaluate((s) => {',
      '    const el = document.querySelector<HTMLElement>(s);',
      '    return el?.getBoundingClientRect().height;',
      '  }, sel);',
      "expect(await fits('[data-pick-control] [data-untagged]')).toBe(18);",
    ].join('\n');
    expect(bodyAt(src, 2)).toContain('[data-untagged]');
    expect(quantitiesOf({ route: '/?artistId=ID', title: 'Evaluate', body: bodyAt(src, 2) })).toContain(3);
  });
  it('a locator passed in to a wrapping reader is read from its callers too (result-card-150:121, whose locator is a result card)', () => {
    const src = [
      "const box = (locator: ReturnType<Page['locator']>) => locator.evaluate((el) => { const r = el.getBoundingClientRect(); return r.top; });",
      "const top = await box(page.locator('[data-result-card]').first());",
    ].join('\n');
    expect(quantitiesOf({ route: '/lookup', title: 'Evaluate', body: bodyAt(src, 1) })).toEqual([7]);
  });
  it('a $$eval keeps its own name, since it is a list read whatever its callback does (record-navigation:81, ring-144:182: the wall’s seats)', () => {
    const src = "x\nreturn page.$$eval('a[data-seat]', (links) => links.map((a) => a.getAttribute('data-seat')));\n";
    expect(quantitiesOf({ route: '/?artistId=ID', title: 'Evaluate', body: bodyAt(src, 2) })).toEqual([1]);
  });
  it('takes the line itself for a read that is not an evaluate', () => {
    expect(bodyAt("x\nconst drawn = await page.locator('[data-cover]').count();\n", 2)).toContain('.count()');
  });
});

describe('intersectReport', () => {
  const site = (q: number[], s: string) => ({ site: s, title: 'Evaluate', routes: ['/'], quantities: q });
  it('prints the distribution by quantity and says the per-quantity figures do not sum to the site total', () => {
    const { lines, broken } = intersectReport([site([1], 'a:1'), site([4, 5], 'b:2'), site([], 'c:3')]);
    expect(broken).toBe(false);
    expect(lines.join('\n')).toMatch(/in the intersection: 2 of 3 sites/);
    expect(lines.join('\n')).toMatch(/a site reading several quantities counts under each, so these do not sum/);
    expect(lines.join('\n')).toMatch(/"1":1,"4":1,"5":1/);
  });
  it('calls a run with every site in one bucket, or none in any quantity, a BROKEN READER', () => {
    expect(intersectReport([site([], 'a:1'), site([], 'b:2')]).broken).toBe(true);
    expect(intersectReport([site([1], 'a:1'), site([1], 'b:2')]).broken).toBe(true);
  });
});
