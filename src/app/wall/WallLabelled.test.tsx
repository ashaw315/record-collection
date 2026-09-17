import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { WallLabelled } from './WallLabelled';
import { WALL_PAPER_HEX } from './pull-colour';
import { FACE_FILL, PLANE_FILL, TOP_FILL } from './WallOverview';
import type { WallSeat } from './shelf-runs';

/**
 * The 1:1 component at the structure layer. The cover on the pulled record is
 * asserted with the faces that carry it (D2: the right face).
 */

const seat = (id: string, coverUrl: string | null): WallSeat => ({
  id,
  section: 'S',
  label: id,
  spineColour: '#31788a',
  coverUrl,
});

const render = (seats: WallSeat[], pull: Parameters<typeof WallLabelled>[0]['pull']) =>
  renderToStaticMarkup(<WallLabelled seats={seats} pull={pull} />);

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
    const g = pulled.slice(pulled.indexOf('<g transform="matrix(-'));
    expect(g, 'the cover’s group uses D2’s mirrored matrix').toContain('matrix(-0.866');
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

describe('the labelled wall renders at 1:1 and never above it (5b §5)', () => {
  it('sizes the svg to its viewBox width in px, capped by its container', () => {
    /*
      A seventeen-record wall over four shelves is a small drawing; left to
      `width: 100%` it scaled UP to fill two-thirds of a 1440 viewport and a
      record filled the screen, labels at forty pixels. §5's rule is that
      labels render at 1:1 — which cuts both ways.
    */
    const html = render([seat('a', null), seat('b', null)], null);
    const svg = /<svg[^>]*data-wall="labelled"[^>]*>/.exec(html)?.[0] ?? '';
    const viewBox = /viewBox="([^"]+)"/.exec(svg)?.[1]?.split(' ').map(Number) ?? [];
    expect(viewBox).toHaveLength(4);
    expect(svg).toContain(`width:${viewBox[2]}px`);
    expect(svg).toContain('max-width:100%');
    expect(svg, 'not a fluid width').not.toMatch(/[;"]width:100%/);
  });
});
