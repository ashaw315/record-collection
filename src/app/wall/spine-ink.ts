import { contrastRatio } from '@/lib/colour/record-colour';

/**
 * The label's ink, picked per fill (The Wall 5b §1).
 *
 * **Four candidates, the best contrast wins.** 5b draws every label in one of
 * four inks — the page's ink, white, the frame's near-black, and a muted grey —
 * and picks per spine by ratio against that spine's fill. The drawing reports
 * its worst pick at 4.52:1 on Donna Summer.
 *
 * **Re-run on current samples, not copied.** 5b's picks were made against the
 * pre-A75 fills; A75 moved nine of seventeen, and Donna Summer's `#94698a`
 * became `#bc4889`. The candidates are the rule; the picks are its output on
 * whatever the fills are today.
 */
export const INK_CANDIDATES = ['#0a0a0a', '#ffffff', '#161412', '#5c564f'] as const;

export type Ink = (typeof INK_CANDIDATES)[number];

/** The ink with the highest contrast against a fill, and that ratio. */
export function pickInk(fill: string): { ink: Ink; ratio: number } {
  let best: { ink: Ink; ratio: number } = { ink: INK_CANDIDATES[0], ratio: 0 };

  for (const ink of INK_CANDIDATES) {
    const ratio = contrastRatio(fill, ink);
    if (ratio > best.ratio) best = { ink, ratio };
  }

  return best;
}
