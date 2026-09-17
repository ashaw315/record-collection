import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import '../../../test/component/next-navigation';
import { WallStage } from './WallStage';
import type { WallSeat } from './shelf-runs';
import type { RecordSummary } from './summary';
import { PERCEIVED_END } from './pull-colour';
import { DEPTH, SPINE_HEIGHT } from './geometry';

/**
 * The stage: the drawing plus what the gesture arrives at. §11.7's panel
 * appears at the slide's perceived end — not tracking the face, since a
 * panel that slides with a drawn object is a caption and the two planes
 * collapse into one. §11.8's fork at 820 is an overlay, not a narrower
 * panel: the wall does not reflow.
 */
const seat = (id: string, over: Partial<WallSeat> = {}): WallSeat => ({
  id,
  section: '0',
  label: `Artist ${id} · Title ${id}`,
  title: `Title ${id}`,
  artist: `Artist ${id}`,
  spineColour: '#31788a',
  coverUrl: 'https://c/x.jpg',
  backUrl: null,
  labelName: 'Epic',
  catalogNumber: 'PE 1',
  ...over,
});
const summary = (id: string): RecordSummary => ({
  title: `Title ${id}`,
  artist: `Artist ${id}`,
  year: 1976,
  href: `/records/${id}`,
  furtherFacts: 2,
  snippet: { text: 'A note.', generated: true },
  factGroups: [],
});

const render = (props: Partial<Parameters<typeof WallStage>[0]> = {}) =>
  renderToStaticMarkup(
    <WallStage
      seats={[seat('a'), seat('b')]}
      summaries={{ a: summary('a'), b: summary('b') }}
      pull={null}
      side="front"
      width={819}
      viewport={1280}
      view={{ x: 0, y: 0, width: 960, height: 760 }}
      {...props}
    />,
  );

describe('two columns: facts left, drawing right (§11.9)', () => {
  it('has the count at the facts column’s head and the panel’s region below it, EMPTY at rest', () => {
    const html = render();
    const facts = html.slice(html.indexOf('data-region="facts"'), html.indexOf('data-region="wall"'));
    expect(facts).toContain('data-region="count"');
    expect(facts).toContain('data-testid="panel-region"');
    expect(facts.indexOf('data-region="count"')).toBeLessThan(facts.indexOf('data-testid="panel-region"'));
    const region = /<div[^>]*data-testid="panel-region"[^>]*>([\s\S]*?)<\/div>/.exec(facts)?.[1] ?? 'x';
    expect(region.trim(), 'empty at rest').toBe('');
    expect(html).not.toContain('data-testid="record-chrome"');
  });

  it('fills the panel’s region — a destination that does not move — once the record has arrived, at any width', () => {
    for (const width of [500, 1280]) {
      const html = render({ pull: { id: 'b', direction: 'out', progress: PERCEIVED_END }, viewport: width, width });
      const facts = html.slice(html.indexOf('data-region="facts"'), html.indexOf('data-region="wall"'));
      expect(facts).toContain('data-testid="record-chrome"');
      expect(facts).toContain('href="/records/b"');
      expect(facts).toMatch(/data-testid="record-panel"[^>]*data-expanded="true"/);
      /* No fork: no overlay, no flanking variant, no width rule. */
      expect(html).not.toContain('record-chrome-stacked');
      expect(html).not.toContain('record-chrome-facts');
    }
    const early = render({ pull: { id: 'b', direction: 'out', progress: PERCEIVED_END - 0.05 } });
    expect(early).not.toContain('data-testid="record-chrome"');
  });

  it('keeps the count while a record is out — the collection has not been left', () => {
    const html = render({ pull: { id: 'b', direction: 'out', progress: 1 } });
    expect(html).toContain('data-testid="wall-count"');
    expect(html).toMatch(/data-testid="wall-count"[^>]*>2</);
  });
});

describe('the record lands in the drawing’s region (§11.9)', () => {
  it('is the largest square the region holds, unsheared — exactly — with the wall unchanged behind it', () => {
    const rest = render();
    const html = render({ pull: { id: 'b', direction: 'out', progress: 1 }, view: { x: 0, y: 0, width: 960, height: 760 } });
    const group = /<g transform="matrix\(([^)]+)\)"[^>]*data-landing/.exec(html) ?? /data-pulled="b"[\s\S]*?<g transform="matrix\(([^)]+)\)"/.exec(html);
    expect(group, 'the cover group carries the landing matrix').not.toBeNull();
    const [a, b, c, d] = (group?.[1] ?? '').split(' ').map(Number);
    expect(b).toBe(0);
    expect(c).toBe(0);
    expect(a * DEPTH, 'the square’s size').toBeCloseTo(760 - 2 * 34, 9);
    expect(d * SPINE_HEIGHT).toBeCloseTo(760 - 2 * 34, 9);
    /* No lightness step: every plane and face fill is what it was at rest. */
    const fills = (h: string) => [...h.matchAll(/<polygon[^>]*fill="([^"]+)"/g)].map((m) => m[1]).filter((f) => f.startsWith('oklch'));
    expect(new Set(fills(html))).toEqual(new Set(fills(rest)));
  });

  it('carries the arrows with the record, in the drawing’s region, only where there is somewhere to go', () => {
    const three = [seat('a'), seat('b'), seat('c')];
    const sums = { a: summary('a'), b: summary('b'), c: summary('c') };
    const mid = render({ seats: three, summaries: sums, pull: { id: 'b', direction: 'out', progress: 1 } });
    const wall = mid.slice(mid.indexOf('data-region="wall"'));
    const facts = mid.slice(mid.indexOf('data-region="facts"'), mid.indexOf('data-region="wall"'));
    expect(wall).toContain('data-testid="nav-previous"');
    expect(wall).toContain('data-testid="nav-next"');
    expect(facts).not.toContain('data-testid="nav-next"');
    const first = render({ seats: three, summaries: sums, pull: { id: 'a', direction: 'out', progress: 1 } });
    expect(first).not.toContain('data-testid="nav-previous"');
    const last = render({ seats: three, summaries: sums, pull: { id: 'c', direction: 'out', progress: 1 } });
    expect(last).not.toContain('data-testid="nav-next"');
  });
});

describe('Turn over shows the back on the same face (§11.7)', () => {
  it('swaps the cover for the back photograph when there is one', () => {
    const html = render({
      seats: [seat('a', { backUrl: 'https://c/back.jpg' })],
      summaries: { a: summary('a') },
      pull: { id: 'a', direction: 'out', progress: 1 },
      side: 'back',
    });
    expect(html).toContain('href="https://c/back.jpg"');
    expect(html).not.toContain('href="https://c/x.jpg"');
  });

  it('shows a plain back carrying label and catalogue number when there is no photograph (§10b)', () => {
    const html = render({ pull: { id: 'a', direction: 'out', progress: 1 }, side: 'back' });
    expect(html).toContain('data-back-plain');
    expect(html).toContain('Epic');
    expect(html).toContain('PE 1');
    expect(html).not.toContain('href="https://c/x.jpg"');
  });
});
