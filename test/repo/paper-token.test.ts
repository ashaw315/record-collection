import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { PAPER, PAPER_CSS } from '@/lib/colour/paper';
import { WALL_PAPER } from '@/app/wall/pull-colour';

/**
 * §11.5: paper is one token, named in both places, and every ratio is
 * measured against it. Three papers had grown: the app's ground at 0.985,
 * the drawing's 0.925 painted by the composition, and the fade's start at
 * 0.977 — so the hairline and the ladder's tint step were measured against
 * a ground the page did not paint outside the wall, and a pulled record's
 * field began a step lighter than the face it left.
 */
function* sources(dir: string): Generator<string> {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) yield* sources(path);
    else if (/\.(ts|tsx|css)$/.test(name) && !/\.test\.tsx?$/.test(name)) yield path;
  }
}

describe('paper is one token (§11.5)', () => {
  it('is the drawing’s 0.925, and the stylesheet’s --background on :root is that value', () => {
    expect(PAPER).toEqual({ L: 0.925, C: 0.004, h: 80 });
    const css = readFileSync('src/app/globals.css', 'utf8');
    const match = /:root\s*\{[^}]*?--background:\s*(oklch\([^)]+\))/.exec(css);
    expect(match, 'globals.css declares --background on :root').not.toBeNull();
    expect(match?.[1]).toBe(PAPER_CSS);
  });

  it('is the fade’s start — not a third value (the composition’s ground is held by the literal scan below)', () => {
    expect(WALL_PAPER).toEqual(PAPER);
  });

  it('is restated nowhere as a literal: every 0.925 in src reads the token, the stylesheet excepted', () => {
    const offenders: string[] = [];
    for (const file of sources('src')) {
      if (file.endsWith('src/lib/colour/paper.ts') || file.endsWith('src/app/globals.css')) continue;
      const text = readFileSync(file, 'utf8');
      if (/0\.925[ _]0\.004[ _]80|L:\s*0\.925|L:\s*0\.977/.test(text)) offenders.push(file);
    }
    expect(offenders).toEqual([]);
  });
});
