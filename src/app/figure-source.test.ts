import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { construction } from './records/[id]/construction';
import { ownFitViewBox } from './records/[id]/own-fit';
import { MIN_FACE_WIDTH } from './records/[id]/ornament';
import { clearing, figureSource, firstDrawingWidth } from './figure-source';
import { FIGURE_FRACTION, SIDEBAR } from './sidebar-layout';

/**
 * §T.6, step 115: "The source record is the one whose figure first draws at
 * the narrowest window, which folds in its construction's aspect." And why:
 * "That width can only fall as records are added, so adding a record never
 * removes a figure." The oldest where two tie. The source names no screen,
 * so re-sorting, filtering and paging never move it.
 *
 * Withdrawn by the same step: the source by smallest clearing height. The
 * figure is sized by width and its height follows its aspect, so a record
 * that clears lower but draws wider needs a wider window, and choosing it
 * took the figure away at windows where it had drawn (The Doors, 10 Oct).
 */
const at = (n: number) => new Date(Date.UTC(2026, 0, 1 + n));

describe('a construction’s clearing height', () => {
  /* Fails against a height taken from the box alone: the narrowest side face is what §29 measures. */
  it('is the height at which its narrowest side face is 6 wide, and at that height it is', () => {
    for (let i = 0; i < 50; i += 1) {
      const id = randomUUID();
      const scene = construction(id);
      /* The still's own box: a figure drawn `height` tall is this box drawn `height` tall. */
      const [, , boxWidth, boxHeight] = ownFitViewBox(scene).split(' ').map(Number);
      const { height, aspect } = clearing(id);
      const scale = height / boxHeight;
      let narrowest = Infinity;
      for (const form of scene.forms) for (const face of form.faces) {
        if (face.kind === 'top') continue;
        const xs = face.points.map((p) => p[0]);
        narrowest = Math.min(narrowest, (Math.max(...xs) - Math.min(...xs)) * scale);
      }
      expect(narrowest, id).toBeCloseTo(MIN_FACE_WIDTH, 6);
      expect(aspect, id).toBeCloseTo(boxWidth / boxHeight, 9);
    }
  });

  it('is the same every time for one id', () => {
    const id = randomUUID();
    expect(clearing(id)).toEqual(clearing(id));
  });
});

describe('the one source record', () => {
  const ids = Array.from({ length: 40 }, () => randomUUID());
  const collection = ids.map((id, i) => ({ id, createdAt: at(i) }));

  it('is none for an empty collection', () => {
    expect(figureSource([])).toBeNull();
  });

  /* Fails against the newest record, the first record, or the page's first. */
  it('is the record whose figure first draws at the narrowest window', () => {
    const least = Math.min(...ids.map((id) => firstDrawingWidth(clearing(id))));
    const source = figureSource(collection);
    expect(source?.firstDraws).toBe(least);
    expect(firstDrawingWidth(clearing(source?.id ?? ''))).toBe(least);
  });

  /* The window at which a figure of 0.328 of the content column is as tall as the clearing height. */
  it('counts a first-drawing width as the sidebar’s 417 and the column whose figure is the clearing height tall', () => {
    expect(firstDrawingWidth({ height: 172.4, aspect: 1.19 })).toBeCloseTo(SIDEBAR.taken + (172.4 * 1.19) / FIGURE_FRACTION, 6);
    expect(firstDrawingWidth({ height: 172.4, aspect: 1.19 }), 'the collection’s source before The Doors').toBeCloseTo(1042.5, 0);
    expect(firstDrawingWidth({ height: 159.6, aspect: 1.362 }), 'The Doors').toBeCloseTo(1079.7, 0);
  });

  /*
    The case that showed it. Fails against a selection on clearing height
    alone (`c.height < best.clearing.height`), which picks the lower-clearing
    record; and against the largest first-drawing width, which picks it too.
  */
  it('is not taken by a record that clears lower but draws wider', () => {
    const shapes: Record<string, { height: number; aspect: number }> = {
      'the standing source': { height: 172.4, aspect: 1.19 },
      'the newcomer, lower and wider': { height: 159.6, aspect: 1.362 },
    };
    const before = [{ id: 'the standing source', createdAt: at(1) }];
    const after = [...before, { id: 'the newcomer, lower and wider', createdAt: at(2) }];
    const measure = (id: string) => shapes[id];
    expect(shapes['the newcomer, lower and wider'].height, 'the precondition: the newcomer clears lower').toBeLessThan(shapes['the standing source'].height);
    expect(firstDrawingWidth(shapes['the newcomer, lower and wider']), 'the precondition: and first draws wider').toBeGreaterThan(firstDrawingWidth(shapes['the standing source']));
    for (const order of [after, [...after].reverse()]) {
      const picked = figureSource(order, measure);
      expect(
        picked?.id,
        `picked "${picked?.id}" (clears at ${picked?.clearing}, first draws at ${picked?.firstDraws.toFixed(1)}); it should have kept "the standing source" (clears at 172.4, first draws at ${firstDrawingWidth(shapes['the standing source']).toFixed(1)})`,
      ).toBe('the standing source');
    }
    expect(figureSource(after, measure)?.firstDraws, 'so the figure still draws where it drew').toBe(figureSource(before, measure)?.firstDraws);
  });

  /* Fails against a source that follows the order it is given: a re-sort is a different order of the same records. */
  it('does not depend on the order the records come in', () => {
    const source = figureSource(collection);
    expect(figureSource([...collection].reverse())).toEqual(source);
    expect(figureSource([...collection].sort((a, b) => a.id.localeCompare(b.id)))).toEqual(source);
  });

  /* Two records cannot share an id, so a tie is staged with the measure handed in. */
  it('takes the oldest where two tie', () => {
    const tie = [{ id: 'b', createdAt: at(5) }, { id: 'a', createdAt: at(2) }, { id: 'c', createdAt: at(9) }];
    const flat = () => ({ height: 200, aspect: 1 });
    expect(figureSource(tie, flat)?.id).toBe('a');
    expect(figureSource([...tie].reverse(), flat)?.id).toBe('a');
  });

  /* "Adding a record never removes a figure": the window a figure first draws at never rises as the collection grows. Fails against the smallest clearing height wherever a lower record draws wider. */
  it('has a first-drawing width that never rises as records are added', () => {
    let threshold = Infinity;
    for (let n = 1; n <= collection.length; n += 1) {
      const next = figureSource(collection.slice(0, n))?.firstDraws ?? Infinity;
      expect(next, `after record ${n}`).toBeLessThanOrEqual(threshold);
      threshold = next;
    }
  });
});
