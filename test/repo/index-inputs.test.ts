import { execFileSync, spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { sections } from '../../scripts/design-target-parser.mjs';
import { parseBullets } from '../../scripts/withdrawals.mjs';

const REPO_ROOT = join(import.meta.dirname, '..', '..');
const DESIGN = join(REPO_ROOT, 'docs', 'design');
const IDS = ['0', '1', '2', '3', '4', '5', '6', '7', '8a', '8b', '9'];

/**
 * **The nav target, §G, is an input (2 Oct).** The first record-detail
 * withdrawal replaced by a section in another file, `24/in-line-no-height`
 * (§24 withdrawn by §G.8), met two behaviours in one run, ten lines apart:
 * the bullet parser refused the id and named the line, and assertion 4 --
 * whose job is cross-file references -- passed, because it recognised only
 * W and bare-number shapes and did not see "§G.8" as a reference at all.
 * A check that ignores what it does not understand reports success.
 */

let staged: string | null = null;
afterEach(() => {
  if (staged !== null) rmSync(staged, { recursive: true, force: true });
  staged = null;
});

/** A copy of the design inputs the script reads, for a run over a deliberately broken tree. */
function stage(edit: (dir: string) => void): string {
  staged = mkdtempSync(join(tmpdir(), 'index-inputs-'));
  for (const f of ['HANDOFF-wall-and-pull.md', 'Record Detail 8a - build target.dc.html', 'Record Detail 8a - settled 1-10.dc.html', 'Wall and Pull - build target.dc.html', 'Nav - build target.dc.html', 'Record Modal - build target.dc.html', 'Table and Grid - build target.dc.html', 'WITHDRAWALS.md']) {
    cpSync(join(DESIGN, f), join(staged, f));
  }
  edit(staged);
  return staged;
}

function run(designDir?: string): { code: number; out: string } {
  const r = spawnSync('node', ['scripts/check-index.mjs'], {
    cwd: REPO_ROOT,
    encoding: 'utf-8',
    env: { ...process.env, ...(designDir === undefined ? {} : { INDEX_DESIGN_DIR: designDir }) },
  });
  return { code: r.status ?? 1, out: `${r.stdout ?? ''}${r.stderr ?? ''}` };
}

describe('the shared parser and the bullet grammar read §G ids', () => {
  /* Fails against SECTION_ID in design-target-parser.mjs, which accepted W and bare numbers only. */
  it('finds the nav target’s headings as G.1 onward', () => {
    const html = readFileSync(join(DESIGN, 'Nav - build target.dc.html'), 'utf8');
    const ids = sections(html).map((h: { id: string }) => h.id);
    expect(ids[0]).toBe('G.1');
    expect(ids).toContain('G.8');
    expect(ids.every((id: string) => /^G\.\d+$/.test(id)), `every heading is a G id: ${ids.join(', ')}`).toBe(true);
  });

  /* Fails against BULLET in withdrawals.mjs, which threw "bullet does not match the grammar" on line 49. */
  it('parses an entry whose replacing section is in the nav target', () => {
    const md = '- **`24/in-line-no-height`**: §24, withdrawn by §G.8. The verbs in line.\n  > Superseded in part by §G.8: a sentence.\n';
    expect(parseBullets(md)).toEqual([
      { id: '24/in-line-no-height', s: '24', by: 'G.8', what: 'The verbs in line.', quote: 'Superseded in part by §G.8: a sentence.' },
    ]);
  });
});

/**
 * **M, the record modal's target, ahead of anything citing it (5 Oct).** The
 * two grammars accept `M.N` before a heading or an entry uses one, so the
 * first §M citation is read rather than refused -- G's first entry met a
 * parser that refused it and an assertion that could not see it. Written on
 * inline text: the target is not yet a tracked input.
 */
describe('the shared parser and the bullet grammar read §M ids', () => {
  /* Fails against SECTION_ID, which accepts W, G and bare numbers only. */
  it('finds headings written M.1 onward', () => {
    const html = '<p style="font-size:11px;text-transform:uppercase">M.1 · Where the modal opens</p><p>Body.</p><p style="text-transform:uppercase">M.12 · A later one</p>';
    expect(sections(html).map((h: { id: string }) => h.id)).toEqual(['M.1', 'M.12']);
  });

  /* Fails against BULLET, whose section slots accept numbers, W and G only. */
  it('parses an entry withdrawn in and by an §M section', () => {
    const md = '- **`M.4/fitted`**: §M.4, withdrawn by §M.4. A first wording.\n  > Withdrawn within §M.4: a sentence.\n';
    expect(parseBullets(md)).toEqual([{ id: 'M.4/fitted', s: 'M.4', by: 'M.4', what: 'A first wording.', quote: 'Withdrawn within §M.4: a sentence.' }]);
  });
});

/**
 * **T, the table and grid target, ahead of anything citing it (8 Oct).** The
 * same move as M: both grammars accept `T.N` before a tracked heading or
 * entry uses one. Checked free first: no index input has T as its file key,
 * no withdrawal entry and no line of the handoff carries a T id, and the
 * only file with §T ids is the target itself, which is not yet an input.
 * Written on inline text for that reason.
 */
describe('the shared parser and the bullet grammar read §T ids', () => {
  /* Fails against SECTION_ID, which accepts W, G, M and bare numbers only. */
  it('finds headings written T.1 onward', () => {
    const html = '<p style="font-size:11px;text-transform:uppercase">T.1 · Why these views are designed</p><p>Body.</p><p style="text-transform:uppercase">T.12 · A later one</p>';
    expect(sections(html).map((h: { id: string }) => h.id)).toEqual(['T.1', 'T.12']);
  });

  /* Fails against BULLET, whose section slots accept numbers, W, G and M only. */
  it('parses an entry withdrawn in and by a §T section, and one in §T withdrawn by §W', () => {
    const md = '- **`T.4/columns`**: §T.4, withdrawn by §T.4. A first wording.\n  > Withdrawn within §T.4: a sentence.\n\n- **`T.2/chrome`**: §T.2, withdrawn by §W.27. Another.\n  > Superseded by §W.27: a sentence.\n';
    expect(parseBullets(md)).toEqual([
      { id: 'T.4/columns', s: 'T.4', by: 'T.4', what: 'A first wording.', quote: 'Withdrawn within §T.4: a sentence.' },
      { id: 'T.2/chrome', s: 'T.2', by: 'W.27', what: 'Another.', quote: 'Superseded by §W.27: a sentence.' },
    ]);
  });
});

describe('assertion 4 resolves §G references in both directions', () => {
  /* Fails against assertion 4's reference rules: before G, "§G.99" was not a reference it could see, so it passed. */
  it('fails a §G reference in the record-detail target that names no nav heading', () => {
    const dir = stage((d) => {
      const p = join(d, 'Record Detail 8a - build target.dc.html');
      writeFileSync(p, readFileSync(p, 'utf8').replace('</body>', '<p>See §G.99 for the menu.</p></body>'));
    });
    const { out } = run(dir);
    expect(out).toMatch(/^FAIL 4$/m);
    expect(out).toContain('4 L→§G.99');
  });

  /* Fails against the G-side rules: the nav target's own references to record-detail and wall sections were read by nothing. */
  it('fails a reference from the nav target to a record-detail section that does not exist', () => {
    const dir = stage((d) => {
      const p = join(d, 'Nav - build target.dc.html');
      writeFileSync(p, readFileSync(p, 'utf8').replace(/(G\.2 · [^<]*<\/p>)/, '$1<p>As §98 rules.</p>'));
    });
    const { out } = run(dir);
    expect(out).toMatch(/^FAIL 4$/m);
    expect(out).toContain('4 G→§98');
  });
});

/**
 * **Assertion 8 strips section references before reading figures, and did
 * not strip §G (3 Oct).** §G.7's pointer, "held until §G.8 recorded Adam's
 * choice", is correct -- it points rather than restates -- but "§G.8" was
 * left as "G.8", and 8b read its 8 as a figure in a pointer column. A false
 * failure, the first of the week; every other gap found was a false pass.
 * 8a reads the same stripped text from the title and the pointer, so the
 * same reference would have sent it looking for an 8 in the row's section.
 */
describe('assertion 8 reads a §G reference as a reference, not a figure', () => {
  const editRow = (from: string, to: string) => (d: string) => {
    const p = join(d, 'HANDOFF-wall-and-pull.md');
    const text = readFileSync(p, 'utf8');
    if (!text.includes(from)) throw new Error(`staging anchor missing: ${from}`);
    writeFileSync(p, text.replace(from, to));
  };

  /* Fails against the stripping in assertion 8: §G.6's text has no 8, so "§G.8" in its pointer failed 8a as a missing figure and 8b as a token. */
  it('passes 8a and 8b on a governs row whose pointer names a §G section', () => {
    const dir = stage(editRow('| §G.6 | The header is not sticky | Why the header scrolls away with the page. |', '| §G.6 | The header is not sticky | Why the header scrolls away with the page, unlike §G.8’s open menu. |'));
    const { out } = run(dir);
    expect(out).not.toMatch(/^8a §G\.6 /m);
    expect(out).not.toMatch(/^8b §G\.6 /m);
  });

  /* Fails against the same stripping read from the title: 8a takes figures from the title as well as the pointer; 8b reads the pointer only. */
  it('passes 8a on a governs row whose title names a §G section', () => {
    const dir = stage(editRow('| §G.6 | The header is not sticky |', '| §G.6 | The header is not sticky; see §G.7 |'));
    const { out } = run(dir);
    expect(out).not.toMatch(/^8a §G\.6 /m);
  });
});

/**
 * **Assertion 2 recognised an id only when "not followed by [\\d.]" (3 Oct).**
 * The guard exists so §G.7 does not match §G.71 or §G.7.1, but it also
 * refused the full stop ending a sentence, so Design's declaration "No
 * step: §G.7." -- written to satisfy the check -- could not reach it. The
 * rule now refuses a following digit, or a full stop and a digit.
 */
describe('assertion 2 recognises an id that ends a sentence', () => {
  /** The build order with every §G.7 mention removed and one sentence put back. */
  const orderWith = (sentence: string) => (d: string) => {
    const p = join(d, 'HANDOFF-wall-and-pull.md');
    const text = readFileSync(p, 'utf8');
    const start = text.indexOf('## Build order');
    const end = text.indexOf('## Maintaining', start);
    const order = text.slice(start, end).replace(/§G\.7(?!\d)/g, 'the unsettled section');
    writeFileSync(p, `${text.slice(0, start)}${order}${sentence}\n\n${text.slice(end)}`);
  };

  /* Fails against the lookahead in assertion 2: "§G.7." was refused for the full stop after it. */
  it('counts "§G.7." at the end of a sentence as naming §G.7', () => {
    const { out } = run(stage(orderWith('No step: §G.7. It rules nothing.')));
    expect(out).not.toContain('2 §G.7 not-in-order');
  });

  /* A guard on the fix, not a fail-first test: it passed before the change and must still pass after. §G.71 is not §G.7. */
  it('does not count §G.71 or §G.7.1 as naming §G.7', () => {
    const { out } = run(stage(orderWith('See §G.71 and §G.7.1.')));
    expect(out).toContain('2 §G.7 not-in-order');
  });
});

/**
 * **M, the record modal's target, as input M (5 Oct)**, with the same two
 * directions G was given and the same stripping in assertion 8, so the first
 * §M citation is checked rather than waved through.
 */
describe('the modal target is read: §M references resolve, and §M is not a figure', () => {
  /* Fails before input M: "§M.99" in a record-detail target was no reference assertion 4 could see. */
  it('fails a §M reference in the record-detail target that names no modal heading', () => {
    const dir = stage((d) => {
      const p = join(d, 'Record Detail 8a - build target.dc.html');
      writeFileSync(p, readFileSync(p, 'utf8').replace('</body>', '<p>See §M.99 for the sleeve.</p></body>'));
    });
    const { out } = run(dir);
    expect(out).toMatch(/^FAIL 4$/m);
    expect(out).toContain('4 L→§M.99');
  });

  /* Fails before input M: the modal target's own references were read by nothing. */
  it('fails a reference from the modal target to a record-detail section that does not exist', () => {
    const dir = stage((d) => {
      const p = join(d, 'Record Modal - build target.dc.html');
      writeFileSync(p, readFileSync(p, 'utf8').replace(/(M\.2 · [^<]*<\/p>)/, '$1<p>As §97 rules.</p>'));
    });
    const { out } = run(dir);
    expect(out).toMatch(/^FAIL 4$/m);
    expect(out).toContain('4 M→§97');
  });

  /* Fails before §M joins assertion 8's stripping: the 9 of "§M.9" read as a figure in §G.6's pointer. */
  it('reads a §M reference in a governs row as a reference, not a figure', () => {
    const dir = stage((d) => {
      const p = join(d, 'HANDOFF-wall-and-pull.md');
      const text = readFileSync(p, 'utf8');
      const from = '| §G.6 | The header is not sticky | Why the header scrolls away with the page. |';
      if (!text.includes(from)) throw new Error('staging anchor missing');
      writeFileSync(p, text.replace(from, '| §G.6 | The header is not sticky | Why the header scrolls away with the page, unlike §M.9’s sleeve. |'));
    });
    const { out } = run(dir);
    expect(out).not.toMatch(/^8a §G\.6 /m);
    expect(out).not.toMatch(/^8b §G\.6 /m);
  });
});

/**
 * **Assertion 7's exemption was a category, and the category was a hole
 * (5 Oct).** The spec exempts "a superseded first wording of the same
 * section, so its `s` equals its `by`" and names two entries. The script
 * tested only `s` equals `by`, so every same-section entry -- twenty, of
 * which eighteen happen to carry a prefix -- could drop its prefix and pass.
 * Staged: with "Withdrawn within §33:" removed from 33/about-clamped in the
 * entry and the prose, the index was 11 of 11; 6 found the quote, 7 exempted
 * it, and 9, which looks for the same prefixes, could not see the sentence.
 * The exemption is now the two ids by name.
 */
describe('assertion 7 exempts two entries by name, not every same-section entry', () => {
  const OLD = 'Withdrawn within §33: the frame shows the About clamped, and the lower About row keeps it whole.';
  const NEW = 'The frame shows the About clamped, and the lower About row keeps it whole.';

  /* Fails against `if (e.s !== e.by)`: an unprefixed §33-by-§33 entry was skipped as exempt. */
  it('fails a same-section entry that lost its declared prefix, by name', () => {
    const dir = stage((d) => {
      const w = join(d, 'WITHDRAWALS.md');
      const text = readFileSync(w, 'utf8');
      if (!text.includes(OLD)) throw new Error('staging anchor missing: the 33/about-clamped quote');
      writeFileSync(w, text.split(OLD).join(NEW));
      const t = join(d, 'Record Detail 8a - build target.dc.html');
      const html = readFileSync(t, 'utf8');
      const prose = /Withdrawn within §33: ((?:<[^>]+>)*)the frame shows the About clamped/;
      if (!prose.test(html)) throw new Error('staging anchor missing: the §33 sentence');
      writeFileSync(t, html.replace(prose, '$1The frame shows the About clamped'));
    });
    const { out } = run(dir);
    expect(out).toMatch(/^FAIL 7$/m);
    expect(out).toContain('7 33/about-clamped undeclared');
  });

  /* Fails against a rule that exempts by category: the tree's exempt list must be exactly the spec's two. */
  it('exempts exactly the two entries the spec names, on the tree as it stands', () => {
    const { out } = run();
    const line = /7: \d+ declared withdrawal sentences against \d+ entries: \d+ paired, \d+ exempt by name \(([^)]*)\)/.exec(out);
    expect(line, 'assertion 7 prints its exempt entries by name').not.toBeNull();
    expect((line?.[1] ?? '').split(', ').sort()).toEqual(['26/first-wording-of-placement', '34/acceptance-against-143']);
    expect(out).toMatch(/^PASS 7$/m);
  });
});

describe('a run that stops partway names the ids it never reached', () => {
  /* Fails against the uncaught throw: the run ended after "PASS 5" with a stack trace and no line for 6 onward. */
  it('prints ABSENT for every id after the stop, and a summary that counts them', () => {
    const dir = stage((d) => {
      const p = join(d, 'WITHDRAWALS.md');
      writeFileSync(p, readFileSync(p, 'utf8').replace(/withdrawn by §(\d+)/, 'withdrawn by §X.1'));
    });
    const { code, out } = run(dir);
    expect(code).not.toBe(0);
    for (const id of ['6', '7', '8a', '8b', '9']) expect(out).toMatch(new RegExp(`^ABSENT ${id}\\b`, 'm'));
    expect(out).toMatch(/^RESULT: \d+ PASS, \d+ FAIL, 5 ABSENT of 11 -- INCOMPLETE/m);
  });

  /* Fails against the summary: a complete run must say it reported every id, so a short run cannot pass for a clean one. */
  it('reports every id on a complete run, and says so in its last line', () => {
    const { out } = run();
    for (const id of IDS) expect(out).toMatch(new RegExp(`^(PASS|FAIL) ${id}$`, 'm'));
    expect(out).toMatch(/^RESULT: \d+ PASS, \d+ FAIL, 0 ABSENT of 11$/m);
  });
});

/**
 * **T, the table and grid target, as input T (8 Oct)**, in the shape M was
 * given: assertion 4 reads §T references both ways, assertion 8 strips
 * them, and the target is tracked by its own `.gitignore` exception line in
 * the commit that makes it an input. The last matters as much as the rest:
 * the index reads the file from disk, an ignored and untracked file reports
 * no change to git, and the tree guard cannot see one. An input nobody is
 * tracking is read on this machine and absent on every other.
 */
describe('the table and grid target is read: §T references resolve, and §T is not a figure', () => {
  /* Fails before input T: "§T.99" in the wall target was no reference assertion 4 could see. */
  it('fails a §T reference in the wall target that names no table-and-grid heading', () => {
    const dir = stage((d) => {
      const p = join(d, 'Wall and Pull - build target.dc.html');
      writeFileSync(p, readFileSync(p, 'utf8').replace('</body>', '<p>See §T.99 for the table.</p></body>'));
    });
    const { out } = run(dir);
    expect(out).toMatch(/^FAIL 4$/m);
    expect(out).toContain('4 W→§T.99');
  });

  /* Fails before input T: the target's own references were read by nothing. */
  it('fails a reference from the table and grid target to a record-detail section that does not exist', () => {
    const dir = stage((d) => {
      const p = join(d, 'Table and Grid - build target.dc.html');
      const text = readFileSync(p, 'utf8');
      const edited = text.replace(/(T\.2 · [^<]*<\/[a-z0-9]+>)/, '$1<p>As §97 rules.</p>');
      if (edited === text) throw new Error('staging anchor missing');
      writeFileSync(p, edited);
    });
    const { out } = run(dir);
    expect(out).toMatch(/^FAIL 4$/m);
    expect(out).toContain('4 T→§97');
  });

  /* Fails before §T joins assertion 8's stripping: the 9 of "§T.9" would read as a figure in §G.6's pointer. */
  it('reads a §T reference in a governs row as a reference, not a figure', () => {
    const dir = stage((d) => {
      const p = join(d, 'HANDOFF-wall-and-pull.md');
      const text = readFileSync(p, 'utf8');
      const from = '| §G.6 | The header is not sticky | Why the header scrolls away with the page. |';
      if (!text.includes(from)) throw new Error('staging anchor missing');
      writeFileSync(p, text.replace(from, '| §G.6 | The header is not sticky | Why the header scrolls away with the page, unlike §T.9’s header row. |'));
    });
    const { out } = run(dir);
    expect(out).not.toMatch(/^8a §G\.6 /m);
    expect(out).not.toMatch(/^8b §G\.6 /m);
  });

  /* The pairing, pinned: an index input the repository does not track is read here and nowhere else. Fails if any input is ignored by git. */
  it('every index input is tracked by git, the table and grid target among them', () => {
    const inputs = ['HANDOFF-wall-and-pull.md', 'Record Detail 8a - build target.dc.html', 'Record Detail 8a - settled 1-10.dc.html', 'Wall and Pull - build target.dc.html', 'Nav - build target.dc.html', 'Record Modal - build target.dc.html', 'Table and Grid - build target.dc.html', 'WITHDRAWALS.md'];
    const script = readFileSync(join(REPO_ROOT, 'scripts', 'check-index.mjs'), 'utf8');
    const named = [...script.matchAll(/^  [A-Z]: '([^']+)',$/gm)].map((m) => m[1]).sort();
    expect(named, 'this list is the script\'s own').toEqual([...inputs].sort());
    const tracked = execFileSync('git', ['ls-files', '--', ...inputs.map((f) => join('docs', 'design', f))], { cwd: REPO_ROOT, encoding: 'utf8' }).trim().split('\n').filter(Boolean).length;
    expect(tracked).toBe(inputs.length);
  });
});
