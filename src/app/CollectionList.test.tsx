import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import '../../test/component/next-navigation';
import { CollectionList } from './CollectionList';
import { parseCollectionParams } from './collection-params';

/**
 * The table's and the grid's empty state says what is true.
 *
 * It said "No records yet." whatever emptied it, so a reader with seventeen
 * records whose filter or search matched nothing was told they had none
 * (found measuring for step 103e, 9 Oct). With records in the collection it
 * says what the shelf's ruled empty state says (§W.29, step 104), so the
 * two screens agree. Design rules the final wording with step 103e; this
 * removes a false statement.
 */
const render = (search: string, collectionTotal: number, view: 'table' | 'grid' = 'table') =>
  renderToStaticMarkup(<CollectionList rows={[]} params={parseCollectionParams(new URLSearchParams(search))} view={view} collectionTotal={collectionTotal} />);

describe('the empty state’s sentence', () => {
  for (const view of ['table', 'grid'] as const) {
    /* Fails against the sentence as built: "No records yet." with seventeen in the collection. */
    it(`${view}: with records in the collection and none shown, it says nothing matches, and does not say there are none`, () => {
      for (const search of ['q=zzzz', 'genreId=00000000-0000-4000-8000-00000000000a', 'page=9', '']) {
        const html = render(search, 17, view);
        expect(html, search).toContain('Nothing in the collection matches.');
        expect(html, search).not.toContain('No records yet');
      }
    });

    it(`${view}: with an empty collection it says there are no records yet`, () => {
      const html = render('', 0, view);
      expect(html).toContain('No records yet.');
      expect(html).not.toContain('Nothing in the collection matches');
    });
  }
});

/**
 * Step 103e, §T.6: "The empty state's figure is drawn at the clearing
 * height and no larger, and stands where a screen's whole list or view is
 * empty... above one sentence saying what is empty and a §9.3 control that
 * changes it, such as CLEAR FILTERS." "'No records yet.' only where the
 * collection is empty, which has no figure."
 */
describe('the empty state’s figure, sentence and control', () => {
  const figure = <svg data-probe-figure="" />;
  const draw = (search: string, collectionTotal: number, view: 'table' | 'grid') =>
    renderToStaticMarkup(<CollectionList rows={[]} params={parseCollectionParams(new URLSearchParams(search))} view={view} collectionTotal={collectionTotal} emptyFigure={figure} />);

  for (const view of ['table', 'grid'] as const) {
    /* Fails against the empty state as built: a sentence in a box, no figure and no control. */
    it(`${view}: the figure, then the sentence, then CLEAR FILTERS, which keeps the view and the order and drops the search and every filter`, () => {
      const html = draw(`view=${view}&q=zzzz&genreId=00000000-0000-4000-8000-00000000000a&sort=title:desc&page=3`, 17, view);
      const order = ['data-probe-figure', 'Nothing in the collection matches.', 'data-collection-empty-clear'].map((m) => html.indexOf(m));
      expect(order.every((i) => i > -1), html).toBe(true);
      expect(order, 'figure, sentence, control').toEqual([...order].sort((a, b) => a - b));
      const href = /<a[^>]*data-collection-empty-clear[^>]*>/.exec(html)?.[0] ?? '';
      expect(href).toContain(`view=${view}`);
      expect(href).toContain('sort=title%3Adesc');
      expect(href).not.toMatch(/q=|genreId=|page=/);
      expect(html).toMatch(/data-collection-empty-clear[^>]*>Clear filters</);
    });

    /* "Which has no figure": fails against a figure drawn whenever one is handed over. */
    it(`${view}: an empty collection has the sentence alone, no figure and no control`, () => {
      const html = draw(`view=${view}`, 0, view);
      expect(html).toContain('No records yet.');
      expect(html).not.toContain('data-probe-figure');
      expect(html).not.toContain('data-collection-empty-clear');
    });
  }
});

