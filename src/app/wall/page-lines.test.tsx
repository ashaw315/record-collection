import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import '../../../test/component/next-navigation';
import { WallStage } from './WallStage';
import { WallRail } from '../WallRail';
import { WallComposition } from './WallComposition';
import { parseCollectionParams } from '../collection-params';
import type { WallSeat } from './shelf-runs';
import type { RecordSummary } from './summary';
import { OUT_MS } from './gesture';

/**
 * §11.31: **which lines the page carries — six, and no others.**
 *
 * Two verticals, rail to facts column and facts column to drawing region,
 * each full-bleed from the nav to the page foot; two horizontals in the
 * rail, above the view switcher and above Add record; and two in the facts
 * column, under the count and above the two verbs. The facts column's pair
 * exists only when the PANEL does — a rule under the count with nothing
 * below it separates nothing — so the far view carries four and the landed
 * state six.
 *
 * Counted per view, so a line added later fails this rather than passing
 * unnoticed. Value 0.72 on the 0.925 paper (§11.27), 1px for every rule;
 * 2px is reserved for §3's non-type marks, which on this page are §11.30's
 * focus edge, the journal edge and the rail's 44-wide set bar.
 */
const seat = (id: string): WallSeat => ({
  id,
  section: 'S',
  label: `Artist ${id} · Title ${id}`,
  title: `Title ${id}`,
  artist: `Artist ${id}`,
  spineColour: '#31788a',
  coverUrl: null,
  backUrl: null,
  labelName: 'Epic',
  catalogNumber: 'PE 1',
});
const summary = (id: string): RecordSummary => ({
  title: `Title ${id}`,
  artist: `Artist ${id}`,
  year: 1976,
  href: `/records/${id}`,
  furtherFacts: 2,
  snippet: { text: 'A note.', generated: true },
  factGroups: [
    { kind: 'imprint', rows: [{ label: 'Label', value: 'Epic' }] },
    { kind: 'pressing', rows: [{ label: 'Pressed', value: '1976' }] },
  ],
});

const stage = (over: Partial<Parameters<typeof WallStage>[0]> = {}) =>
  renderToStaticMarkup(
    <WallStage
      seats={[seat('a'), seat('b')]}
      summaries={{ a: summary('a'), b: summary('b') }}
      pull={null}
      side="front"
      width={819}
      viewport={1440}
      view={{ x: 0, y: 0, width: 960, height: 760 }}
      {...over}
    />,
  );

/*
  The rail's own two horizontals come from WallRail; the vertical BESIDE it
  belongs to the composition, which is what places the rail in a column — so
  the page's line count is read from both together, as the page renders them.
*/
const rail = () => renderToStaticMarkup(<WallRail params={parseCollectionParams(new URLSearchParams())} genres={[]} />);
/** The rail column as the composition renders it: the rail's own lines plus the vertical beside it. */
const compositionRailLines = () => {
  const html = renderToStaticMarkup(
    <WallComposition seats={[]} rail={<WallRail params={parseCollectionParams(new URLSearchParams())} genres={[]} />} />,
  );
  return html.slice(0, html.indexOf('data-wall-container'));
};
void rail;

/** Every element the page marks as one of §11.31's structural lines. */
const lines = (html: string) => [...html.matchAll(/data-line="([a-z-]+)"/g)].map((m) => m[1]);

describe('§11.31: the page carries six lines, and no others', () => {
  it('draws four in the far view — the two verticals and the rail’s two — with the count unruled', () => {
    const html = stage({ far: true }) + compositionRailLines();
    expect(lines(html).sort()).toEqual(['rail-actions', 'rail-facts', 'rail-views', 'facts-drawing'].sort());
  });

  it('draws six in the landed state: the far view’s four plus the facts column’s pair', () => {
    const html = stage({ far: false, pull: { id: 'a', direction: 'out', ms: OUT_MS } }) + compositionRailLines();
    expect(lines(html).sort()).toEqual(
      ['rail-actions', 'rail-facts', 'rail-views', 'facts-drawing', 'facts-count', 'facts-verbs'].sort(),
    );
  });

  it('draws four at rest in the near view: the panel’s pair arrives with the panel', () => {
    const html = stage({ far: false }) + compositionRailLines();
    expect(lines(html)).not.toContain('facts-count');
    expect(lines(html)).not.toContain('facts-verbs');
    expect(lines(html)).toHaveLength(4);
  });

  it('runs both verticals full-bleed, nav to foot — a rule that stops short draws a box', () => {
    const html = stage({ far: false }) + compositionRailLines();
    for (const id of ['rail-facts', 'facts-drawing']) {
      const line = new RegExp(`<[^>]*data-line="${id}"[^>]*>`).exec(html)?.[0] ?? '';
      expect(line, `${id} is full height`).toMatch(/h-full|inset-y-0|100vh/);
    }
  });

  it('gives every rule 1px, reserving 2px for §3’s non-type marks', () => {
    const html = stage({ far: false, pull: { id: 'a', direction: 'out', ms: OUT_MS } }) + compositionRailLines();
    for (const id of lines(html)) {
      const line = new RegExp(`<[^>]*data-line="${id}"[^>]*>`).exec(html)?.[0] ?? '';
      expect(line, `${id} is 1px`).not.toMatch(/border-2|h-\[2px\]|w-\[2px\]/);
    }
    /* The rail's set bar is a MARK, not a rule: 44 wide at 2px (§11.31's correction from 4). */
    const bar = /<[^>]*data-current-bar[^>]*>/.exec(html)?.[0] ?? '';
    expect(bar).toMatch(/width:\s*44px/);
    expect(bar, 'the set bar is 2px, not the 4 it was drawn at').toMatch(/height:\s*2px/);
  });

  it('puts no rules inside the drawing region: it holds one drawing', () => {
    const html = stage({ far: false, pull: { id: 'a', direction: 'out', ms: OUT_MS } });
    const region = html.slice(html.indexOf('data-region="wall"'));
    expect([...region.matchAll(/data-line="/g)]).toHaveLength(0);
  });
});
