import { describe, expect, it } from 'vitest';
import {
  ARCHETYPES,
  CONSTRUCTION_FRAME,
  FORM_COUNT,
  SIZE_BAND,
  construction,
  project,
} from './construction';

/**
 * The isometric construction (Isometric Probe §1, §4, §5).
 *
 * **One family, seventeen members.** What varies is which archetype takes which
 * ground slot, a bounded jitter, each form's extent, which form and which two
 * faces carry the colour, and the disc. What is fixed is the projection, the
 * form count, the archetype set, the ground plane, the tone triple, the 6:1
 * size band, and the rule that the disc never takes base.
 */

/** Every real record id in the collection, so the sheet is the real sheet. */
const REAL_IDS = [
  'e73e1de1-3686-4a81-8544-ca2300e187bb',
  'd7047c62-149e-42fa-8cda-fac3f90c47cc',
  '158a3163-6a56-4673-8f88-27e7b2aec724',
  'c61c5919-8f50-4782-8e04-419fb3d2b148',
  'a31591e7-2e28-42e7-84d5-2a1f96ad31fd',
  'b9a9a9db-4bf5-42e6-b751-0eba2dfe8002',
  '30504952-8d43-4c2e-b687-b89558371df5',
  '78da2ee9-f7c7-40ea-8149-269454437ef6',
  '372aba39-59ad-46c8-b76b-f33ecae75c98',
  '464979c3-aaa2-43c5-afd4-8dc4ee2e98c6',
  '7d35194b-5a02-4e31-a568-d95a9b32b0cd',
  'b4abf39a-df33-4a9e-b65c-64d3d0a39b78',
  '4a1e2b7c-0000-4000-8000-000000000001',
  '4a1e2b7c-0000-4000-8000-000000000002',
  '4a1e2b7c-0000-4000-8000-000000000003',
  '4a1e2b7c-0000-4000-8000-000000000004',
  '4a1e2b7c-0000-4000-8000-000000000005',
] as const;

describe('the projection is the wall’s, generalised (§1)', () => {
  /**
   * The wall's `spinePolygon` lifts its top edge by `width * SIN30 / COS30` —
   * a slope of tan 30°, which is one unit along an isometric ground axis. Same
   * angle, same two constants, no new decision.
   */
  it('puts w straight up and the ground axes at ±30°', () => {
    const origin = project(0, 0, 0);
    expect(origin).toEqual([0, 0]);

    /* w rises: screen y decreases. */
    const up = project(0, 0, 1);
    expect(up[0]).toBeCloseTo(0, 10);
    expect(up[1]).toBeCloseTo(-1, 10);

    /* u goes right-and-down at tan 30°. */
    const u = project(1, 0, 0);
    expect(u[1] / u[0], 'slope of tan 30°').toBeCloseTo(Math.tan(Math.PI / 6), 6);

    /* v mirrors it left-and-down. */
    const v = project(0, 1, 0);
    expect(v[0]).toBeCloseTo(-u[0], 10);
    expect(v[1]).toBeCloseTo(u[1], 10);
  });
});

describe('the frame is constant, and that was the whole finding (§4)', () => {
  /**
   * **The load-bearing assertion.** The probe's first version fitted the viewBox
   * to each arrangement's bounding box and six records were nearly
   * indistinguishable: fitting normalises every composition to the same
   * rectangle and throws away the property that varies most. The generator was
   * never the problem — the framing was discarding its output.
   *
   * A normalisation applied to make things comparable removes the variation it
   * was applied to preserve. Same shape as the averaging that cancelled the
   * chroma it was sampling for.
   */
  it('gives every record the identical viewBox', () => {
    const frames = new Set(REAL_IDS.map((id) => construction(id).viewBox));

    expect(frames.size, 'one frame across the whole collection').toBe(1);
    expect([...frames][0]).toBe(CONSTRUCTION_FRAME);
  });

  it('does not fit the frame to the forms', () => {
    /*
      The forms move INSIDE the frame: their own bounding boxes differ while the
      frame does not. If a future change starts fitting, the frames diverge and
      the test above fails — this one says the variation it would destroy is
      really there.
    */
    const extents = REAL_IDS.map((id) => {
      const { forms } = construction(id);
      const xs = forms.flatMap((f) => f.faces.flatMap((face) => face.points.map((p) => p[0])));
      return Math.round(Math.max(...xs) - Math.min(...xs));
    });

    expect(new Set(extents).size, 'the compositions really do differ in extent').toBeGreaterThan(
      1,
    );
  });
});

describe('the forms stay inside the constant frame', () => {
  /**
   * **A property the generator must be unable to violate, not something the
   * sheet catches.** The first version escaped on every record — worst case 17
   * points outside, with x reaching 220 against a frame edge at 150, visible as
   * clipped beams once seventeen tiles sat side by side.
   *
   * Fixed in the SLOTS rather than the frame. The frame is the thing that must
   * not be fitted per record: fitting normalises away the variation it was
   * applied to preserve, which is the whole viewBox lesson.
   */
  it('keeps every drawn point inside the frame, on all seventeen', () => {
    const [fx, fy, fw, fh] = CONSTRUCTION_FRAME.split(' ').map(Number);

    for (const id of REAL_IDS) {
      const { forms } = construction(id);
      const points = forms.flatMap((f) => f.faces.flatMap((face) => face.points));

      for (const [x, y] of points) {
        expect(x, `${id}: x ${x.toFixed(1)}`).toBeGreaterThanOrEqual(fx);
        expect(x, `${id}: x ${x.toFixed(1)}`).toBeLessThanOrEqual(fx + fw);
        expect(y, `${id}: y ${y.toFixed(1)}`).toBeGreaterThanOrEqual(fy);
        expect(y, `${id}: y ${y.toFixed(1)}`).toBeLessThanOrEqual(fy + fh);
      }
    }
  });

  it('keeps the disc inside the frame too', () => {
    const [fx, fy, fw, fh] = CONSTRUCTION_FRAME.split(' ').map(Number);

    for (const id of REAL_IDS) {
      const { disc } = construction(id);

      expect(disc.cx - disc.r, `${id}`).toBeGreaterThanOrEqual(fx);
      expect(disc.cx + disc.r, `${id}`).toBeLessThanOrEqual(fx + fw);
      expect(disc.cy - disc.r, `${id}`).toBeGreaterThanOrEqual(fy);
      expect(disc.cy + disc.r, `${id}`).toBeLessThanOrEqual(fy + fh);
    }
  });
});

describe('deterministic, and from the id alone (§4)', () => {
  /**
   * **The hash takes nothing mutable.** Not a slug, not a title, not a sort
   * position — only the record id, so a rename or a re-sort cannot change a
   * record's construction.
   */
  it('draws the same construction twice for the same id', () => {
    for (const id of REAL_IDS.slice(0, 6)) {
      expect(JSON.stringify(construction(id))).toBe(JSON.stringify(construction(id)));
    }
  });

  it('gives different ids different constructions', () => {
    const shapes = REAL_IDS.map((id) => JSON.stringify(construction(id).forms));

    expect(new Set(shapes).size, 'no two records share an arrangement').toBe(REAL_IDS.length);
  });
});

describe('what is fixed makes them one family (§4)', () => {
  it('gives every record six forms and one disc', () => {
    for (const id of REAL_IDS) {
      const c = construction(id);

      expect(c.forms.length, `${id}`).toBe(FORM_COUNT);
      expect(c.disc, `${id}`).toBeTruthy();
    }
  });

  /**
   * §4: "the archetype set itself — beam, slab, cube, plate, panel, needle — so
   * every record has one of each rather than a random bag." Form count is the
   * one the probe defends hardest: varying it varies density, and density reads
   * as meaning when nothing here encodes anything.
   */
  it('gives every record one of each archetype, never a random bag', () => {
    for (const id of REAL_IDS) {
      const kinds = construction(id).forms.map((f) => f.archetype).sort();

      expect(kinds, `${id}`).toEqual([...ARCHETYPES].sort());
    }
  });

  /**
   * **The band is a distribution, not a constant, and the per-form jitter is
   * why.** Each form's extent multiplies by 0.80–1.25×, so the ratio between
   * the longest and the shortest cannot be exactly 6:1 on every record — the
   * worst-case pair compounds both multipliers.
   *
   * Measured across all seventeen real ids: **min 4.44, max 7.92, mean 6.04.**
   * The shapes are pitched so the MEAN lands on the band rather than the
   * nominal, which is what "roughly 6:1 against the reference" asks for. A
   * first version set the nominal to 6:1 and measured 3.81–6.82, centring the
   * distribution below the band.
   */
  it('centres the size band on six to one across the collection', () => {
    const ratios = REAL_IDS.map((id) => {
      const sizes = construction(id).forms.map((f) => f.extent);
      return Math.max(...sizes) / Math.min(...sizes);
    });

    const mean = ratios.reduce((a, b) => a + b, 0) / ratios.length;
    expect(mean, `mean ${mean.toFixed(2)}`).toBeGreaterThan(SIZE_BAND - 0.6);
    expect(mean, `mean ${mean.toFixed(2)}`).toBeLessThan(SIZE_BAND + 0.6);

    /* And no record falls so far out of band that it reads as a different
       family: the spread is what the jitter costs, and it is bounded. */
    for (const [index, ratio] of ratios.entries()) {
      expect(ratio, `${REAL_IDS[index]}: ${ratio.toFixed(2)}`).toBeGreaterThan(4);
      expect(ratio, `${REAL_IDS[index]}: ${ratio.toFixed(2)}`).toBeLessThan(9);
    }
  });
});

describe('the colour placement is narrow, and the disc never takes base (§5)', () => {
  /**
   * **This is what defuses the near-grey case.** The disc can no longer become a
   * heavy dark mass, so the failure retreats into the forms where it is quiet
   * rather than disruptive. The rule holds even where base would look better on
   * a chromatic record, because it exists for the five quiet ones.
   */
  it('never gives the disc the base step, on any record', () => {
    for (const id of REAL_IDS) {
      expect(construction(id).disc.step, `${id}`).toBe('tint');
    }
  });

  it('puts base only on faces', () => {
    for (const id of REAL_IDS) {
      const coloured = construction(id).forms.flatMap((f) =>
        f.faces.filter((face) => face.step === 'base'),
      );

      expect(coloured.length, `${id}: base appears only on faces`).toBeGreaterThan(0);
    }
  });

  /**
   * §4: "exactly one coloured form, two coloured faces" — and §2's re-judgement
   * says the coloured faces sit on two DIFFERENT forms, so the eye traces a
   * path instead of landing once.
   */
  it('spreads the two coloured faces across two different forms', () => {
    for (const id of REAL_IDS) {
      const carriers = construction(id)
        .forms.filter((f) => f.faces.some((face) => face.step === 'base'))
        .map((f) => f.archetype);

      expect(new Set(carriers).size, `${id}: two forms carry colour`).toBe(2);
    }
  });

  it('keeps the slab and the needle ink on every record', () => {
    for (const id of REAL_IDS) {
      for (const form of construction(id).forms) {
        if (form.archetype !== 'slab' && form.archetype !== 'needle') continue;

        for (const face of form.faces) {
          expect(face.step, `${id} ${form.archetype}`).toBe('ink');
        }
      }
    }
  });
});

describe('the layout owes a box and the generator fills it (§5.4)', () => {
  it('fills the box it is given rather than asking for room', () => {
    // The generator takes no size argument beyond the frame: it cannot
    // negotiate with the layout, which is what the radius mutation enforces on
    // the other side of the boundary.
    expect(construction.length, 'id only').toBe(1);
  });
});
