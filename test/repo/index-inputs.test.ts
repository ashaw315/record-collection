import { spawnSync } from 'node:child_process';
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
  for (const f of ['HANDOFF-wall-and-pull.md', 'Record Detail 8a - build target.dc.html', 'Record Detail 8a - settled 1-10.dc.html', 'Wall and Pull - build target.dc.html', 'Nav - build target.dc.html', 'WITHDRAWALS.md']) {
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
