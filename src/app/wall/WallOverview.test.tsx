import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { FACE_FILL, PLANE_FILL, TOP_FILL, WallOverview } from './WallOverview';
import type { ShelfSeat } from './shelf-runs';

/**
 * The overview renderer (The Wall 5b §5): **polygons only — no text, no
 * interaction.**
 *
 * §5's rule is that labels render at 1:1 and are REMOVED below it, never
 * shrunk: a 9px label is an absolute floor, so a wall scaled to 0.41 to fit a
 * 1440px viewport would render it at 3.7px and violate the floor silently.
 * This component is the unlabelled state, and the claim worth testing at this
 * layer is that it draws the geometry the shared module produces and nothing
 * else.
 *
 * **The threshold between this component and the labelled one is NOT here.**
 * The rule is settled; how the switch is expressed is its own decision.
 */

const seats = (count: number, sections = 1): ShelfSeat[] =>
  Array.from({ length: count }, (_, index) => ({
    id: `r${index}`,
    section: `S${index % sections}`,
  }));

const render = (props: Parameters<typeof WallOverview>[0]) =>
  renderToStaticMarkup(<WallOverview {...props} />);

const countTag = (html: string, tag: string) =>
  html.split(`<${tag}`).length - 1;

describe('the overview draws the collection as polygons', () => {
  it('draws three faces per record plus the unit’s furniture', () => {
    const html = render({ seats: seats(6, 2), pulledId: null });

    // 6 records × (top, right, front) on one unit's top shelf (§11.10): the
    // unit's eighteen faces, the section boundaries drawn as rules on the shelf.
    expect(countTag(html, 'polygon')).toBe(6 * 3 + 18);
    expect(html.split('data-break=""').length - 1, 'a break at each section boundary').toBe(5);
  });

  /**
   * **No text at any size.** The load-bearing claim of this component: at the
   * overview scale a label would be below the 9px floor, so the state is
   * unlabelled rather than small-labelled.
   */
  it('renders no text at all', () => {
    const html = render({ seats: seats(40, 3), pulledId: null });

    expect(countTag(html, 'text')).toBe(0);
    expect(html).not.toMatch(/<tspan/);
  });

  /** No interaction: nothing clickable, nothing focusable, no handlers. */
  it('renders nothing interactive', () => {
    const html = render({ seats: seats(20, 2), pulledId: null });

    expect(countTag(html, 'button')).toBe(0);
    expect(countTag(html, 'a ')).toBe(0);
    expect(html).not.toMatch(/tabindex|onclick|role="button"/i);
  });

  it('linked (§11.24’s narrow shelf): each record is an anchor to its own screen, NAMED as the labelled wall names it — a tap goes there, not to a pulled state', () => {
    const named = seats(3).map((seat, i) => ({ ...seat, artist: `Artist ${i}`, title: `Title ${i}` }));
    const html = render({ seats: named, pulledId: null, linked: true });
    for (const id of ['r0', 'r1', 'r2']) expect(html).toMatch(new RegExp(`<a [^>]*href="/records/${id}"[^>]*data-far-seat="${id}"`));
    /* An anchor with no name is "link" two hundred times over: the far view draws no text, so the name is the attribute. */
    for (const i of [0, 1, 2]) expect(html).toMatch(new RegExp(`<a [^>]*aria-label="Artist ${i} · Title ${i}"[^>]*data-far-seat="r${i}"`));
    expect(countTag(html, 'a ')).toBe(3);
    /* Still no text: the far view identifies nothing; the record screen does. */
    expect(html).not.toMatch(/<text/);
  });

  it('renders an empty collection as the fixture alone — the unit, no records', () => {
    const html = render({ seats: [], pulledId: null });

    /* §11.10: the empty shelves are the fixture rather than a gap in it. */
    expect(countTag(html, 'polygon')).toBe(18);
  });
});

/**
 * **§2's distinction, at the rendered layer.** The geometry module asserts it
 * on points; this asserts that the renderer actually emits what it produced.
 */
describe('the far view paints by the separating-plane sort, furniture and records together (§11.23)', () => {
  /*
    **The defect this pins.** The far view painted ALL furniture, then ALL
    records — two passes — so a shelf's front face went down before the
    records standing on it and the records drew over it: spines hanging below
    the shelf plane and past the right upright, which is what a reader
    reported as "the shelf drawing itself is messed up". The near view has
    never had this, because §11.23's insertion runs over every object at
    once; the far view is the same wall and needs the same order.
  */
  it('paints the shelf a row stands on BEFORE that row’s records, and the upright in front of them after — one order over every object', () => {
    const html = render({ seats: seats(17), pulledId: null, linked: true });
    const order = (marker: string) => html.indexOf(marker);
    /* A record of the top row, and the shelf it stands on. */
    const record = order('data-far-seat="r0"');
    expect(record).toBeGreaterThan(-1);
    const shelfTop = order('data-furniture="shelf-top"');
    expect(shelfTop, 'the shelf its records stand on is painted first').toBeLessThan(record);
    /* The nearer upright is in FRONT of the row, so it paints after. */
    const uprights = [...html.matchAll(/data-furniture="upright-front"/g)].map((m) => m.index ?? -1);
    expect(uprights.some((i) => i > record), 'the near upright paints after the records it stands in front of').toBe(true);
  });

  it('does not paint every piece of furniture before every record — the two-pass order is the defect', () => {
    const html = render({ seats: seats(17), pulledId: null, linked: true });
    const lastFurniture = html.lastIndexOf('data-furniture=');
    const firstRecord = html.indexOf('data-far-seat=');
    expect(lastFurniture, 'some furniture paints after some records').toBeGreaterThan(firstRecord);
  });
});

describe('the far view fits its region (§11.10, §11.12)', () => {
  it('centres the fitted drawing rather than pinning it to the left — a portrait fixture in a landscape region fits the height and must not sit in a column', () => {
    const html = render({ seats: seats(17), pulledId: null });
    const svg = /<svg[^>]*>/.exec(html)?.[0] ?? '';
    /* `meet` fits the whole drawing; the alignment decides where the leftover space goes, and it goes on both sides. */
    expect(svg).toContain('preserveAspectRatio="xMidYMid meet"');
    expect(svg).not.toContain('xMinYMin');
  });
});

describe('§11.28: the occupied run is the click target, and it signals on hover', () => {
  const occupied = (over: Partial<{ artist: string; title: string }> = {}) =>
    seats(17).map((s, i) => ({ ...s, artist: `A${i}`, title: `T${i}`, ...over }));

  it('draws ONE target per occupied run — not the fixture, not the region, and not the empty shelves', () => {
    /*
      A region-sized target that does one thing is a page that responds
      anywhere; the fixture includes three empty shelves, so half of it would
      promise a view of nothing. The run is the only part with something to
      zoom to.
    */
    const html = render({ seats: occupied(), pulledId: null, linked: true, onSeatClick: () => {} });
    const runs = [...html.matchAll(/data-run="(\d+)"/g)].map((m) => m[1]);
    expect(runs, 'seventeen records fill one shelf').toEqual(['0']);
    /* It covers the run's records, and nothing is drawn over the empty shelves. */
    const target = /<(?:a|g)[^>]*data-run="0"[^>]*>/.exec(html)?.[0] ?? '';
    expect(target).toContain('data-run-count="17"');
  });

  it('sinks the run to §11.27’s 0.731 on hover, with its hairlines recomputed to 0.588 against that ground', () => {
    /*
      §11.28: the hairline moves because the GROUND moved — §5.5's shade step
      from 0.731 rather than from paper. Left at 0.72 it reads 1.04:1 on the
      hover surface, worse than the 1.08:1 §11.27 refused 0.90 for, and it
      erased the only channel separating one spine from another: the hover
      said one object at the moment it meant seventeen records. 0.588 gives
      1.74:1, close to the run's 1.99:1 at rest and deliberately not equal —
      matching rest would need ~0.556, a number tuned to a target, where
      0.588 is the derivation.
    */
    const html = render({ seats: occupied(), pulledId: null, linked: true, onSeatClick: () => {} });
    const style = /<style data-run-hover[^>]*>([\s\S]*?)<\/style>/.exec(html)?.[1] ?? '';
    expect(style, 'the sunk surface').toContain('0.731');
    expect(style, 'the recomputed hairline').toContain('0.588');
    expect(style, 'not the paper-ground hairline').not.toContain('0.72 0.004 80');
    expect(style).toMatch(/\[data-run\][^{]*:hover|:hover[^{]*\[data-run\]/);
  });

  it('shows the run’s count beside it on hover, in 11px mono, with no caption', () => {
    const html = render({ seats: occupied(), pulledId: null, linked: true, onSeatClick: () => {} });
    const label = /<text[^>]*data-run-label[^>]*>([^<]*)<\/text>/.exec(html);
    expect(label?.[1], 'the count, not a caption').toMatch(/^17 RECORDS/);
    const tag = label?.[0] ?? '';
    expect(tag, '§11.27’s 11px mono').toMatch(/font-size="11"|font-size:11px/);
    expect(html, 'no caption explaining the drawing').not.toMatch(/click to|tap to|zoom in/i);
  });

  it('does not offer a run target where there is no zoom to do — §11.24’s narrow shelf', () => {
    const html = render({ seats: occupied(), pulledId: null, linked: true });
    expect(html).not.toContain('data-run=');
  });
});

describe('§11.30: reaching the run by keyboard', () => {
  const occupied = (count = 17) => seats(count).map((s, i) => ({ ...s, artist: `A${i}`, title: `T${i}` }));

  it('is a BUTTON, not an anchor — a run has no route, and §11.29 makes the near view a camera position rather than an address', () => {
    /*
      A spine is an anchor because a record has a route. An anchor with no
      href is a link to nowhere announced as a link, which is worse for the
      reader it exists to serve than a control announced as what it is.
    */
    /*
      SVG has no <button>, so the run is a <g> carrying the button ROLE, which
      is what a screen reader announces. The point of the ruling holds either
      way: it is announced as a control rather than as a link to nowhere, and
      it carries no href.
    */
    const html = render({ seats: occupied(), pulledId: null, linked: true, onSeatClick: () => {} });
    const run = /<(\w+)[^>]*data-run="0"[^>]*>/.exec(html);
    expect(run?.[0], 'announced as a button').toContain('role="button"');
    expect(run?.[0], 'and reachable by keyboard').toContain('tabindex="0"');
    expect(run?.[0], 'no href: a run is not an address').not.toContain('href');
  });

  it('is labelled by what the hover says in ink: "17 records — zoom to this shelf"', () => {
    const html = render({ seats: occupied(), pulledId: null, linked: true, onSeatClick: () => {} });
    const run = /<g[^>]*data-run="0"[^>]*>/.exec(html)?.[0] ?? '';
    expect(run).toContain('aria-label="17 records — zoom to this shelf"');
  });

  it('takes runs in document order, top shelf first — §11.23’s seat order one level up', () => {
    /* Two shelves' worth: the order they filled is the order they are reached. */
    const html = render({ seats: occupied(30), pulledId: null, linked: true, onSeatClick: () => {} });
    const order = [...html.matchAll(/data-run="(\d+)"/g)].map((m) => Number(m[1]));
    expect(order.length, 'thirty records fill two runs').toBe(2);
    expect(order, 'document order, top shelf first').toEqual([0, 1]);
  });

  it('shows the hover’s sink and count on FOCUS too, plus a 2px ink rule the hover does not have', () => {
    /*
      Hover and focus must not be the same state: hover follows a pointer
      already where the reader is looking, and focus has to be findable by
      someone who cannot see where it went. The sink alone is a 1.74:1 change
      in a drawing of 1.99:1 hairlines — legible as a response, not as a
      location. 0.18 reads 7.89:1 on the 0.731 surface and 15.07:1 on paper.
    */
    const html = render({ seats: occupied(), pulledId: null, linked: true, onSeatClick: () => {} });
    const style = /<style data-run-hover[^>]*>([\s\S]*?)<\/style>/.exec(html)?.[1] ?? '';
    expect(style, 'focus sinks and counts as hover does').toMatch(/\[data-run\]:focus-visible/);
    /* The edge is drawn only on focus, at §3's 2px, in ink. */
    expect(style).toMatch(/\[data-run-edge\][\s\S]*?opacity:\s*0/);
    expect(style).toMatch(/:focus-visible[^{]*\[data-run-edge\][^}]*opacity:\s*1/);
    const edge = /<line[^>]*data-run-edge[^>]*>/.exec(html)?.[0] ?? '';
    expect(edge, '§3’s 2px, the weight reserved for a mark that is not a rule about type').toContain('stroke-width="2"');
    expect(edge, 'ink at 0.18').toContain('oklch(0.18');
    /* Hover does not draw it: the two states differ. */
    expect(style).not.toMatch(/:hover[^{]*\[data-run-edge\][^}]*opacity:\s*1/);
  });

  it('adds no second control: the run is the only stop, and nothing else in the far view is focusable', () => {
    const html = render({ seats: occupied(), pulledId: null, linked: true, onSeatClick: () => {} });
    expect((html.match(/role="button"/g) ?? []).length, 'one control per run and no more').toBe(1);
    /*
      The run is the only TAB STOP. Where a zoom is offered the seats stay
      anchors — they work with JavaScript off, and a record has a route — but
      they leave the tab sequence: §11.28 rules the run the only target, and
      seventeen links in front of it would be the second control §11.30
      forbids, reached before the one that does something.
    */
    expect((html.match(/tabindex="0"/g) ?? []).length, 'one tab stop').toBe(1);
    expect((html.match(/tabindex="-1"/g) ?? []).length, 'and the seats step out of the sequence').toBe(17);
  });
});

describe('the far view’s seats are the way in (§11.12)', () => {
  it('calls back with the seat rather than following its link, when a zoom is offered', () => {
    const html = render({ seats: seats(3), pulledId: null, linked: true, onSeatClick: () => {} });
    /* Still an anchor — it works with JavaScript off — and the click is intercepted. */
    expect(html).toMatch(/<a [^>]*href="\/records\/r1"[^>]*data-far-seat="r1"/);
    expect(html).toContain('cursor:pointer');
  });
});

describe('a filter empties seats in the far view (§11.12)', () => {
  it('draws no faces for an empty seat, keeps the fixture, and links nothing there', () => {
    const three = seats(3);
    const full = render({ seats: three, pulledId: null });
    const filtered = render({ seats: [three[0], { ...three[1], empty: true }, three[2]], pulledId: null, linked: true });
    expect(countTag(filtered, 'polygon')).toBe(countTag(full, 'polygon') - 3);
    expect(countTag(filtered, 'polygon[data-furniture')).toBe(countTag(full, 'polygon[data-furniture'));
    expect(filtered).not.toContain('data-far-seat="r1"');
    expect(filtered).toContain('data-far-seat="r0"');
    expect(filtered).toContain('data-far-seat="r2"');
  });
});

describe('a pulled record leaves the shelf whole', () => {
  it('draws the same number of shelf outlines with a record pulled', () => {
    const shelf = seats(6, 2);
    const seated = render({ seats: shelf, pulledId: null });
    const pulled = render({ seats: shelf, pulledId: 'r2' });

    /* One fewer spine, the SAME number of outlines. */
    expect(countTag(pulled, 'polygon')).toBe(countTag(seated, 'polygon') - 3);
  });
});

/**
 * **200 records, which is the state the whole density sequence was about.**
 *
 * The design file's §7 draws five shelves of forty and reports 33% ink against
 * 67% empty. Nobody had rendered that in SVG, so the cost is measured here
 * rather than asserted — and the number that matters is what it costs when
 * something CHANGES, because the two-state switch will eventually mount and
 * unmount this whole thing.
 */
describe('200 records', () => {
  it('renders without error and reports its node count', () => {
    const html = render({ seats: seats(200, 5), pulledId: null });
    const polygons = countTag(html, 'polygon');

    /*
      200 spines + 25 outlines. Five shelves of forty, and because the sections
      cycle every fifth seat, each shelf contains all five sections interleaved
      — so each draws five runs rather than one. My first expectation said 205,
      assuming one run per section across the whole wall; runs are per SHELF,
      which is what makes the wall wrap without a run spanning a row break.
    */
    /* 200 records on ONE fixture of four shelves of fifty (§11.23): eighteen furniture faces, not three units' worth. */
    expect(polygons).toBe(200 * 3 + 18);
    expect(html.length).toBeGreaterThan(0);
  });

  it('costs a re-render less than a budget a switch could not absorb', () => {
    const shelf = seats(200, 5);

    /* Warm, so the measurement is steady-state rather than first-compile. */
    render({ seats: shelf, pulledId: null });

    const started = performance.now();
    for (let run = 0; run < 5; run += 1) {
      render({ seats: shelf, pulledId: `r${run}` });
    }
    const perRender = (performance.now() - started) / 5;

    /*
      Generous on purpose: this is a REGRESSION bound, not a target. It exists
      so a future change that makes the overview quadratic fails here rather
      than being noticed as jank after the switch lands. The measured figure is
      reported in the unit's notes.
    */
    expect(perRender, `${perRender.toFixed(1)}ms per 200-record render`).toBeLessThan(100);
  });
});

describe('the overview at rest is line, ink and paper (8a §11)', () => {
  it('fills every face in a paper value, never a derived colour — opaque so nearer faces occlude', () => {
    /*
      §11 says no derived colour at rest, not no fill: a painter's order can
      only hide the lines behind a face if the face is opaque. Three paper
      steps — plane, face, top — and nothing with a hue.
    */
    const html = render({ seats: seats(6, 2), pulledId: null });
    const fills = [...html.matchAll(/fill="([^"]*)"/g)].map((m) => m[1]);

    expect(fills).toHaveLength(6 * 3 + 18);
    expect(new Set(fills)).toEqual(new Set([PLANE_FILL, FACE_FILL, TOP_FILL]));
    for (const fill of fills) {
      const chroma = Number(/oklch\([\d.]+ ([\d.]+) /.exec(fill)?.[1]);
      expect(chroma, fill).toBeLessThanOrEqual(0.004);
    }
  });
});
