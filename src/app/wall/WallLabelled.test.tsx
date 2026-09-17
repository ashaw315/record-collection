import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { WallLabelled } from './WallLabelled';
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
