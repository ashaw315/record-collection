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
