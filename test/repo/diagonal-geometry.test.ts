import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { lineGeometry, type LineReading } from '../../e2e/diagonal-geometry';

/**
 * **The diagonal's reading, tested at the level the defect lived at (the coordinator, 10 Nov).** On gate 42824167411
 * sidebar-113:270 read the head-rule's start from `offsetTop`, a whole pixel, while the used top was 56.501156: the
 * end measured from 57 missed the header's rule by exactly 0.5 against a bound of under 0.5, and from the used top by
 * 0.0012. A record seeding that half-pixel source would become every parallel spec's source while it lived, so the
 * reading is tested with the geometry fed directly, no database. Fails against a version that rounds the start, or
 * reads `offsetTop` and `offsetLeft` in place of the used `top` and `left`.
 */
describe('lineGeometry', () => {
  /* The gate's own figures: header bottom 53, the offset parent's top 53, the head-rule 113 long at −30°. */
  const headRule: LineReading = { name: 'head-rule', parentLeft: 1054 - 417 + 100, parentTop: 53, clientLeft: 0, clientTop: 0, left: '220.25px', top: '56.501156px', a: Math.cos(-Math.PI / 6), b: Math.sin(-Math.PI / 6), length: 113, weight: '1px' };

  it('starts a line at its used left and top, fractions kept, so the end lands where the page drew it', () => {
    const g = lineGeometry(headRule);
    expect(g.y1).toBeCloseTo(53 + 56.501156, 6);
    expect(Math.abs(g.y2 - 53), 'the end against the header’s rule, the gate’s 0.5 case').toBeLessThan(0.01);
  });

  it('would miss by exactly 0.5 from the rounded start, which is the reading the gate had', () => {
    const rounded = lineGeometry({ ...headRule, top: '57px' });
    expect(Math.abs(rounded.y2 - 53)).toBeCloseTo(0.5, 6);
  });

  it('carries the angle and the name through unchanged', () => {
    const g = lineGeometry(headRule);
    expect(g.name).toBe('head-rule');
    expect(g.angle).toBeCloseTo(-30, 6);
    expect(g.weight).toBe('1px');
  });
});

/* A proxy, named as one: the spec imports the geometry. Whether it calls it on every line is what the function's own tests above cannot see. */
describe('sidebar-113.spec reads its diagonals through lineGeometry', () => {
  it('imports lineGeometry and calls it', () => {
    const spec = readFileSync('e2e/sidebar-113.spec.ts', 'utf8');
    expect(spec).toMatch(/import \{[^}]*lineGeometry[^}]*\} from '\.\/diagonal-geometry'/);
    /* As a callback or a call: the first version of this line wanted `lineGeometry(` and the spec maps it (10 Nov). */
    expect(spec).toMatch(/\.map\(lineGeometry\)|lineGeometry\(/);
  });
});
