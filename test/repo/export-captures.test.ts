import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { capturesNamed } from '../../scripts/export-captures.mjs';
import { underLoad } from '../helpers/spawn-budget';

vi.setConfig({ testTimeout: underLoad(333) });

/**
 * **A step's captures reach Adam's Downloads with the commit that names them
 * (the coordinator, 4 Nov).** Captures are untracked, so they cannot ride a
 * commit, and three times a step's look was held because Adam had to find
 * PNGs by hand in `docs/captures/`. The commit path already exports the
 * shared documents to ~/Downloads after a commit; this exports the capture
 * folders the commit message names, from the working tree, under the same
 * naming. `capturesNamed` reads the names from a message; the script copies
 * the folders. Fails against a script that reads HEAD rather than the tree
 * (the folders are not in HEAD), copies nothing, or names the export without
 * the date and commit.
 */
const SCRIPT = join(process.cwd(), 'scripts', 'export-captures.mjs');
const localDate = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

describe('capturesNamed', () => {
  it('reads every docs/captures folder a message names, once each, in order of first mention', () => {
    expect(capturesNamed('Captures in docs/captures/years-166, the pair alone; see docs/captures/arrow-167/ and docs/captures/years-166 again.')).toEqual(['years-166', 'arrow-167']);
  });
  it('reads a name with dots and capitals, and stops at a slash, a space or punctuation', () => {
    expect(capturesNamed('`docs/captures/paint-order-31-oct/for-design/x.png` and docs/captures/Step156.3a.')).toEqual(['paint-order-31-oct', 'Step156.3a']);
  });
  it('finds none in a message that names no folder', () => {
    expect(capturesNamed('NOTES: a read of CI run 41762846318, OK on every half.')).toEqual([]);
  });
});

function repo(): { dir: string; sha: string } {
  const dir = mkdtempSync(join(tmpdir(), 'export-captures-'));
  const git = (...args: string[]) => execFileSync('git', args, { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  git('init', '-q');
  git('config', 'user.email', 'test@example.invalid');
  git('config', 'user.name', 'Test');
  git('config', 'commit.gpgsign', 'false');
  writeFileSync(join(dir, 'first.txt'), 'first\n');
  git('add', 'first.txt');
  git('commit', '-q', '-m', 'first');
  return { dir, sha: git('rev-parse', '--short', 'HEAD') };
}

function run(dir: string, args: string[]): { status: number; output: string } {
  try {
    return { status: 0, output: execFileSync('node', [SCRIPT, ...args], { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }) };
  } catch (error) {
    const failure = error as { status?: number; stdout?: string; stderr?: string };
    return { status: failure.status ?? 1, output: `${failure.stdout ?? ''}${failure.stderr ?? ''}` };
  }
}

describe('the export copies the named folders from the working tree', () => {
  it('writes each folder, untracked files and subfolders included, under the date and the commit', () => {
    const { dir, sha } = repo();
    mkdirSync(join(dir, 'docs', 'captures', 'years-166', 'for-design'), { recursive: true });
    writeFileSync(join(dir, 'docs', 'captures', 'years-166', 'pair-w1440-fine-h97.png'), 'png');
    writeFileSync(join(dir, 'docs', 'captures', 'years-166', 'years-166.md'), '# sheet\n');
    writeFileSync(join(dir, 'docs', 'captures', 'years-166', 'for-design', 'note.md'), 'note\n');
    mkdirSync(join(dir, 'docs', 'captures', 'arrow-167'), { recursive: true });
    writeFileSync(join(dir, 'docs', 'captures', 'arrow-167', 'manage-arrow-darwin-1440x900.png'), 'png');
    const out = mkdtempSync(join(tmpdir(), 'export-captures-out-'));
    const result = run(dir, ['--out', out, 'years-166', 'arrow-167']);
    expect(result.status, result.output).toBe(0);
    const folders = readdirSync(out).sort();
    expect(folders).toEqual([`captures arrow-167 — export for Design, ${localDate()} at ${sha}`, `captures years-166 — export for Design, ${localDate()} at ${sha}`]);
    expect(readdirSync(join(out, folders[1])).sort()).toEqual(['for-design', 'pair-w1440-fine-h97.png', 'years-166.md']);
    expect(readFileSync(join(out, folders[1], 'for-design', 'note.md'), 'utf8')).toBe('note\n');
    expect(result.output).toMatch(/3 file\(s\) of docs\/captures\/years-166/);
    expect(result.output).toMatch(/1 file\(s\) of docs\/captures\/arrow-167/);
  });

  it('refuses a folder the tree does not hold, names it, and writes nothing for it', () => {
    const { dir } = repo();
    const out = mkdtempSync(join(tmpdir(), 'export-captures-out-'));
    const result = run(dir, ['--out', out, 'no-such-step']);
    expect(result.status).not.toBe(0);
    expect(result.output).toMatch(/docs\/captures\/no-such-step/);
    expect(readdirSync(out)).toEqual([]);
  });

  it('refuses a missing output directory rather than creating one somewhere', () => {
    const { dir } = repo();
    mkdirSync(join(dir, 'docs', 'captures', 'x'), { recursive: true });
    const result = run(dir, ['--out', join(dir, 'nowhere'), 'x']);
    expect(result.status).not.toBe(0);
    expect(existsSync(join(dir, 'nowhere'))).toBe(false);
  });
});
