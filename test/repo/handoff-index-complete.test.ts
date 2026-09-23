import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * **The handoff index and the build targets are three sources for one fact,
 * and this holds them to agreeing.**
 *
 * The target split on 23 Sep: the wall's sections (§W, §W.1–§W.37, formerly
 * §11.N) live in `Wall and Pull - build target.dc.html` and the record
 * screen's (§1–§10, §12–§27) in `Record Detail 8a - build target.dc.html`.
 * One handoff indexes both, in two tables. All three are tracked and move
 * together: the reachability clause is "reachable wherever the index is
 * read, AND AT THE SAME REVISION as the index".
 *
 * Three assertions per table, and each was written after a miss: a row per
 * heading and no phantom rows; EXACTLY one row per section, because a
 * presence grep passed on two conflicting rows for §W.35; and every indexed
 * section in a build-order step, because the order sat eight rulings behind
 * while the table alone was checked.
 *
 * The record table indexes §12 onward — §1–§10 are the original composition
 * and were never rows.
 */

const DESIGN = join(import.meta.dirname, '..', '..', 'docs', 'design');
const HANDOFF = join(DESIGN, 'HANDOFF-wall-and-pull.md');

const TABLES = [
  {
    name: 'wall (§W.N)',
    target: join(DESIGN, 'Wall and Pull - build target.dc.html'),
    heading: /text-transform:uppercase;color:oklch\(0\.48 0\.012 60\)">W\.(\d+) · /g,
    row: /^\|\s*§W\.(\d+)\s*\|/gm,
    step: /§W\.(\d+)/g,
    label: (n: number) => `§W.${n}`,
    indexedFrom: 1,
  },
  {
    name: 'record screen (§N)',
    target: join(DESIGN, 'Record Detail 8a - build target.dc.html'),
    heading: /text-transform:uppercase;color:oklch\(0\.48 0\.012 60\)">(\d+) · /g,
    row: /^\|\s*§(\d+)\s*\|/gm,
    step: /§(\d+)(?![.\d])/g,
    label: (n: number) => `§${n}`,
    indexedFrom: 12,
  },
] as const;

/*
  Raw HTML, not stripped: a heading is the element carrying the eyebrow
  signature (uppercase mono at 0.48), and the targets use the same " · "
  separator inside figures — "1981 · Harvest", "150 · more than a third" —
  which stripped text cannot tell from a section.
*/
const text = (path: string) => readFileSync(path, 'utf8');

describe.each(TABLES)('the handoff indexes every numbered section of the $name target', (t) => {
  const present = () => existsSync(t.target) && existsSync(HANDOFF);

  it('has a row for each heading the target carries, and no row for one it lacks', ({ skip }) => {
    if (!present()) skip('docs/design is not on this checkout — the index cannot be checked here');
    const headings = [...new Set([...text(t.target).matchAll(t.heading)].map((m) => Number(m[1])))]
      .filter((n) => n >= t.indexedFrom)
      .sort((a, b) => a - b);
    expect(headings.length, 'the target has numbered sections').toBeGreaterThan(5);

    /* Rows below `indexedFrom` index the original composition (§1–§10), which predates the build order and is not re-checked here. */
    const rows = new Set([...readFileSync(HANDOFF, 'utf8').matchAll(t.row)].map((m) => Number(m[1])).filter((n) => n >= t.indexedFrom));
    const missing = headings.filter((n) => !rows.has(n));
    expect(missing.map(t.label), 'headings in the target with no row in the handoff').toEqual([]);
    const phantom = [...rows].filter((n) => !headings.includes(n));
    expect(phantom.map(t.label), 'rows in the handoff for sections the target lacks').toEqual([]);
  });

  it('has EXACTLY one row per section — a presence check passes on two conflicting rows', ({ skip }) => {
    if (!present()) skip('docs/design is not on this checkout');
    const counts = new Map<number, number>();
    for (const m of readFileSync(HANDOFF, 'utf8').matchAll(t.row)) counts.set(Number(m[1]), (counts.get(Number(m[1])) ?? 0) + 1);
    const duplicated = [...counts.entries()].filter(([, c]) => c > 1).map(([n]) => t.label(n));
    expect(duplicated, 'sections with more than one row').toEqual([]);
  });

  it('names every indexed section somewhere in the BUILD ORDER too', ({ skip }) => {
    if (!present()) skip('docs/design is not on this checkout');
    const handoff = readFileSync(HANDOFF, 'utf8');
    const rows = [...new Set([...handoff.matchAll(t.row)].map((m) => Number(m[1])))].filter((n) => n >= t.indexedFrom);
    expect(rows.length, 'the handoff indexes the numbered sections').toBeGreaterThan(5);
    const order = handoff.slice(handoff.indexOf('## Build order'));
    expect(order.length, 'the handoff carries a build order').toBeGreaterThan(0);
    const stepped = new Set([...order.matchAll(t.step)].map((m) => Number(m[1])));
    const unbuilt = rows.filter((n) => !stepped.has(n)).map(t.label);
    expect(unbuilt, 'indexed but in no build-order step').toEqual([]);
  });
});
