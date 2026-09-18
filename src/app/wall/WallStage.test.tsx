import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import '../../../test/component/next-navigation';
import { WallStage } from './WallStage';
import type { WallSeat } from './shelf-runs';
import type { RecordSummary } from './summary';
import { layoutRow } from './geometry';
import { ARROW_LANE } from './landing';
import { GROWTH, OUT_MS, RETURN_MS, ROTATION_START, SWING_MS, gestureFaces, landingDrift, poseAt } from './gesture';

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
      const html = render({ pull: { id: 'b', direction: 'out', ms: OUT_MS }, viewport: width, width });
      const facts = html.slice(html.indexOf('data-region="facts"'), html.indexOf('data-region="wall"'));
      expect(facts).toContain('data-testid="record-chrome"');
      expect(facts).toContain('href="/records/b"');
      expect(facts).toMatch(/data-testid="record-panel"[^>]*data-expanded="true"/);
      /* No fork: no overlay, no flanking variant, no width rule. */
      expect(html).not.toContain('record-chrome-stacked');
      expect(html).not.toContain('record-chrome-facts');
    }
    const early = render({ pull: { id: 'b', direction: 'out', ms: ROTATION_START * SWING_MS - 1 } });
    expect(early).not.toContain('data-testid="record-chrome"');
  });

  it('keeps the count while a record is out — the collection has not been left', () => {
    const html = render({ pull: { id: 'b', direction: 'out', ms: OUT_MS } });
    expect(html).toContain('data-testid="wall-count"');
    expect(html).toMatch(/data-testid="wall-count"[^>]*>2</);
  });
});

describe('where the record lands and what goes with it (§11.19–§11.21)', () => {
  const view = { x: 0, y: 0, width: 960, height: 760 };

  it('lands on the gesture’s own construction: the cover matrix at 1600ms is axis-aligned and square at the record’s own size, the wall unchanged behind it', () => {
    const rest = render();
    const html = render({ pull: { id: 'b', direction: 'out', ms: OUT_MS }, view });
    const [a, b, c, d] = (/<g transform="matrix\(([^)]+)\)"[^>]*data-landing/.exec(html)?.[1] ?? '').split(' ').map(Number);
    expect(b).toBeCloseTo(0, 9);
    expect(c).toBeCloseTo(0, 9);
    expect(a * 150).toBeCloseTo(150 * GROWTH, 6);
    expect(d * 150).toBeCloseTo(150 * GROWTH, 6);
    const fills = (h: string) => [...h.matchAll(/<polygon[^>]*fill="([^"]+)"/g)].map((m) => m[1]).filter((f) => f.startsWith('oklch'));
    expect(new Set(fills(html))).toEqual(new Set(fills(rest)));
  });

  it('carries the arrows with the landed record — beside its cover’s extent — only where there is somewhere to go, and only once settled', () => {
    const three = [seat('a'), seat('b'), seat('c')];
    const sums = { a: summary('a'), b: summary('b'), c: summary('c') };
    const mid = render({ seats: three, summaries: sums, pull: { id: 'b', direction: 'out', ms: OUT_MS } });
    const wall = mid.slice(mid.indexOf('data-region="wall"'));
    const facts = mid.slice(mid.indexOf('data-region="facts"'), mid.indexOf('data-region="wall"'));
    expect(wall).toContain('data-testid="nav-previous"');
    expect(wall).toContain('data-testid="nav-next"');
    expect(facts).not.toContain('data-testid="nav-next"');
    /* Beside the landed cover, in the region's px (the svg's frame origin taken out). */
    const placed = layoutRow(three.map((s) => ({ id: s.id, section: '0' })), 0)[1];
    const [frameX, frameY] = (/viewBox="([^"]+)"/.exec(mid)?.[1] ?? '0 0').split(' ').map(Number);
    const view = { x: 0, y: 0, width: 960, height: 760 };
    const cover = gestureFaces(placed, poseAt(OUT_MS), landingDrift(placed, { ...view, x: frameX, y: frameY })).cover;
    const xs = cover.map(([x]) => x);
    const left = (id: string) => Number(/left:([\d.-]+)px/.exec(/data-testid="nav-(?:previous|next)"[^>]*>/.exec(mid.slice(mid.indexOf(`data-testid="${id}"`)))?.[0] ?? '')?.[1]);
    expect(left('nav-previous')).toBeCloseTo(Math.min(...xs) - frameX - ARROW_LANE, 6);
    expect(left('nav-next')).toBeCloseTo(Math.max(...xs) - frameX + ARROW_LANE - 44, 6);
    const first = render({ seats: three, summaries: sums, pull: { id: 'a', direction: 'out', ms: OUT_MS } });
    expect(first).not.toContain('data-testid="nav-previous"');
    const last = render({ seats: three, summaries: sums, pull: { id: 'c', direction: 'out', ms: OUT_MS } });
    expect(last).not.toContain('data-testid="nav-next"');
    const moving = render({ seats: three, summaries: sums, pull: { id: 'b', direction: 'out', ms: SWING_MS } });
    expect(moving, 'not before it has settled').not.toContain('data-testid="nav-next"');
  });
});

describe('the panel arrives with the rotation (§11.14, §11.19)', () => {
  it('is absent before the rotation joins at 42% of the swing and present from it — the record becomes a subject when it turns', () => {
    const before = render({ pull: { id: 'b', direction: 'out', ms: ROTATION_START * SWING_MS - 1 } });
    expect(before).not.toContain('data-testid="record-chrome"');
    const from = render({ pull: { id: 'b', direction: 'out', ms: ROTATION_START * SWING_MS + 1 } });
    expect(from).toContain('data-testid="record-chrome"');
    expect(from).toContain('href="/records/b"');
    /* And leaves with it on the return: past the mirrored time, the panel is gone. */
    const returning = render({ pull: { id: 'b', direction: 'back', ms: RETURN_MS * (1 - (ROTATION_START * SWING_MS - 1) / OUT_MS) } });
    expect(returning).not.toContain('data-testid="record-chrome"');
  });
});

describe('Turn over shows the back on the same face (§11.7)', () => {
  it('swaps the cover for the back photograph when there is one', () => {
    const html = render({
      seats: [seat('a', { backUrl: 'https://c/back.jpg' })],
      summaries: { a: summary('a') },
      pull: { id: 'a', direction: 'out', ms: OUT_MS },
      side: 'back',
    });
    expect(html).toContain('href="https://c/back.jpg"');
    expect(html).not.toContain('href="https://c/x.jpg"');
  });

  it('shows a plain back carrying label and catalogue number when there is no photograph (§10b)', () => {
    const html = render({ pull: { id: 'a', direction: 'out', ms: OUT_MS }, side: 'back' });
    expect(html).toContain('data-back-plain');
    expect(html).toContain('Epic');
    expect(html).toContain('PE 1');
    expect(html).not.toContain('href="https://c/x.jpg"');
  });
});
