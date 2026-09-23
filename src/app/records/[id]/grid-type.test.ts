import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { INK, LABEL, LABEL_INK } from './grid-type';
import { oklchToHex } from '@/lib/colour/record-ladder';
import { contrastRatio } from '@/lib/colour/record-colour';

/**
 * §W.4: the 11px label read 3.88:1 against paper, and the reason it survived
 * is that **contrast is checked against the ground a mark sits on, and these
 * sat on the default, which nobody checks.** So this file checks the default.
 *
 * Two grounds, because the page has two. The drawing's paper is
 * `oklch(0.925 0.004 80)` and every figure in the target is measured on it;
 * the built page paints the app's `--background`, which is lighter. A label
 * that clears one and not the other is the finding this test exists to stop
 * recurring, so it must clear both.
 */

/** A Tailwind arbitrary value or a CSS value — either spelling, one hex. */
function hexOf(css: string): string {
  const match = /oklch\(([\d.]+)[ _]([\d.]+)[ _]([\d.]+)\)/.exec(css);
  if (match === null) throw new Error(`no oklch() in ${css}`);
  return oklchToHex({ L: Number(match[1]), C: Number(match[2]), h: Number(match[3]) });
}

/** Read from the stylesheet rather than copied, so a retuned ground is measured. */
function pageGround(): string {
  const css = readFileSync('src/app/globals.css', 'utf8');
  const match = /:root\s*\{[^}]*?--background:\s*(oklch\([^)]+\))/.exec(css);
  if (match === null) throw new Error('globals.css no longer declares --background on :root');
  return hexOf(match[1]);
}

const DRAWN_PAPER = hexOf('oklch(0.925 0.004 80)');

describe('the 11px label ink (§4, §W.4)', () => {
  it('clears 4.5:1 on the ground the page paints AND on the drawing’s paper', () => {
    /* Fails against grid-type.ts:17 at oklch(0.55 0.008 60): 3.88 on the drawn paper. */
    const label = hexOf(LABEL);

    expect(contrastRatio(label, pageGround()), 'on --background').toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(label, DRAWN_PAPER), 'on the drawn paper').toBeGreaterThanOrEqual(4.5);
  });

  it('stays below body ink in the hierarchy — the fix must not reach for ink', () => {
    /*
      A control on the fix's direction: setting the label to INK would clear
      both grounds and delete the distinction §4 carries by treatment.
    */
    const label = hexOf(LABEL);
    const ink = hexOf(INK);

    expect(contrastRatio(label, pageGround())).toBeLessThan(contrastRatio(ink, pageGround()));
  });

  it('is one value, carried by name: LABEL is built from LABEL_INK', () => {
    /* Proxy for "one value in 158 places": the class carries the constant's value. */
    expect(LABEL).toContain(`text-[${LABEL_INK.replace(/ /g, '_')}]`);
  });

  it('is restated nowhere as a literal', () => {
    /*
      The 10px meta lines carried `oklch(0.55 0.008 60)` as their own literal —
      the fifteen-places shape at two places. A source check, named as one:
      it proves the literal is absent, not that the lines render in LABEL_INK.
    */
    const files = ['src/app/records/[id]/RecordPage8a.tsx', 'src/app/wall/probe/sheet/page.tsx'];
    for (const file of files) {
      const source = readFileSync(file, 'utf8');
      expect(source, `${file} restates a label ink`).not.toMatch(/oklch\(0\.(55|44)[ _]0\.0/);
    }
  });
});
