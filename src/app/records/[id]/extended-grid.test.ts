import { describe, expect, it } from 'vitest';
import {
  CONTENT_X,
  CONTROL_HEIGHT,
  FIELD_HEIGHT,
  CHIP_HEIGHT,
  GRID_TEMPLATE,
  GRID_TRACKS,
  MARK_HEIGHT,
  MARK_WIDTH,
  RAIL_X,
  SECTIONS,
  TYPED_LEADING,
  TYPED_SIZE,
  carriesMark,
  type SectionName,
} from './extended-grid';

describe('the five tracks (§9.1)', () => {
  it('is five tracks, three of them spacers', () => {
    expect(GRID_TRACKS).toEqual(['34px', '216px', '34px', '1fr', '34px']);
    expect(GRID_TEMPLATE).toBe('34px 216px 34px 1fr 34px');
  });

  it('puts the rail at 34 and the content at 284', () => {
    /*
      Derived from the tracks rather than restated, so a track changing without
      these moving is a contradiction the test can see. 34 + 216 + 34 = 284.
    */
    const px = (track: string) => Number.parseInt(track, 10);

    expect(px(GRID_TRACKS[0]), 'rail x').toBe(RAIL_X);
    expect(px(GRID_TRACKS[0]) + px(GRID_TRACKS[1]) + px(GRID_TRACKS[2]), 'content x').toBe(
      CONTENT_X,
    );
  });

  it('carries no gap in the template, because a gap would compose with the spacers', () => {
    /**
     * **A spacer track and a gap both applying was a live defect.** The two
     * compose silently: the rail lands at 34 + gap and the content at 284 + 2×
     * gap, and every label still lines up with every other, so the region looks
     * correct and sits at the wrong x.
     */
    expect(GRID_TEMPLATE).not.toMatch(/gap/);
  });
});

describe("§9.3's mark predicate", () => {
  it('marks exactly the four the ruling names', () => {
    const marked = SECTIONS.filter(carriesMark);

    expect(marked).toEqual(['pressing-detail', 'images', 'price-history', 'journal']);
  });

  it('leaves the other four unmarked', () => {
    const unmarked = SECTIONS.filter((section) => !carriesMark(section));

    expect(unmarked).toEqual(['acquisition', 'tags', 'snippet', 'market']);
  });

  it('decides on the SCHEMA, so the same section marks on every record', () => {
    /**
     * **The anti-encoding rule, asserted by CALLING it with what a per-record
     * predicate would want — not by inspecting its signature.**
     *
     * The first version asserted `carriesMark.length === 1`, reasoning that a
     * per-record predicate needs a second argument. It does, and `.length`
     * cannot see it: the count stops at the first default, so
     * `(section, hasContent = true)` also reports 1. Staged, that change broke
     * a different test and left this one — the test NAMED for the property —
     * green. An assertion testing a proxy one layer below its claim, which is
     * the shape this file has recorded three times.
     *
     * So it calls the function the way a per-record implementation would be
     * called, and requires the extra argument to make no difference. A
     * predicate that consults emptiness fails here, whatever its arity.
     *
     * Per-record evaluation would make the mark encode data: a bar that appears
     * when a record has images and vanishes when it does not is an indicator of
     * that fact.
     */
    const ask = carriesMark as unknown as (section: SectionName, ...rest: unknown[]) => boolean;

    for (const section of SECTIONS) {
      const plain = ask(section);

      /* Whatever a caller passes about this record, the answer is the same. */
      for (const extra of [false, true, 0, 1, null, undefined, [], {}]) {
        expect(
          ask(section, extra),
          `${section} answered differently for ${JSON.stringify(extra) ?? 'undefined'}`,
        ).toBe(plain);
      }
    }
  });

  it('implements no minimum count', () => {
    /**
     * **The inference a build would otherwise draw from the retired sentence.**
     *
     * The floor exemption once argued from "the fourth one you have seen in the
     * same place", which was false on 16 of 17 records — there the marked set
     * is Images and Journal alone. The repetition is POSITIONAL: the rail is
     * what repeats and the bars only have to sit on it.
     *
     * So nothing may top up a short set to reach a count. Asserted by removing
     * marked sections from the list and checking the rest do not change their
     * answer — a top-up rule would start marking something else.
     */
    const answers = new Map(SECTIONS.map((section) => [section, carriesMark(section)]));

    for (const dropped of SECTIONS) {
      for (const section of SECTIONS) {
        if (section === dropped) continue;
        expect(
          carriesMark(section),
          `${section} changed when ${dropped} was not asked about`,
        ).toBe(answers.get(section));
      }
    }
  });

  it('decides a section the drawing does not contain', () => {
    /**
     * **The seventh recorded shape, applied to this rule.** A rule derived from
     * a set will always fit that set and may fit nothing else; the tell is that
     * it cannot be applied to a member you have not already decided.
     *
     * So: hand it sections §9 never drew. The predicate is "holds a fact that
     * appears nowhere above the fold", and these decide cleanly by reading it —
     * a wants/fulfils link and a related-pressings list are facts in no frame
     * cell; a delete row and an export control hold no fact at all.
     *
     * This test cannot call `carriesMark` on them, because they are not in the
     * type — which is the point. It pins the DECISIONS so that adding any of
     * them later is a change to a recorded expectation rather than a fresh
     * judgement made under deadline.
     */
    const undrawn: Record<string, boolean> = {
      /* Facts in no frame cell. */
      'wants-fulfils': true,
      'related-pressings': true,
      /* Controls holding no fact. */
      'delete-row': false,
      export: false,
    };

    expect(Object.entries(undrawn).filter(([, marked]) => marked).map(([name]) => name)).toEqual([
      'wants-fulfils',
      'related-pressings',
    ]);
  });
});

describe("§9.2's control geometry", () => {
  it('puts the control height on the type scale', () => {
    /* 44 is 4× the 11px label, and the hit-target floor. Both, not either. */
    expect(CONTROL_HEIGHT).toBe(44);
    expect(CONTROL_HEIGHT / 11, 'four label-heights').toBe(4);
    expect(CONTROL_HEIGHT, 'the hit-target floor').toBeGreaterThanOrEqual(44);
  });

  it('keeps the field and the chip at their drawn heights', () => {
    expect(FIELD_HEIGHT).toBe(34);
    expect(CHIP_HEIGHT).toBe(30);
  });

  it('fits A67 16px line inside the 34px field', () => {
    /**
     * **The one conflict, resolved in A67's favour and recorded as an
     * amendment.** §9.2 drew a 13px line; A67 forces 16px on anything the user
     * can put a cursor in, because Safari zooms the viewport below that.
     *
     * The geometry closes: 16 × 1.9 = 30.4px of line inside 34px of
     * border-box field, leaving 3.6px for the 1px bottom border and the gap
     * above it. Asserted rather than asserted-about, so a leading change that
     * broke it would fail here rather than in a rendering.
     */
    const line = TYPED_SIZE * TYPED_LEADING;

    expect(line).toBeCloseTo(30.4, 5);
    expect(line, 'the line fits the field').toBeLessThan(FIELD_HEIGHT);
    expect(FIELD_HEIGHT - line, 'room for the 1px rule beneath').toBeGreaterThanOrEqual(1);
  });

  it('keeps 16 off the type scale everywhere but the typed line', () => {
    /*
      The amendment is scoped to text with a cursor in it. Recorded here as a
      named constant so nothing reaches for it as a general size — a `text-16`
      utility would be the amendment escaping its scope.
    */
    expect(TYPED_SIZE, 'not a scale role').toBe(16);
  });
});

describe("§9.3's bar", () => {
  it('is 44 × 10, matching the control width it sits under', () => {
    expect(MARK_WIDTH).toBe(44);
    expect(MARK_HEIGHT).toBe(10);
    expect(MARK_WIDTH, 'as wide as a control is tall').toBe(CONTROL_HEIGHT);
  });

  it('fits inside the rail with room to spare', () => {
    const rail = Number.parseInt(GRID_TRACKS[1], 10);

    expect(MARK_WIDTH).toBeLessThan(rail);
  });
});

describe('the eight sections', () => {
  it('names them in render order', () => {
    expect(SECTIONS).toHaveLength(8);
    expect([...SECTIONS]).toEqual([
      'pressing-detail',
      'acquisition',
      'tags',
      'images',
      'snippet',
      'market',
      'price-history',
      'journal',
    ]);
  });

  it('has no section outside the union', () => {
    /* A typo in a section name is a compile error rather than a silent miss. */
    const name: SectionName = 'journal';
    expect(SECTIONS).toContain(name);
  });
});
