import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { PAPER } from '@/lib/colour/paper';
import { oklchToHex } from '@/lib/colour/record-ladder';
import { contrastRatio } from '@/lib/colour/record-colour';

/**
 * §W.27: **the app has one hairline value, and it is §3's 0.72.**
 *
 * The chrome carried two — `--border` at 0.9 and `--input` at 0.88 — both
 * chosen against a ground of 0.985 that §W.5 replaced with the drawing's
 * 0.925. Measured on the ground the app now paints they read 1.08:1 and
 * 1.15:1, which is past the threshold of visible on the wrong side: §3
 * spends its whole argument keeping a rule AT that threshold, and a hairline
 * that cannot be seen is not a quiet rule, it is an absent one. That is why
 * the page read as having no rules at all.
 *
 * 0.72 reads 1.99:1 on paper, which is the value §3 states and the one the
 * drawings are measured against.
 */
function tokenOf(name: string): { L: number; C: number; h: number } {
  const css = readFileSync('src/app/globals.css', 'utf8');
  const root = /:root\s*\{([\s\S]*?)\n\}/.exec(css)?.[1] ?? '';
  const match = new RegExp(`--${name}:\\s*oklch\\(([\\d.]+)\\s+([\\d.]+)\\s+([\\d.]+)\\)`).exec(root);
  if (match === null) throw new Error(`globals.css no longer declares --${name} on :root`);
  return { L: Number(match[1]), C: Number(match[2]), h: Number(match[3]) };
}

const RULE = { L: 0.72, C: 0.004, h: 80 };

describe('one hairline value (§W.27)', () => {
  it('is §3’s 0.72, for both of the app’s former hairline tokens', () => {
    expect(tokenOf('border')).toEqual(RULE);
    expect(tokenOf('input')).toEqual(RULE);
  });

  it('reads 1.99:1 on the paper the app paints, where 0.9 and 0.88 read 1.08 and 1.15', () => {
    const paper = oklchToHex(PAPER);
    expect(contrastRatio(oklchToHex(RULE), paper)).toBeCloseTo(1.99, 1);
    /* The values it replaces, measured on the same ground — the finding, kept so it cannot recur silently. */
    expect(contrastRatio(oklchToHex({ L: 0.9, C: 0.006, h: 75 }), paper)).toBeCloseTo(1.08, 1);
    expect(contrastRatio(oklchToHex({ L: 0.88, C: 0.006, h: 75 }), paper)).toBeCloseTo(1.15, 1);
  });

  it('is restated nowhere as a literal: the chrome reads the token', () => {
    /* The one place that spelled a hairline out rather than naming it. */
    const sheet = readFileSync('src/app/wall/probe/sheet/page.tsx', 'utf8');
    expect(sheet, 'the sheet probe reads the token').not.toMatch(/border-\[oklch\(0\.9[ _]/);
  });
});
