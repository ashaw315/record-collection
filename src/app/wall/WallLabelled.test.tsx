import { describe, expect, it, vi } from 'vitest';
import * as paintSort from './paint-sort';
import { recordOffset } from './pan';
import { renderToStaticMarkup } from 'react-dom/server';
import { WallLabelled, type PullState } from './WallLabelled';
import { WALL_PAPER_HEX, pullFill } from './pull-colour';
import { recordLadder } from '@/lib/colour/record-ladder';
import { FACE_FILL, PLANE_FILL, TOP_FILL, points } from './WallOverview';
import type { WallSeat } from './shelf-runs';
import { DEPTH, SPINE_HEIGHT, frontFace, layoutRow } from './geometry';
import { GROWTH, OUT_MS, RETURN_MS, ROTATION_START, SWING_MS, easeInOutCubic, gestureFaces, poseAt } from './gesture';
import { wallLayout } from './wall-layout';
import { landedExtent } from './pan';

/**
 * The 1:1 component at the structure layer. The cover on the pulled record is
 * asserted with the faces that carry it (D2: the right face).
 */

const seat = (id: string, coverUrl: string | null, spineColour: string | null = '#31788a'): WallSeat => ({
  id,
  section: 'S',
  label: id,
  title: `Title ${id}`,
  artist: `Artist ${id}`,
  spineColour,
  coverUrl,
  backUrl: null,
  labelName: null,
  catalogNumber: null,
});

const view = { x: 0, y: 0, width: 960, height: 760 };
const render = (
  seats: WallSeat[],
  pull: Parameters<typeof WallLabelled>[0]['pull'] | Parameters<typeof WallLabelled>[0]['pulls'],
  labels?: boolean,
  minWidth?: number,
) =>
  renderToStaticMarkup(
    Array.isArray(pull) ? (
      <WallLabelled seats={seats} pulls={pull} labels={labels} minWidth={minWidth} />
    ) : (
      <WallLabelled seats={seats} pull={pull as PullState | null} labels={labels} minWidth={minWidth} />
    ),
  );

describe('what distinguishes a spine at rest (§11.1)', () => {
  /**
   * Width is the only distinguishing mark derived from the record, and it
   * hashes the id — **never anything mutable.** A title or a label in the hash
   * would give a record a new thickness on rename, and a slug would give two
   * records the same thickness for sharing a name. So: same id, same width,
   * whatever else differs; different ids, widths as the hash gives them.
   */
  const widthOf = (html: string, id: string) => {
    const seat = html.slice(html.indexOf(`data-seat="${id}"`));
    const points = /data-spine=""[^>]*points="([^"]+)"/.exec(seat)?.[1] ?? '';
    const [tl, tr] = points.split(' ').map((p) => p.split(',').map(Number));
    return tr[0] - tl[0];
  };

  it('gives a seat its width from the id alone — label and colour change nothing', () => {
    const a = render([{ ...seat('r1', null), label: 'One', spineColour: '#111111' }], null);
    const b = render([{ ...seat('r1', 'https://c/x.jpg'), label: 'Two · Different', spineColour: null }], null);
    expect(widthOf(a, 'r1')).toBe(widthOf(b, 'r1'));
  });

  it('does not read the label: two seats with one label and two ids differ where the hash says so', () => {
    const html = render(
      [
        { ...seat('r1', null), label: 'Same' },
        { ...seat('r2', null), label: 'Same' },
      ],
      null,
    );
    /* r1 hashes to 21 and r2 to 22 — a label-fed hash would make these equal. */
    expect(widthOf(html, 'r1')).not.toBe(widthOf(html, 'r2'));
  });
});

describe('5b’s two faces at rest (D2): three faces per record, filled in paper for occlusion', () => {
  it('draws top, right and front per seat, the top a step lighter, all paper', () => {
    const html = render([seat('a', null), seat('b', null)], null);
    const seatA = html.slice(html.indexOf('data-seat="a"'), html.indexOf('data-seat="b"'));
    for (const face of ['top', 'right', 'front']) {
      expect(seatA, `face ${face}`).toContain(`data-face="${face}"`);
    }
    expect(seatA).toContain(`data-face="top" points="`);
    expect(seatA).toContain(`fill="${TOP_FILL}"`);
    expect(seatA).toContain(`fill="${FACE_FILL}"`);
    /*
      Paper, not none: the painter's order only occludes with opaque faces.
      Scoped to the FACES — §11.33's focus mark is an unfilled outline on the
      top face, and it is not a face.
    */
    for (const face of ['top', 'right', 'front']) {
      const polygon = new RegExp(`<polygon[^>]*data-face="${face}"[^>]*>`).exec(seatA)?.[0] ?? '';
      expect(polygon, `face ${face} is opaque`).not.toContain('fill="none"');
    }
    expect(html).toContain(`data-furniture="shelf-top" points="`);
    expect(html).toContain(`fill="${PLANE_FILL}"`);
  });

  it('paints the moving record where the separating-plane sort puts it: between its neighbours while it overlaps the row, last once past it (§11.20)', () => {
    const three = [seat('a', null), seat('b', null), seat('c', null)];
    const view = { x: 0, y: 0, width: 960, height: 760 };
    const early = renderToStaticMarkup(<WallLabelled seats={three} pulls={[{ id: 'b', direction: 'out', ms: 0 }]} view={view} />);
    expect(early.indexOf('data-pulled="b"')).toBeGreaterThan(early.indexOf('data-seat="a"'));
    expect(early.indexOf('data-pulled="b"'), 'the neighbour at larger x is nearer until the record is clear').toBeLessThan(early.indexOf('data-seat="c"'));
    const clear = renderToStaticMarkup(<WallLabelled seats={three} pulls={[{ id: 'b', direction: 'out', ms: OUT_MS }]} view={view} />);
    expect(clear.indexOf('data-pulled="b"')).toBeGreaterThan(clear.indexOf('data-seat="c"'));
  });

  it('hands the sort the PHYSICAL box for the moving record — the rule, asserted at the sort’s input, since nothing else stops the grown box being passed again', () => {
    /*
      Three sets of bounds for three purposes, each right for its own: the
      faces are DRAWN grown; the box is SORTED at the record's own size,
      travelled and rotated; the plan is CLEARED against the neighbours by
      SAT on that same physical box. The grown box reaches back into the row
      on y at a partial angle and loses its separating plane, so a sort on
      it falls to the centroid — the invalid order.
    */
    const spy = vi.spyOn(paintSort, 'paintOrder');
    try {
      const row = Array.from({ length: 20 }, (_, i) => seat(`r${i}`, null));
      const placed = layoutRow(row.map(({ id, section }) => ({ id, section })), 0).find((p) => p.id === 'r4');
      expect(placed).toBeDefined();
      if (placed === undefined) return;
      for (const ms of [900, SWING_MS]) {
        spy.mockClear();
        renderToStaticMarkup(<WallLabelled seats={row} pulls={[{ id: 'r4', direction: 'out', ms }]} view={{ x: 0, y: 0, width: 1400, height: 900 }} />);
        const inputs = spy.mock.calls.flatMap(([objects]) => objects).filter((o) => o.id === 'r4');
        expect(inputs.length, `the moving record reaches the sort once at ${ms}`).toBe(1);
        const physical = gestureFaces(placed, { ...poseAt(ms), scale: 1 }).sortBounds;
        const { id: _id, moving: _moving, ...given } = inputs[0] as typeof inputs[0] & { moving?: boolean };
        void _id;
        void _moving;
        expect(given, `at ${ms}`).toEqual(physical);
        expect(given.z1, `the record's own height at ${ms}`).toBeCloseTo(placed.z + SPINE_HEIGHT, 9);
      }
    } finally {
      spy.mockRestore();
    }
  });

  it('paints the growing record over the whole of a long row: the sort sees the physical box, not the grown one (§11.25 with §11.21)', () => {
    /* Twenty on a shelf, the fifth pulled: the far end of the row is 255 units to the right of it. */
    const row = Array.from({ length: 20 }, (_, i) => seat(`r${i}`, null));
    const view = { x: 0, y: 0, width: 1400, height: 900 };
    for (const ms of [900, SWING_MS, OUT_MS]) {
      const html = renderToStaticMarkup(<WallLabelled seats={row} pulls={[{ id: 'r4', direction: 'out', ms }]} view={view} />);
      const pulled = html.indexOf('data-pulled="r4"');
      const lastSeat = Math.max(...row.map((r) => html.lastIndexOf(`data-seat="${r.id}"`)));
      const lastPiece = html.lastIndexOf('data-piece=');
      expect(pulled, `over the row at ${ms}`).toBeGreaterThan(lastSeat);
      expect(pulled, `over the furniture at ${ms}`).toBeGreaterThan(lastPiece);
    }
  });

  it('renders the moving record on its first frame — three faces, four corners each — the test the probe’s comparator failed', () => {
    const html = renderToStaticMarkup(
      <WallLabelled seats={[seat('a', null), seat('b', null)]} pulls={[{ id: 'a', direction: 'out', ms: 0 }]} view={{ x: 0, y: 0, width: 960, height: 760 }} />,
    );
    const pulled = html.slice(html.indexOf('data-pulled="a"'));
    for (const face of ['top', 'front']) {
      const points = new RegExp(`data-face="${face}"[^>]*points="([^"]+)"`).exec(pulled)?.[1] ?? '';
      expect(points.split(' '), `${face} has four corners`).toHaveLength(4);
    }
    expect(pulled).toContain('data-field=""');
    expect(html).not.toContain('data-seat="a"');
  });

  it('carries the pulled record’s field and cover on its right face, and no caption', () => {
    const html = render([seat('a', null), seat('b', 'https://covers.test/b.jpg')], {
      id: 'b',
      direction: 'out',
      ms: OUT_MS,
    });
    const pulled = html.slice(html.indexOf('data-pulled="b"'));
    expect(pulled).toContain('data-face="top"');
    expect(pulled).toContain('data-face="front"');
    /* The right face is the field: a rect on the cover's plane, at the record's colour. */
    const field = /<rect[^>]*data-field[^>]*>/.exec(pulled)?.[0] ?? '';
    expect(field).not.toBe('');
    expect(field).not.toContain(`fill="${WALL_PAPER_HEX}"`);
    /* At the START of the pull the group is the face itself, entered from the far-top corner, local x toward the reader: un-mirrored. */
    const start = render([seat('a', null), seat('b', 'https://covers.test/b.jpg')], { id: 'b', direction: 'out', ms: 0 });
    expect(start.slice(start.indexOf('data-pulled="b"')), 'the cover’s group maps the face un-mirrored').toContain('<g transform="matrix(0.866');
    const g = pulled.slice(pulled.indexOf('<g transform="matrix('));
    const image = /<image[^>]*>/.exec(g)?.[0] ?? '';
    expect(image).toContain('data-cover="b"');
    expect(image).toContain('href="https://covers.test/b.jpg"');
    expect(image, 'own aspect, uncropped (§11.3)').toContain('preserveAspectRatio="xMidYMid meet"');
    const group = g.slice(0, g.indexOf('</g>'));
    expect(group, 'no text on a mirrored plane').not.toContain('<text');
  });

  it('fades the field over the full out-span (§11.2): the swing’s end is not yet the base, the finish’s end is — one ease over 1600, so colour lands with the record', () => {
    const record = seat('b', null);
    const fieldAt = (ms: number) => {
      const html = render([seat('a', null), record], { id: 'b', direction: 'out', ms });
      return /fill="([^"]+)"/.exec(/<rect[^>]*data-field[^>]*>/.exec(html.slice(html.indexOf('data-pulled="b"')))?.[0] ?? '')?.[1];
    };
    const ladder = recordLadder(record.spineColour);
    expect(fieldAt(0)).toBe(pullFill(0, ladder));
    expect(fieldAt(SWING_MS), 'at 1300 the record has 300ms of finish left, and so does its colour').not.toBe(pullFill(1, ladder));
    expect(fieldAt(OUT_MS)).toBe(pullFill(1, ladder));
    for (const ms of [400, 800, SWING_MS, 1450]) expect(fieldAt(ms), `at ${ms}`).toBe(pullFill(easeInOutCubic(ms / OUT_MS), ladder));
  });

  it('draws no cover for a record with none, and the field still arrives', () => {
    const html = render([seat('a', null)], { id: 'a', direction: 'out', ms: OUT_MS });
    expect(html).not.toContain('<image');
    expect(html).toContain('data-field');
  });
});

describe('the pulled record is the same object (D2)', () => {
  it('keeps its spine label on its front face while pulled', () => {
    const html = render([seat('a', null), seat('b', null)], { id: 'b', direction: 'out', ms: OUT_MS });
    const pulled = html.slice(html.indexOf('data-pulled="b"'));
    const group = pulled.slice(0, pulled.indexOf('</g>', pulled.indexOf('data-face="front"')));
    expect(group).toContain('data-label=""');
    expect(group).toContain('>b<');
  });
});

describe('the labelled wall renders at 1:1 — never above it, and (D1) never below it', () => {
  it('sizes the svg to its viewBox width in px, with no fluid or maximum width', () => {
    /*
      A seventeen-record wall over four shelves is a small drawing; at
      `width: 100%` it scaled UP until a record filled the screen. And a
      `max-width: 100%` scaled the 200 case DOWN below the 9px floor. D1: the
      wall is 1:1 and pans; the svg is exactly as wide as its drawing.
    */
    const html = render([seat('a', null), seat('b', null)], null);
    const svg = /<svg[^>]*data-wall="labelled"[^>]*>/.exec(html)?.[0] ?? '';
    const viewBox = /viewBox="([^"]+)"/.exec(svg)?.[1]?.split(' ').map(Number) ?? [];
    expect(viewBox).toHaveLength(4);
    expect(svg).toContain(`width:${viewBox[2]}px`);
    expect(svg).not.toContain('max-width');
    expect(svg, 'not a fluid width').not.toMatch(/[;"]width:100%/);
  });

  it('draws no labels when told the container cannot hold one record (§5’s guard)', () => {
    const html = render([seat('a', null)], null, false);
    expect(html).not.toContain('<text');
    expect(html).toContain('data-face="front"');
    expect(render([seat('a', null)], null)).toContain('<text');
  });
});

describe('the frame holds the whole drawing', () => {
  it('starts above the top row’s top faces, not at its front faces', () => {
    /*
      Framed on front faces only, the viewBox began 120px (D·sin30) below the
      top row's top faces and the scene ran off the top of the view. Every
      point of every face is inside the frame.
    */
    const html = render([seat('a', null), seat('b', null)], null);
    const svg = /<svg[^>]*data-wall="labelled"[^>]*>/.exec(html)?.[0] ?? '';
    const [minX, minY, w, h] = /viewBox="([^"]+)"/.exec(svg)?.[1]?.split(' ').map(Number) ?? [];
    /* Faces only: the planes run off both edges of the frame by design (§11.8). */
    const points = [...html.matchAll(/data-face="[a-z]+" points="([^"]+)"/g)].flatMap((m) =>
      m[1].split(' ').map((pair) => pair.split(',').map(Number)),
    );
    expect(points.length).toBeGreaterThan(0);
    for (const [x, y] of points) {
      expect(x).toBeGreaterThanOrEqual(minX);
      expect(y, 'no point above the frame').toBeGreaterThanOrEqual(minY);
      expect(x).toBeLessThanOrEqual(minX + w);
      expect(y).toBeLessThanOrEqual(minY + h);
    }
  });
});

describe('the record with no cover arrives at type, not at a swatch (§11.3, §11.7)', () => {
  it('sets title and artist large on a paper sleeve area over the field, with §6’s diagonal across it', () => {
    const html = render([seat('a', null), seat('b', null, null)], { id: 'b', direction: 'out', ms: OUT_MS });
    const pulled = html.slice(html.indexOf('data-pulled="b"'));
    /* The field is still painted — the same fill every pull arrives at — and the sleeve area sits on it. */
    expect(pulled).toContain('data-field');
    const sleeve = pulled.slice(pulled.indexOf('data-no-cover'));
    expect(sleeve, 'a sleeve area where the cover would be').not.toBe('');
    expect(sleeve).toContain('data-diagonal');
    expect(sleeve).toContain('Title b');
    expect(sleeve).toContain('Artist b');
    /*
      Two elements, governed differently on read-versus-drawn: the artist is
      READ and takes a scale size (LABEL, above); the title stands in for
      artwork, so it is a DRAWN element whose size derives from its box and
      its string, the way the 72 does in the year field.
    */
    expect(sleeve).toMatch(/text-label[^>]*>Artist b</);
    expect(sleeve.indexOf('Artist b')).toBeLessThan(sleeve.indexOf('Title b'));
    expect(sleeve).toMatch(/data-sleeve-title[^>]*font-size:[\d.]+px[^>]*>Title b</);
    expect(sleeve, 'a long title clips rather than escaping the sleeve').toContain('overflow-hidden');
    expect(sleeve, 'anchored at the top: the clip takes the tail, never the title’s first line').toContain('justify-start');
    expect(html.indexOf('<g transform="matrix(')).toBeLessThan(html.indexOf('data-no-cover'));
  });

  it('draws no sleeve area and no diagonal for a record that has a cover', () => {
    const html = render([seat('a', 'https://covers.test/a.jpg')], { id: 'a', direction: 'out', ms: OUT_MS });
    expect(html).not.toContain('data-no-cover');
    expect(html).not.toContain('data-diagonal');
    expect(html).toContain('data-cover="a"');
  });
});

describe('§11.33: hover and focus on a spine', () => {
  const html = () => render([seat('a', null), seat('b', null)], null);

  it('sinks the spine to §11.27’s 0.731 with hairlines at 0.588, and moves nothing', () => {
    /*
      A small version of the pull is still the pull: §11.19's gesture is the
      transition from the collection to a record, and a hover performing 10%
      of it says that transition is underway when nothing has been chosen.
      Motion of a record is the channel this page reserves for the pull.
    */
    const style = /<style data-spine-states[^>]*>([\s\S]*?)<\/style>/.exec(html())?.[1] ?? '';
    expect(style, 'the sunk surface').toContain('0.731');
    expect(style, 'hairlines recomputed against that ground').toContain('0.588');
    expect(style, 'no lift, offset or shadow').not.toMatch(/translate|scale|shadow/);
  });

  it('shows no count and no tooltip: the label is already on the face', () => {
    /*
      The far view's run shows a count because the far view withholds counts
      by design. The near view withholds nothing, so there is nothing to
      reveal and a tooltip would repeat the drawing.
    */
    const style = /<style data-spine-states[^>]*>([\s\S]*?)<\/style>/.exec(html())?.[1] ?? '';
    expect(style).not.toContain('data-run-label');
    expect(html()).not.toMatch(/<title>/);
  });

  it('puts the focus mark on the TOP face, not the front edge — 2px is 19% of a 10.4-unit face', () => {
    /*
      At that proportion the mark stops reading as an edge and starts reading
      as a spine of a different colour, which is the channel §11.28 spent the
      hover hairline correction protecting. The top face is 130 deep and no
      label crosses it.
    */
    const markup = html();
    const edge = /<polygon[^>]*data-spine-focus[^>]*>/.exec(markup)?.[0] ?? '';
    expect(edge, 'the focus mark is drawn').not.toBe('');
    expect(edge, '§11.30’s weight and value, unchanged').toContain('stroke-width="2"');
    expect(edge).toMatch(/oklch\(0\.18/);
    const style = /<style data-spine-states[^>]*>([\s\S]*?)<\/style>/.exec(markup)?.[1] ?? '';
    /* Drawn only on focus — hover and focus must differ (§11.30). */
    expect(style).toMatch(/\[data-spine-focus\][^{]*\{[^}]*opacity:\s*0/);
    expect(style).toMatch(/:focus-visible[^{]*\[data-spine-focus\][^}]*opacity:\s*1/);
    expect(style).not.toMatch(/:hover[^{]*\[data-spine-focus\][^}]*opacity:\s*1/);
  });

  it('takes the app’s oxblood focus ring off the shelf (§11.32)', () => {
    /*
      A focus ring is chrome the app applies everywhere without asking what it
      lands on; on a monochrome fixture it is the only colour on the page,
      arriving wherever the reader happens to tab.
    */
    const style = /<style data-spine-states[^>]*>([\s\S]*?)<\/style>/.exec(html())?.[1] ?? '';
    expect(style).toMatch(/outline:\s*none/);
    expect(html()).not.toMatch(/oklch\(0\.36/);
  });
});

describe('§11.34: an emptied seat draws its footprint', () => {
  it('draws the seat’s rectangle on the shelf’s top face where a record was displaced', () => {
    /*
      Position invariance was necessary and not sufficient: the seats held to
      the pixel and the drawing had nothing in it to read, so six matches
      looked like a shorter shelf rather than six records and eleven empty
      berths. A shape made of absences is only a shape if the absences are
      drawn.
    */
    const html = render([seat('a', null), { ...seat('b', null), empty: true }, seat('c', null)], null);
    /* A footprint carries the displaced record's id, so an E2E can count footprints among ITS records. The claim here — one per emptied seat — is unchanged. */
    const prints = [...html.matchAll(/data-footprint="[^"]+"/g)];
    expect(prints, 'one per emptied seat').toHaveLength(1);
    const tag = /<polygon[^>]*data-footprint="[^"]+"[^>]*>/.exec(html)?.[0] ?? '';
    /* Projected geometry, not a page rule: it is a polygon in the drawing, at 1px. */
    expect(tag).toContain('stroke-width="1"');
    expect(tag).toContain('fill="none"');
    expect(tag, '§11.27’s hairline').toMatch(/oklch\(0\.72/);
  });

  it('draws nothing for a seat that never held a record — a filtered seat is a fact about the filter, a never-filled one about the backlog (§8.1)', () => {
    /*
      At seventeen records the fixture has eighty seats, sixty-three of them
      never filled. Drawing those would turn the room-to-grow into a grid of
      vacancies; the three empty shelves stay blank.
    */
    const html = render([seat('a', null), seat('b', null)], null);
    expect(html).not.toContain('data-footprint');
  });

  it('counts one footprint per emptied seat, and none when nothing is filtered', () => {
    const none = render([seat('a', null), seat('b', null), seat('c', null)], null);
    expect([...none.matchAll(/data-footprint="[^"]+"/g)]).toHaveLength(0);
    const two = render(
      [seat('a', null), { ...seat('b', null), empty: true }, { ...seat('c', null), empty: true }, seat('d', null)],
      null,
    );
    expect([...two.matchAll(/data-footprint="[^"]+"/g)]).toHaveLength(2);
  });
});

describe('a filter empties seats rather than re-seating them (§11.12)', () => {
  const xOf = (html: string, id: string) => Number(/<polygon[^>]*data-face="front"[^>]*points="([\d.-]+),/.exec(html.slice(html.indexOf(`data-seat="${id}"`)))?.[1]);

  it('draws nothing for an empty seat — no faces, no anchor, no label — and holds every other seat in its place', () => {
    const full = render([seat('a', null), seat('b', null), seat('c', null)], null);
    const filtered = render([seat('a', null), { ...seat('b', null), empty: true }, seat('c', null)], null);
    expect(filtered).not.toContain('data-seat="b"');
    expect(filtered).not.toContain('href="/records/b"');
    expect(filtered).not.toContain('Title b');
    expect(filtered).toContain('data-seat="a"');
    expect(filtered).toContain('data-seat="c"');
    /* c's seat is where it was: the filter is a shape on the fixture, not a new fixture. */
    expect(xOf(filtered, 'c')).toBe(xOf(full, 'c'));
    /* The fixture is unchanged: the same pieces, the same faces. */
    expect(filtered.split('data-furniture=').length).toBe(full.split('data-furniture=').length);
  });

  it('gives the keyboard walk the seated records only, in seat order', () => {
    const html = render([seat('a', null), { ...seat('b', null), empty: true }, seat('c', null)], null);
    const tab = (id: string) => Number(/tabindex="(\d+)"/.exec(new RegExp(`<a [^>]*data-seat="${id}"[^>]*>`).exec(html)?.[0] ?? '')?.[1]);
    expect(tab('a')).toBe(1);
    expect(tab('c')).toBe(2);
  });
});

describe('spines are anchors inside the SVG (§11.8)', () => {
  it('wraps each seat’s faces and label in an <a> with the record’s route and the FULL title as its name', () => {
    const html = render([seat('a', null), seat('b', null)], null);
    const a = html.slice(html.indexOf('data-seat="a"'), html.indexOf('data-seat="b"'));
    const open = /<a [^>]*data-seat="a"[^>]*>/.exec(html)?.[0] ?? '';
    expect(open, 'the seat is an anchor').not.toBe('');
    expect(open).toContain('href="/records/a"');
    /* The face carries the truncated label; the accessible name carries the whole title. */
    expect(open).toContain('aria-label="Artist a · Title a"');
    for (const face of ['top', 'right', 'front']) expect(a).toContain(`data-face="${face}"`);
    expect(a).toContain('<text');
  });

});

describe('document order is seat order (§11.8) — asserted, because it holds only while seats vary along x alone', () => {
  it('lists a row’s seats in the DOM in seat order', () => {
    /* Within a row paint order and seat order agree, because seats are separated on x alone. */
    const many = Array.from({ length: 11 }, (_, i) => seat(`s${String(i).padStart(2, '0')}`, null));
    const html = render(many, null);
    const order = [...html.matchAll(/data-seat="([^"]+)"/g)].map((m) => m[1]);
    expect(order).toEqual(many.map((s) => s.id));
  });

  it('carries an explicit tabindex sequence in seat order across rows, where paint order and reading order separate (§11.23)', () => {
    /*
      Paint order interleaves rows by column (225 of extent against 198 of
      pitch), so document order is no longer the reading order across rows.
      The keyboard walk gets its own sequence: §11.8 preferred anchors to a
      parallel list because a list draws the identifying channel twice; a tab
      sequence draws nothing, so the argument is silent on it.
    */
    const many = Array.from({ length: 22 }, (_, i) => seat(`s${String(i).padStart(2, '0')}`, null));
    const html = render(many, null);
    const tab = (id: string) => Number(/tabindex="(\d+)"/.exec(new RegExp(`<a [^>]*data-seat="${id}"[^>]*>`).exec(html)?.[0] ?? '')?.[1]);
    expect(tab('s00')).toBe(1);
    expect(tab('s19')).toBe(20);
    expect(tab('s20'), 'the second row follows the first in the walk, though it precedes it in the DOM').toBe(21);
    expect(tab('s21')).toBe(22);
    expect(html.indexOf('data-seat="s20"')).toBeLessThan(html.indexOf('data-seat="s00"'));
  });

  it('puts a lower record before the one above it in the DOM — the painter’s order, which is no longer the reading order (with Design)', () => {
    /*
      §11.8's assertion has failed as designed: at the square seat a record's
      projected extent is 150 plus a 75px top face against a 198 pitch, so a
      lower record's top overpaints the bottom 27px of the record above it
      unless that one paints later. Either the pitch grows so rows do not
      overlap, or paint and reading order separate and the keyboard walk
      needs its own mechanism. Until then the DOM carries the paint order:
      each row in seat order, the rows interleaved by column.
    */
    const many = Array.from({ length: 22 }, (_, i) => seat(`s${String(i).padStart(2, '0')}`, null));
    const html = render(many, null);
    const order = [...html.matchAll(/data-seat="([^"]+)"/g)].map((m) => m[1]);
    expect(order.filter((id) => Number(id.slice(1)) < 20)).toEqual(many.slice(0, 20).map((s) => s.id));
    expect(order.indexOf('s20'), 'the record below s00 paints first').toBeLessThan(order.indexOf('s00'));
    expect(order.indexOf('s21')).toBeLessThan(order.indexOf('s01'));
    expect(order).not.toEqual(many.map((s) => s.id));
  });

  it('masks the tops of the records below a shelf: the shelf’s faces paint after every record of the row beneath, where they overlap (§11.23)', () => {
    /*
      A lower record's top face and the shelf above it overlap on screen by
      27px (225 of extent against 198 of pitch). The shelf must paint over
      the record's top, or the unit reads as rows floating in front of each
      other. The overlap is asserted too, so the order cannot pass vacuously.
    */
    const many = Array.from({ length: 22 }, (_, i) => seat(`s${String(i).padStart(2, '0')}`, null));
    const html = render(many, null);
    const shelfAbove = /<g data-piece="shelf">(?:(?!<\/g>)[\s\S])*?data-furniture="shelf-top" points="([^"]+)"/g;
    const shelves = [...html.matchAll(shelfAbove)].map((m) => ({ index: m.index ?? 0, points: m[1] }));
    const lower = html.indexOf('data-seat="s20"');
    const lowerTop = /data-seat="s20"[^>]*>[\s\S]*?data-face="top" points="([^"]+)"/.exec(html)?.[1] ?? '';
    const box = (pts: string) => {
      const xy = pts.split(' ').map((p) => p.split(',').map(Number));
      return { minX: Math.min(...xy.map((p) => p[0])), maxX: Math.max(...xy.map((p) => p[0])), minY: Math.min(...xy.map((p) => p[1])), maxY: Math.max(...xy.map((p) => p[1])) };
    };
    const top = box(lowerTop);
    const covering = shelves.filter((s) => {
      const b = box(s.points);
      return b.minX < top.maxX && b.maxX > top.minX && b.minY < top.maxY && b.maxY > top.minY;
    });
    expect(covering.length, 'a shelf top overlaps the lower record’s top on screen').toBeGreaterThan(0);
    for (const s of covering) expect(s.index, 'the shelf paints after the record it covers').toBeGreaterThan(lower);
  });

  it('interleaves the furniture with the records by the same order: the shelf above a row paints after that row’s records', () => {
    const many = Array.from({ length: 22 }, (_, i) => seat(`s${String(i).padStart(2, '0')}`, null));
    const html = render(many, null);
    const topShelfStrip = [...html.matchAll(/data-furniture="shelf-front"/g)].map((m) => m.index ?? 0);
    const lowerRowLast = html.indexOf('data-seat="s21"');
    expect(topShelfStrip.some((i) => i > lowerRowLast), 'a shelf strip after the lower row').toBe(true);
    /* The right upright paints after every seated record; the left before them. */
    const uprights = [...html.matchAll(/data-furniture="upright-front"/g)].map((m) => m.index ?? 0);
    expect(Math.max(...uprights)).toBeGreaterThan(html.lastIndexOf('data-seat='));
    expect(Math.min(...uprights)).toBeLessThan(html.indexOf('data-seat='));
  });
});

describe('the drawing is never smaller than the region that shows it', () => {
  it('widens the frame to the container; the unit does not lengthen', () => {
    const narrow = render([seat('a', null)], null, true);
    const narrowBox = /viewBox="([^"]+)"/.exec(narrow)?.[1]?.split(' ').map(Number) ?? [];
    const wide = render([seat('a', null)], null, true, narrowBox[2] + 1000);
    const box = /viewBox="([^"]+)"/.exec(wide)?.[1]?.split(' ').map(Number) ?? [];
    expect(box[2]).toBe(narrowBox[2] + 1000);
    const furniture = (h: string) => [...h.matchAll(/data-furniture="[a-z-]+" points="([^"]+)"/g)].map((m) => m[1]);
    expect(furniture(wide), 'the fixture is the fixture at any width').toEqual(furniture(narrow));
  });
});

describe('two records can be moving at once — the arrows’ slide (§11.8)', () => {
  it('draws a returning record and an arriving one as their own elements, both seats emptied', () => {
    const html = render([seat('a', null), seat('b', null), seat('c', null)], [
      { id: 'b', direction: 'back', ms: 250 },
      { id: 'c', direction: 'out', ms: 400 },
    ]);
    expect(html).toContain('data-pulled="b"');
    expect(html).toContain('data-pulled="c"');
    expect(html).not.toContain('data-seat="b"');
    expect(html).not.toContain('data-seat="c"');
    expect(html).toContain('data-seat="a"');
  });
});

describe('the pulled record is the gesture’s solid, drawn where the sort puts it (§11.19–§11.21)', () => {
  const two = [seat('a', null), seat('b', null)];
  const at = (ms: number, direction: 'out' | 'back' = 'out') =>
    renderToStaticMarkup(<WallLabelled seats={two} pulls={[{ id: 'a', direction, ms }]} view={view} />);
  const pulledOf = (html: string) => html.slice(html.indexOf('data-pulled="a"'));
  const placed = layoutRow([{ id: 'a', section: 'S' }, { id: 'b', section: 'S' }], 0)[0];

  it('draws the three faces gestureFaces gives at that time — seated at 0, exactly', () => {
    const faces = gestureFaces(placed, poseAt(0));
    const html = pulledOf(at(0));
    expect(html).toContain(`data-face="front" points="${points(faces.spine)}"`);
    expect(html).toContain(`data-face="top" points="${points(faces.top)}"`);
    expect(/<g transform="([^"]+)"[^>]*data-landing/.exec(html)?.[1]).toBe(faces.coverMatrix);
    expect(html).toContain(`points="${points(frontFace(placed))}"`);
    expect(at(0)).not.toContain('data-seat="a"');
  });

  it('carries the cover matrix and the label’s plane through the swing and the finish — the transforms exactly as ruled, nothing drifting (§11.22)', () => {
    for (const ms of [546, 900, SWING_MS, SWING_MS + 150, OUT_MS]) {
      const faces = gestureFaces(placed, poseAt(ms));
      const html = pulledOf(at(ms));
      expect(/<g transform="([^"]+)"[^>]*data-landing/.exec(html)?.[1], `cover at ${ms}`).toBe(faces.coverMatrix);
      expect(/<text[^>]*transform="([^"]+)"/.exec(html)?.[1], `label at ${ms}`).toBe(faces.labelMatrix);
      expect(html, `spine at ${ms}`).toContain(`data-face="front" points="${points(faces.spine)}"`);
    }
  });

  it('lands as a 560 square with no shear: the cover matrix is axis-aligned at 1600ms, and the field rect is DEPTH × SPINE_HEIGHT in its own plane', () => {
    const html = pulledOf(at(OUT_MS));
    const [a, b, c, d] = (/<g transform="matrix\(([^)]+)\)"[^>]*data-landing/.exec(html)?.[1] ?? '').split(' ').map(Number);
    expect(b).toBeCloseTo(0, 9);
    expect(c).toBeCloseTo(0, 9);
    expect(a * DEPTH).toBeCloseTo(DEPTH * GROWTH, 6);
    expect(d * SPINE_HEIGHT).toBeCloseTo(SPINE_HEIGHT * GROWTH, 6);
    expect(a * DEPTH, '§11.19: 560 square').toBeCloseTo(560, 6);
    const field = /<rect[^>]*data-field=""[^>]*>/.exec(html)?.[0] ?? '';
    expect(Number(/width="([^"]+)"/.exec(field)?.[1])).toBe(DEPTH);
    expect(Number(/height="([^"]+)"/.exec(field)?.[1])).toBe(SPINE_HEIGHT);
    expect(html).not.toContain('opacity="0"');
  });

  it('carries the pan’s clearance as a translate on the whole moving record — none at rest, the shift at the landing, the faces themselves untouched (§11.26)', () => {
    const rest = /<g[^>]*data-pulled="a"[^>]*>/.exec(at(0))?.[0] ?? '';
    expect(rest).not.toContain('transform=');
    for (const ms of [900, SWING_MS, OUT_MS]) {
      const group = /<g[^>]*data-pulled="a"[^>]*>/.exec(at(ms))?.[0] ?? '';
      const [dx, dy] = recordOffset(placed, { id: 'a', direction: 'out', ms });
      expect(group, `at ${ms}`).toContain(`transform="translate(${dx} ${dy})"`);
      /* The polygons inside are the gesture's own points: the offset is the group's, not the geometry's. */
      const faces = gestureFaces(placed, poseAt(ms));
      expect(pulledOf(at(ms))).toContain(`points="${points(faces.top)}"`);
    }
  });

  it('the return is the out reversed: the same drawing at the mirrored time', () => {
    const back = at(RETURN_MS * 0.25, 'back');
    const out = at(OUT_MS * 0.75, 'out');
    const matrix = (html: string) =>
      (/<g transform="matrix\(([^)]+)\)"[^>]*data-landing/.exec(pulledOf(html))?.[1] ?? '').split(' ').map(Number);
    matrix(back).forEach((v, i) => expect(v, `entry ${i}`).toBeCloseTo(matrix(out)[i], 6));
  });

  it('lays the no-cover sleeve out at its landed size and scales it into the growing face — exact at the end', () => {
    const html = pulledOf(at(OUT_MS));
    const sleeve = /<g data-no-cover=""[\s\S]*?<g transform="([^"]+)"/.exec(html)?.[1] ?? '';
    expect(sleeve).toContain(`scale(${1 / GROWTH})`);
    expect(html).toMatch(/data-sleeve-title=""[^>]*style="[^"]*font-size:\s*\d+px/);
    expect(ROTATION_START).toBe(0.42);
  });
});

describe('the frame holds the landing (§11.22): the pan needs somewhere to pan to', () => {
  it('grows the viewBox to include the pulled record’s landed extent, and is the seated frame when nothing moves', () => {
    const two = [seat('a', null), seat('b', null)];
    const seated = wallLayout(two.map((s) => ({ id: s.id, section: 'S' })), [], 0, 0).frame;
    const pulling = wallLayout(two.map((s) => ({ id: s.id, section: 'S' })), [{ id: 'a' }], 0, 0).frame;
    const placed = layoutRow([{ id: 'a', section: 'S' }], 0)[0];
    const extent = landedExtent(placed);
    const [sx, sy, sw, sh] = seated.viewBox.split(' ').map(Number);
    const [px, py, pw, ph] = pulling.viewBox.split(' ').map(Number);
    expect(px).toBeLessThanOrEqual(extent.minX);
    expect(py).toBeLessThanOrEqual(extent.minY);
    expect(px + pw).toBeGreaterThanOrEqual(extent.maxX);
    expect(py + ph).toBeGreaterThanOrEqual(extent.maxY);
    expect(px, 'the landing lies left of the seated frame, so the frame grows there').toBeLessThan(sx);
    expect(sy).toBe(sy);
    expect(sw).toBeGreaterThan(0);
    expect(sh).toBeGreaterThan(0);
    /* The rendered svg carries the grown frame while the record is out. */
    const html = renderToStaticMarkup(<WallLabelled seats={two} pulls={[{ id: 'a', direction: 'out', ms: 10 }]} />);
    expect(/viewBox="([^"]+)"/.exec(html)?.[1]).toBe(pulling.viewBox);
  });
});
