import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { nextRefName } from '../../scripts/drop-ref.mjs';

/**
 * **A copy of each drop as it arrived, and a word that a new one has (25 Oct).**
 * A drop sits uncommitted while the index runs against it, so there was no
 * pristine copy to compare with, and when Adam relayed a corrected drop
 * nothing said a new generation had arrived: a failing assertion with no
 * report read as an unexplained edit. `scripts/drop-ref.mjs` keeps
 * docs/design as it stands under refs/drops/, off every branch, so neither the
 * commit path nor a push carries it, and says what differs from the last one.
 */
const SCRIPT = join(process.cwd(), 'scripts', 'drop-ref.mjs');
const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

function repo() {
  const dir = mkdtempSync(join(tmpdir(), 'drop-ref-'));
  const git = (...args: string[]) => execFileSync('git', args, { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  git('init', '-q');
  git('config', 'user.email', 'test@example.invalid');
  git('config', 'user.name', 'Test');
  git('config', 'commit.gpgsign', 'false');
  mkdirSync(join(dir, 'docs', 'design'), { recursive: true });
  /* As this repository's .gitignore does: the directory ignored, one file let back in. */
  writeFileSync(join(dir, '.gitignore'), 'docs/design/*\n!docs/design/Target.dc.html\n');
  writeFileSync(join(dir, 'docs', 'design', 'Target.dc.html'), '<p>The fragment sits 24 below the last line. The slot is reserved.</p>\n');
  git('add', '.gitignore', 'docs/design/Target.dc.html');
  git('commit', '-q', '-m', 'first');
  /* Not in the commit and ignored: a drop's new file looks like this until it is let in. */
  writeFileSync(join(dir, 'docs', 'design', 'Ignored.dc.html'), '<p>An ignored file is part of the drop.</p>\n');
  const write = (name: string, text: string) => writeFileSync(join(dir, 'docs', 'design', name), text);
  const run = () => execFileSync('node', [SCRIPT], { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  const drops = () => git('for-each-ref', '--format=%(refname)', 'refs/drops/').split('\n').filter(Boolean);
  return { dir, git, write, run, drops, done: () => rmSync(dir, { recursive: true, force: true }) };
}

describe('nextRefName', () => {
  /* Fails against a name taken from the clock alone: two drops in one day would share a ref. */
  it('numbers drops within a day and starts again at 01 on a new one', () => {
    expect(nextRefName([], '2026-10-25')).toBe('refs/drops/2026-10-25-01');
    expect(nextRefName(['refs/drops/2026-10-25-01'], '2026-10-25')).toBe('refs/drops/2026-10-25-02');
    expect(nextRefName(['refs/drops/2026-10-25-09', 'refs/drops/2026-10-25-10'], '2026-10-25')).toBe('refs/drops/2026-10-25-11');
    expect(nextRefName(['refs/drops/2026-10-25-03'], '2026-10-26')).toBe('refs/drops/2026-10-26-01');
  });
});

describe('drop-ref', () => {
  it('keeps every file in docs/design byte for byte, ignored ones too, and leaves HEAD, the index and the tree alone', () => {
    const r = repo();
    try {
      const head = r.git('rev-parse', 'HEAD');
      const out = r.run();
      const ref = `refs/drops/${today()}-01`;
      expect(r.drops()).toEqual([ref]);
      expect(out).toContain(ref);
      /*
        Named by when it was captured, not by what arrived (the coordinator, 25 Oct): a ref is the whole directory,
        so one taken after a single file was copied in holds every other file as it was before that.
      */
      expect(out).toMatch(/^Captured docs\/design at \d{2}:\d{2}:\d{2} on \d{4}-\d{2}-\d{2} as refs\/drops\/\S+-01\. The first drop ref/);
      expect(r.git('log', '-1', '--format=%B', ref)).toMatch(/^docs\/design as captured at \d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/);
      expect(r.git('log', '-1', '--format=%B', ref)).not.toMatch(/arriv/i);
      for (const name of ['Target.dc.html', 'Ignored.dc.html']) {
        expect(r.git('cat-file', 'blob', `${ref}:docs/design/${name}`) + '\n').toBe(readFileSync(join(r.dir, 'docs', 'design', name), 'utf8'));
      }
      expect(r.git('rev-parse', 'HEAD')).toBe(head);
      expect(r.git('diff', '--cached', '--name-only')).toBe('');
      expect(r.git('status', '--porcelain')).toBe('');
      /* Off every branch: nothing a push of the branch would send. */
      expect(r.git('branch', '--contains', ref)).toBe('');
    } finally {
      r.done();
    }
  });

  it('records nothing and says so when the drop is the same as the last one', () => {
    const r = repo();
    try {
      r.run();
      const out = r.run();
      expect(r.drops()).toHaveLength(1);
      expect(out).toMatch(/same as refs\/drops\/\S+-01/i);
    } finally {
      r.done();
    }
  });

  /* Fails against a report of file names alone: "Target changed" does not say a sentence moved, which is what this morning needed. */
  it('says a new generation arrived and what differs from the last: the sentences reworded, removed and added, and files added and gone', () => {
    const r = repo();
    try {
      r.run();
      r.write('Target.dc.html', '<p>The fragment sits 24 below the sidebar’s last line. A new ruling arrives here.</p>\n');
      r.write('New.dc.html', '<p>A new file.</p>\n');
      rmSync(join(r.dir, 'docs', 'design', 'Ignored.dc.html'));
      const out = r.run();
      const [first, second] = [`refs/drops/${today()}-01`, `refs/drops/${today()}-02`];
      expect(r.drops()).toEqual([first, second]);
      expect(r.git('rev-parse', `${second}^`)).toBe(r.git('rev-parse', first));
      expect(out).toMatch(/^Captured docs\/design at \d{2}:\d{2}:\d{2} on \d{4}-\d{2}-\d{2} as refs\/drops\/\S+-02\./);
      expect(out).toMatch(new RegExp(`differs from ${first}, captured at \\d{2}:\\d{2}:\\d{2} on \\d{4}-\\d{2}-\\d{2}, in 3 file`));
      expect(out).toMatch(/added\s+docs\/design\/New\.dc\.html/);
      expect(out).toMatch(/gone\s+docs\/design\/Ignored\.dc\.html/);
      expect(out).toMatch(/changed\s+docs\/design\/Target\.dc\.html/);
      expect(out).toContain('was: The fragment sits 24 below the last line.');
      expect(out).toContain('now: The fragment sits 24 below the sidebar’s last line.');
      expect(out).toContain('removed: The slot is reserved.');
      expect(out).toContain('added: A new ruling arrives here.');
    } finally {
      r.done();
    }
  });

  /* Fails against a report that lists only sentence changes: a file whose bytes moved and whose prose did not would be reported as nothing. */
  it('names a change with no prose difference as markup only', () => {
    const r = repo();
    try {
      r.run();
      r.write('Target.dc.html', '<p style="margin:0">The fragment sits 24 below the last line. The slot is reserved.</p>\n');
      const out = r.run();
      expect(out).toMatch(/changed\s+docs\/design\/Target\.dc\.html/);
      expect(out).toMatch(/markup only/i);
    } finally {
      r.done();
    }
  });
});
