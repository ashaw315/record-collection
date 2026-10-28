import { execFileSync, spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { sections } from '../../scripts/design-target-parser.mjs';
import { parseBullets } from '../../scripts/withdrawals.mjs';

const REPO_ROOT = join(import.meta.dirname, '..', '..');
const DESIGN = join(REPO_ROOT, 'docs', 'design');
const IDS = ['0', '1', '2', '3', '4', '5', '6', '7', '8a', '8b', '9', '11', '12'];

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
  for (const f of ['HANDOFF-wall-and-pull.md', 'Record Detail 8a - build target.dc.html', 'Record Detail 8a - settled 1-10.dc.html', 'Wall and Pull - build target.dc.html', 'Nav - build target.dc.html', 'Record Modal - build target.dc.html', 'Table and Grid - build target.dc.html', 'Mood Pick - build target.dc.html', 'WITHDRAWALS.md']) {
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
    for (const id of ['6', '7', '8a', '8b', '9', '11', '12']) expect(out).toMatch(new RegExp(`^ABSENT ${id}\\b`, 'm'));
    expect(out).toMatch(/^RESULT: \d+ PASS, \d+ FAIL, 7 ABSENT of 13 -- INCOMPLETE/m);
  });

  /* Fails against the summary: a complete run must say it reported every id, so a short run cannot pass for a clean one. */
  it('reports every id on a complete run, and says so in its last line', () => {
    const { out } = run();
    for (const id of IDS) expect(out).toMatch(new RegExp(`^(PASS|FAIL) ${id}$`, 'm'));
    expect(out).toMatch(/^RESULT: \d+ PASS, \d+ FAIL, 0 ABSENT of 13$/m);
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
    const inputs = ['HANDOFF-wall-and-pull.md', 'Record Detail 8a - build target.dc.html', 'Record Detail 8a - settled 1-10.dc.html', 'Wall and Pull - build target.dc.html', 'Nav - build target.dc.html', 'Record Modal - build target.dc.html', 'Table and Grid - build target.dc.html', 'Mood Pick - build target.dc.html', 'WITHDRAWALS.md'];
    const script = readFileSync(join(REPO_ROOT, 'scripts', 'check-index.mjs'), 'utf8');
    const named = [...script.matchAll(/^  [A-Z]: '([^']+)',$/gm)].map((m) => m[1]).sort();
    expect(named, 'this list is the script\'s own').toEqual([...inputs].sort());
    const tracked = execFileSync('git', ['ls-files', '--', ...inputs.map((f) => join('docs', 'design', f))], { cwd: REPO_ROOT, encoding: 'utf8' }).trim().split('\n').filter(Boolean).length;
    expect(tracked).toBe(inputs.length);
  });
});

/**
 * **Assertion 12 holds a no-entry call to the sentence it spares (15 Oct).**
 * The handoff's rule has a call quote, verbatim, the sentence that would
 * have been withdrawn. Staged the day the convention landed: a later
 * withdrawal of the spared sentence passed every assertion with the stale
 * call still saying the sentence survives, and the remedy proposed was
 * "the same save edits the call", a convention held by discipline. The
 * material for a check is in the convention itself: the spared text stands
 * exactly twice in its section, once at home and once in the call, so a
 * home rewritten or removed drops the count to one on the save that does
 * it. The mirror of 6.
 */
describe('assertion 12 holds a no-entry call to its spared sentence', () => {
  const HOME = /So the arrival lands on the occupied shelf rather than at the fixture’s top corner(<\/strong> — )/;
  const W = 'Wall and Pull - build target.dc.html';

  /*
    The staging anchor is asked of check-index, not quoted. These tests
    staged over §W.29's closing sentence by its literal text, and Design's
    save 6077355 reworded it into the third form: nine tests failed on a
    missing anchor while check-index passed on the same file. Asking the
    parser which third-form call §W.29 holds makes a rewording invisible
    here, and a staging whose anchor the parser did not report cannot run.
    Exactly one, or the test fails naming what was found; never a skip.
  */
  const figures = (out: string) => {
    const m = out.match(/^     12: (\d+) no-entry calls, (\d+) named and checked, (\d+) ruling something new, (\d+) unnamed and (\d+) quoting a phrase \(report only\), (\d+) draft fix(?:es)? not calls, (\d+) mentions/m);
    if (m === null) throw new Error(`no assertion 12 summary line in:\n${out}`);
    const [calls, named, fresh, unnamed, phrase, draft, mentions] = m.slice(1).map(Number);
    return { calls, named, fresh, unnamed, phrase, draft, mentions };
  };
  const thirdForm = (html: string, out: string): { at: number; text: string } => {
    const reported = out.split('\n').filter((line) => line.startsWith('12 §W.29 new-ruling "'));
    if (reported.length !== 1) throw new Error(`staging anchor: check-index reports ${reported.length} third-form calls in §W.29, one expected: ${reported.join(' | ') || 'none'}`);
    const sentence = reported[0].slice('12 §W.29 new-ruling "'.length, -1);
    if (sentence.length >= 80) throw new Error(`staging anchor: the reported call may be cut at 80 characters: "${sentence}"`);
    /* Offsets into the file itself: svg blanked to its own length, so sections() counts as the file does. */
    const masked = html.replace(/<svg[\s\S]*?<\/svg>/g, (svg) => ' '.repeat(svg.length));
    const homes = sections(masked, { prefixW: true }).filter((s: { id: string }) => s.id === 'W.29');
    if (homes.length !== 1) throw new Error(`staging anchor: ${homes.length} sections read as §W.29`);
    const pattern = new RegExp([...sentence].map((c) => (c === ' ' ? '\\s+' : c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))).join('(?:<[^>]*>)*'), 'g');
    const hits = [...homes[0].html.matchAll(pattern)];
    if (hits.length !== 1) throw new Error(`staging anchor: "${sentence}" stands ${hits.length} times in §W.29's html, one expected`);
    return { at: homes[0].at + (hits[0].index ?? 0), text: hits[0][0] };
  };
  let unstaged: string | null = null;
  const baseline = () => (unstaged ??= run().out);
  /** §W.29's one third-form call replaced by `call`; returns the run and the figures it moved from the tree as it stands. */
  const overThirdForm = (call: string) => {
    const dir = stage((d) => {
      const t = join(d, W);
      const html = readFileSync(t, 'utf8');
      const { at, text } = thirdForm(html, baseline());
      writeFileSync(t, html.slice(0, at) + call + html.slice(at + text.length));
    });
    const result = run(dir);
    const before = figures(baseline());
    const after = figures(result.out);
    const moved = Object.fromEntries(Object.entries(after).map(([k, v]) => [k, v - before[k as keyof typeof before]]).filter(([, d]) => d !== 0));
    return { ...result, moved };
  };

  /* Fails against an anchor taken on trust: with a second third-form call in §W.29 the staging refuses, naming both, rather than choosing one. */
  it('refuses to stage when check-index reports other than one third-form call in §W.29', () => {
    const dir = stage((d) => {
      const t = join(d, W);
      const html = readFileSync(t, 'utf8');
      const { at, text } = thirdForm(html, baseline());
      writeFileSync(t, `${html.slice(0, at)}${text} ${text}${html.slice(at + text.length)}`);
    });
    const html = readFileSync(join(dir, W), 'utf8');
    expect(() => thirdForm(html, run(dir).out)).toThrow(/check-index reports 2 third-form calls in §W\.29, one expected: 12 §W\.29 new-ruling .* \| 12 §W\.29 new-ruling /);
  });

  /* Fails against the id's absence: no line for 12 at all. */
  it('passes on the tree as it stands, and says how many calls it read', () => {
    const { out } = run();
    expect(out).toMatch(/^PASS 12$/m);
    expect(out).toMatch(/^     12: \d+ no-entry calls, \d+ named and checked, \d+ ruling something new, \d+ unnamed/m);
  });

  /* Fails against the count: the home sentence reworded, the call still quoting the old wording, and the spared text standing once. */
  it('fails when the home sentence is rewritten and the call still quotes the old one', () => {
    const dir = stage((d) => {
      const t = join(d, W);
      const html = readFileSync(t, 'utf8');
      if (!HOME.test(html)) throw new Error('staging anchor missing: §W.29’s home sentence before its dash');
      writeFileSync(t, html.replace(HOME, 'So the arrival lands on the occupied shelf and not at the fixture’s top corner$1'));
    });
    const { code, out } = run(dir);
    expect(code).not.toBe(0);
    expect(out).toMatch(/^FAIL 12$/m);
    expect(out).toContain('12 §W.29 spared-count=1 "So the arrival lands on the occupied shelf rather than at the fixture’s top corner"');
  });

  /* Fails against a check that reads only quoted calls: a call in the form with no sentence named is the one the rule says to file instead. */
  it('names a call that quotes no sentence, report-only while the older calls are Design’s to bring to the form', () => {
    const { out, moved } = overThirdForm('No entry: this is new.');
    expect(moved, 'a ruling on something new becomes a call naming nothing').toEqual({ fresh: -1, unnamed: 1 });
    expect(out).toContain('12 §W.29 unnamed "No entry: this is new."');
    expect(out).toMatch(/^PASS 12$/m);
  });

  /*
    28 Oct: §T.6 wrote 'The line’s wording is proposed: “Last import, 28
    October, 14:05.” The sentence this replaces claimed nothing, so no entry
    is owed.' A quoted sentence does not end the sentence it sits in, so the
    two read as one prose-form call, and the detector took the proposed
    wording as the sentence spared, which stands once, and failed the run.
    Design proposes quoted wordings routinely, so the next paragraph that
    does both in one breath would trip it again (the coordinator). A
    prose-form call's spared sentence comes only from the “The sentence
    spared is” line after it; a quote in the call's own sentence names
    nothing, and the call is reported unnamed. Fails against the detector
    that read the quote: FAIL 12 with spared-count=1.
  */
  it('does not take a quoted wording in a prose-form call’s own sentence as the sentence it spares: the call is unnamed, report-only', () => {
    const { out, code, moved } = overThirdForm('The line’s wording is proposed: “Last import, 28 October, 14:05.” The sentence this replaces claimed nothing, so no entry is owed.');
    expect(code).toBe(0);
    expect(out).toMatch(/^PASS 12$/m);
    expect(out).not.toContain('spared-count=1 "Last import, 28 October, 14:05"');
    expect(moved, 'the third-form call becomes one unnamed call').toEqual({ fresh: -1, unnamed: 1 });
    /* The reported line is cut at 80 characters. */
    expect(out).toMatch(/^12 §W\.29 unnamed "The line’s wording is proposed: “Last import, 28 October, 14:05\.” The sent/m);
  });

  /*
    The reviewer, 15 Oct, after Design's save: §W.29 holds three calls and 12
    read two, because its detector keyed on the literal `No entry:` while
    Design's two newer calls read "no entry is owed. The sentence spared is
    “…”". An unnamed call is reported; an unseen one is not, and the index
    read clean either way. Fails against the literal-marker detector: the
    prose-form call's home sentence rewritten passes 12, unseen.
  */
  const PROSE_HOME = /The occupied shelf is the right landing for the whole collection, and the matching records are the occupied shelf of a filtered one(, by §W\.12’s emptied seats\.)/;
  it('reads a call in the prose form, “no entry is owed” with “The sentence spared is” following, and fails it when that home sentence is rewritten', () => {
    const dir = stage((d) => {
      const t = join(d, W);
      const html = readFileSync(t, 'utf8');
      if (!PROSE_HOME.test(html)) throw new Error('staging anchor missing: §W.29’s occupied-shelf home sentence with its trailing clause');
      writeFileSync(t, html.replace(PROSE_HOME, 'The occupied shelf is the landing for the whole collection, and the matching records are the occupied shelf of a filtered one$1'));
    });
    const { code, out } = run(dir);
    expect(code).not.toBe(0);
    expect(out).toMatch(/^FAIL 12$/m);
    expect(out).toContain('12 §W.29 spared-count=1 "The occupied shelf is the right landing for the whole collection, and the matching records are the occupied shelf of a filtered one"');
  });

  /* Fails against the literal-marker detector: a call in the "owes no entry" form with no sentence named is neither counted nor reported by it. */
  it('reports a call in the “owes no entry” form that names no sentence, rather than not seeing it', () => {
    const { out, moved } = overThirdForm('Being new, this owes no entry.');
    expect(moved, 'a ruling on something new becomes a call naming nothing').toEqual({ fresh: -1, unnamed: 1 });
    expect(out).toContain('12 §W.29 unnamed "Being new, this owes no entry."');
    expect(out).toMatch(/^PASS 12$/m);
  });

  /* Fails against a detector that keys on "no entry" alone: the phrase in another sense (a journal with no entry, the record's entries never leaving) is listed as not a call, so a form the detector does not know is never silently absent. */
  it('lists a “no entry” in another sense as not a call, report-only, so an unknown form is visible rather than unseen', () => {
    const { out, moved } = overThirdForm('The journal frame shows no entry at all.');
    expect(moved, 'a call becomes a mention, which is not a call').toEqual({ calls: -1, fresh: -1, mentions: 1 });
    expect(out).toContain('12 §W.29 not-a-call "The journal frame shows no entry at all."');
    expect(out).not.toContain('12 §W.29 unnamed "The journal frame shows no entry at all."');
    expect(out).toMatch(/^PASS 12$/m);
  });

  /* Fails against a reader that takes the first curly quote in the call's own sentence: §W.29's second call says “shelf” in its sentence and names its spared sentence on the line after. */
  it('takes a prose-form call’s spared sentence from the line after it, not from a quote inside the call’s own sentence', () => {
    const { out, moved } = overThirdForm('A defect against “shelf”, so no entry is owed. The sentence spared is “The arrival is a starting place for someone who has not yet chosen one.”');
    expect(moved, 'a ruling on something new becomes a call naming its sentence').toEqual({ named: 1, fresh: -1 });
    expect(out).not.toContain('spared-count=');
    expect(out).toMatch(/^PASS 12$/m);
  });

  /* Fails against a count of whatever is quoted: §T.3's older call quotes a phrase that stands seven times in its section, and a phrase is not the sentence the rule asks for. */
  it('reports a call that quotes a phrase rather than a sentence, report-only, instead of counting the phrase', () => {
    const { out, moved } = overThirdForm('No entry: “shelf” stays true as built.');
    expect(moved, 'a ruling on something new becomes a call quoting a phrase').toEqual({ phrase: 1, fresh: -1 });
    expect(out).toContain('12 §W.29 quotes-a-phrase "shelf"');
    expect(out).not.toContain('spared-count=');
    expect(out).toMatch(/^PASS 12$/m);
  });

  /*
    The lead ruled for readers (the reviewer, 16 Oct): `No entry:` in bold,
    the spared sentence on the line after. Green first time, and said so:
    tags are stripped before the split and a call sentence without a quote
    takes the spared line after it, each held by a test above; this pins the
    combination Design will now write, so a change to either path fails the
    form in use by name.
  */
  it('reads the ruled lead, bold “No entry:” with the spared sentence on the line after, as one named call', () => {
    const { out, moved } = overThirdForm('<strong>No entry:</strong> a defect, not a new claim. The sentence spared is “The arrival is a starting place for someone who has not yet chosen one.”');
    expect(moved, 'a ruling on something new becomes a call naming its sentence').toEqual({ named: 1, fresh: -1 });
    expect(out).not.toContain('unnamed "No entry: a defect');
    expect(out).not.toContain('spared-count=');
    expect(out).toMatch(/^PASS 12$/m);
  });

  /*
    The rule's third form (Design, 16 Oct): "No entry: nothing was ruled
    here before", for a ruling on something no sentence ruled, "declared so
    it can be counted apart from calls still owed a sentence". Fails against
    the reader before it, which lists the form as unnamed, with the eight
    older calls for something new.
  */
  it('counts the third form, “No entry: nothing was ruled here before”, apart from the calls still owed a sentence', () => {
    const { out, moved } = overThirdForm('<strong>No entry:</strong> nothing was ruled here before; the paper block under the sentence is new.');
    expect(moved, 'a third-form call replaced by a third-form call: nothing moves').toEqual({});
    expect(out).toContain('12 §W.29 new-ruling "No entry: nothing was ruled here before; the paper block under the sentence is new."');
    expect(out).not.toContain('unnamed "No entry: nothing was ruled here before');
    expect(out).toMatch(/^     12: \d+ no-entry calls, \d+ named and checked, \d+ ruling something new, \d+ unnamed/m);
    expect(out).toMatch(/^PASS 12$/m);
  });

  /*
    Design, 16 Oct: "A draft fix is not a no-entry call. A sentence saying a
    change was a draft fix invokes the withdrawal rule's own exemption… It
    quotes nothing… That check [against git], not a spared sentence, is what
    makes it verifiable." Fails against the reader before it, which listed
    the three draft-fix sentences among the unnamed calls.
  */
  it('does not count a draft-fix sentence as a call, and lists it apart', () => {
    const { out, moved } = overThirdForm('No drop carried the first wording, so this was a draft fix and no entry is owed.');
    expect(moved, 'a call becomes a draft fix, which is not a call').toEqual({ calls: -1, fresh: -1, draft: 1 });
    expect(out).toContain('12 §W.29 draft-fix "No drop carried the first wording, so this was a draft fix and no entry is owed."');
    expect(out).not.toContain('unnamed "No drop carried the first wording');
    expect(out).toMatch(/^     12: \d+ no-entry calls, \d+ named and checked, \d+ ruling something new, \d+ unnamed and \d+ quoting a phrase \(report only\), \d+ draft fix/m);
    expect(out).toMatch(/^PASS 12$/m);
  });

  /*
    The reviewer, 17 Oct: the inventory marked four draft calls and the
    count said three. §G.5's call reads "An earlier draft of this paragraph
    said…, and no entry is owed for replacing it", naming the exemption's
    subject without the phrase "draft fix", which its paragraph states
    three sentences on. Fails against the reader keyed on "draft fix"
    alone, which listed it unnamed and reported 18 where 17 exist.
  */
  it('counts a call that names an earlier draft as a draft fix, not as unnamed', () => {
    const { out, moved } = overThirdForm('An earlier draft of this paragraph said the arrival was the seat, and no entry is owed for replacing it.');
    expect(moved, 'a call becomes a draft fix, which is not a call').toEqual({ calls: -1, fresh: -1, draft: 1 });
    expect(out).toContain('12 §W.29 draft-fix "An earlier draft of this paragraph said the arrival was the seat, and no entry is owed for replacing it."');
    expect(out).not.toContain('unnamed "An earlier draft of this paragraph');
  });
});

/**
 * **P, the mood pick's target, ahead of anything citing it (23 Oct).** The
 * same move as T (ee39ebd): the grammars accept `P.N` before a tracked
 * heading or entry uses one, and Design's §P rows wait for this. Checked
 * free first: no index input has P as its file key; no section heading, row,
 * withdrawal id or reference in any input carries a P id; the only file with
 * one is `Mood Pick - build target.dc.html` itself, which is not an input.
 *
 * **One thing T's move did not do, read before this one.** With the target
 * on disk and not an input, the index ignores it: 13 of 13, and the current
 * parser finds no heading in it. A handoff row citing §P.1 fails loudly
 * (`1 §P.1 no-heading`, `2 §P.1 not-in-order`). But a §P.1 in another
 * target's prose passed, 13 of 13: assertion 4 scanned W, G, M, T and bare
 * numbers, so a citation of a prefix it did not know was not a reference at
 * all, the 2 Oct shape for §G. So 4 reads §P now, and until the target is an
 * input every §P citation names a heading that does not exist, and fails.
 */
describe('the shared parser and the bullet grammar read §P ids', () => {
  /* Fails against SECTION_ID, which accepts W, G, M, T and bare numbers only. */
  it('finds headings written P.1 onward', () => {
    const html = '<p style="font-size:11px;text-transform:uppercase">P.1 · Where the feature is ruled, and where it is presented</p><p>Body.</p><p style="text-transform:uppercase">P.12 · A later one</p>';
    expect(sections(html).map((h: { id: string }) => h.id)).toEqual(['P.1', 'P.12']);
  });

  /* Fails against BULLET, whose section slots accept numbers, W, G, M and T only. */
  it('parses an entry withdrawn in and by a §P section, and one in §P withdrawn by §W', () => {
    const md = '- **`P.4/states`**: §P.4, withdrawn by §P.4. A first wording.\n  > Withdrawn within §P.4: a sentence.\n\n- **`P.2/control`**: §P.2, withdrawn by §W.24. Another.\n  > Superseded by §W.24: a sentence.\n';
    expect(parseBullets(md)).toEqual([
      { id: 'P.4/states', s: 'P.4', by: 'P.4', what: 'A first wording.', quote: 'Withdrawn within §P.4: a sentence.' },
      { id: 'P.2/control', s: 'P.2', by: 'W.24', what: 'Another.', quote: 'Superseded by §W.24: a sentence.' },
    ]);
  });
});

/**
 * **P, the mood pick's target, as input P (24 Oct)**, in the shape T was
 * given on 8 Oct: read the same ways as G, M and T, and tracked by its own
 * `.gitignore` exception in the commit that makes it an input. Until then a
 * §P citation in another target failed because no §P heading existed at all
 * (`4 T→§P.1`); now §P.1 exists, so that case is the wrong test, and what
 * must fail is a §P citation naming a heading P does not have.
 */
describe('the mood pick target is read: §P references resolve both ways', () => {
  /* Fails before input P, as 4 T→§P.1 and every other §P citation did: no §P heading was read. Passes after only if P.99 still fails. */
  it('fails a §P reference in the table and grid target that names no mood-pick heading', () => {
    const dir = stage((d) => {
      const p = join(d, 'Table and Grid - build target.dc.html');
      const text = readFileSync(p, 'utf8');
      const staged = text.replace(/(T\.1 · [^<]*<\/p>\s*<p[^>]*>)/, '$1The mood pick presents here too (§P.99). ');
      if (staged === text) throw new Error('staging anchor missing: T.1');
      writeFileSync(p, staged);
    });
    const { out } = run(dir);
    expect(out).toMatch(/^FAIL 4$/m);
    expect(out).toContain('4 T→§P.99');
  });

  /* Fails before input P: the target's own references were read by nothing. */
  it('fails a reference from the mood pick target to a wall section that does not exist', () => {
    const dir = stage((d) => {
      const p = join(d, 'Mood Pick - build target.dc.html');
      const text = readFileSync(p, 'utf8');
      const edited = text.replace(/(P\.2 · [^<]*<\/[a-z0-9]+>)/, '$1<p>As §W.99 rules.</p>');
      if (edited === text) throw new Error('staging anchor missing: P.2');
      writeFileSync(p, edited);
    });
    const { out } = run(dir);
    expect(out).toMatch(/^FAIL 4$/m);
    expect(out).toContain('4 P→§W.99');
  });

  /* Fails before input P: the target's §P.N headings were not among the headings a handoff row could name. */
  it('reads the six §P sections as headings, so the handoff rows for them resolve', () => {
    const { out } = run();
    expect(out).not.toMatch(/^1 §P\.\d+ no-heading$/m);
    expect(out).toMatch(/^PASS 1$/m);
  });
});

describe('assertion 8 reads a §P reference as a reference, not a figure', () => {
  /* Fails against the stripping in assertion 8: §G.6's text has no 3, so "§P.3" in its pointer would fail 8a as a missing figure, as "§G.8" did on 3 Oct. */
  it('passes 8a on a governs row whose pointer names a §P section', () => {
    const dir = stage((d) => {
      const p = join(d, 'HANDOFF-wall-and-pull.md');
      const from = '| §G.6 | The header is not sticky | Why the header scrolls away with the page. |';
      const text = readFileSync(p, 'utf8');
      if (!text.includes(from)) throw new Error(`staging anchor missing: ${from}`);
      writeFileSync(p, text.replace(from, '| §G.6 | The header is not sticky | Why the header scrolls away with the page, unlike §P.3’s pick. |'));
    });
    const { out } = run(dir);
    expect(out).not.toMatch(/^8a §G\.6 /m);
  });
});
