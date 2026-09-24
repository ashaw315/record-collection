import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * **SUPERSEDED by `scripts/check-index.mjs`, and kept until it passes.**
 *
 * `docs/design/ASSERTIONS-spec.md` specifies eight assertions and says "the
 * script's exit code is the result". That script is built and runs; it is
 * currently red on assertion 6 (the `data-withdrawn-by` marking pass has not
 * landed — zero marks exist in any target) and on 8b (two handoff rows carry
 * figures in their pointer column). **This file stays until the script is
 * green, then it is deleted**, because two checks over one fact is the
 * duplication the index itself keeps failing on.
 *
 * What it asserts is a subset of the script's 1, 2, 3, 6 and 7.
 *
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

/**
 * **Assertions 6 and 7: the reader's note's withdrawal list is a
 * RESTATEMENT, and this file's whole history is restatements going stale.**
 *
 * The note says what currently governs; each section says what it withdraws.
 * Those are two lists of one fact, which is the shape that has failed this
 * index three times. So they are checked against each other in both
 * directions: every listed withdrawal must be marked in the section it
 * happened to, and every marked withdrawal must be listed.
 *
 * The list is machine-readable on purpose — a `reader-note-withdrawals`
 * comment of `[section, replaced-by, what]` entries — because the prose form
 * cannot be checked without parsing English. **On its first run, 6 found §26
 * retracting its 0.78 scale without ever saying so.**
 *
 * A section marks a withdrawal in its own text as "Withdrawn by §N",
 * "Superseded by §N" or "Withdrawn within §N" — the third because §26
 * withdraws a figure of its own, so the replacement is itself.
 */
describe('the reader’s note and the sections agree about what is withdrawn', () => {
  const RECORD_TARGET = join(DESIGN, 'Record Detail 8a - build target.dc.html');
  /** §1–§10, split out and closed: nothing is written into it. */
  const SETTLED_TARGET = join(DESIGN, 'Record Detail 8a - settled 1-10.dc.html');
  const present = () => existsSync(RECORD_TARGET) && existsSync(HANDOFF);

  /** The note's list: [section, replaced-by, what]. */
  const listed = (): Array<[string, string, string]> => {
    /* `[\s\S]` rather than the `s` flag, which needs an es2018 target this tsconfig does not set. */
    const comment = /<!--\s*reader-note-withdrawals\s*(\[[\s\S]*?\])\s*-->/.exec(text(RECORD_TARGET));
    expect(comment, 'the reader’s note carries a machine-readable withdrawal list').not.toBeNull();
    return JSON.parse(comment![1]) as Array<[string, string, string]>;
  };

  /**
   * Each section's own text, keyed by its number.
   *
   * **Headings only, never SVG text.** The drawings carry cell labels in the
   * same `N · ` shape — "1 · Cover", "1981 · Harvest" — so a pattern that
   * reads stripped text splits the file at a picture's caption. Sliced on the
   * uppercase heading paragraphs the file's own eyebrow signature marks.
   */
  const sections = (): Map<string, { heading: string; body: string }> => {
    /*
      **Both record-detail targets.** Design split §1–§10 into
      `Record Detail 8a - settled 1-10.dc.html` so each file can be rendered
      after every edit, and the reader's note lists withdrawals in BOTH — §2.1,
      §4.2 and §8.1 among them. Reading only the live target reported three of
      Design's own entries as pointing at sections that do not exist.
    */
    const raw = [text(RECORD_TARGET), existsSync(SETTLED_TARGET) ? text(SETTLED_TARGET) : '']
      .join('\n')
      .replace(/<svg[\s\S]*?<\/svg>/g, '');
    const heading = /text-transform:uppercase;color:oklch\(0\.48 0\.012 60\)">(?:§)?(\d+(?:\.\d+)?) · [^<]*/g;
    const marks = [...raw.matchAll(heading)].map((m) => ({ n: m[1], at: m.index!, end: m.index! + m[0].length }));
    const out = new Map<string, { heading: string; body: string }>();
    marks.forEach((mark, i) => {
      out.set(mark.n, {
        heading: raw.slice(mark.at, mark.end),
        /*
          **The body EXCLUDES the heading, and that is the whole assertion.**
          Three headings carry the withdrawal in their own title — §13, §17,
          §20 — so a slice that starts at the heading is satisfied by the
          title while the section's prose says nothing. Staged: removing
          §20's "Withdrawn by §22" from its text left the check green,
          because its heading still read "(squeeze withdrawn by §22)". That
          is the assertion testing one layer below its own name.
        */
        body: raw.slice(mark.end, i + 1 < marks.length ? marks[i + 1].at : undefined),
      });
    });
    return out;
  };

  /** "Withdrawn by §N", "Superseded by §N", "Withdrawn within §N" — the forms the target uses. */
  const MARK = /(?:withdrawn|superseded)\s+(?:by|within)\s+§(\d+(?:\.\d+)?)/gi;

  it('marks every listed withdrawal in the section it happened to, citing its replacement', ({ skip }) => {
    if (!present()) skip('docs/design is not on this checkout');
    const bodies = sections();
    const unmarked: string[] = [];
    for (const [section, replacedBy, what] of listed()) {
      const found = bodies.get(section);
      if (found === undefined) {
        unmarked.push(`§${section} (${what}): the note lists a section the target has no heading for`);
        continue;
      }
      /* The section's own prose, not its title — see `sections`. */
      const cited = [...found.body.matchAll(MARK)].map((m) => m[1]);
      if (!cited.includes(replacedBy)) {
        unmarked.push(`§${section} (${what}): the note says §${replacedBy} replaces it; the section cites ${cited.length === 0 ? 'nothing' : cited.map((c) => `§${c}`).join(', ')}`);
      }
    }
    expect(unmarked, 'withdrawals the note lists that their own section does not mark').toEqual([]);
  });

  it('lists every withdrawal a section marks — the other direction, because either list can go stale', ({ skip }) => {
    if (!present()) skip('docs/design is not on this checkout');
    const entries = listed();
    const unlisted: string[] = [];
    for (const [section, { heading, body }] of sections()) {
      /* Either place counts here: a heading that claims a withdrawal the note omits is the same staleness. */
      for (const cited of new Set([...`${heading}${body}`.matchAll(MARK)].map((m) => m[1]))) {
        if (!entries.some(([s, by]) => s === section && by === cited)) {
          unlisted.push(`§${section} says it is withdrawn/superseded by §${cited}, and the reader’s note does not list it`);
        }
      }
    }
    expect(unlisted, 'withdrawals marked in a section that the note omits').toEqual([]);
  });
});
