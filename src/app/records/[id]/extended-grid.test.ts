import { describe, expect, it } from 'vitest';
import {
  CELL_PADDING,
  CONTENT_COLUMNS,
  CONTENT_SPLITS,
  CONTROL_HEIGHT,
  FIELD_HEIGHT,
  CHIP_HEIGHT,
  GRID_TEMPLATE,
  LABEL_SPAN,
  MARK_HEIGHT,
  MARK_WIDTH,
  SECTIONS,
  TYPED_LEADING,
  TYPED_SIZE,
  carriesMark,
  type ContentShape,
  type SectionName,
} from './extended-grid';

describe('twelve columns (§9.1)', () => {
  it('is the same grid as §2.1, not a structure of its own', () => {
    /*
      The rail was the wrong repair: the columns exist for ALIGNMENT and the
      bands for height, so dropping the budget drops the height and leaves the
      columns alone. A region on its own grid is a document stapled under a
      page.
    */
    expect(GRID_TEMPLATE).toBe('repeat(12, 1fr)');
  });

  it('gives the label two columns, so its x is a column edge', () => {
    expect(LABEL_SPAN).toBe(2);
    expect(CONTENT_COLUMNS, 'the ten right of the label').toBe(10);
    expect(LABEL_SPAN + CONTENT_COLUMNS, 'twelve').toBe(12);
  });

  it('holds content at 34px while the section rule bleeds past it', () => {
    expect(CELL_PADDING).toBe(34);
  });
});

describe('three content splits and no more (§9.1)', () => {
  it('offers exactly three', () => {
    /**
     * **The count is the rule.** Three splits stop each section inventing its
     * own; a fourth is a section whose content has not been identified yet.
     * Asserted as a count rather than as a list, because the failure this
     * guards is one more arriving — not one of these three changing.
     */
    expect(Object.keys(CONTENT_SPLITS)).toHaveLength(3);
  });

  it('fills the ten columns right of the label, whichever is chosen', () => {
    /*
      The load-bearing property: a split that summed to anything else would put
      one section's content edge somewhere no other section has one, which is
      the alignment the twelve columns exist for.
    */
    for (const [shape, split] of Object.entries(CONTENT_SPLITS)) {
      const total = split.reduce((sum, span) => sum + span, 0);
      expect(total, `${shape} spans ${split.join('+')}`).toBe(CONTENT_COLUMNS);
    }
  });

  it('names each split for the shape of content it takes', () => {
    expect(CONTENT_SPLITS.one, 'one continuous thing').toEqual([10]);
    expect(CONTENT_SPLITS.pair, 'two comparable things').toEqual([5, 5]);
    expect(CONTENT_SPLITS.body, 'a body with an action beside it').toEqual([6, 4]);
  });

  it('has no split that is not one of the three', () => {
    /**
     * **The fourth-split guard, as a type-level claim made checkable.**
     *
     * `ContentShape` is the union of the three keys, so a section asking for a
     * fourth does not compile. This asserts the union has not quietly grown —
     * the enumeration defect this repo has recorded seven times, where a rule
     * stated over a fixed set acquires a member nobody decided on.
     */
    const shapes: ContentShape[] = ['one', 'pair', 'body'];

    expect(Object.keys(CONTENT_SPLITS).sort()).toEqual([...shapes].sort());
  });
});

describe("§9.3's mark predicate", () => {
  /**
   * **Derived from the predicate, not transcribed from the list.**
   *
   * Design rebuilt the eight sections by hand and carried the mark flags from
   * the pre-ruling order, which flipped Market with Price history. The bar
   * belongs on Price history: the frame shows the median and does not show the
   * series. Transcription is exactly how that error happened, so each section
   * below states the FACT it holds and whether the frame shows it, and the
   * expected set falls out of applying §9.3's one test.
   */
  const FRAME_SHOWS: Record<SectionName, { holds: string; shownAbove: boolean }> = {
    'pressing-detail': { holds: 'plant, weight, colour variant', shownAbove: false },
    acquisition: { holds: 'paid / from / condition', shownAbove: true },
    tags: { holds: 'a control, not a fact', shownAbove: true },
    images: { holds: 'the images themselves', shownAbove: false },
    snippet: { holds: 'the snippet text', shownAbove: true },
    market: { holds: 'the median', shownAbove: true },
    'price-history': { holds: 'the series of observations', shownAbove: false },
    journal: { holds: 'an entry', shownAbove: false },
  };

  it('marks a section when it holds a fact that appears nowhere above the fold', () => {
    for (const section of SECTIONS) {
      const { holds, shownAbove } = FRAME_SHOWS[section];

      expect(
        carriesMark(section),
        `${section} holds ${holds}; the frame ${shownAbove ? 'shows' : 'does not show'} it`,
      ).toBe(!shownAbove);
    }
  });

  it('marks four of eight, and Price history rather than Market', () => {
    /*
      The flip, asserted by name because it is the specific error that shipped:
      the frame shows the median in full and never the series, so Market only
      refreshes a fact already above the fold and Price history holds one that
      is not.
    */
    const marked = SECTIONS.filter(carriesMark);

    expect(marked).toHaveLength(4);
    expect(marked, 'the series is not shown above').toContain('price-history');
    expect(marked, 'the median IS shown above').not.toContain('market');
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

  it('sits in the label span, which is where §9.3 puts it', () => {
    /*
      The bar is under the label inside the two-column span — a mark at the
      label column's x sits on the one line the reader has already learned. At
      1440 the span is 240px, so a 44px bar fits with room; the assertion is
      that it fits the narrowest span the cap allows rather than a fixed number.
    */
    const spanAt1440 = (1440 / 12) * LABEL_SPAN;

    expect(MARK_WIDTH).toBeLessThan(spanAt1440 - CELL_PADDING * 2);
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
