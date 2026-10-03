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
