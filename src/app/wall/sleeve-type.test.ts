import { describe, expect, it } from 'vitest';
import { SLEEVE_TYPE_FLOOR, SLEEVE_MAX_LINES, TITLE_ADVANCE_EM, sleeveTitle } from './sleeve-type';

/**
 * The no-cover sleeve's title is a DRAWN element (8a §11.3 as ruled): it
 * stands in for artwork, so §4's scale does not apply and its size derives
 * from its box and its string, the way the 72 does in the year field. The
 * fit: the largest size whose longest word fits the square's measure, at most
 * three lines; floored at 15, below which it truncates at a derived cap like
 * the spine label rather than shrinking further, since type too small to
 * read stands in for nothing.
 *
 * **Asserted as a rule, not a number.** A test pinning a size passes on the
 * collection's current longest title and says nothing about the derivation.
 */
const MEASURE = 156;

describe('the sleeve title fits its box', () => {
  it('sizes down as the title lengthens — the size derives from the string', () => {
    const short = sleeveTitle('Wired', MEASURE);
    const long = sleeveTitle('The Best Of The Blues Project', MEASURE);
    expect(short.size).toBeGreaterThan(long.size);
    expect(short.size).toBeGreaterThanOrEqual(SLEEVE_TYPE_FLOOR);
    expect(long.size).toBeGreaterThanOrEqual(SLEEVE_TYPE_FLOOR);
    expect(short.text).toBe('Wired');
    expect(long.text).toBe('The Best Of The Blues Project');
  });

  it('fits the longest word on the measure and the whole title in three lines, at the size it picks', () => {
    for (const title of ['Wired', 'Bridge Over Troubled Water', 'On The Radio: Greatest Hits Vol. 1 & 2']) {
      const { size, text, lines, fitsLongestWord } = sleeveTitle(title, MEASURE);
      expect(fitsLongestWord, `${title} @${size}`).toBe(true);
      expect(lines, `${title} @${size}`).toBeLessThanOrEqual(SLEEVE_MAX_LINES);
      expect(size).toBeGreaterThanOrEqual(SLEEVE_TYPE_FLOOR);
      /* Not truncated unless the floor forced it. */
      if (size > SLEEVE_TYPE_FLOOR) expect(text).toBe(title);
    }
  });

  it('truncates at a derived cap rather than shrinking below the floor', () => {
    const { size, text } = sleeveTitle('Antidisestablishmentarianism Anthology '.repeat(4).trim(), MEASURE);
    expect(size).toBe(SLEEVE_TYPE_FLOOR);
    expect(text.endsWith('…')).toBe(true);
    expect(text.length).toBeLessThan(80);
    expect(SLEEVE_TYPE_FLOOR).toBe(15);
  });

  it('a single word wider than the measure at the floor is cut, not shrunk', () => {
    const word = 'Supercalifragilisticexpialidocious';
    const { size, text } = sleeveTitle(word, MEASURE);
    expect(size).toBe(SLEEVE_TYPE_FLOOR);
    expect(text.endsWith('…')).toBe(true);
    expect(text.length).toBeLessThan(word.length);
  });
});

describe('the advance is the WIDEST word’s, not the average title’s (§11.3, §11.8)', () => {
  /*
    **The defect this pins.** `TITLE_ADVANCE_EM` was 0.48, measured across
    the collection's titles — an average, which narrow letters pull down. The
    fit then sized a title by that average and the widest WORD overflowed:
    "Mind Games" took size 140, which the module computed as 336px inside a
    401px measure, while the rendered face gave 0.664em per character for
    "Games" — 465px, clipped by 64. Measured in the browser at weight 800:

      "Games"                    0.664 em/char
      "Mind Games"               0.588
      "Hear Nothing See Nothing" 0.504
      lowercase alphabet         0.544

    The fit's job is that no word overflows, so the constant has to bound the
    widest word rather than describe the mean. `wall-cover.spec.ts` checks the
    rendered line boxes, which is the measurement this number stands in for.
  */
  it('bounds the widest word of the collection’s titles, not their mean', () => {
    expect(TITLE_ADVANCE_EM).toBeGreaterThanOrEqual(0.664);
  });

  it('keeps "Mind Games" inside its measure at the size it chooses', () => {
    const measure = 401;
    const fit = sleeveTitle('Mind Games', measure);
    const widest = Math.max(...'Mind Games'.split(' ').map((w) => w.length));
    expect(widest * fit.size * TITLE_ADVANCE_EM, 'the widest word fits').toBeLessThanOrEqual(measure);
  });

  it('keeps a single very long word inside the measure, cutting only at the floor', () => {
    const measure = 401;
    const fit = sleeveTitle('Supercalifragilisticexpialidocious', measure);
    expect(fit.text.length * fit.size * TITLE_ADVANCE_EM).toBeLessThanOrEqual(measure);
  });

  it('keeps the collection’s longest title inside the measure', () => {
    const measure = 401;
    const title = 'Hear Nothing See Nothing Say Nothing';
    const fit = sleeveTitle(title, measure);
    const widest = Math.max(...title.split(' ').map((w) => w.length));
    expect(widest * fit.size * TITLE_ADVANCE_EM).toBeLessThanOrEqual(measure);
    expect(fit.lines).toBeLessThanOrEqual(3);
  });
});
