import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { importedConstants, isPinned } from '../../scripts/spec-pins';

/**
 * **A constant a spec asserts against must itself be held to a figure by a
 * unit test.**
 *
 * `specs-import-constants.test.ts` makes a spec take a declared number from
 * the source, so the spec fails when the rendering disagrees with the
 * declaration and not on the day a ruling changes. That is half of a chain.
 * The other half is that something holds the declaration to the ruling's
 * figure; where nothing does, the spec and the source agree with each other
 * about any value at all, and that pair is vacuous.
 *
 * On 10 Oct the content inset went from 20 to 18. Two specs that read it from
 * `SCREEN.inset` passed against the old build and the new, which looked like
 * the defect and was the design: `screen-frame.test.ts` pins the constant to
 * 18 and failed first. This check is for the constants where no such test
 * exists. Nothing enforced it, and thirty-seven had none when it was written.
 *
 * **A ratchet, not an amnesty.** The list below is every constant found
 * unpinned on that day, and the tree must match it exactly: a new unpinned
 * constant fails, and so does pinning one without taking it off the list.
 * Some of them are not figures (a fixture record, a cosine); each comes off
 * by being pinned or by a line here saying why it needs no pin.
 *
 * A proxy, and named as one: "pinned" is read from the text of a unit test,
 * `expect(NAME…)` met by a literal. It does not know the literal is the
 * ruling's.
 */
const KNOWN_UNPINNED = [
  'CAP', 'COS30', 'COVER_CROP_BOUND', 'DEPTH', 'EMPTIEST', 'FIGURES', 'FIGURE_INSET_COLUMNS', 'GRID_COLUMN', 'GRID_COLUMNS', 'GRID_FORK',
  'IDENTITY_PADDING', 'IDENTITY_SPANS', 'MAX_GRID_WIDTH', 'MODAL_CONTROL', 'MODAL_CONTROL_GAP', 'MODAL_INSET', 'MODAL_LABEL_GAP', 'MODAL_LABEL_LINE',
  'MODAL_ROW', 'NO_SCROLL_HEIGHT', 'OVERFLOWS_THE_MEASURE', 'RECORD_BAND_QUARTERS', 'RETURN_FADE_END', 'RETURN_MS', 'SETTLE_MS', 'SHORT_TITLE', 'SIN30',
  'SLEEVE_CELL', 'STILL_MARGIN', 'STRIP_SPLIT', 'TITLE_MEASURE', 'VISIBLE_OF_HOST_HEIGHT', 'VISIBLE_OF_SECTION_WIDTH', 'WALL_INK', 'WALL_PAPER_HEX', 'WIDEST',
  'WORST',
];

function files(dir: string, keep: (path: string) => boolean): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? files(path, keep) : keep(path) ? [path] : [];
  });
}

describe('reading a spec’s imports and a unit test’s pins', () => {
  it('takes the constants a spec imports from the source, and not its functions or types', () => {
    const spec = "import { FORK, SIDEBAR, contentColumn, type FigureShape } from '../src/app/sidebar-layout';\nimport { expect } from '@playwright/test';\nimport { login } from './sign-in';";
    expect(importedConstants(spec)).toEqual(['FORK', 'SIDEBAR']);
  });

  it('follows a constant renamed on import back to its own name', () => {
    expect(importedConstants("import { FORK as SIDEBAR_FORK } from '../../src/app/sidebar-layout';")).toEqual(['FORK']);
  });

  it('counts a constant as pinned where a unit test meets it, or a part of it, with a literal', () => {
    expect(isPinned('FORK', ['expect(FORK).toBe(1054);'])).toBe(true);
    expect(isPinned('SCREEN', ['expect(SCREEN.inset).toBe(18);'])).toBe(true);
    expect(isPinned('SIDEBAR', ["expect(SIDEBAR, 'as drawn').toEqual({ width: 336 });"])).toBe(true);
  });

  it('does not count one constant held to another, or one only used', () => {
    expect(isPinned('FORK', ['expect(FORK).toBe(SIDEBAR.taken + RECORD_AT_FORK);'])).toBe(false);
    expect(isPinned('FORK', ['const at = FORK - 1; expect(width).toBe(at);'])).toBe(false);
    expect(isPinned('FORK', ['expect(FORKED).toBe(3);'])).toBe(false);
  });
});

describe('every constant a spec asserts against is pinned by a unit test', () => {
  const specs = files('e2e', (path) => path.endsWith('.ts') && !path.includes('/sheet/') && !path.includes('/capture/'));
  const tests = [...files('src', (path) => /\.test\.tsx?$/.test(path)), ...files('test', (path) => /\.test\.tsx?$/.test(path))].map((path) => readFileSync(path, 'utf8'));
  const imported = [...new Set(specs.flatMap((path) => importedConstants(readFileSync(path, 'utf8'))))].sort();
  const unpinned = imported.filter((name) => !isPinned(name, tests));

  it('reads a real set: the specs import constants, and some are pinned', () => {
    expect(specs.length).toBeGreaterThan(90);
    expect(imported.length).toBeGreaterThan(50);
    expect(imported).toContain('SCREEN');
    expect(unpinned).not.toContain('SCREEN');
  });

  it('no constant is unpinned that was not on 10 Oct', () => {
    expect(unpinned.filter((name) => !KNOWN_UNPINNED.includes(name)), 'imported by a spec, and no unit test holds it to a literal').toEqual([]);
  });

  it('and one that has since been pinned, or is no longer imported, is off the list', () => {
    expect(KNOWN_UNPINNED.filter((name) => !unpinned.includes(name)), 'on the list, and pinned or gone').toEqual([]);
  });
});
