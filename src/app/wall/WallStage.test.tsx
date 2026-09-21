import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import '../../../test/component/next-navigation';
import { WallStage } from './WallStage';
import type { WallSeat } from './shelf-runs';
import type { RecordSummary } from './summary';
import { layoutRow } from './geometry';
import { ARROW_LANE } from './landing';
import { clearanceShift } from './pan';
import { nearViewMinWidth } from './view-fork';
import { GROWTH, OUT_MS, RETURN_MS, ROTATION_START, SWING_MS, gestureFaces, poseAt } from './gesture';

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

describe('§11.28: the count beside the drawing, and the run is what the reader clicks', () => {
  it('puts COLLECTION and the count in a COLUMN beside the drawing, not a band above it', () => {
    /*
      The band ate 281px of the 847 available, which is why the region was
      1240 × 566 and the fixture 239px wide. Moving the count into a column
      returns that height: 337px at 17 records, 542 at 200. The fixture does
      not change — the region does.
    */
    const html = render({ far: true });
    const region = /<div data-region="far"[^>]*class="([^"]*)"/.exec(html)?.[1] ?? '';
    expect(region, 'a row above the fork: the count beside the drawing').toContain('flex-row');
    /* And the fork's width is the one constant, not a literal restated here (§11.26). */
    expect(region, 'the fork’s own width').toContain(`min-width:${nearViewMinWidth()}px`);
    /* Below it the column stacks: §11.24 makes the far view the whole shelf, and a 420px column would leave nothing to draw in. */
    expect(region).toContain('flex-col');
    expect(region, 'and it still takes the full height under the nav').toContain('h-[calc(100vh-var(--app-nav-height,0px))]');
    /* The count comes first in the row, and the drawing takes the rest. */
    expect(html.indexOf('data-region="count-far"')).toBeLessThan(html.indexOf('data-wall="overview"'));
  });

  it('gives the drawing the region’s full height, so the fit has the band’s 281px back', () => {
    const html = render({ far: true });
    const drawing = /<div([^>]*)>\s*<svg data-wall="overview"/.exec(html)?.[1] ?? '';
    expect(drawing, 'the drawing fills the row').toMatch(/flex-1|min-h-0/);
    expect(drawing, 'and is not pushed down by a band').not.toContain('mt-[34px]');
  });
});

describe('the arrival is in position at parse time (§11.29)', () => {
  it('emits an inline script straight after the region that sets its scroll before the first paint', () => {
    /*
      The browser paints the server's markup before any client script runs, so
      a scroll issued from a layout effect is always a paint late: the wall
      appeared at 0,0 and visibly travelled into place, scrollbar moving,
      which reads as a page still loading. The server's svg already carries
      real dimensions inside an overflow-auto region, so the region IS
      scrollable at parse time — and a script placed immediately after it
      runs then, before that first paint.
    */
    /*
      `renderToStaticMarkup` is the server's path, which is the only one that
      emits this: React never executes a component-rendered script on the
      client and warns when it finds one, and a client navigation has no
      server paint to be late for — WallLive's landing effect covers it.
    */
    const html = render({ far: false });
    const region = html.indexOf('data-region="wall"');
    const script = html.indexOf('data-arrival-scroll');
    expect(region, 'the region is rendered').toBeGreaterThan(-1);
    expect(script, 'the arrival script follows it').toBeGreaterThan(region);
    const body = /<script data-arrival-scroll[^>]*>([\s\S]*?)<\/script>/.exec(html)?.[1] ?? '';
    expect(body).toContain('scrollLeft');
    expect(body).toContain('scrollTop');
    expect(body, 'no framework, no state').not.toMatch(/react|useState|dispatch/i);
  });

  it('emits nothing in the far view, which does not scroll', () => {
    expect(render({ far: true })).not.toContain('data-arrival-scroll');
  });
});

describe('the route’s two views, and the way between them (§11.12)', () => {
  it('makes the count the way out in BOTH views: §11.12 puts the zoom-out on the collection’s identity, which the near view also shows', () => {
    /*
      The zoom-out was rendered only inside the far view's count, so from the
      near view there was no way back except Escape — and every test that
      clicked it timed out. §11.12's argument is about the COUNT, which is
      the collection's identity and what the zoom-out arrives at; the near
      view carries the same count in its facts column.
    */
    const near = render({ onZoomOut: () => {}, onZoomIn: () => {} });
    expect(near).toContain('data-region="near"');
    expect(near).toMatch(/<button[^>]*data-testid="wall-zoom-out"[^>]*>/);
    expect(near).toContain('data-testid="wall-count"');
    /* And it is absent where there is no zoom to do — §11.24's narrow shelf. */
    expect(render()).not.toContain('data-testid="wall-zoom-out"');
  });

  it('makes the far view’s count the way out — a button, not a wheel — and the far seats the way in', () => {
    const far = render({ far: true, onZoomOut: () => {}, onZoomIn: () => {} });
    /* Out is the count: the collection's identity, which is what the zoom-out arrives at. */
    expect(far).toMatch(/<button[^>]*data-testid="wall-zoom-out"[^>]*>/);
    expect(far.indexOf('data-testid="wall-zoom-out"')).toBeLessThan(far.indexOf('data-wall="overview"'));
    expect(far).toContain('data-testid="wall-count-far"');
    /* In is a seat. With a handler the far seats are the zoom, not links away. */
    expect(far).toMatch(/<a [^>]*data-far-seat="a"/);
  });

  it('leaves the far view’s records as plain links when there is no zoom to do — the narrow shelf, where a tap opens the record (§11.24)', () => {
    const narrow = render({ far: true });
    expect(narrow).not.toContain('data-testid="wall-zoom-out"');
    expect(narrow).toMatch(/<a [^>]*href="\/records\/a"/);
  });
});

describe('the narrow shelf is the far view (§11.24)', () => {
  it('draws the count and then the overview in one column — no facts column, no labelled wall, no panel region — with the records as links to their screens', () => {
    const html = render({ far: true, viewport: 390, width: 390 });
    expect(html).not.toMatch(/grid-cols-\[420px_1fr\]/);
    expect(html).not.toContain('data-wall="labelled"');
    expect(html).not.toContain('data-testid="panel-region"');
    /* Its own markers: while unmeasured both views are in the document, and nothing may resolve to both. */
    expect(html).toContain('data-testid="wall-count-far"');
    expect(html).not.toContain('data-testid="wall-count"');
    expect(html.indexOf('data-testid="wall-count-far"')).toBeLessThan(html.indexOf('data-wall="overview"'));
    expect(html).toMatch(/<a [^>]*href="\/records\/a"[^>]*aria-label="Artist a · Title a"[^>]*data-far-seat="a"/);
    expect(html).not.toContain('data-seat="a"');
    /* No width floor: the svg fits the column rather than holding 1:1. */
    expect(/<svg[^>]*data-wall="overview"[^>]*>/.exec(html)?.[0]).toContain('width:100%');
  });

  it('keeps the near view unless told otherwise', () => {
    expect(render()).toContain('data-wall="labelled"');
    expect(render()).not.toContain('data-wall="overview"');
    expect(render()).toContain('data-region="near"');
  });

  it('renders BOTH views while unmeasured — the server has no width — so CSS can show the right one on the first paint, and one once measured (§11.26)', () => {
    const both = render({ far: null });
    expect(both).toContain('data-region="near"');
    expect(both).toContain('data-region="far"');
    expect(render({ far: true })).not.toContain('data-region="near"');
    expect(render({ far: false })).not.toContain('data-region="far"');
  });
});

describe('two columns: facts left, drawing right (§11.9)', () => {
  it('gives the facts 420px and the drawing the rest — page pixels, §11.13’s figure', () => {
    expect(render()).toMatch(/grid-cols-\[420px_1fr\]/);
  });

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

describe('a filter empties seats: the count and the arrows are the seated records’ (§11.12)', () => {
  const three = [seat('a'), { ...seat('b'), empty: true }, seat('c')];
  const sums = { a: summary('a'), b: summary('b'), c: summary('c') };

  it('counts the seated records, not the seats', () => {
    expect(render({ seats: three, summaries: sums })).toMatch(/data-testid="wall-count"[^>]*>2</);
  });

  it('skips an empty seat with the arrows: a’s next is c, and c’s previous is a', () => {
    const fromA = render({ seats: three, summaries: sums, pull: { id: 'a', direction: 'out', ms: OUT_MS } });
    expect(fromA).toContain('data-testid="nav-next"');
    const fromC = render({ seats: three, summaries: sums, pull: { id: 'c', direction: 'out', ms: OUT_MS } });
    expect(fromC).toContain('data-testid="nav-previous"');
    /* And an empty seat at the end is not somewhere to go. */
    const end = render({ seats: [seat('a'), { ...seat('b'), empty: true }], summaries: sums, pull: { id: 'a', direction: 'out', ms: OUT_MS } });
    expect(end).not.toContain('data-testid="nav-next"');
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
    const [frameX] = (/viewBox="([^"]+)"/.exec(mid)?.[1] ?? '0 0').split(' ').map(Number);
    /* Shifted by the pan's clearance (§11.26): the arrows go where the cover lands, not where the gesture alone puts it. */
    const cover = gestureFaces(placed, poseAt(OUT_MS)).cover;
    const xs = cover.map(([x]) => x + clearanceShift(placed));
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
