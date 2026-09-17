import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * **The handoff index and the build target are two sources for one fact, and
 * only a test keeps them agreeing.** The index has failed three times and
 * differently each time: first as an excerpt that went stale, then by
 * deferring to a section the repo's copy did not contain, then as a pointer
 * index missing a pointer (§11.11) — and the third was invisible precisely
 * because nothing checked it. Same shape as the constants guard.
 *
 * The rule, from the handoff's own "Maintaining this file": grep the target
 * for every `§11.N ·` heading and assert each N has a row in the table.
 *
 * `docs/design/` is gitignored — design artefacts are not committed — so on a
 * checkout without them there is nothing to check and the test says so
 * rather than passing on nothing (absent is reported, not mistaken for met).
 */
const DESIGN = join(import.meta.dirname, '..', '..', 'docs', 'design');
const TARGET = join(DESIGN, 'Record Detail 8a - build target.dc.html');
const HANDOFF = join(DESIGN, 'HANDOFF-wall-and-pull.md');

describe('the wall handoff indexes every numbered section of §11', () => {
  it('has a row for each §11.N heading the target carries', ({ skip }) => {
    if (!existsSync(TARGET) || !existsSync(HANDOFF)) {
      skip('docs/design is not on this checkout — the index cannot be checked here');
    }
    const target = readFileSync(TARGET, 'utf8').replace(/<[^>]+>/g, ' ');
    const handoff = readFileSync(HANDOFF, 'utf8');

    const headings = [...new Set([...target.matchAll(/(?<![\d.])11\.(\d+) · /g)].map((m) => Number(m[1])))].sort(
      (a, b) => a - b,
    );
    expect(headings.length, 'the target has numbered §11 subsections').toBeGreaterThan(5);

    const rows = new Set([...handoff.matchAll(/^\|\s*§11\.(\d+)\s*\|/gm)].map((m) => Number(m[1])));
    const missing = headings.filter((n) => !rows.has(n));
    expect(missing, `§11.${missing.join(', §11.')} has a heading in the target and no row in the handoff`).toEqual([]);

    /* And no row for a section the target does not have — a pointer to nothing. */
    const phantom = [...rows].filter((n) => !headings.includes(n));
    expect(phantom, `the handoff has a row for §11.${phantom.join(', §11.')} which the target lacks`).toEqual([]);
  });
});
