import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import '../../../test/component/next-navigation';
import { WallStage } from './WallStage';
import type { WallSeat } from './shelf-runs';
import type { RecordSummary } from './summary';
import { PERCEIVED_END } from './pull-colour';
import { FORK_PX } from './panel-anchor';

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
      {...props}
    />,
  );

describe('the panel arrives at the slide’s perceived end (§11.7)', () => {
  it('is absent while the record is still visibly moving, present once 97% of travel is behind it', () => {
    const before = render({ pull: { id: 'b', direction: 'out', progress: PERCEIVED_END - 0.05 } });
    expect(before).not.toContain('data-testid="record-chrome"');
    const after = render({ pull: { id: 'b', direction: 'out', progress: PERCEIVED_END } });
    expect(after).toContain('data-testid="record-chrome"');
    expect(after).toContain('data-testid="record-panel"');
    expect(after).toContain('Title b');
    expect(after).toContain('href="/records/b"');
  });

  it('goes with the record on the way back', () => {
    expect(render({ pull: { id: 'b', direction: 'back', progress: 0 } })).not.toContain('data-testid="record-chrome"');
    expect(render({ pull: null })).not.toContain('data-testid="record-chrome"');
  });

  it('flanks the record at the cover’s width on a wide VIEWPORT, expanded at rest — nothing sheared', () => {
    /* The fork is the page's width, not the wall's column: at 1280 the column is 819, one under 820. */
    const html = render({ pull: { id: 'b', direction: 'out', progress: 1 }, width: 819, viewport: 1280 });
    expect(html).toContain('data-testid="record-chrome-facts"');
    expect(html).not.toContain('data-testid="record-chrome-stacked"');
    expect(html).toMatch(/data-testid="record-chrome"[^>]*style="[^"]*width:208px/);
    expect(html).toMatch(/data-testid="record-panel"[^>]*data-expanded="true"/);
    const chrome = /<div[^>]*data-testid="record-chrome"[^>]*>/.exec(html)?.[0] ?? '';
    expect(chrome, 'in the page’s plane, not the projection').not.toContain('transform');
  });

  it('overlays the projection below the fork, collapsed, and the wall itself is unchanged', () => {
    const narrow = render({ pull: { id: 'b', direction: 'out', progress: 1 }, width: 500, viewport: FORK_PX - 1 });
    expect(FORK_PX).toBe(820);
    expect(narrow).toContain('data-testid="record-chrome-stacked"');
    expect(narrow).not.toContain('data-testid="record-chrome-facts"');
    expect(narrow).toMatch(/data-testid="record-panel"[^>]*data-expanded="false"/);
    const wide = render({ pull: { id: 'b', direction: 'out', progress: 1 }, width: 819, viewport: 1280 });
    /* The faces — not the frame, which rightly widens to the container: the pan extent is not the wall's shape. */
    const faces = (h: string) => [...h.matchAll(/data-face="[a-z]+" points="([^"]+)"/g)].map((m) => m[1]);
    expect(faces(narrow).length).toBeGreaterThan(0);
    expect(faces(narrow), 'no reflow: fewer records, not smaller ones').toEqual(faces(wide));
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

describe('arrows between pulled records (§11.8): wall order, absent at the ends', () => {
  const three = [seat('a'), seat('b'), seat('c')];
  const sums = { a: summary('a'), b: summary('b'), c: summary('c') };

  it('shows both arrows from the middle, neither where there is nowhere to go', () => {
    const mid = render({ seats: three, summaries: sums, pull: { id: 'b', direction: 'out', progress: 1 } });
    expect(mid).toContain('data-testid="nav-previous"');
    expect(mid).toContain('data-testid="nav-next"');
    const first = render({ seats: three, summaries: sums, pull: { id: 'a', direction: 'out', progress: 1 } });
    expect(first).not.toContain('data-testid="nav-previous"');
    expect(first).toContain('data-testid="nav-next"');
    const last = render({ seats: three, summaries: sums, pull: { id: 'c', direction: 'out', progress: 1 } });
    expect(last).toContain('data-testid="nav-previous"');
    expect(last).not.toContain('data-testid="nav-next"');
  });

  it('follows the ARRIVING record: its panel, once it has arrived; nothing while both are moving', () => {
    const moving = render({ seats: three, summaries: sums, pulls: [
      { id: 'b', direction: 'back', progress: 0.3 },
      { id: 'c', direction: 'out', progress: 0.3 },
    ] });
    expect(moving).not.toContain('data-testid="record-chrome"');
    const arrived = render({ seats: three, summaries: sums, pulls: [
      { id: 'b', direction: 'back', progress: 1 },
      { id: 'c', direction: 'out', progress: PERCEIVED_END },
    ] });
    const chrome = arrived.slice(arrived.indexOf('data-testid="record-chrome"'));
    expect(chrome).toContain('href="/records/c"');
    expect(chrome, 'the returning record’s panel is not shown').not.toContain('href="/records/b"');
  });
});
