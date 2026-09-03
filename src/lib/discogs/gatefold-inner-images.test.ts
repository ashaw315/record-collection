import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { normalizeRelease } from './normalize-release';

/**
 * SPEC.md §12 step 14a's MEASUREMENT, kept as a test.
 *
 * 14a asks three questions about what Discogs carries for a gatefold, and
 * requires them answered against the live API "before designing anything on
 * top". They were, on 2026-09-03, across four real gatefold releases. This file
 * is that measurement made permanent — the probe survives as a test (CLAUDE.md
 * §2) rather than as a number in a report nothing can contradict.
 *
 * **Why it is a test and not a note.** The measurement's conclusions are what
 * the slot-assignment UI and §10b's A21b rule are built on. A note recording
 * "Discogs cannot distinguish a left leaf from a back cover" is a claim about
 * an external API that no longer fails when someone builds an importer that
 * assumes otherwise. Run against committed captures, it does.
 *
 * These fixtures are re-capturable (`node scripts/capture-discogs-fixtures.mjs
 * release-gatefold-a release-gatefold-b release-gatefold-c`) and their release
 * ids are PINNED in that script, which is what lets this file name them. A
 * searched capture could return a different gatefold, leaving these assertions
 * loading fine and running fine while measuring a release that no longer has
 * the property — the no-primary test below especially. The capture asserts the
 * id, so that swap fails at capture time instead.
 *
 * Per the fixtures README, a failure after a re-capture is INFORMATION —
 * establish whether Discogs changed or a contributor edited the release before
 * touching a test.
 *
 * The four releases, all verified gatefolds at capture time:
 *   381756    Discharge — Hear Nothing See Nothing Say Nothing  ("Gatefold")
 *   14451455  Grateful Dead — From The Mars Hotel   ("180g, Gatefold")
 *   10155238  Deep Purple — Fireball                ("Gatefold")
 *   6758287   Cat Stevens — Catch Bull At Four      ("Santa Maria Press, Embossed Gatefold")
 */

const raw = (name: string): unknown =>
  JSON.parse(readFileSync(`test/fixtures/discogs/${name}.json`, 'utf8'));

const load = (name: string) => normalizeRelease(raw(name));

/**
 * The RAW payload's images, with the dimensions Discogs actually sends.
 *
 * Read from the fixture rather than through `normalizeRelease` because the
 * normalizer DROPS `width` and `height` (`normalize-release.ts:292` maps only
 * `url` and `type`). That omission is itself one of 14a's answers — see the Q3
 * block below — so these assertions have to reach past it to measure the shape
 * Discogs sends, rather than the shape the app currently keeps.
 */
const rawImages = (name: string) =>
  ((raw(name) as { images?: Array<{ type?: string; width?: number; height?: number }> }).images ??
    []);

const GATEFOLDS = [
  { name: 'release-discharge-hear-nothing', id: 381756 },
  { name: 'release-gatefold-a', id: 14451455 },
  { name: 'release-gatefold-b', id: 10155238 },
  { name: 'release-gatefold-c', id: 6758287 },
] as const;

/** A release's images, as `normalizeRelease` hands them to the importer. */
const imagesOf = (name: string) => load(name).images;

describe('§12 14a Q1 — how the payload types an inner image', () => {
  /**
   * THE FINDING THAT DECIDES THE FEATURE. `images[].type` is only `primary` or
   * `secondary`, and every inner-sleeve photograph is `secondary` — the same
   * value the back cover, the labels and the dead-wax close-ups carry.
   *
   * Fails against `normalize-release.ts`'s `images` mapping if a `type` beyond
   * these two ever appears, which is the only way an importer could assign a
   * slot automatically. SPEC §12 14a's "the importer does not assign slots
   * automatically" rests on exactly this, and CLAUDE.md §8's worst-bug rule is
   * what a wrong guess would violate.
   */
  it.each(GATEFOLDS)('$name types images only primary/secondary', ({ name }) => {
    const types = new Set(imagesOf(name).map((image) => image.type));

    expect([...types].sort()).not.toContain('gatefold');
    for (const type of types) {
      expect(type).toMatch(/^(primary|secondary)$/);
    }
  });

  /**
   * The corollary, and the reason a "just use the primary" heuristic cannot be
   * extended to the leaves: `secondary` is the overwhelming majority on every
   * gatefold measured, covering back, inner, labels and runout alike. There is
   * no per-image field to separate them.
   */
  it.each(GATEFOLDS)('$name carries multiple undifferentiated secondaries', ({ name }) => {
    const secondaries = imagesOf(name).filter((image) => image.type === 'secondary');

    expect(secondaries.length).toBeGreaterThanOrEqual(4);
  });

  /**
   * **A gatefold need not carry a `primary` AT ALL** — release 14451455 has
   * seven images and not one of them is `primary`.
   *
   * This is the measurement's surprise, and it reaches beyond 14a into code
   * that already ships: `attach-cover.ts:54` picks the primary and falls back
   * to `images[0]`. That fallback is doing real work on releases like this one,
   * not defending against a hypothetical — and it means the cover attached for
   * this release is whichever image a contributor happened to upload first.
   */
  it('a real gatefold can carry no primary image at all', () => {
    const marsHotel = imagesOf('release-gatefold-a');

    expect(marsHotel.length).toBeGreaterThan(0);
    expect(marsHotel.some((image) => image.type === 'primary')).toBe(false);
  });
});

describe('§12 14a Q2 — one wide spread, or two square leaves', () => {
  const ratio = (image: { width?: number; height?: number }) =>
    typeof image.width === 'number' && typeof image.height === 'number' && image.height !== 0
      ? image.width / image.height
      : null;

  /**
   * THE ANSWER: a wide spread, and on every single gatefold measured — exactly
   * one image per release at roughly 2:1, alongside otherwise-square artwork.
   *
   * A21b anticipated this case and ruled that a single wide scan "cannot fill
   * two square slots", so it goes to the gallery as `other`. The measurement
   * turns that from a defensive clause into the COMMON case: 4 of 4 releases.
   * Discogs' convention for an open gatefold is one photograph of the spread,
   * not two leaves.
   */
  it.each(GATEFOLDS)('$name carries exactly one ~2:1 spread', ({ name }) => {
    const wide = rawImages(name).filter((image) => {
      const r = ratio(image);
      return r !== null && r >= 1.5;
    });

    expect(wide).toHaveLength(1);

    const spread = ratio(wide[0]);
    expect(spread).not.toBeNull();
    // ~2:1 — two square leaves side by side. Measured: 2.083, 2.0, 1.852, 2.027.
    expect(spread as number).toBeGreaterThan(1.8);
    expect(spread as number).toBeLessThan(2.2);
  });

  /**
   * And nothing else is wide. Everything but the spread is within 10% of
   * square, which is what makes the spread identifiable BY SHAPE — the only
   * signal available, since Q1 established the type field cannot help.
   *
   * This is the fact the assignment UI can lean on: it may SURFACE a likely
   * spread to the user by aspect ratio. It still must not assign a slot from
   * it, because a 2:1 image cannot fill a square leaf.
   */
  it.each(GATEFOLDS)('$name has no other non-square image', ({ name }) => {
    const notSquare = rawImages(name).filter((image) => {
      const r = ratio(image);
      return r !== null && (r <= 0.9 || r >= 1.1);
    });

    expect(notSquare).toHaveLength(1);
  });
});

describe('§12 14a Q3 — what §6 mapping would have to gain', () => {
  /**
   * The material is already there. `normalizeRelease` carries every image with
   * its url and type, so the importer HAS the candidates the assignment UI
   * would offer — nothing new needs fetching from Discogs.
   *
   * Fails against `normalize-release.ts:292` if the images mapping is dropped
   * or narrowed to the primary. That is the line the assignment UI will build
   * on, and it is worth a test standing on it before the UI exists.
   */
  it.each(GATEFOLDS)('$name exposes every image with a usable https url', ({ name }) => {
    const images = imagesOf(name);

    expect(images.length).toBeGreaterThanOrEqual(5);
    for (const image of images) {
      expect(image.url).toMatch(/^https:\/\//);
    }
  });

  /**
   * The gap, stated as a count: Discogs offers five to nine candidates and
   * §10b's object takes at most four faces — so the assignment UI is a
   * REDUCTION performed by a person, never a mapping performed by code.
   *
   * Confirms there is genuinely a choice to make. If a release offered exactly
   * four images the temptation to auto-assign would at least be arguable; at
   * seven-to-nine, with only shape to go on, it is not.
   */
  it.each(GATEFOLDS)('$name offers more candidates than the object has faces', ({ name }) => {
    expect(imagesOf(name).length).toBeGreaterThan(4);
  });

  /**
   * **THE CONCRETE ANSWER TO Q3, and it is a real gap.** Discogs sends `width`
   * and `height` on every image; `normalizeRelease` keeps neither.
   *
   * This is not a defect today — nothing downstream needs dimensions, and the
   * normalizer dropping unused fields is right. It is what 14a asked for: the
   * ONE thing §6's mapping must gain before the assignment UI can be built,
   * because Q2 established that aspect ratio is the only signal distinguishing
   * a 2:1 spread from a square leaf, and Q1 established the type field cannot.
   *
   * Without dimensions the UI cannot warn that a wide scan will not fill a
   * square slot, and A21b's rule becomes unenforceable at the point of choice.
   *
   * **This test is expected to FAIL when the gap is closed**, and that is the
   * point — it is a tripwire on a known omission, not an assertion that the
   * omission is correct. Whoever adds `width`/`height` to the mapping should
   * delete this test and say so; a silently-passing successor would leave the
   * measurement's central finding unrecorded.
   */
  it('normalizeRelease drops width/height — the one thing §6 must gain', () => {
    const normalized = imagesOf('release-gatefold-a') as ReadonlyArray<Record<string, unknown>>;
    const source = rawImages('release-gatefold-a');

    // Discogs really does send them, so the absence below is ours, not theirs.
    expect(source.every((image) => typeof image.width === 'number')).toBe(true);
    expect(source.every((image) => typeof image.height === 'number')).toBe(true);

    for (const image of normalized) {
      expect(image.width).toBeUndefined();
      expect(image.height).toBeUndefined();
    }
  });
});
