import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import '../../test/component/next-navigation';
import { WallRail } from './WallRail';
import { parseCollectionParams } from './collection-params';

/**
 * §W.32: **the accent does not survive on the shelf, and survives unchanged
 * everywhere else.**
 *
 * §11 rests on one premise — the wall at rest is line, ink and paper, and
 * colour arrives with the pull — so an oxblood Add record in the rail would
 * be a second colour on a surface that has exactly one, arriving before the
 * gesture that introduces it. The pull would then be colour joining colour
 * rather than colour arriving, which is the whole of what the rest state
 * buys. The table and the grid keep the accent: they have no rest state to
 * protect and no pull to spend it on.
 */
const GENRE = '00000000-0000-4000-8000-00000000000a';
const rail = (search = '') =>
  renderToStaticMarkup(<WallRail params={parseCollectionParams(new URLSearchParams(search))} genres={[{ id: GENRE, name: 'Punk', count: 12 }]} />);

describe('§W.32: no oxblood on the shelf view', () => {
  it('keeps the rail’s Add record ink on §W.13’s LABEL, never the accent', () => {
    const html = rail();
    const add = /<a [^>]*href="\/records\/new"[^>]*>/.exec(html)?.[0] ?? '';
    expect(add, 'the action is drawn').not.toBe('');
    expect(add, 'ink, not oxblood').not.toMatch(/bg-primary|primary-foreground/);
  });

  it('uses the accent nowhere in the rail at all', () => {
    expect(rail(`genreId=${GENRE}`), 'no accent on a set filter either').not.toMatch(/bg-primary|border-primary|text-primary/);
  });

  it('marks a set filter with the rail’s own set mark — the 44-wide ink bar at 2px, not the field’s underline', () => {
    /*
      §W.13's set mark is the BAR under the active view name. The field's
      ink underline (§9.3) is present whether or not a filter is set, so it
      encodes no state — which is the one thing this must express.
    */
    const set = rail(`genreId=${GENRE}`);
    const bars = [...set.matchAll(/data-set-bar=""[^>]*style="([^"]*)"/g)].map((m) => m[1]);
    expect(bars.length, 'one mark for the set filter').toBe(1);
    expect(bars[0]).toMatch(/width:\s*44px/);
    expect(bars[0]).toMatch(/height:\s*2px/);
    /* And absent when nothing is set. */
    expect(rail()).not.toContain('data-set-bar');
  });
});
