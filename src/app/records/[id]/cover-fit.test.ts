import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { COVER_CROP_BOUND, coverTreatment } from './cover-fit';

/**
 * Step 83, §33: "The cover is cropped to fill its square where the
 * photograph's shorter side is at least 95% of its longer, and fitted in the
 * square on paper beyond that."
 *
 * The rule compares the SHORTER side with the LONGER. One that compares width
 * with height passes every landscape photograph and fails every portrait
 * one, and Believer at 581 x 600, the only real cover near the bound, is
 * portrait. So the fixtures come in both orientations.
 */

const FIXTURES = join(import.meta.dirname, '..', '..', '..', '..', 'test', 'fixtures', 'covers');
type Fixture = { file: string; width: number; height: number; ratio: number; bound: number; expected: 'crop' | 'fit' };
const manifest = JSON.parse(readFileSync(join(FIXTURES, 'manifest.json'), 'utf8')) as Fixture[];

/** A PNG's own dimensions, from its header: the precondition every fixture test checks first (CLAUDE.md §2). */
function pngSize(file: string): { width: number; height: number } {
  const b = readFileSync(join(FIXTURES, file));
  return { width: b.readUInt32BE(16), height: b.readUInt32BE(20) };
}

describe('the fixtures are what the manifest says, before anything relies on them', () => {
  /* Fails against a regenerated or replaced file that moved across the bound: the manifest would still say crop or fit. */
  it('has six fixtures, three on each side of the bound, in both orientations', () => {
    expect(manifest).toHaveLength(6);
    for (const f of manifest) {
      const size = pngSize(f.file);
      expect(size, `${f.file}: the file's own dimensions`).toEqual({ width: f.width, height: f.height });
      const ratio = Math.min(size.width, size.height) / Math.max(size.width, size.height);
      expect(ratio, `${f.file}: its ratio`).toBeCloseTo(f.ratio, 4);
      expect(f.bound, `${f.file}: the bound it was drawn against`).toBe(COVER_CROP_BOUND);
      expect(f.expected, `${f.file}: the side of the bound it sits on`).toBe(ratio >= COVER_CROP_BOUND ? 'crop' : 'fit');
    }
    expect(manifest.filter((f) => f.expected === 'crop').map((f) => `${f.width}x${f.height}`).sort()).toEqual(['1000x950', '1000x951', '951x1000']);
    expect(manifest.filter((f) => f.expected === 'fit').map((f) => `${f.width}x${f.height}`).sort()).toEqual(['1000x949', '1200x900', '949x1000']);
  });
});

describe('coverTreatment: crop at or above 95%, fit below (§33)', () => {
  /* Fails against the absent rule; then against any rule that crops every cover, as the build did. */
  it('gives each fixture the treatment the manifest expects', () => {
    for (const f of manifest) {
      const size = pngSize(f.file);
      expect({ width: size.width, height: size.height }, `${f.file}: precondition`).toEqual({ width: f.width, height: f.height });
      expect(coverTreatment(size.width, size.height), f.file).toBe(f.expected);
    }
  });

  /* Fails against `width / height >= bound`: 951 x 1000 gives 0.951 either way, but 1000 x 949 gives 1.054 and would crop. */
  it('compares the shorter side with the longer, whichever is which', () => {
    expect(coverTreatment(1000, 949)).toBe('fit');
    expect(coverTreatment(949, 1000)).toBe('fit');
    expect(coverTreatment(1000, 951)).toBe('crop');
    expect(coverTreatment(951, 1000)).toBe('crop');
  });

  /* Fails against `>` in place of `>=`: "at least 95%" puts 95% itself on the cropping side. */
  it('crops at exactly the bound, in both orientations', () => {
    expect(coverTreatment(1000, 950)).toBe('crop');
    expect(coverTreatment(950, 1000)).toBe('crop');
  });

  /* Fails against a rule that fits near-square photographs: every real cover is inside the bound and must stay cropped. */
  it('keeps Believer, 581 x 600, and an exact square cropped', () => {
    expect(coverTreatment(581, 600)).toBe('crop');
    expect(coverTreatment(600, 600)).toBe('crop');
  });

  /* Fails against a rule that fits when it cannot tell: before a photograph has loaded its size is 0 x 0, and the built treatment stands. */
  it('crops when the size is not known', () => {
    expect(coverTreatment(0, 0)).toBe('crop');
    expect(coverTreatment(Number.NaN, 600)).toBe('crop');
  });
});
