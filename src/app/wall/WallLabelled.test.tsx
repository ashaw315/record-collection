import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { WallLabelled } from './WallLabelled';
import type { WallSeat } from './shelf-runs';
import { PULLED_SIZE, PULL_OFFSET_X } from './pull-geometry';
import { SPINE_WIDTH_MAX } from './geometry';

/**
 * 8a §11.3: pulled, the record shows its cover — uncropped, at its own aspect,
 * on a field of the record's colour. "The pulled state is the one surface in
 * the app that can show a whole sleeve, so it shows one."
 *
 * Structure only, at this layer: the image exists exactly when a record with a
 * cover is pulled, is fitted (`meet`, never `slice`) into the pulled square,
 * and sits over the field rather than replacing it.
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

describe('the cover on the pulled record (§11.3)', () => {
  it('draws the cover fitted into the pulled square, over the field', () => {
    const html = render([seat('a', null), seat('b', 'https://covers.test/b.jpg')], {
      id: 'b',
      direction: 'out',
      progress: 1,
    });

    const image = /<image[^>]*>/.exec(html)?.[0] ?? '';
    expect(image, 'an <image> for the pulled cover').not.toBe('');
    expect(image).toContain('data-cover="b"');
    expect(image).toContain('href="https://covers.test/b.jpg"');
    expect(image, 'own aspect, uncropped').toContain('preserveAspectRatio="xMidYMid meet"');
    expect(image).toContain(`width="${PULLED_SIZE}"`);
    expect(image).toContain(`height="${PULLED_SIZE}"`);
    expect(image).toContain(`x="${1 * SPINE_WIDTH_MAX + PULL_OFFSET_X}"`);
    expect(image).toContain('y="0"');

    /* Over the field: the polygon precedes the image in paint order. */
    expect(html.indexOf('data-pulled="b"')).toBeLessThan(html.indexOf('data-cover="b"'));
  });

  it('draws no cover for a record that has none, and none at rest', () => {
    expect(render([seat('a', null)], { id: 'a', direction: 'out', progress: 1 })).not.toContain(
      '<image',
    );
    expect(render([seat('a', 'https://covers.test/a.jpg')], null)).not.toContain('<image');
  });

  it('arrives with the colour: the cover’s opacity is the pull’s eased value', () => {
    /* At 0 it is not there to see; at 1 it is whole. One curve, not a pop-in. */
    const at = (progress: number) =>
      /<image[^>]*opacity="([^"]+)"/.exec(
        render([seat('a', 'https://covers.test/a.jpg')], { id: 'a', direction: 'out', progress }),
      )?.[1];
    expect(Number(at(0))).toBe(0);
    expect(Number(at(0.5))).toBeCloseTo(0.875, 3);
    expect(Number(at(1))).toBe(1);
  });
});

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
    const points = /data-spine="" points="([^"]+)"/.exec(seat)?.[1] ?? '';
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
