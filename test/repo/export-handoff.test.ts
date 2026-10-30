import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { exportText, fileName } from '../../scripts/export-handoff.mjs';

/**
 * **Design reads the current handoff; it never sends one back whole (the
 * coordinator, 28 Oct).** Handoff edits arrive as change files because a
 * whole copy reverted Code's Done marks, and the rule's cost is that
 * Design's own copy only drifts: it was 82 Done lines behind on 26 Oct, and
 * on 28 Oct it lacked step 133's body, so §T.6's placement of the import
 * was ruled against a layout Design had not read. `scripts/export-handoff.mjs`
 * writes the committed handoff, with every code-region block, where Adam can
 * relay it, headed by a note that says what it is and that it does not
 * come back whole. Reading is safe; writing is what caused the problem.
 */
const SCRIPT = join(process.cwd(), 'scripts', 'export-handoff.mjs');
/* The local date, as the script and drop-ref name things; UTC named an evening export for tomorrow. */
const localDate = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const HANDOFF = join('docs', 'design', 'HANDOFF-wall-and-pull.md');
const blocks = [{ id: 'step-71', before: '72. ', text: '71. **Done.** The tile’s Delete control.' }];
const handoff = '70. Build the disc.\n\n71. **Done.** The tile’s Delete control.\n\n72. Build the nav.\n';

describe('exportText', () => {
  /* Fails against an export that is the file alone: nothing would say what it is or that it is one-directional. */
  it('heads the handoff with a note naming the commit and the date, saying it is read-only and comes back as change files, never whole', () => {
    const { text, missing } = exportText(handoff, blocks, { sha: 'abc1234', date: '2026-10-28', treeDiffers: false });
    expect(missing).toEqual([]);
    const [note, blank, ...rest] = text.split('\n');
    expect(note).toContain('abc1234');
    expect(note).toContain('2026-10-28');
    expect(note).toMatch(/read-only/i);
    expect(note).toMatch(/change files/);
    expect(note).toMatch(/never .*whole/);
    expect(blank).toBe('');
    expect(rest.join('\n')).toBe(handoff);
  });

  /* Fails against an export that reads the tree: an uncommitted edit would travel as if it were a ruling's text. */
  it('says when the working tree holds edits the export does not carry', () => {
    const { text } = exportText(handoff, blocks, { sha: 'abc1234', date: '2026-10-28', treeDiffers: true });
    expect(text.split('\n')[0]).toMatch(/uncommitted/);
    expect(exportText(handoff, blocks, { sha: 'abc1234', date: '2026-10-28', treeDiffers: false }).text).not.toMatch(/uncommitted/);
  });

  /* Fails against an export that does not check: the point of the export is the blocks Design's copy lacks. */
  it('names every code-region block the handoff does not carry', () => {
    const { missing } = exportText('70. Build the disc.\n\n72. Build the nav.\n', blocks, { sha: 'abc1234', date: '2026-10-28', treeDiffers: false });
    expect(missing).toEqual(['step-71']);
  });

  it('names the file by the date and the commit, so two exports never overwrite each other', () => {
    expect(fileName('2026-10-28', 'abc1234')).toBe('HANDOFF-wall-and-pull — export for Design, 2026-10-28 at abc1234.md');
  });
});

describe('the script', () => {
  /*
    DESIGN-RULES is the one file of Design's with neither an index checking it nor a receiving copy
    Design can read (Design, 28 Oct), so the export carries it beside the handoff: HEAD's text under
    the same note. Fails against the export of the handoff alone: one file written, not two.
  */
  /*
    Fails against the export of the handoff and DESIGN-RULES alone (the coordinator, 30 Oct): the
    index checks that an entry's quote stands in its target, not that Design's entry landed as
    written, and Design could not read the list to see.
  */
  it('writes the committed WITHDRAWALS beside the handoff, under the same note, named by the date and the commit', () => {
    const out = mkdtempSync(join(tmpdir(), 'export-withdrawals-'));
    try {
      const sha = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { encoding: 'utf8' }).trim();
      const stdout = execFileSync('node', [SCRIPT, '--out', out], { encoding: 'utf8' });
      const name = `WITHDRAWALS — export for Design, ${localDate()} at ${sha}.md`;
      expect(readdirSync(out)).toContain(name);
      const committed = execFileSync('git', ['show', 'HEAD:docs/design/WITHDRAWALS.md'], { encoding: 'utf8' });
      const written = readFileSync(join(out, name), 'utf8');
      expect(written.endsWith(committed)).toBe(true);
      expect(written.split('\n')[0]).toMatch(/WITHDRAWALS\.md as committed at .* read-only for Design/);
      expect(stdout).toContain(name);
    } finally {
      rmSync(out, { recursive: true, force: true });
    }
  });

  it('writes the committed DESIGN-RULES beside the handoff, under the same note, named by the date and the commit', () => {
    const out = mkdtempSync(join(tmpdir(), 'export-rules-'));
    try {
      const sha = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { encoding: 'utf8' }).trim();
      const stdout = execFileSync('node', [SCRIPT, '--out', out], { encoding: 'utf8' });
      const files = readdirSync(out).sort();
      expect(files).toHaveLength(3);
      const rules = files.find((f) => f.startsWith('DESIGN-RULES'));
      expect(rules).toBe(`DESIGN-RULES — export for Design, ${localDate()} at ${sha}.md`);
      const written = readFileSync(join(out, rules ?? ''), 'utf8');
      const committed = execFileSync('git', ['show', 'HEAD:docs/design/DESIGN-RULES.md'], { encoding: 'utf8' });
      expect(written.endsWith(committed)).toBe(true);
      expect(written.split('\n')[0]).toMatch(/DESIGN-RULES\.md as committed at/);
      expect(stdout).toContain(rules ?? 'DESIGN-RULES');
    } finally {
      rmSync(out, { recursive: true, force: true });
    }
  });

  /*
    Captures were the one thing still hand-carried to Design (the coordinator, 28 Oct): the step-158
    captures never reached it and the step-159 captures had not either, and the import's Provisionals
    line was held open twice by a folder upload. `--captures <step>` writes that folder as committed at
    HEAD, measures table and pictures, beside the handoff under the same name. Fails against the export
    of the two files alone: no folder is written, and an unknown folder is not refused.
  */
  it('writes a step’s captures folder as committed, named the same way, and refuses a folder HEAD does not hold', () => {
    const out = mkdtempSync(join(tmpdir(), 'export-captures-'));
    try {
      const sha = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { encoding: 'utf8' }).trim();
      const stdout = execFileSync('node', [SCRIPT, '--out', out, '--captures', 'import-159'], { encoding: 'utf8' });
      const folder = `captures import-159 — export for Design, ${localDate()} at ${sha}`;
      expect(readdirSync(out)).toContain(folder);
      const files = readdirSync(join(out, folder)).sort();
      const committed = execFileSync('git', ['ls-tree', '--name-only', 'HEAD', 'docs/captures/import-159/'], { encoding: 'utf8' }).trim().split('\n').map((p) => p.split('/').pop()).sort();
      expect(files).toEqual(committed);
      expect(readFileSync(join(out, folder, 'import-159.md'), 'utf8')).toBe(execFileSync('git', ['show', 'HEAD:docs/captures/import-159/import-159.md'], { encoding: 'utf8' }));
      expect(stdout).toContain(folder);
      let status = 0;
      let output = '';
      try {
        output = execFileSync('node', [SCRIPT, '--out', out, '--captures', 'no-such-step'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
      } catch (e) {
        const err = e as { status: number; stdout: string; stderr: string };
        status = err.status;
        output = `${err.stdout}${err.stderr}`;
      }
      expect(status).toBe(1);
      expect(output).toMatch(/no-such-step/);
    } finally {
      rmSync(out, { recursive: true, force: true });
    }
  });

  /* Fails against the committed state before the script existed: no file is written. */
  it('writes the committed handoff with every code-region block into the directory asked for, and says so', () => {
    const out = mkdtempSync(join(tmpdir(), 'export-handoff-'));
    try {
      const sha = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { encoding: 'utf8' }).trim();
      const stdout = execFileSync('node', [SCRIPT, '--out', out], { encoding: 'utf8' });
      /* The handoff's file; DESIGN-RULES stands beside it (the test above). */
      const files = readdirSync(out).filter((f) => f.startsWith('HANDOFF'));
      expect(files).toHaveLength(1);
      expect(files[0]).toContain(sha);
      const written = readFileSync(join(out, files[0]), 'utf8');
      const committed = execFileSync('git', ['show', `HEAD:${HANDOFF}`], { encoding: 'utf8' });
      expect(written.endsWith(committed)).toBe(true);
      /* Step 133 is a code-region block, the one Design's copy lacked on 28 Oct; read at HEAD, as the script reads. */
      const region = JSON.parse(execFileSync('git', ['show', 'HEAD:scripts/handoff-code-region.json'], { encoding: 'utf8' })) as Array<{ id: string; text: string }>;
      const step133 = region.find((block) => block.id === 'step-133') as { text: string };
      expect(written).toContain(step133.text);
      expect(stdout).toContain(files[0]);
      expect(stdout).toMatch(/\d+ of \d+ code-region blocks carried/);
    } finally {
      rmSync(out, { recursive: true, force: true });
    }
  });

  /* Fails against a script that writes whatever HEAD holds: a handoff missing Code's lines is the thing Design already has. */
  it('refuses, writing nothing, when the committed handoff lacks a code-region block', () => {
    const dir = mkdtempSync(join(tmpdir(), 'export-handoff-repo-'));
    const out = join(dir, 'out');
    mkdirSync(out);
    const git = (...args: string[]) => execFileSync('git', args, { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
    try {
      git('init', '-q');
      git('config', 'user.email', 'test@example.invalid');
      git('config', 'user.name', 'Test');
      git('config', 'commit.gpgsign', 'false');
      mkdirSync(join(dir, 'docs', 'design'), { recursive: true });
      mkdirSync(join(dir, 'scripts'), { recursive: true });
      writeFileSync(join(dir, HANDOFF), '70. Build the disc.\n\n72. Build the nav.\n');
      /* The region is read at HEAD, as the handoff is, so a step entered in the tree does not refuse the commit that enters it. */
      writeFileSync(join(dir, 'scripts', 'handoff-code-region.json'), `${JSON.stringify(blocks, null, 2)}\n`);
      git('add', HANDOFF, 'scripts/handoff-code-region.json');
      git('commit', '-q', '-m', 'a handoff without Code’s lines');
      let status = 0;
      let output = '';
      try {
        output = execFileSync('node', [SCRIPT, '--out', out], { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
      } catch (e) {
        const err = e as { status: number; stdout: string; stderr: string };
        status = err.status;
        output = `${err.stdout}${err.stderr}`;
      }
      expect(status).toBe(1);
      expect(readdirSync(out)).toEqual([]);
      expect(output).toMatch(/step-71/);
      expect(output).toMatch(/not exported/i);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
