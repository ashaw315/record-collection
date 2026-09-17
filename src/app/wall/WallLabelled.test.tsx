import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { WallLabelled, type PullState } from './WallLabelled';
import { WALL_PAPER_HEX } from './pull-colour';
import { FACE_FILL, PLANE_FILL, TOP_FILL } from './WallOverview';
import type { WallSeat } from './shelf-runs';

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
    /* Paper, not none: the painter's order only occludes with opaque faces. */
    expect(seatA).not.toContain('fill="none"');
    expect(html).toContain(`data-plane="" points="`);
    expect(html).toContain(`fill="${PLANE_FILL}"`);
  });

  it('carries the pulled record’s field and cover on its right face, and no caption', () => {
    const html = render([seat('a', null), seat('b', 'https://covers.test/b.jpg')], {
      id: 'b',
      direction: 'out',
      progress: 1,
    });
    const pulled = html.slice(html.indexOf('data-pulled="b"'));
    expect(pulled).toContain('data-face="top"');
    expect(pulled).toContain('data-face="front"');
    /* The right face is the field: a rect on the cover's plane, at the record's colour. */
    const field = /<rect[^>]*data-field[^>]*>/.exec(pulled)?.[0] ?? '';
    expect(field).not.toBe('');
    expect(field).not.toContain(`fill="${WALL_PAPER_HEX}"`);
    const g = pulled.slice(pulled.indexOf('<g transform="matrix('));
    /* Entered from the near-top corner: un-mirrored (§11.7 puts type on this face). */
    expect(g, 'the cover’s group maps the face un-mirrored').toContain('matrix(0.866');
    const image = /<image[^>]*>/.exec(g)?.[0] ?? '';
    expect(image).toContain('data-cover="b"');
    expect(image).toContain('href="https://covers.test/b.jpg"');
    expect(image, 'own aspect, uncropped (§11.3)').toContain('preserveAspectRatio="xMidYMid meet"');
    const group = g.slice(0, g.indexOf('</g>'));
    expect(group, 'no text on a mirrored plane').not.toContain('<text');
  });

  it('draws no cover for a record with none, and the field still arrives', () => {
    const html = render([seat('a', null)], { id: 'a', direction: 'out', progress: 1 });
    expect(html).not.toContain('<image');
    expect(html).toContain('data-field');
  });
});

describe('the pulled record is the same object (D2)', () => {
  it('keeps its spine label on its front face while pulled', () => {
    const html = render([seat('a', null), seat('b', null)], { id: 'b', direction: 'out', progress: 1 });
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
    const html = render([seat('a', null), seat('b', null, null)], { id: 'b', direction: 'out', progress: 1 });
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
    expect(sleeve).toMatch(/data-sleeve-title[^>]*font-size:\d+px[^>]*>Title b</);
    expect(sleeve, 'a long title clips rather than escaping the sleeve').toContain('overflow-hidden');
    expect(sleeve, 'anchored at the top: the clip takes the tail, never the title’s first line').toContain('justify-start');
    expect(html.indexOf('<g transform="matrix(')).toBeLessThan(html.indexOf('data-no-cover'));
  });

  it('draws no sleeve area and no diagonal for a record that has a cover', () => {
    const html = render([seat('a', 'https://covers.test/a.jpg')], { id: 'a', direction: 'out', progress: 1 });
    expect(html).not.toContain('data-no-cover');
    expect(html).not.toContain('data-diagonal');
    expect(html).toContain('data-cover="a"');
  });
});

describe('spines are anchors inside the SVG (§11.8)', () => {
  it('wraps each seat’s faces in an <a> with the record’s route and the FULL title as its name', () => {
    const html = render([seat('a', null), seat('b', null)], null);
    const a = html.slice(html.indexOf('data-seat="a"'), html.indexOf('data-seat="b"'));
    const open = /<a [^>]*data-seat="a"[^>]*>/.exec(html)?.[0] ?? '';
    expect(open, 'the seat is an anchor').not.toBe('');
    expect(open).toContain('href="/records/a"');
    /* The face carries the truncated label; the accessible name carries the whole title. */
    expect(open).toContain('aria-label="Artist a · Title a"');
    for (const face of ['top', 'right', 'front']) expect(a).toContain(`data-face="${face}"`);
  });

});

describe('document order is seat order (§11.8) — asserted, because it holds only while seats vary along x alone', () => {
  it('lists the seats in the DOM in seat order, rows top to bottom, with no tabindex', () => {
    /*
      SVG has no z-index: paint order is document order, and document order
      is what a keyboard walks. The two agree today because seats within a
      row vary only along x. The day a row's seats vary in depth, THIS fails
      rather than the reading order silently going wrong.
    */
    const many = Array.from({ length: 11 }, (_, i) => seat(`s${String(i).padStart(2, '0')}`, null));
    const html = render(many, null);
    const order = [...html.matchAll(/data-seat="([^"]+)"/g)].map((m) => m[1]);
    expect(order).toEqual(many.map((s) => s.id));
    expect(html, 'no tabindex — document order serves the reader').not.toContain('tabindex');
  });
});

describe('the plane is the pan extent (§11.8)', () => {
  it('widens the drawing to the container when the container is wider, and the planes run past both edges', () => {
    const narrow = render([seat('a', null)], null, true);
    const narrowBox = /viewBox="([^"]+)"/.exec(narrow)?.[1]?.split(' ').map(Number) ?? [];
    const wide = render([seat('a', null)], null, true, narrowBox[2] + 1000);
    const svg = /<svg[^>]*data-wall="labelled"[^>]*>/.exec(wide)?.[0] ?? '';
    const box = /viewBox="([^"]+)"/.exec(svg)?.[1]?.split(' ').map(Number) ?? [];
    expect(box[2]).toBe(narrowBox[2] + 1000);
    expect(svg).toContain(`width:${box[2]}px`);

    const plane = /data-plane="" points="([^"]+)"/.exec(wide)?.[1] ?? '';
    const xs = plane.split(' ').map((pair) => Number(pair.split(',')[0]));
    expect(Math.min(...xs), 'off the left edge').toBeLessThan(box[0]);
    expect(Math.max(...xs), 'off the right edge').toBeGreaterThan(box[0] + box[2]);
  });
});

describe('two records can be moving at once — the arrows’ slide (§11.8)', () => {
  it('draws a returning record and an arriving one as their own elements, both seats emptied', () => {
    const html = render([seat('a', null), seat('b', null), seat('c', null)], [
      { id: 'b', direction: 'back', progress: 0.3 },
      { id: 'c', direction: 'out', progress: 0.3 },
    ]);
    expect(html).toContain('data-pulled="b"');
    expect(html).toContain('data-pulled="c"');
    expect(html).not.toContain('data-seat="b"');
    expect(html).not.toContain('data-seat="c"');
    expect(html).toContain('data-seat="a"');
  });
});
