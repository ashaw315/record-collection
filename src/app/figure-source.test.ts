import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { construction } from './records/[id]/construction';
import { ownFitViewBox } from './records/[id]/own-fit';
import { MIN_FACE_WIDTH } from './records/[id]/ornament';
import { clearing, figureSource } from './figure-source';

/**
 * §T.6: "Every figure in the app is drawn from one record, the one in the
 * collection whose construction clears §29's 6px at the smallest height, the
 * oldest where two tie." And why: "The smallest clearing height in a growing
 * set can only fall, so adding a record never removes a figure. The source
 * names no screen, so re-sorting, filtering and paging never do either."
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
  it('is the record whose construction clears at the smallest height', () => {
    const least = Math.min(...ids.map((id) => clearing(id).height));
    const source = figureSource(collection);
    expect(source?.clearing).toBe(least);
    expect(clearing(source?.id ?? '').height).toBe(least);
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

  /* "Adding a record never removes a figure": the threshold a figure must clear never rises as the collection grows. */
  it('has a clearing height that never rises as records are added', () => {
    let threshold = Infinity;
    for (let n = 1; n <= collection.length; n += 1) {
      const next = figureSource(collection.slice(0, n))?.clearing ?? Infinity;
      expect(next, `after record ${n}`).toBeLessThanOrEqual(threshold);
      threshold = next;
    }
  });
});
