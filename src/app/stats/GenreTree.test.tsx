import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { GenreTree } from './GenreTree';
import { HIT_ROW_LESS_44 } from '@/app/hit-area';

/**
 * **The name is its own clipper** (§T.6, Design, 14 Oct): "Stats' names,
 * labels and stores take the outside ring: each link is its own clipper
 * and the wrapper's classes move off it, so both bands paint, the
 * ellipsis falls inside the ring, and no exception reaches them." The
 * ring is drawn 2px outside the link's box; a wrapper that clips sideways
 * clips the ring's left band with the overflow (step 144's survey: the
 * band painted 0 of 32). Fails against `GenreTree.tsx`'s wrapper span
 * carrying `overflow-x-clip` and its link carrying `data-ring-held`.
 * The painting itself is `e2e/stats-names-144.spec.ts`.
 */
describe('a genre name on stats is its own clipper, with no hold on its ring', () => {
  const node = { id: 'g1', name: 'Punk', direct: 2, subtree: 2, hasBranch: false, children: [], depth: 0 };
  const html = renderToStaticMarkup(<GenreTree nodes={[node]} href={(id) => `/?genreId=${id}`} />);
  const at = html.indexOf('href="/?genreId=g1"');
  const link = html.slice(html.lastIndexOf('<a ', at), html.indexOf('>', at) + 1);
  const wrapper = html.slice(html.lastIndexOf('<span ', at), html.indexOf('>', html.lastIndexOf('<span ', at)) + 1);
  const classOf = (tag: string) => (/class="([^"]*)"/.exec(tag)?.[1] ?? '').replace(/&#x27;/g, "'"); /* react-dom escapes the target's quotes */

  it('clips sideways on the link itself, an inline block no wider than its row', () => {
    expect(link, 'the link was found').not.toBe('');
    for (const cls of ['inline-block', 'max-w-full', 'overflow-x-clip', 'text-ellipsis', 'whitespace-nowrap']) expect(classOf(link).split(' '), cls).toContain(cls);
    /* The baseline: an inline block with `overflow: hidden` sits on its bottom edge and lifts the name off the count's baseline; `clip` keeps the text's. No vertical-align utility is to be added. */
    expect(classOf(link)).not.toMatch(/\balign-|overflow-hidden|overflow-x-hidden/);
  });

  it('keeps the row-less-44 target on the link', () => {
    expect(classOf(link)).toContain(HIT_ROW_LESS_44);
  });

  it('leaves the wrapper with no clip and the link with no hold', () => {
    expect(wrapper, 'the wrapper was found').toMatch(/^<span /);
    for (const cls of ['overflow-x-clip', 'text-ellipsis', 'whitespace-nowrap']) expect(classOf(wrapper).split(' '), `wrapper without ${cls}`).not.toContain(cls);
    expect(classOf(wrapper).split(' ')).toContain('min-w-0');
    expect(link).not.toContain('data-ring-held');
  });
});
