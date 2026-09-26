import { describe, expect, it } from 'vitest';
import { MARKS, markBox, marksForBand, type MarkName } from './mark-boxes';

/**
 * 8a §5.1, §5.4, §5.5 — what the LAYOUT owes each colour mark.
 *
 * **A box each, and nothing else.** §5.4: "the four ornament marks have no
 * geometry here and will not be given any... Specifying vertices would fix by
 * hand the exact thing the generator exists to derive, and would need
 * re-specifying the moment the slot set changes." So this layer names the cell,
 * the inset and the anchor corner; the hash owns shape, size and the disc's
 * radius.
 *
 * The test of that boundary is that nothing here is a coordinate.
 */

describe('the layout owes a box and nothing more (§5.4)', () => {
  /**
   * **The boundary, asserted.** A vertex list, a radius or a point pair in this
   * module means the layout has started deriving what the generator derives —
   * and the next slot-set change silently disagrees with it.
   */
  it('gives every mark a cell, an inset and an anchor, and no geometry', () => {
    for (const name of Object.keys(MARKS) as MarkName[]) {
      const box = markBox(name);

      expect(box.cell, `${name} names its cell`).toBeTruthy();
      expect(box.anchor, `${name} names an anchor corner`).toBeTruthy();
      expect(typeof box.inset, `${name} has an inset`).toBe('number');

      /* No shape, no size, no path: those belong to the hash. */
      expect(box, `${name} must not carry geometry`).not.toHaveProperty('points');
      expect(box).not.toHaveProperty('radius');
      expect(box).not.toHaveProperty('width');
      expect(box).not.toHaveProperty('height');
    }
  });

  it('anchors every mark to a corner or an edge of its own cell', () => {
    const legal = ['top-left', 'top-right', 'bottom-left', 'bottom-right', 'fill', 'right-edge'];

    for (const name of Object.keys(MARKS) as MarkName[]) {
      expect(legal, `${name}`).toContain(markBox(name).anchor);
    }
  });
});

describe('the ladder step says what kind of mark it is (§5.5)', () => {
  /**
   * Base carries or frames the record's own material; tint is ground; shade is
   * only ever a right-hand face. A reader who notices the strong marks always
   * touch the record and the pale ones are always behind something has read it
   * correctly — which only holds if the assignment is fixed here rather than
   * chosen per mark at render time.
   */
  it('puts the marks that touch the record at base', () => {
    expect(markBox('releaseYearField').step).toBe('base');
    expect(markBox('sleeveBar').step).toBe('base');
    expect(markBox('journalEdge').step).toBe('base');
  });

  it('puts the ground marks at tint', () => {
    expect(markBox('stillDisc').step).toBe('tint');
    expect(markBox('provenanceArc').step).toBe('tint');
  });

  it('never assigns shade to a shape, because shade is a face', () => {
    // §5.5: "shade is a face and never a shape: it exists only as the
    // right-hand side of a coloured form." No mark in this layer takes it —
    // the construction's own faces do, inside the generator.
    for (const name of Object.keys(MARKS) as MarkName[]) {
      expect(markBox(name).step, `${name}`).not.toBe('shade');
    }
  });

  it('keeps the black mark off the ladder entirely (aboutSquare removed: a box nothing drew)', () => {
    // §5.1: fixed at ink, never derived, "because they anchor the construction
    // rather than being its subject".
    expect(markBox('sleeveBlock').step).toBe('ink');
  });
});

describe('at least one base mark per band, at most two (§5.5)', () => {
  /**
   * "The same colour at the same strength in both halves of the page is what
   * makes it one composition rather than a coloured lower half with accents
   * above it."
   */
  /**
   * **The identity band holds ONE base mark here, and that is correct.** §5.5
   * names its two as "the sleeve bar, and the construction's coloured form" —
   * and §5.4 assigns the construction to the generator, so its coloured form is
   * not a layout box and cannot appear in this module.
   *
   * Asserted as one-plus-the-construction rather than two, because a test
   * demanding two would only pass if this layer invented a mark the spec puts
   * somewhere else. The band reaches its second base mark when the construction
   * lands; until then it is keyed by the sleeve bar alone, which satisfies
   * §5.5's floor of at least one.
   */
  it('gives the identity band its one layout-owned base mark', () => {
    const base = marksForBand('identity').filter((m) => markBox(m).step === 'base');

    expect(base, 'the sleeve bar; the construction supplies the second').toEqual(['sleeveBar']);
  });

  it('gives the record band exactly two base marks', () => {
    const base = marksForBand('record').filter((m) => markBox(m).step === 'base');

    expect(base.length).toBe(2);
    expect(base).toContain('releaseYearField');
    expect(base).toContain('journalEdge');
  });

  it('never leaves a band unkeyed', () => {
    for (const band of ['identity', 'record'] as const) {
      const base = marksForBand(band).filter((m) => markBox(m).step === 'base');

      expect(base.length, `${band}`).toBeGreaterThanOrEqual(1);
      expect(base.length, `${band}`).toBeLessThanOrEqual(2);
    }
  });
});

describe('§28: the identity cell carries no ornament', () => {
  /**
   * §28: "The identity cell carries no ornament. Its corner field and
   * ornament track are withdrawn, and the ornament step leaves §4.2's give
   * order. A track that holds a triangle on most records and 1px on the
   * worst makes ornament's presence depend on the record. §21 forbids that,
   * and it is the same defect as hashing ornament, reached through the give
   * order instead of the generator."
   *
   * So the page divides cleanly: above the fold the only ornament is the
   * construction, which IS the record; below it, ornament is §25 and §26's,
   * fixed per screen. The §1, §6.1 and §10 drawings still show the triangle
   * and are superseded on that point.
   */
  it('has no identity triangle among the marks', () => {
    expect(MARKS, 'the mark is gone, not merely unrendered').not.toHaveProperty('identityTriangle');
    expect(marksForBand('identity'), 'and no band claims it').not.toContain('identityTriangle');
  });
});

describe('decoration does not decorate an absence (§5.4)', () => {
  /**
   * "When the cell they sit in is empty, they are suppressed — because a
   * decorated empty cell reads as a designed state rather than as a gap the
   * reader can fill."
   */
  it('marks the ornament as suppressible and the structural marks as not', () => {
    expect(markBox('provenanceArc').suppressWhenEmpty).toBe(true);
  });

  it('keeps the release-year field and the journal edge whatever the cell holds', () => {
    /*
      §6: the release year is "always filled, always carries a 72 — this is the
      cell that guarantees the page has colour and a display size on every
      record". And the journal's 2px edge "marks the cell, not its content", so
      it persists next to a diagonal.
    */
    expect(markBox('releaseYearField').suppressWhenEmpty).toBe(false);
    expect(markBox('journalEdge').suppressWhenEmpty).toBe(false);
    expect(markBox('sleeveBar').suppressWhenEmpty).toBe(false);
  });
});

describe('the seven and the two', () => {
  it('holds five of §5.1’s eight as derived marks, and one fixed-ink one: the construction is accounted in construction.ts, the triangle withdrawn by §28, the About arc by §35', () => {
    /*
      §5.1 names EIGHT derived regions: the release-year field, the sleeve
      bar, the identity triangle, the disc, the provenance quarter-circle,
      the About quarter-circle, the journal's 2px edge, and the
      construction's coloured faces. This module holds seven of them -- the
      construction's faces are the construction's own (construction.ts), and
      colour-distribution.spec counts them as one base mark -- so an earlier
      version of this comment said "seven" where the file says eight. §28
      withdraws the triangle with the ornament track; §35 the About arc,
      drawn on one real record in seventeen. Five derived remain here, six
      drawn on the page ("of §5.1's eight, six are drawn"), and the count is
      asserted because §9.4's base-mark arithmetic and §5.5's colour budget
      are measured against it.

      One fixed-ink mark, not two: `aboutSquare` was a box for a mark nothing
      ever drew -- no component, spec or script referenced it -- and a box
      with no mark is a count that lies.
    */
    const all = Object.keys(MARKS) as MarkName[];
    const derived = all.filter((m) => markBox(m).step !== 'ink');
    const ink = all.filter((m) => markBox(m).step === 'ink');

    expect(derived.length, 'seven of §5.1’s eight here, less §28’s triangle, less §35’s About arc').toBe(5);
    expect(ink.length, 'the sleeve block alone').toBe(1);
  });
});
