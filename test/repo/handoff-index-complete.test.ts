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

  it('has EXACTLY one row per section — a presence check passes on two conflicting rows', ({ skip }) => {
    /*
      §11.35 briefly had two rows. A grep for presence cannot see that, and
      two rows for one section are two answers to one question: whichever a
      reader finds first wins, and nothing says the other exists.
    */
    if (!existsSync(TARGET) || !existsSync(HANDOFF)) {
      skip('docs/design is not on this checkout — the index cannot be checked here');
    }
    const handoff = readFileSync(HANDOFF, 'utf8');
    const counts = new Map<number, number>();
    for (const match of handoff.matchAll(/^\|\s*§11\.(\d+)\s*\|/gm)) {
      const n = Number(match[1]);
      counts.set(n, (counts.get(n) ?? 0) + 1);
    }
    const duplicated = [...counts.entries()].filter(([, count]) => count > 1).map(([n]) => n);
    expect(duplicated, `§11.${duplicated.join(', §11.')} has more than one row in the handoff`).toEqual([]);
  });

  it('names every indexed section somewhere in the BUILD ORDER too', ({ skip }) => {
    /*
      **The table and the build order are separate lists, and only the table
      was ever checked.** That is how the order sat eight rulings behind while
      this file reported the index current: §11.28 through §11.36 had rows and
      no step, so a reader following the order built §11.27 and stopped. A
      completeness check that covers one of two lists reports completeness it
      has not measured.
    */
    if (!existsSync(TARGET) || !existsSync(HANDOFF)) {
      skip('docs/design is not on this checkout — the index cannot be checked here');
    }
    const handoff = readFileSync(HANDOFF, 'utf8');
    const rows = [...new Set([...handoff.matchAll(/^\|\s*§11\.(\d+)\s*\|/gm)].map((m) => Number(m[1])))];
    expect(rows.length, 'the handoff indexes the numbered sections').toBeGreaterThan(5);

    const order = handoff.slice(handoff.indexOf('## Build order'));
    expect(order.length, 'the handoff carries a build order').toBeGreaterThan(0);
    const stepped = new Set([...order.matchAll(/§11\.(\d+)/g)].map((m) => Number(m[1])));
    const unbuilt = rows.filter((n) => !stepped.has(n));
    expect(unbuilt, `§11.${unbuilt.join(', §11.')} is indexed but appears in no build-order step`).toEqual([]);
  });
});
